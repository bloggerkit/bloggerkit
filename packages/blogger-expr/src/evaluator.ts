import {
	type ArithmeticName,
	type ComparisonName,
	type FunctionCall,
	type LambdaOperation,
	type LoopRange,
	type Node,
	nameOf,
	type OperatorFunctionCall,
	type Root,
	type TakeOrSkip,
} from './ast';
import { formatDate, PatternError, weekdayOf } from './dates';
import {
	type DiagnosticCode,
	diagnostic,
	ExpressionError,
} from './diagnostics';
import {
	ArgumentProblem,
	appendParams,
	fragment,
	params,
	path,
	resizeImage,
	snippet,
	sourceSet,
} from './functions';
import type { Span } from './source';
import { table } from './table';
import { DEFAULT_TEXT_OPTIONS, type TextOptions, toText } from './text';
import {
	add,
	compare,
	Decimal,
	divide,
	isBooleanWord,
	isList,
	isMap,
	isTruthy,
	kindOf,
	looseEquals,
	multiply,
	plain,
	RichValue,
	read,
	remainder,
	subtract,
	textOf,
	toNumber,
	type Value,
	type ValueMap,
} from './values';

export interface EvaluateOptions extends TextOptions {
	/** The names `data:` reads: `data:blog.title` reads `data.blog.title`. */
	data?: Record<string, unknown>;
}

/**
 * A value and where it comes from. A value read from data uses truthiness
 * where a condition is expected; a value made in the expression must be a
 * boolean, or a string that reads as one.
 */
interface Result {
	value: Value;
	fromData: boolean;
}

const made = (value: Value): Result => ({ value, fromData: false });
const fromData = (value: Value): Result => ({ value, fromData: true });

const MAX_RANGE = 1_000_000;

/** The operators that take two numbers. */
type NumberOperator = ArithmeticName | ComparisonName;

/** The value of a parsed expression for the data. Throws `ExpressionError`. */
export function evaluateNode(
	source: string,
	node: Root,
	options: EvaluateOptions = {},
): Value {
	return new Evaluator(source, options).run(node);
}

class Evaluator {
	private readonly scope: { name: string; value: Value }[] = [];
	private readonly text: Required<TextOptions>;

	constructor(
		private readonly source: string,
		private readonly options: EvaluateOptions,
	) {
		this.text = {
			language: options.language ?? DEFAULT_TEXT_OPTIONS.language,
			timeZone: options.timeZone ?? DEFAULT_TEXT_OPTIONS.timeZone,
			timestampFormat:
				options.timestampFormat ?? DEFAULT_TEXT_OPTIONS.timestampFormat,
		};
	}

	run(node: Root): Value {
		try {
			return node.type === 'LoopRange'
				? this.range(node)
				: this.eval(node).value;
		} catch (error) {
			// an invalid date in the data, or an invalid time zone or language option
			if (error instanceof RangeError) {
				return this.fail('evaluate-invalid', node.span, {
					problem: error.message,
				});
			}
			throw error;
		}
	}

	private fail(
		code: DiagnosticCode,
		at: Span,
		detail: Record<string, string> = {},
	): never {
		throw new ExpressionError(
			diagnostic(this.source, 'error', code, at, detail),
		);
	}

	private sourceOf(node: { span: Span }): string {
		return this.source.slice(node.span.start, node.span.end);
	}

	private toText = (value: Value): string => toText(value, this.text);

	private eval(node: Node): Result {
		switch (node.type) {
			case 'NumberLiteral':
				return made(Decimal.parse(node.raw));
			case 'StringLiteral':
				return made(node.value);
			case 'BooleanLiteral':
				return made(node.value);
			case 'ListLiteral':
				return made(node.items.map((item) => this.eval(item).value));
			case 'MapLiteral': {
				// own keys, `__proto__` and `constructor` too, the last of a key written twice
				const map = Object.fromEntries(
					node.entries.map((entry) => {
						const value = this.eval(entry.value).value;
						// a map keeps computed values: `{ a: 007 }.a` is `7`
						return [
							nameOf(entry.key),
							value instanceof Decimal ? value.computed() : value,
						];
					}),
				);
				return made(map);
			}
			case 'DataPath':
				return fromData(this.dataPath(node.root, node.properties));
			case 'Parameter':
				return fromData(this.lookup(node.name));
			case 'PropertyAccess':
				return fromData(
					this.member(this.eval(node.object).value, nameOf(node.property)),
				);
			case 'IndexAccess':
				return fromData(
					this.index(this.eval(node.object).value, this.eval(node.index).value),
				);
			case 'Parenthesized':
				return this.eval(node.expression);
			case 'LogicalNot':
				return made(!this.condition(node.operand));
			case 'Logical':
				return made(
					node.operator.name === 'and'
						? this.condition(node.left) && this.condition(node.right)
						: this.condition(node.left) || this.condition(node.right),
				);
			case 'Equality': {
				const equal = looseEquals(
					this.eval(node.left).value,
					this.eval(node.right).value,
					this.toText,
				);
				return made(node.operator.name === 'equal' ? equal : !equal);
			}
			case 'Arithmetic':
			case 'Comparison': {
				const operator = node.operator.name;
				const left = this.number(node.left, operator);
				const right = this.number(node.right, operator);
				return made(this.arithmetic(operator, left, right, node));
			}
			case 'PlusChain':
				return made(
					this.addition(
						node.operands.map((operand) => this.eval(operand).value),
						node,
					),
				);
			case 'Membership': {
				const found = this.contains(
					this.eval(node.collection).value,
					this.eval(node.item).value,
					node,
				);
				return made(found !== node.negated);
			}
			case 'Conditional':
				return this.condition(node.condition)
					? this.eval(node.whenTrue)
					: this.eval(node.whenFalse);
			case 'Fallback': {
				const value = this.eval(node.value);
				return plain(value.value) === undefined
					? this.eval(node.fallback)
					: value;
			}
			case 'LambdaOperation':
				return this.lambda(node);
			case 'TakeOrSkip':
				return fromData(
					this.slice(
						this.eval(node.list).value,
						this.eval(node.count).value,
						node.operator.name,
						node,
					),
				);
			case 'FunctionCall':
				return this.call(node);
			case 'OperatorFunctionCall':
				return made(this.operatorCall(node));
		}
	}

	// ----- data -----

	private lookup(name: string): Value {
		for (let i = this.scope.length - 1; i >= 0; i--) {
			const entry = this.scope[i] as { name: string; value: Value };
			if (entry.name === name) {
				return entry.value;
			}
		}
		return undefined;
	}

	/** `data:a.b.c`: the root is a lambda parameter or a name of the data. */
	private dataPath(root: string | undefined, properties: string[]): Value {
		if (root === undefined) {
			return undefined;
		}
		const fromScope = this.scope.some((entry) => entry.name === root);
		const data = this.options.data ?? {};
		let value = fromScope
			? this.lookup(root)
			: Object.hasOwn(data, root)
				? read(data[root])
				: undefined;
		for (const property of properties) {
			value = this.member(value, property);
		}
		return value;
	}

	/**
	 * `.name`: a property given with the value, a key of a map, or one Blogger
	 * has, whose name is in any case: `.length`, `.LENGTH`.
	 */
	private member(value: Value, name: string): Value {
		const property = name.toLowerCase();
		if (value instanceof RichValue) {
			const key =
				value.kind === 'image'
					? Object.keys(value.properties).find(
							(k) => k.toLowerCase() === property,
						)
					: Object.hasOwn(value.properties, name) && name;
			if (key) {
				return read(value.properties[key]);
			}
			if (value.kind === 'url' && property === 'raw') {
				return plain(value);
			}
		}
		const v = plain(value);
		if (isMap(v)) {
			return Object.hasOwn(v, name) ? read((v as ValueMap)[name]) : undefined;
		}
		if (Array.isArray(v)) {
			return listProperty(v, property);
		}
		if (v instanceof Date && property in DATE_PROPERTIES) {
			return this.dateProperty(v, property);
		}
		const text = textOf(value, this.toText);
		if (text === undefined) {
			return undefined;
		}
		if (property === 'length' || property === 'size') {
			return Decimal.integer([...text].length);
		}
		// the escaped text is read again: `"9999".escaped` is a number
		const escapeText = ESCAPES[property];
		return escapeText ? read(escapeText(text)) : undefined;
	}

	private dateProperty(date: Date, property: string): Value {
		if (property === 'dayofweek') {
			return Decimal.integer(weekdayOf(date, this.text.timeZone));
		}
		if (property === 'iso8601') {
			return formatDate(date, "yyyy-MM-dd'T'HH:mm:ssxxx", this.text);
		}
		return Decimal.parse(
			formatDate(date, DATE_PROPERTIES[property] as string, this.text),
		);
	}

	/** `[index]`: an integer, or a string of digits; anything else reads nothing. */
	private index(value: Value, index: Value): Value {
		const list = plain(value);
		if (!Array.isArray(list)) {
			return undefined;
		}
		const i = plain(index);
		let position: bigint | undefined;
		if (i instanceof Decimal && i.scale === 0) {
			position = i.mantissa;
		} else if (typeof i === 'string' && /^\d+$/.test(i)) {
			position = BigInt(i);
		}
		if (
			position === undefined ||
			position < 0n ||
			position >= BigInt(list.length)
		) {
			return undefined;
		}
		return read(list[Number(position)]);
	}

	// ----- conditions -----

	/**
	 * A condition: data uses truthiness; a value made in the expression must be
	 * a boolean, or a string `true`, `false`, `yes`, `no` or `""`.
	 */
	private condition(node: Node): boolean {
		const { value, fromData: isData } = this.eval(node);
		const v = plain(value);
		if (isData || typeof v === 'boolean') {
			return isTruthy(v);
		}
		if (typeof v === 'string' && (v === '' || isBooleanWord(v))) {
			return isTruthy(v);
		}
		// a map is true
		if (isMap(v)) {
			return true;
		}
		return this.fail('evaluate-condition', node.span, {
			text: this.sourceOf(node),
			found: kindOf(v),
		});
	}

	// ----- operators -----

	private number(node: Node, operator: string): Decimal {
		const value = this.eval(node).value;
		const n = toNumber(value);
		if (!n) {
			this.fail('evaluate-type', node.span, {
				operation: OPERATION_NAMES[operator] ?? `\`${operator}\``,
				text: this.sourceOf(node),
				found: kindOf(value),
			});
		}
		return n;
	}

	private arithmetic(
		operator: NumberOperator,
		left: Decimal,
		right: Decimal,
		at: Node,
	): Value {
		switch (operator) {
			case 'subtract':
				return subtract(left, right);
			case 'multiply':
				return multiply(left, right);
			case 'divide':
				return divide(left, right) ?? this.fail('division-by-zero', at.span);
			case 'remainder':
				return (
					remainder(left, right) ?? this.fail('remainder-by-zero', at.span)
				);
			case 'less':
				return compare(left, right) < 0;
			case 'greater':
				return compare(left, right) > 0;
			case 'lessOrEqual':
				return compare(left, right) <= 0;
			default:
				return compare(left, right) >= 0;
		}
	}

	/** A `+` chain: text when any value is a string, a date or missing data; a sum of numbers otherwise. */
	private addition(values: Value[], at: Node): Value {
		const joins = values.some((v) => {
			const p = plain(v);
			return p === undefined || typeof p === 'string' || p instanceof Date;
		});
		if (joins) {
			return values.map(this.toText).join('');
		}
		let total: Decimal | undefined;
		for (const [i, v] of values.entries()) {
			const p = plain(v);
			if (!(p instanceof Decimal)) {
				const operand = at.type === 'PlusChain' ? at.operands[i] : at;
				return this.fail('evaluate-type', (operand ?? at).span, {
					operation: '`+`',
					text: this.sourceOf(operand ?? at),
					found: kindOf(p),
				});
			}
			total = total ? add(total, p) : p.computed();
		}
		return total ?? Decimal.integer(0);
	}

	/**
	 * `item in collection`: a substring of text, an item of a list equal with
	 * `==`. Missing data is searched like `""`, and is never found in text; a
	 * map is never in a list; a list is never searched for.
	 */
	private contains(collection: Value, item: Value, at: Node): boolean {
		const c = plain(collection);
		const i = plain(item);
		if (Array.isArray(c) && !isList(i)) {
			return (
				i !== undefined && c.some((x) => looseEquals(read(x), i, this.toText))
			);
		}
		const text = c === undefined ? '' : c;
		if (
			typeof text === 'string' &&
			i !== undefined &&
			!isList(i) &&
			!isMap(i)
		) {
			return text.includes(this.toText(i));
		}
		return this.fail('evaluate-type', at.span, {
			operation: '`in` and `contains`',
			text: this.sourceOf(at),
			found: `${kindOf(i)} in ${kindOf(c)}`,
		});
	}

	// ----- lambdas, take, skip -----

	private lambda(node: LambdaOperation): Result {
		const list = plain(this.eval(node.list).value);
		if (list === undefined) {
			const defaults: Record<string, Value> = {
				filter: [],
				map: [],
				any: false,
				all: false,
				none: true,
				count: Decimal.integer(0),
				first: undefined,
			};
			return made(defaults[node.operator.name]);
		}
		if (!Array.isArray(list)) {
			return this.fail('evaluate-type', node.list.span, {
				operation: `\`${node.operator.spelling}\``,
				text: this.sourceOf(node.list),
				found: kindOf(list),
			});
		}
		const kept: unknown[] = [];
		const mapped: Value[] = [];
		let count = 0;
		this.scope.push({ name: node.parameter.name, value: undefined });
		try {
			for (const item of list) {
				(this.scope.at(-1) as { value: Value }).value = read(item);
				if (node.operator.name === 'map') {
					mapped.push(this.eval(node.body).value);
					continue;
				}
				const passed = this.condition(node.body);
				if (passed) {
					if (node.operator.name === 'any') {
						return made(true);
					}
					if (node.operator.name === 'none') {
						return made(false);
					}
					if (node.operator.name === 'first') {
						return fromData(read(item));
					}
					count++;
					kept.push(item);
				} else if (node.operator.name === 'all') {
					return made(false);
				}
			}
		} finally {
			this.scope.pop();
		}
		switch (node.operator.name) {
			case 'map':
				return made(mapped);
			case 'filter':
				return made(kept);
			case 'count':
				return made(Decimal.integer(count));
			case 'any':
				return made(false);
			case 'first':
				return made(undefined);
			default:
				return made(true);
		}
	}

	/** `take` and `skip`: the count is a number, rounded half up; `take` needs 1 or more, `skip` 0 or more. */
	private slice(
		list: Value,
		count: Value,
		operator: 'take' | 'skip',
		at: TakeOrSkip | FunctionCall,
	): Value {
		const items = plain(list);
		const listNode =
			at.type === 'TakeOrSkip' ? at.list : (at.arguments[0] as Node);
		const countNode =
			at.type === 'TakeOrSkip' ? at.count : (at.arguments[1] as Node);
		if (!Array.isArray(items)) {
			return this.fail('evaluate-type', listNode.span, {
				operation: `\`${operator}\``,
				text: this.sourceOf(listNode),
				found: kindOf(items),
			});
		}
		const n = plain(count);
		if (!(n instanceof Decimal)) {
			return this.fail('slice-count', countNode.span, {
				operator,
				text: this.sourceOf(countNode),
			});
		}
		const rounded = n.roundHalfUp();
		if (rounded < 0n || (operator === 'take' && rounded < 1n)) {
			return this.fail('slice-count-range', countNode.span, {
				operator,
				text: this.sourceOf(countNode),
			});
		}
		const k = Number(rounded > BigInt(items.length) ? items.length : rounded);
		return operator === 'take' ? items.slice(0, k) : items.slice(k);
	}

	// ----- calls -----

	private call(node: FunctionCall): Result {
		const args = node.arguments.map((a) => this.eval(a).value);
		try {
			switch (node.function.name) {
				case 'path':
					return made(path(args[0], args[1]));
				case 'fragment':
					return made(fragment(args[0], args[1]));
				case 'params':
					return made(params(args[0], args[1]));
				case 'appendParams':
					return made(appendParams(args[0], args[1]));
				case 'snippet':
					return fromData(snippet(args[0], args[1], args.length > 1));
				case 'format':
					return made(this.format(args[0], args[1]));
				case 'resizeImage':
					return made(resizeImage(args[0], args[1], args[2]));
				case 'sourceSet':
					return made(sourceSet(args[0], args[1], args[2]));
				default:
					return fromData(
						this.slice(args[0], args[1], node.function.name, node),
					);
			}
		} catch (error) {
			if (error instanceof ArgumentProblem) {
				const argument = node.arguments[error.argument] ?? node;
				return this.fail('evaluate-argument', argument.span, {
					name: node.function.spelling,
					problem: error.problem,
					text: this.sourceOf(argument),
				});
			}
			throw error;
		}
	}

	/** `format(date, pattern)`: in UTC, with the blog's language. */
	private format(date: Value, pattern: Value): Value {
		const d = plain(date);
		if (!(d instanceof Date)) {
			throw new ArgumentProblem(
				`the date must be a date of the data, not ${kindOf(d)}`,
				0,
			);
		}
		const p = plain(pattern);
		if (p === undefined) {
			return undefined;
		}
		if (typeof p !== 'string') {
			throw new ArgumentProblem(
				`the pattern must be a string, not ${kindOf(p)}`,
				1,
			);
		}
		try {
			return formatDate(d, p, {
				language: this.text.language,
				timeZone: 'UTC',
			});
		} catch (error) {
			if (error instanceof PatternError) {
				throw new ArgumentProblem(`${error.message}; quote text: 'at'`, 1);
			}
			throw error;
		}
	}

	/** `+(a, b)`, `and(a, b)`, `-(x)`: the operator applied from the left. */
	private operatorCall(node: OperatorFunctionCall): Value {
		const args = node.arguments;
		const value = (i: number) => this.eval(args[i] as Node).value;
		switch (node.operator.name) {
			case '+': {
				if (args.length === 0) {
					return Decimal.integer(0);
				}
				const values = args.map((_, i) => value(i));
				if (values.length === 1) {
					const n = plain(values[0]);
					return n instanceof Decimal ? n.computed() : values[0];
				}
				return this.addition(values, node);
			}
			case 'and':
				return args.every((a) => this.condition(a));
			case 'or':
				return args.some((a) => this.condition(a));
			case '?:': {
				for (const [i] of args.entries()) {
					const v = value(i);
					if (plain(v) !== undefined || i === args.length - 1) {
						return v;
					}
				}
				return undefined;
			}
			case 'in':
			case 'contains': {
				const [first, second] = [value(0), value(1)];
				return node.operator.name === 'in'
					? this.contains(second, first, node)
					: this.contains(first, second, node);
			}
			case '==':
			case '!=': {
				let result: Value = value(0);
				for (let i = 1; i < args.length; i++) {
					const equal = looseEquals(result, value(i), this.toText);
					result = node.operator.name === '==' ? equal : !equal;
				}
				return result;
			}
			default: {
				const operator = OPERATOR_FUNCTION_BINARY[
					node.operator.name
				] as NumberOperator;
				let result: Value = this.number(args[0] as Node, operator).computed();
				for (let i = 1; i < args.length; i++) {
					const left = toNumber(result);
					if (!left) {
						return this.fail('evaluate-type', node.span, {
							operation: `\`${node.operator.spelling}\``,
							text: this.sourceOf(node),
							found: kindOf(result),
						});
					}
					result = this.arithmetic(
						operator,
						left,
						this.number(args[i] as Node, operator),
						node,
					);
				}
				return result;
			}
		}
	}

	/** `start to end`, `n1..n2`: the integers from the start to the end, both included, up or down. */
	private range(at: LoopRange): Value {
		const { start: from, end: to } = at;
		const end = (node: Node) => {
			const n = toNumber(this.eval(node).value);
			if (!n?.isInteger()) {
				return this.fail('range-end', node.span, { text: this.sourceOf(node) });
			}
			return n.roundHalfUp();
		};
		const a = end(from);
		const b = end(to);
		const length = (a > b ? a - b : b - a) + 1n;
		if (length > BigInt(MAX_RANGE)) {
			return this.fail('range-end', at.span, { text: this.sourceOf(at) });
		}
		const step = a <= b ? 1n : -1n;
		const numbers: Decimal[] = [];
		for (let i = a; step > 0n ? i <= b : i >= b; i += step) {
			numbers.push(Decimal.integer(i));
		}
		return numbers;
	}
}

const OPERATION_NAMES = table<string>({
	subtract: '`-`',
	multiply: '`*`',
	divide: '`/`',
	remainder: '`%`',
	less: '`<`',
	greater: '`>`',
	lessOrEqual: '`<=`',
	greaterOrEqual: '`>=`',
});

const OPERATOR_FUNCTION_BINARY = table<NumberOperator>({
	'-': 'subtract',
	'*': 'multiply',
	'/': 'divide',
	'%': 'remainder',
	'<': 'less',
	'>': 'greater',
	'<=': 'lessOrEqual',
	'>=': 'greaterOrEqual',
});

function listProperty(list: readonly unknown[], property: string): Value {
	switch (property) {
		case 'length':
		case 'size':
			return Decimal.integer(list.length);
		case 'first':
			return read(list[0]);
		case 'last':
			return read(list.at(-1));
		case 'empty':
		case 'isempty':
			return list.length === 0;
		// not empty, whatever the items: `[false].any` is true
		case 'notempty':
		case 'any':
			return list.length > 0;
		default:
			return undefined;
	}
}

/** The properties of a date, in lower case, with the pattern of the numbers. */
const DATE_PROPERTIES = table<string | undefined>({
	year: 'y',
	month: 'M',
	day: 'd',
	dayofmonth: 'd',
	dayofweek: undefined,
	dayofyear: 'D',
	iso8601: undefined,
});

const HTML_ESCAPES = table<string>({
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
});

const JS_ESCAPES = table<string>({
	'\\': '\\\\',
	'"': '\\x22',
	"'": '\\x27',
	'<': '\\x3c',
	'>': '\\x3e',
	'&': '\\x26',
	'=': '\\x3d',
	'\n': '\\n',
	'\r': '\\r',
	'\u0085': '\\x85',
	'\u2028': '\\u2028',
	'\u2029': '\\u2029',
	'\ufeff': '\\ufeff',
});

const JSON_ESCAPES = table<string>({
	'\\': '\\\\',
	'"': '\\"',
	'<': '\\u003c',
	'>': '\\u003e',
	'&': '\\u0026',
	'=': '\\u003d',
	'\n': '\\n',
	'\r': '\\r',
	'\t': '\\t',
	'\u0085': '\\u0085',
	'\u2028': '\\u2028',
	'\u2029': '\\u2029',
	'\ufeff': '\\ufeff',
});

/** The escapes, by their names in lower case. A tab is kept by `jsEscaped`, a backslash by `cssEscaped`. */
const ESCAPES = table<(text: string) => string>({
	escaped: (text) => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] as string),
	jsescaped: (text) =>
		text.replace(
			/[\\"'<>&=\n\r\u0085\u2028\u2029\ufeff]/g,
			(c) => JS_ESCAPES[c] as string,
		),
	jsonescaped: (text) =>
		text.replace(
			/[\\"<>&=\n\r\t\u0085\u2028\u2029\ufeff]/g,
			(c) => JSON_ESCAPES[c] as string,
		),
	cssescaped: (text) => text.replace(/["'()/:]/g, (c) => `\\${c}`),
});
