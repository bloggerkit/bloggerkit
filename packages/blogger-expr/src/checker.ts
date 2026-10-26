import {
	type FunctionCall,
	forEachChild,
	isPath,
	type LoopRange,
	type MapLiteral,
	type Node,
	nameOf,
	type OperatorFunctionCall,
	type Root,
	unwrap,
} from './ast';
import type { DiagnosticCode, Severity } from './diagnostics';
import type { Span } from './source';
import { isBooleanWord } from './values';

/** A finding of the check, made into a `Diagnostic` by `parse`. */
export interface Finding {
	severity: Severity;
	code: DiagnosticCode;
	span: Span;
	detail: Record<string, string>;
}

/**
 * Checks a parsed expression: errors the grammar does not show (arguments,
 * literal conditions, division by a literal 0…), and warnings for expressions
 * that are accepted but may not do what they look like.
 */
/** A name a key of a map can be written as, unquoted: letters, digits, `_`, `$` and dashes. */
const KEY_NAME = /^[\w$-]*[\w$][\w$-]*$/;

export function check(root: Root, source: string): Finding[] {
	const findings: Finding[] = [];
	const text = (node: Node) => source.slice(node.span.start, node.span.end);
	const report = (
		severity: Severity,
		code: DiagnosticCode,
		at: Span,
		detail: Record<string, string> = {},
	) => findings.push({ severity, code, span: at, detail });

	/** A condition that is a value made in the expression and never a boolean. */
	const checkCondition = (node: Node) => {
		if (isNeverBoolean(unwrap(node))) {
			report('error', 'condition-not-boolean', node.span, { text: text(node) });
		}
	};

	/**
	 * The keys of a map Blogger reads differently than they look: one written
	 * twice, of which the last is read, and a quoted one, which keeps its
	 * quotes in its name.
	 */
	const checkKeys = (node: MapLiteral) => {
		const seen = new Set<string>();
		for (const { key, value } of node.entries) {
			const name = nameOf(key);
			if (seen.has(name)) {
				report('warning', 'duplicate-key', key.span, {
					key: name,
					value: text(value),
				});
			}
			seen.add(name);
			if (!key.quoted) {
				continue;
			}
			if (KEY_NAME.test(key.text)) {
				report('warning', 'quoted-key', key.span, {
					key: name,
					name: key.text,
				});
			} else {
				const suggestion = key.text
					.replace(/[^\w$-]+/g, '-')
					.replace(/^-+|-+$/g, '');
				report('warning', 'key-characters', key.span, {
					key: name,
					fix: suggestion ? `: ${suggestion}` : '',
				});
			}
		}
	};

	const visit = (node: Node, parent: Node | undefined) => {
		switch (node.type) {
			case 'MapLiteral':
				checkKeys(node);
				break;
			case 'Conditional':
				checkCondition(node.condition);
				break;
			case 'LogicalNot':
				checkCondition(node.operand);
				break;
			case 'Logical':
				// the right side is read only when the left side does not decide
				checkCondition(node.left);
				if (!decides(node.left, node.operator.name)) {
					checkCondition(node.right);
				}
				break;
			case 'Comparison':
				checkNumbers(node.left, node.right, node.operator.spelling);
				break;
			case 'Equality':
				if ([node.left, node.right].some(isWrittenNumber)) {
					report('warning', 'number-text-equality', node.span, {
						text: text(node),
					});
				}
				break;
			case 'Arithmetic':
				checkNumbers(node.left, node.right, node.operator.spelling);
				if (
					node.operator.name === 'divide' ||
					node.operator.name === 'remainder'
				) {
					checkDivisor(node.right, node.operator.name === 'divide' ? '/' : '%');
				}
				if (node.right.type === 'Fallback') {
					report('warning', 'default-in-operation', node.right.span);
				}
				break;
			case 'PlusChain':
				checkPlus(node.operands);
				if (joinsNumbers(node.operands)) {
					report('warning', 'plus-joins-numbers', node.span);
				}
				for (const operand of node.operands.slice(1)) {
					if (operand.type === 'Fallback') {
						report('warning', 'default-in-operation', operand.span);
					}
				}
				break;
			case 'Membership':
				checkMembership(node.item, node.collection, node.operator.spelling);
				break;
			case 'LambdaOperation': {
				const list = unwrap(node.list);
				if (
					[
						'NumberLiteral',
						'StringLiteral',
						'BooleanLiteral',
						'MapLiteral',
					].includes(list.type)
				) {
					report('error', 'lambda-on-literal', node.list.span, {
						operator: node.operator.spelling,
						text: text(node.list),
					});
				}
				if (node.operator.name !== 'map') {
					checkCondition(node.body);
				}
				break;
			}
			case 'TakeOrSkip': {
				const list = unwrap(node.list);
				if (
					[
						'NumberLiteral',
						'StringLiteral',
						'BooleanLiteral',
						'MapLiteral',
					].includes(list.type)
				) {
					report('error', 'lambda-on-literal', node.list.span, {
						operator: node.operator.spelling,
						text: text(node.list),
					});
				}
				checkCount(node.count, node.operator.name);
				break;
			}
			case 'DataPath': {
				const written = text(node);
				if (node.root === undefined) {
					report('warning', 'bare-data', node.span, { text: written });
				} else if (written.startsWith('data:.')) {
					report('warning', 'data-leading-dot', node.span, {
						text: written,
						path: `data:${[node.root, ...node.properties].join('.')}`,
					});
				} else if (written.includes('..') || written.endsWith('.')) {
					// `data:blog..title`, `data:blog.title.`: what is read is `data:blog.title`
					report('warning', 'member-access', node.span, {
						text: written,
						path: `data:${[node.root, ...node.properties].join('.')}`,
					});
				}
				break;
			}
			case 'PropertyAccess':
				if (node.property.text.startsWith('.')) {
					report('warning', 'member-dots', node.span, { text: text(node) });
				} else if (
					node.appliesTo === 'everythingBefore' &&
					!isSingleValue(node.object)
				) {
					report('warning', 'member-applies-to-all', node.span, {
						name: nameOf(node.property),
					});
				} else if (node.appliesTo === 'everythingBefore') {
					// `data:blog .title`: a space before the dot, of one value
					const { start, end } = node.property.span;
					report('warning', 'member-access', node.span, {
						text: text(node),
						path: `${text(node.object)}.${source.slice(start, end)}`,
					});
				}
				break;
			case 'FunctionCall':
				checkCall(node);
				break;
			case 'OperatorFunctionCall':
				checkOperatorCall(node);
				break;
			default:
				break;
		}
		// `((data:a).b)` as an argument or a list item
		if (
			(parent?.type === 'FunctionCall' ||
				parent?.type === 'OperatorFunctionCall' ||
				parent?.type === 'ListLiteral') &&
			isPropertyOfParenthesized(node)
		) {
			report('warning', 'missing-member-of-parentheses', node.span);
		}
		forEachChild(node, (child) => visit(child, node));
	};

	const operandType = (
		operand: Node,
		operator: string,
		kind: OperandKind,
		takes: string,
	) =>
		report('error', 'operand-type', operand.span, {
			operator,
			text: text(operand),
			found: KIND_NAMES[kind],
			takes,
		});

	/** `-`, `*`, `/`, `%`, `<`, `>`, `<=`, `>=`: numbers, or strings of digits. */
	const checkNumbers = (left: Node, right: Node, operator: string) => {
		for (const operand of [left, right]) {
			const kind = operandKind(operand);
			if (kind && kind !== 'number' && kind !== 'digits') {
				operandType(operand, operator, kind, TAKES.numbers);
			}
		}
	};

	/** `+` joins anything to a string, and adds numbers; with no string, other kinds are refused. */
	const checkPlus = (operands: Node[]) => {
		const kinds = operands.map(operandKind);
		if (
			kinds.some(
				(kind) =>
					kind === undefined ||
					kind === 'text' ||
					kind === 'digits' ||
					kind === 'empty',
			)
		) {
			return;
		}
		const index = kinds.findIndex((kind) => kind !== 'number');
		if (index !== -1) {
			operandType(
				operands[index] as Node,
				'+',
				kinds[index] as OperandKind,
				TAKES.plus,
			);
		}
	};

	/** `in`, `contains`: a string or a list is searched, for anything but a list; a map only in a list. */
	const checkMembership = (item: Node, collection: Node, operator: string) => {
		const itemKind = operandKind(item);
		const collectionKind = operandKind(collection);
		if (
			collectionKind === 'number' ||
			collectionKind === 'boolean' ||
			collectionKind === 'map'
		) {
			operandType(collection, operator, collectionKind, TAKES.collection);
		} else if (itemKind === 'list') {
			operandType(item, operator, itemKind, TAKES.item);
		} else if (
			itemKind === 'map' &&
			collectionKind &&
			collectionKind !== 'list'
		) {
			operandType(item, operator, itemKind, TAKES.mapItem);
		}
	};

	const checkDivisor = (divisor: Node, operator: '/' | '%') => {
		const d = unwrap(divisor);
		if (d.type === 'NumberLiteral' && Number(d.raw) === 0) {
			report(
				'error',
				operator === '/' ? 'division-by-zero' : 'remainder-by-zero',
				divisor.span,
			);
		} else if (isPath(d)) {
			report('warning', 'divisor-may-be-zero', divisor.span, { operator });
		}
	};

	const checkCount = (count: Node, operator: 'take' | 'skip') => {
		const c = unwrap(count);
		if (
			c.type === 'StringLiteral' ||
			c.type === 'BooleanLiteral' ||
			c.type === 'ListLiteral' ||
			c.type === 'MapLiteral'
		) {
			report('error', 'slice-count', count.span, {
				operator,
				text: text(count),
			});
		} else if (c.type === 'NumberLiteral') {
			const n = Number(c.raw);
			const rounded = Math.sign(n) * Math.round(Math.abs(n));
			if (n < 0 || (operator === 'take' && rounded < 1)) {
				report('error', 'slice-count-range', count.span, {
					operator,
					text: c.raw,
				});
			}
		}
	};

	const argumentError = (
		call: FunctionCall,
		index: number,
		expected: string,
	) => {
		const arg = call.arguments[index] as Node;
		report('error', 'argument-type', arg.span, {
			name: call.function.spelling,
			position: String(index + 1),
			expected,
			text: text(arg),
		});
	};

	const checkCall = (call: FunctionCall) => {
		const [least, most] = ARITY[call.function.name];
		const count = call.arguments.length;
		if (count < least || count > most) {
			const expected =
				least === most
					? `${least} argument${least === 1 ? '' : 's'}`
					: `${least} or ${most} arguments`;
			report('error', 'argument-count', call.span, {
				name: call.function.spelling,
				expected,
				got: String(count),
			});
			return;
		}
		const kind = (i: number) => literalKind(call.arguments[i] as Node);
		switch (call.function.name) {
			case 'path':
				if (isEmptyString(call.arguments[0] as Node)) {
					argumentError(call, 0, 'a URL');
				}
				if (kind(1) && kind(1) !== 'string') {
					argumentError(call, 1, 'a string');
				}
				break;
			case 'fragment':
				if (isEmptyString(call.arguments[0] as Node)) {
					argumentError(call, 0, 'a URL');
				}
				if (kind(1) && kind(1) !== 'string') {
					argumentError(call, 1, 'a string');
				}
				break;
			case 'params':
			case 'appendParams':
				if (isEmptyString(call.arguments[0] as Node)) {
					argumentError(call, 0, 'a URL');
				}
				if (kind(1) && kind(1) !== 'map') {
					argumentError(call, 1, 'a map, { name: value }');
				}
				break;
			case 'snippet':
				if (count === 2 && kind(1) && kind(1) !== 'map') {
					argumentError(call, 1, 'a map, { length: 100 }');
				}
				break;
			case 'format':
				if (kind(0)) {
					argumentError(call, 0, 'a date of the data');
				}
				if (kind(1) && kind(1) !== 'string') {
					argumentError(call, 1, 'a string');
				}
				break;
			case 'resizeImage': {
				const width = call.arguments[1] as Node;
				if (kind(1) === 'list') {
					for (const item of listItems(width)) {
						if (!isWidth(item)) {
							argumentError(
								call,
								1,
								'a list of widths, numbers or strings of digits',
							);
						}
					}
				} else if (kind(1) && !isWidth(width)) {
					argumentError(call, 1, 'a width, a number or a string of digits');
				}
				if (count === 3) {
					checkRatio(call, 2);
				}
				const w = unwrap(width);
				const ratio = call.arguments[2] && unwrap(call.arguments[2]);
				if (
					w.type === 'NumberLiteral' &&
					Number(w.raw) < 0 &&
					ratio?.type === 'StringLiteral' &&
					ratio.value !== ''
				) {
					report('error', 'negative-width-ratio', call.span);
				}
				break;
			}
			case 'sourceSet':
				if (kind(1) && kind(1) !== 'list') {
					argumentError(call, 1, 'a list of widths');
				}
				if (kind(1) === 'list') {
					for (const item of listItems(call.arguments[1] as Node)) {
						if (!isWidth(item)) {
							argumentError(
								call,
								1,
								'a list of widths, numbers or strings of digits',
							);
						}
					}
				}
				if (count === 3) {
					checkRatio(call, 2);
				}
				break;
			default:
				// take(list, n), skip(list, n)
				if (kind(0) && kind(0) !== 'list') {
					argumentError(call, 0, 'a list');
				}
				checkCount(
					call.arguments[1] as Node,
					call.function.name as 'take' | 'skip',
				);
				break;
		}
	};

	const checkRatio = (call: FunctionCall, index: number) => {
		const ratio = unwrap(call.arguments[index] as Node);
		if (ratio.type === 'StringLiteral') {
			const match = /^\s*(\d+)\s*:\s*(\d+)\s*$/.exec(ratio.value);
			if (
				ratio.value !== '' &&
				(!match || Number(match[1]) === 0 || Number(match[2]) === 0)
			) {
				argumentError(call, index, 'a ratio of two positive integers, "16:9"');
			}
		} else if (literalKind(ratio)) {
			argumentError(call, index, 'a ratio, "16:9"');
		}
	};

	const checkOperatorCall = (call: OperatorFunctionCall) => {
		const operator = call.operator.name;
		const least = OPERATOR_FUNCTION_LEAST[operator] ?? 0;
		const count = call.arguments.length;
		if (operator === 'in' || operator === 'contains') {
			if (count !== 2) {
				report('error', 'argument-count', call.span, {
					name: call.operator.spelling,
					expected: '2 values',
					got: String(count),
				});
			}
		} else if (count < least) {
			report('error', 'operator-function-count', call.span, {
				operator: call.operator.spelling,
				got: String(count),
			});
		}
		if (operator === 'and' || operator === 'or') {
			for (const argument of call.arguments) {
				checkCondition(argument);
				if (decides(argument, operator)) {
					break;
				}
			}
		}
		if (operator === '/' || operator === '%') {
			for (const divisor of call.arguments.slice(1)) {
				checkDivisor(divisor, operator);
			}
		}
	};

	/** The ends of a range: integers; with `to`, what each side takes in. */
	const checkRange = (range: LoopRange) => {
		for (const end of [range.start, range.end]) {
			if (end.type === 'NumberLiteral' && !/^-?\d+$/.test(end.raw)) {
				report('error', 'range-end', end.span, { text: end.raw });
			} else if (range.notation === 'to' && REACHING.has(end.type)) {
				report('warning', 'range-reach', end.span, {
					text: text(end),
					side: end === range.start ? 'start' : 'end',
				});
			}
		}
	};

	if (root.type === 'LoopRange') {
		checkRange(root);
		visit(root.start, undefined);
		visit(root.end, undefined);
	} else {
		visit(root, undefined);
	}
	return findings;
}

const ARITY: Record<FunctionCall['function']['name'], [number, number]> = {
	path: [2, 2],
	params: [2, 2],
	appendParams: [2, 2],
	fragment: [2, 2],
	snippet: [1, 2],
	format: [2, 2],
	resizeImage: [2, 3],
	sourceSet: [2, 3],
	take: [2, 2],
	skip: [2, 2],
};

/** The fewest values an operator function takes. */
const OPERATOR_FUNCTION_LEAST: Partial<
	Record<OperatorFunctionCall['operator']['name'], number>
> = {
	'-': 1,
	'*': 1,
	'/': 1,
	'%': 1,
	'==': 2,
	'!=': 2,
	'<': 2,
	'>': 2,
	'<=': 2,
	'>=': 2,
	'?:': 2,
};

/** The kind of a literal, `undefined` for anything computed or read. */
function literalKind(
	node: Node,
): 'string' | 'number' | 'boolean' | 'list' | 'map' | undefined {
	switch (unwrap(node).type) {
		case 'StringLiteral':
			return 'string';
		case 'NumberLiteral':
			return 'number';
		case 'BooleanLiteral':
			return 'boolean';
		case 'ListLiteral':
			return 'list';
		case 'MapLiteral':
			return 'map';
		default:
			return undefined;
	}
}

function listItems(node: Node): Node[] {
	const n = unwrap(node);
	return n.type === 'ListLiteral' ? n.items : [];
}

function isWidth(node: Node): boolean {
	const n = unwrap(node);
	if (n.type === 'NumberLiteral') {
		return true;
	}
	if (n.type === 'StringLiteral') {
		return /^\d+$/.test(n.value);
	}
	return literalKind(n) === undefined;
}

function isEmptyString(node: Node): boolean {
	const n = unwrap(node);
	return n.type === 'StringLiteral' && n.value === '';
}

/** A value made in the expression that can never read as a boolean. */
function isNeverBoolean(node: Node): boolean {
	switch (node.type) {
		case 'NumberLiteral':
		case 'ListLiteral':
		case 'Arithmetic':
			return true;
		case 'PlusChain':
			return operandKind(node) === 'number';
		case 'StringLiteral':
			return !(node.value === '' || /^(true|false|yes|no)$/i.test(node.value));
		case 'OperatorFunctionCall':
			return ['-', '*', '/', '%'].includes(node.operator.name);
		case 'LambdaOperation':
			return node.operator.name === 'filter' || node.operator.name === 'map';
		case 'FunctionCall':
			return [
				'path',
				'params',
				'appendParams',
				'fragment',
				'sourceSet',
			].includes(node.function.name);
		default:
			return false;
	}
}

/** Operators that read as part of a range's end or start when written beside `to`. */
const REACHING = new Set<Node['type']>([
	'Conditional',
	'Fallback',
	'Logical',
	'Equality',
	'Comparison',
	'Membership',
	'LambdaOperation',
	'TakeOrSkip',
	'FunctionCall',
]);

/**
 * Whether a value decides `and` or `or` on its own, so the value after it is
 * not read: false before `and`, true before `or`. Only values certain from
 * the expression decide: literals, maps, and conditions made of them.
 */
function decides(node: Node, operator: 'and' | 'or'): boolean {
	const truth = constantTruth(node);
	return truth !== undefined && truth === (operator === 'or');
}

/** The truth of a condition certain from the expression; `undefined` when it reads data or is not a condition. */
function constantTruth(node: Node): boolean | undefined {
	const n = unwrap(node);
	switch (n.type) {
		case 'BooleanLiteral':
			return n.value;
		case 'StringLiteral':
			return n.value === '' || isBooleanWord(n.value)
				? /^(true|yes)$/i.test(n.value)
				: undefined;
		case 'MapLiteral':
			return true;
		case 'LogicalNot': {
			const truth = constantTruth(n.operand);
			return truth === undefined ? undefined : !truth;
		}
		case 'Logical': {
			const left = constantTruth(n.left);
			if (left === undefined || left === (n.operator.name === 'or')) {
				return left;
			}
			return constantTruth(n.right);
		}
		case 'Comparison': {
			const [a, b] = [literalNumber(n.left), literalNumber(n.right)];
			if (a === undefined || b === undefined) {
				return undefined;
			}
			switch (n.operator.name) {
				case 'less':
					return a < b;
				case 'greater':
					return a > b;
				case 'lessOrEqual':
					return a <= b;
				default:
					return a >= b;
			}
		}
		case 'Equality': {
			// numbers are equal by their text, as written
			const [a, b] = [literalText(n.left), literalText(n.right)];
			if (a === undefined || b === undefined) {
				return undefined;
			}
			return (a === b) === (n.operator.name === 'equal');
		}
		default:
			return undefined;
	}
}

/** A number literal, or a string literal of digits. */
function literalNumber(node: Node): number | undefined {
	const n = unwrap(node);
	if (n.type === 'NumberLiteral') {
		return Number(n.raw);
	}
	return n.type === 'StringLiteral' && /^-?(\d+(\.\d+)?|\.\d+)$/.test(n.value)
		? Number(n.value)
		: undefined;
}

/** The text a number or string literal compares by. */
function literalText(node: Node): string | undefined {
	const n = unwrap(node);
	if (n.type === 'NumberLiteral') {
		return n.raw;
	}
	return n.type === 'StringLiteral' ? n.value : undefined;
}

/** The kind of a value that is certain from the expression; `undefined` for data and anything that depends on it. */
type OperandKind =
	| 'number'
	| 'digits'
	| 'text'
	| 'empty'
	| 'boolean'
	| 'list'
	| 'map';

const KIND_NAMES: Record<OperandKind, string> = {
	number: 'a number',
	digits: 'a string of digits',
	text: 'text',
	empty: 'the empty string',
	boolean: 'a boolean',
	list: 'a list',
	map: 'a map',
};

const TAKES = {
	numbers:
		'`-`, `*`, `/`, `%`, `<`, `>`, `<=` and `>=` take numbers, or strings of digits.',
	plus: '`+` joins any value to a string, and adds numbers; without a string, a boolean, a list or a map is refused.',
	collection: '`in` and `contains` search a string or a list.',
	item: 'A list can not be searched for, in a string or in a list.',
	mapItem: 'A map can be searched for in a list only.',
};

function operandKind(node: Node): OperandKind | undefined {
	const n = unwrap(node);
	switch (n.type) {
		case 'NumberLiteral':
		case 'Arithmetic':
			return 'number';
		case 'StringLiteral':
			if (n.value === '') {
				return 'empty';
			}
			return /^-?(\d+(\.\d+)?|\.\d+)$/.test(n.value) ? 'digits' : 'text';
		case 'BooleanLiteral':
		case 'Comparison':
		case 'Equality':
		case 'Logical':
		case 'LogicalNot':
		case 'Membership':
			return 'boolean';
		case 'ListLiteral':
			return 'list';
		case 'MapLiteral':
			return 'map';
		case 'PlusChain': {
			const kinds = n.operands.map(operandKind);
			return kinds.every((kind) => kind === 'number') ? 'number' : undefined;
		}
		default:
			return undefined;
	}
}

/** A number literal that `==` compares differently from its value: `007`, `5.0`, `.5`, `-0`. */
function isWrittenNumber(node: Node): boolean {
	const n = unwrap(node);
	return (
		n.type === 'NumberLiteral' && /^-?0\d|\.\d*0$|^-?\.|^-0(\.0*)?$/.test(n.raw)
	);
}

/** A literal, a data path or a parameter on its own: a property after it applies only to it. */
function isSingleValue(node: Node): boolean {
	return (
		['NumberLiteral', 'StringLiteral', 'BooleanLiteral'].includes(node.type) ||
		isPath(node)
	);
}

/** A `+` chain with a string and two numbers next to each other, which are joined, not added. */
function joinsNumbers(operands: Node[]): boolean {
	if (!operands.some((o) => o.type === 'StringLiteral')) {
		return false;
	}
	const numeric = (o: Node | undefined) =>
		o !== undefined && (o.type === 'NumberLiteral' || o.type === 'Arithmetic');
	return operands.some((o, i) => numeric(o) && numeric(operands[i + 1]));
}

/** `((data:a).b)`: a property of data in parentheses, itself in parentheses. */
function isPropertyOfParenthesized(node: Node): boolean {
	if (node.type !== 'Parenthesized') {
		return false;
	}
	const inner = node.expression;
	return (
		inner.type === 'PropertyAccess' &&
		inner.appliesTo === 'value' &&
		inner.object.type === 'Parenthesized' &&
		isPath(unwrap(inner.object))
	);
}
