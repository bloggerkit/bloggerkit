/**
 * AST node definitions for Blogger's template expression language.
 */

export type Span = { start: number; end: number };

export type Node =
	| StringLiteral
	| NumberLiteral
	| BooleanLiteral
	| ListLiteral
	| MapLiteral
	| SetLiteral
	| Identifier
	| EmptyDataReference
	| DataReference
	| MemberExpression
	| IndexExpression
	| CallExpression
	| UnaryExpression
	| BinaryExpression
	| LogicalExpression
	| MembershipExpression
	| ConditionalExpression
	| ElvisExpression
	| LambdaExpression
	| NamedOperatorExpression;

export interface BaseNode {
	readonly span: Span;
}

export interface StringLiteral extends BaseNode {
	readonly type: 'StringLiteral';
	readonly value: string;
}

export interface NumberLiteral extends BaseNode {
	readonly type: 'NumberLiteral';
	readonly value: number;
}

export interface BooleanLiteral extends BaseNode {
	readonly type: 'BooleanLiteral';
	readonly value: boolean;
}

/** `[a, b, c]` */
export interface ListLiteral extends BaseNode {
	readonly type: 'ListLiteral';
	readonly elements: Node[];
}

/**
 * `{ key: value, ... }` — a map literal. Distinguished from `SetLiteral` at
 * parse time: `{}` and `{ value, ... }` are parsed as `SetLiteral`, while
 * `{ key: value, ... }` is parsed as a `MapLiteral`. Each `key:` must be
 * followed by at least one space before the value (`{ a: 1 }`, not
 * `{ a:1 }`).
 */
export interface MapEntry {
	readonly key: string;
	readonly value: Node;
}
export interface MapLiteral extends BaseNode {
	readonly type: 'MapLiteral';
	readonly entries: MapEntry[];
}

/** `{}`, `{ "a", "b" }` — a set literal (bare values, no keys) */
export interface SetLiteral extends BaseNode {
	readonly type: 'SetLiteral';
	readonly elements: Node[];
}

/** A bare identifier — only legal as a currently-in-scope lambda parameter. */
export interface Identifier extends BaseNode {
	readonly type: 'Identifier';
	readonly name: string;
}

/**
 * Represents an empty `data:` path (e.g. `data:`, `data:.`), which evaluates to null
 * at runtime. Not reachable via any literal syntax — Blogger has no
 * `null`/`nil` keyword, so this can only ever arise from a `data:` chain
 * with zero segments.
 */
export interface EmptyDataReference extends BaseNode {
	readonly type: 'EmptyDataReference';
}

/** `data:foo` — the root of a data-bound member chain. */
export interface DataReference extends BaseNode {
	readonly type: 'DataReference';
	readonly name: string;
}

/** `map.property` */
export interface MemberExpression extends BaseNode {
	readonly type: 'MemberExpression';
	readonly object: Node;
	readonly property: string;
}

/** `list[0]`, `list["0"]` */
export interface IndexExpression extends BaseNode {
	readonly type: 'IndexExpression';
	readonly object: Node;
	readonly index: Node;
}

/** One of the fixed, built-in functions */
export type FunctionName =
	| 'path'
	| 'appendParams'
	| 'params'
	| 'snippet'
	| 'fragment'
	| 'resizeImage'
	| 'sourceSet'
	| 'format';

/** `name(arg1, arg2, ...)` — `name` is always one of `FunctionName`. */
export interface CallExpression extends BaseNode {
	readonly type: 'CallExpression';
	readonly callee: FunctionName;
	readonly args: Node[];
}

export type UnaryOperator = '!' | '-';
export interface UnaryExpression extends BaseNode {
	readonly type: 'UnaryExpression';
	readonly operator: UnaryOperator;
	readonly argument: Node;
}

export type BinaryOperator =
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
	| '>=';
export interface BinaryExpression extends BaseNode {
	readonly type: 'BinaryExpression';
	readonly operator: BinaryOperator;
	readonly left: Node;
	readonly right: Node;
}

export type LogicalOperator = 'and' | 'or';
export interface LogicalExpression extends BaseNode {
	readonly type: 'LogicalExpression';
	readonly operator: LogicalOperator;
	readonly left: Node;
	readonly right: Node;
}

/** `a in b`, `a contains b`, `a not in b`, `a not contains b` */
export interface MembershipExpression extends BaseNode {
	readonly type: 'MembershipExpression';
	readonly operator: 'in' | 'contains';
	readonly negated: boolean;
	readonly left: Node;
	readonly right: Node;
}

/** `test ? consequent : alternate` */
export interface ConditionalExpression extends BaseNode {
	readonly type: 'ConditionalExpression';
	readonly test: Node;
	readonly consequent: Node;
	readonly alternate: Node;
}

/** `left ?: right` — yields `left` unless it is null/undefined, else `right`. */
export interface ElvisExpression extends BaseNode {
	readonly type: 'ElvisExpression';
	readonly left: Node;
	readonly right: Node;
}

/**
 * `source filter (param => body)` and friends (`map`, `any`, `all`, `none`).
 * Blogger's lambda operators, chainable like member access:
 * `data:links filter (l => l.name == "icon") map (l => l.target)`.
 */
export type LambdaOperator = 'filter' | 'map' | 'any' | 'all' | 'none';
export interface LambdaExpression extends BaseNode {
	readonly type: 'LambdaExpression';
	readonly operator: LambdaOperator;
	readonly source: Node;
	readonly param: string;
	readonly body: Node;
}

/** One of the six fixed functions usable with infix syntax — see `FunctionName`. */
export type InfixFunctionName =
	| 'path'
	| 'appendParams'
	| 'params'
	| 'snippet'
	| 'fragment'
	| 'format';

/**
 * `left name right` — a builtin called with infix syntax instead of the
 * normal call form, e.g. `data:blog.homepageUrl.canonical path "search"`
 * (equivalent to `path(data:blog.homepageUrl.canonical, "search")`).
 */
export interface NamedOperatorExpression extends BaseNode {
	readonly type: 'NamedOperatorExpression';
	readonly operator: InfixFunctionName;
	readonly left: Node;
	readonly right: Node;
}
