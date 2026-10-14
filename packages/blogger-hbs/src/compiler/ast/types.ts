interface BaseNode {
	loc: SourceLocation;
}

export interface SourceLocation {
	source: string;
	start: Position;
	end: Position;
}

export interface Position {
	line: number;
	column: number;
}

export interface Program extends BaseNode {
	type: 'Program';
	body: Statement[];
	blockParams: string[];
}

interface BaseStatement extends BaseNode {}

export interface MustacheStatement extends BaseStatement {
	type: 'MustacheStatement';
	path: PathExpression | Literal;
	params: Expression[];
	hash?: Hash;
	escaped: boolean;
	strip: StripFlags;
}

export interface Decorator extends MustacheStatement {}

export interface BlockStatement extends BaseStatement {
	type: 'BlockStatement';
	path: PathExpression;
	params: Expression[];
	hash?: Hash;
	program: Program;
	inverse?: Program;
	openStrip: StripFlags;
	inverseStrip: StripFlags;
	closeStrip: StripFlags;
}

export interface DecoratorBlock extends BlockStatement {}

export interface PartialStatement extends BaseStatement {
	type: 'PartialStatement';
	name: PathExpression | SubExpression;
	params: Expression[];
	hash?: Hash;
	indent: string;
	strip: StripFlags;
}

export interface PartialBlockStatement extends BaseStatement {
	type: 'PartialBlockStatement';
	name: PathExpression | SubExpression;
	params: Expression[];
	hash?: Hash;
	program: Program;
	openStrip: StripFlags;
	closeStrip: StripFlags;
}

export interface ContentStatement extends BaseStatement {
	type: 'ContentStatement';
	value: string;
	original: string;
}

export interface CommentStatement extends BaseStatement {
	type: 'CommentStatement';
	value: string;
	strip: StripFlags;
}

export type Statement =
	| MustacheStatement
	| BlockStatement
	| PartialStatement
	| PartialBlockStatement
	| ContentStatement
	| CommentStatement;

interface BaseExpression extends BaseNode {}

export interface SubExpression extends BaseExpression {
	type: 'SubExpression';
	path: PathExpression;
	params: Expression[];
	hash?: Hash;
}

export interface PathExpression extends BaseExpression {
	type: 'PathExpression';
	data: boolean;
	depth: number;
	parts: string[];
	original: string;
}

interface BaseLiteral extends BaseExpression {}

export interface StringLiteral extends BaseLiteral {
	type: 'StringLiteral';
	value: string;
	original: string;
}

export interface BooleanLiteral extends BaseLiteral {
	type: 'BooleanLiteral';
	value: boolean;
	original: boolean;
}

export interface NumberLiteral extends BaseLiteral {
	type: 'NumberLiteral';
	value: number;
	original: number;
}

export interface UndefinedLiteral extends BaseLiteral {
	type: 'UndefinedLiteral';
}

export interface NullLiteral extends BaseLiteral {
	type: 'NullLiteral';
}

export type Literal =
	| StringLiteral
	| BooleanLiteral
	| NumberLiteral
	| UndefinedLiteral
	| NullLiteral;

export type Expression = Literal | SubExpression | PathExpression;

export interface Hash extends BaseNode {
	type: 'Hash';
	pairs: HashPair[];
}

export interface HashPair extends BaseNode {
	type: 'HashPair';
	key: string;
	value: Expression;
}

export interface StripFlags {
	open: boolean;
	close: boolean;
}

export type Node = Expression | Statement | Program | Hash | HashPair;
