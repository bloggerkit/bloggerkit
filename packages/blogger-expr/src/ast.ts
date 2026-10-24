import type { Span } from './source';

/**
 * The tree of an expression. The `type` of a node says what it does; every
 * node has the `span` it was read from and its `loc`. Nodes keep how they were
 * written where Blogger keeps it (number text, keyword spellings), so that
 * printing gives back the source.
 */
export type Node =
	| NumberLiteral
	| StringLiteral
	| BooleanLiteral
	| ListLiteral
	| MapLiteral
	| DataPath
	| Parameter
	| PropertyAccess
	| IndexAccess
	| Parenthesized
	| LogicalNot
	| Arithmetic
	| Comparison
	| Equality
	| Logical
	| PlusChain
	| Membership
	| Conditional
	| Fallback
	| LambdaOperation
	| TakeOrSkip
	| FunctionCall
	| OperatorFunctionCall;

/**
 * What `parse` gives: an expression, or, as the whole `values` of a loop, a
 * range. A range is never inside another node.
 */
export type Root = Node | LoopRange;

/** A place in the expression; `line` and `column` from 1, `offset` from 0. */
export interface Position {
	line: number;
	column: number;
	offset: number;
}

export interface Location {
	start: Position;
	end: Position;
}

interface Base {
	span: Span;
	loc: Location;
}

/** An operator or a keyword as written: its meaning, its spelling and its place. */
export interface Operator<Name extends string = string> {
	name: Name;
	/** As written: `==` or `eq`, `&&` or `and`, `filter` or `where`. */
	spelling: string;
	span: Span;
}

// ----- literals -----

/** `12`, `-1.50`, `.5`, `007`. Blogger prints and compares `raw`, as written. */
export interface NumberLiteral extends Base {
	type: 'NumberLiteral';
	raw: string;
	value: number;
}

/** `"a \"b\""`: `raw` with its quotes, `value` the text, `\"` read as `"`. */
export interface StringLiteral extends Base {
	type: 'StringLiteral';
	raw: string;
	value: string;
}

/** `true`, `false`, `yes`, `no`, in any case. */
export interface BooleanLiteral extends Base {
	type: 'BooleanLiteral';
	raw: string;
	value: boolean;
}

/** `[1, 2]`, or `{1, 2}`, a list written with braces; `{}` is an empty list. */
export interface ListLiteral extends Base {
	type: 'ListLiteral';
	notation: 'brackets' | 'braces';
	items: Node[];
}

/** `{ name: "x", "data-id": 2 }` */
export interface MapLiteral extends Base {
	type: 'MapLiteral';
	entries: MapEntry[];
}

export interface MapEntry {
	key: Name;
	value: Node;
	span: Span;
}

/**
 * A key of a map or the name of a property. A quoted name is another name:
 * `"a-b"` and `a-b` are two keys, see `nameOf`.
 */
export interface Name {
	text: string;
	quoted: boolean;
	span: Span;
}

// ----- data -----

/** `data:post.title`: `root` is `post`, `properties` `["title"]`; `data:` alone has no root. */
export interface DataPath extends Base {
	type: 'DataPath';
	root: string | undefined;
	properties: string[];
}

/** The parameter of the lambda the word is in: `p` in `p => p.title`. */
export interface Parameter extends Base {
	type: 'Parameter';
	name: string;
}

/**
 * `object.property`. A property written right after a string, or after a
 * number or a data path with a space before the dot, applies to everything
 * before it: `"x" + "ab".length` is `("x" + "ab").length`.
 */
export interface PropertyAccess extends Base {
	type: 'PropertyAccess';
	object: Node;
	property: Name;
	appliesTo: 'value' | 'everythingBefore';
}

/** `object[index]`, on data only. */
export interface IndexAccess extends Base {
	type: 'IndexAccess';
	object: Node;
	index: Node;
}

/** `(expression)` */
export interface Parenthesized extends Base {
	type: 'Parenthesized';
	expression: Node;
}

// ----- operators -----

/** `!x`, `not x` */
export interface LogicalNot extends Base {
	type: 'LogicalNot';
	operator: Operator<'not'>;
	operand: Node;
}

export type ArithmeticName = 'subtract' | 'multiply' | 'divide' | 'remainder';

/** `a - b`, `a * b`, `a / b`, `a % b` */
export interface Arithmetic extends Base {
	type: 'Arithmetic';
	operator: Operator<ArithmeticName>;
	left: Node;
	right: Node;
}

export type ComparisonName =
	| 'less'
	| 'greater'
	| 'lessOrEqual'
	| 'greaterOrEqual';

/** `a < b`, `a lte b`…: numbers, or strings written like numbers. */
export interface Comparison extends Base {
	type: 'Comparison';
	operator: Operator<ComparisonName>;
	left: Node;
	right: Node;
}

/** `a == b`, `a neq b`… */
export interface Equality extends Base {
	type: 'Equality';
	operator: Operator<'equal' | 'notEqual'>;
	left: Node;
	right: Node;
}

/** `a and b`, `a || b`… */
export interface Logical extends Base {
	type: 'Logical';
	operator: Operator<'and' | 'or'>;
	left: Node;
	right: Node;
}

/**
 * `a + b + c`: one chain. It adds numbers, unless a value is text or missing
 * data, then it joins every value as text: `20 + 25 + ""` is `"2025"`.
 * `operators` has the `+` between each two operands.
 */
export interface PlusChain extends Base {
	type: 'PlusChain';
	operands: Node[];
	operators: Operator<'plus'>[];
}

/** `item in collection`, `collection contains item`, with `not`. */
export interface Membership extends Base {
	type: 'Membership';
	operator: Operator<'in' | 'contains'>;
	negated: boolean;
	item: Node;
	collection: Node;
}

/** `condition ? whenTrue : whenFalse` */
export interface Conditional extends Base {
	type: 'Conditional';
	condition: Node;
	whenTrue: Node;
	whenFalse: Node;
}

/** `value ?: fallback`: `fallback` when `value` is missing data. */
export interface Fallback extends Base {
	type: 'Fallback';
	operator: Operator<'fallback'>;
	value: Node;
	fallback: Node;
}

// ----- lists -----

export type LambdaName =
	| 'filter'
	| 'map'
	| 'any'
	| 'all'
	| 'none'
	| 'count'
	| 'first';

/** `list filter (p => body)`: the operator goes through the list with `parameter`. */
export interface LambdaOperation extends Base {
	type: 'LambdaOperation';
	operator: Operator<LambdaName>;
	list: Node;
	parameter: { name: string; span: Span };
	body: Node;
	/** `bare`: written without parentheses, the body runs to the end. */
	notation: 'parenthesized' | 'bare';
}

/** `list take 2`, `list skip 1`; `limit` and `offset` are other spellings. */
export interface TakeOrSkip extends Base {
	type: 'TakeOrSkip';
	operator: Operator<'take' | 'skip'>;
	list: Node;
	count: Node;
}

// ----- calls -----

export type FunctionName =
	| 'path'
	| 'params'
	| 'appendParams'
	| 'fragment'
	| 'snippet'
	| 'format'
	| 'resizeImage'
	| 'sourceSet'
	| 'take'
	| 'skip';

/** `path(url, "x")`, or written between its two arguments: `url path "x"`. */
export interface FunctionCall extends Base {
	type: 'FunctionCall';
	function: Operator<FunctionName>;
	arguments: Node[];
	notation: 'prefix' | 'infix';
}

export type OperatorFunctionName =
	| '+'
	| '-'
	| '*'
	| '/'
	| '%'
	| '=='
	| '!='
	| '<'
	| '>'
	| '<='
	| '>='
	| 'and'
	| 'or'
	| '?:'
	| 'in'
	| 'contains';

/** An operator written as a function: `+(a, b, c)`, `and(x, y)`, and `-(x)`, which gives `x` back. */
export interface OperatorFunctionCall extends Base {
	type: 'OperatorFunctionCall';
	operator: Operator<OperatorFunctionName>;
	arguments: Node[];
}

/**
 * `start to end`, `1..5`: only the whole `values` of a loop. `to` takes
 * everything before it as the start and everything after it as the end; `..`
 * takes two integer literals.
 */
export interface LoopRange extends Base {
	type: 'LoopRange';
	start: Node;
	end: Node;
	notation: 'to' | 'dots';
}

// ----- helpers -----

/** The name Blogger knows a key or property by: a quoted one keeps its quotes. */
export function nameOf(name: Name): string {
	return name.quoted ? `"${name.text}"` : name.text;
}

/** The direct children of a node, in the order they are written. */
export function childrenOf(node: Root): Node[] {
	switch (node.type) {
		case 'ListLiteral':
			return node.items;
		case 'MapLiteral':
			return node.entries.map((entry) => entry.value);
		case 'PropertyAccess':
			return [node.object];
		case 'IndexAccess':
			return [node.object, node.index];
		case 'Parenthesized':
			return [node.expression];
		case 'LogicalNot':
			return [node.operand];
		case 'Arithmetic':
		case 'Comparison':
		case 'Equality':
		case 'Logical':
			return [node.left, node.right];
		case 'PlusChain':
			return node.operands;
		case 'Membership':
			return node.operator.name === 'contains'
				? [node.collection, node.item]
				: [node.item, node.collection];
		case 'Conditional':
			return [node.condition, node.whenTrue, node.whenFalse];
		case 'Fallback':
			return [node.value, node.fallback];
		case 'LambdaOperation':
			return [node.list, node.body];
		case 'TakeOrSkip':
			return [node.list, node.count];
		case 'FunctionCall':
		case 'OperatorFunctionCall':
			return node.arguments;
		case 'LoopRange':
			return [node.start, node.end];
		default:
			return [];
	}
}

/** Calls `visit` on each direct child of a node. */
export function forEachChild(node: Root, visit: (child: Node) => void): void {
	for (const child of childrenOf(node)) {
		visit(child);
	}
}

/** Whether the node reads data: a data path or a parameter, with properties and indexes on it. */
export function isPath(node: Node): boolean {
	switch (node.type) {
		case 'DataPath':
		case 'Parameter':
			return true;
		case 'PropertyAccess':
			return node.appliesTo === 'value' && isPath(node.object);
		case 'IndexAccess':
			return isPath(node.object);
		default:
			return false;
	}
}

/** The node inside any number of parentheses. */
export function unwrap(node: Node): Node {
	return node.type === 'Parenthesized' ? unwrap(node.expression) : node;
}
