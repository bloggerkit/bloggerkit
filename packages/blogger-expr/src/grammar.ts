/**
 * Rules of the grammar shared by the parser and the printer, so that what the
 * printer writes is exactly what the parser accepts.
 */

import type {
	FunctionName,
	InfixFunctionName,
	LambdaOperator,
	Node,
} from './ast';

export const LAMBDA_OPERATORS: ReadonlySet<LambdaOperator> = new Set([
	'filter',
	'map',
	'any',
	'all',
	'none',
]);

export const FUNCTION_NAMES: ReadonlySet<FunctionName> = new Set([
	'path',
	'appendParams',
	'params',
	'snippet',
	'fragment',
	'resizeImage',
	'sourceSet',
	'format',
]);

export const INFIX_FUNCTION_NAMES: ReadonlySet<InfixFunctionName> = new Set([
	'path',
	'appendParams',
	'params',
	'snippet',
	'fragment',
	'format',
]);

/** A bare identifier token: a lambda parameter, a property or a map key. */
export const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** A segment of a `data:` path, which can also have digits first and `-`. */
export const DATA_SEGMENT = /^[A-Za-z0-9_$-]+$/;

/**
 * Words the parser reads as something else wherever an expression starts, so
 * an identifier named like them can not be referenced.
 */
export const RESERVED_WORDS: ReadonlySet<string> = new Set([
	'true',
	'false',
	'yes',
	'no',
	'null',
	'nil',
	'not',
]);

/**
 * Node types that can not appear bare where a single value is expected: a
 * function argument, a list or set element, a map value, or the right
 * operand of an infix function. They have to be wrapped in parentheses there.
 */
export const REQUIRES_WRAPPING: ReadonlySet<Node['type']> = new Set([
	'BinaryExpression',
	'LogicalExpression',
	'MembershipExpression',
	'ConditionalExpression',
	'ElvisExpression',
	'NamedOperatorExpression',
	'LambdaExpression',
]);

const LITERAL_TYPES: ReadonlySet<Node['type']> = new Set([
	'StringLiteral',
	'NumberLiteral',
	'BooleanLiteral',
	'ListLiteral',
	'MapLiteral',
	'SetLiteral',
	'EmptyDataReference',
]);

export const isLiteral = (node: Node): boolean => LITERAL_TYPES.has(node.type);

/** Checks an argument, returns the problem or null. */
/** What is wrong with an item of a list argument, and the item. */
interface ItemProblem {
	problem: string;
	index: number;
	node: Node;
}

/** Checks an argument, returns the problem, of the argument or of one of its items, or null. */
type ArgValidator = (node: Node) => string | ItemProblem | null;

const anyType: ArgValidator = () => null;
const stringType: ArgValidator = (n) =>
	isLiteral(n) && n.type !== 'StringLiteral'
		? 'must be a string literal'
		: null;
const mapType: ArgValidator = (n) =>
	isLiteral(n) && n.type !== 'MapLiteral'
		? 'must be a map literal, e.g. { key: value }'
		: null;
const listType: ArgValidator = (n) =>
	isLiteral(n) && n.type !== 'ListLiteral'
		? 'must be a list literal, e.g. [1, 2, 3]'
		: null;
/** What a width of an image has to be, for errors. */
export const WIDTH_PROBLEM =
	'must be an integer of 0 or more, a number or a string of digits only, 640 or "640"';

/**
 * A width of an image: an integer of 0 or more, given as a number or as a
 * string of digits only, `640` or `"640"`. Undefined for anything else,
 * `" 640"` too, as Blogger does not render it.
 */
export function widthOf(value: unknown): number | undefined {
	const width =
		typeof value === 'number'
			? value
			: typeof value === 'string' && /^\d+$/.test(value)
				? Number(value)
				: Number.NaN;
	return Number.isInteger(width) && width >= 0 ? width : undefined;
}

const widthType: ArgValidator = (n) => {
	if (n.type === 'NumberLiteral' || n.type === 'StringLiteral') {
		return widthOf(n.value) === undefined ? WIDTH_PROBLEM : null;
	}
	return isLiteral(n) ? WIDTH_PROBLEM : null;
};
const widthsType: ArgValidator = (n) => {
	if (n.type !== 'ListLiteral') {
		return listType(n);
	}
	for (const [index, node] of n.elements.entries()) {
		const problem = widthType(node);
		if (typeof problem === 'string') {
			return { problem, index, node };
		}
	}
	return null;
};

interface FunctionSignature {
	readonly min: number;
	readonly max: number;
	readonly args: readonly ArgValidator[];
}

const FUNCTION_SIGNATURES: Record<FunctionName, FunctionSignature> = {
	path: { min: 2, max: 2, args: [stringType, stringType] },
	appendParams: { min: 2, max: 2, args: [stringType, mapType] },
	params: { min: 2, max: 2, args: [stringType, mapType] },
	snippet: { min: 1, max: 2, args: [stringType, mapType] },
	fragment: { min: 2, max: 2, args: [stringType, stringType] },
	resizeImage: {
		min: 2,
		max: 3,
		args: [stringType, widthType, stringType],
	},
	sourceSet: {
		min: 2,
		max: 3,
		args: [stringType, widthsType, stringType],
	},
	format: { min: 2, max: 2, args: [anyType, stringType] },
};

const SNIPPET_OPTION_TYPES: Record<string, 'NumberLiteral' | 'BooleanLiteral'> =
	{
		length: 'NumberLiteral',
		links: 'BooleanLiteral',
		linebreaks: 'BooleanLiteral',
		ellipsis: 'BooleanLiteral',
	};

export interface CallProblem {
	message: string;
	/** The argument with the problem, undefined when it is the arity. */
	node?: Node;
}

/**
 * Checks the arguments of a call (or an infix function, with the operands as
 * its two arguments) the way the parser does. Only literal arguments can be
 * checked for their type, anything else is known when evaluating.
 */
export function checkCall(
	name: FunctionName,
	args: Node[],
): CallProblem | null {
	const signature = FUNCTION_SIGNATURES[name];
	if (args.length < signature.min || args.length > signature.max) {
		const arity =
			signature.min === signature.max
				? `${signature.min}`
				: `${signature.min}-${signature.max}`;
		return {
			message: `${name}() expects ${arity} argument(s), got ${args.length}`,
		};
	}

	for (let i = 0; i < args.length; i++) {
		const arg = args[i] as Node;
		const problem = signature.args[i]?.(arg);
		if (typeof problem === 'string') {
			return { message: `${name}(): argument ${i + 1} ${problem}`, node: arg };
		}
		if (problem) {
			return {
				message: `${name}(): item ${problem.index + 1} of argument ${i + 1} ${problem.problem}`,
				node: problem.node,
			};
		}
	}

	const options = args[1];
	if (name === 'snippet' && options?.type === 'MapLiteral') {
		for (const entry of options.entries) {
			const expected = SNIPPET_OPTION_TYPES[entry.key];
			if (!expected) {
				return {
					message: `snippet(): unsupported option '${entry.key}' (expected one of: ${Object.keys(SNIPPET_OPTION_TYPES).join(', ')})`,
					node: entry.value,
				};
			}
			if (isLiteral(entry.value) && entry.value.type !== expected) {
				return {
					message: `snippet(): option '${entry.key}' must be a ${expected === 'NumberLiteral' ? 'number' : 'boolean'}`,
					node: entry.value,
				};
			}
		}
	}

	return null;
}
