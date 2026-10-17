import type {
	BinaryOperator,
	FunctionName,
	InfixFunctionName,
	LambdaOperator,
	LogicalOperator,
	MapEntry,
	Node,
	Span,
} from './ast';
import {
	checkCall,
	FUNCTION_NAMES,
	INFIX_FUNCTION_NAMES,
	LAMBDA_OPERATORS,
	REQUIRES_WRAPPING,
} from './grammar';
import { type Token, tokenize } from './lexer';

export class ParseError extends Error {
	constructor(
		message: string,
		public readonly position: number,
	) {
		super(`${message} (at position ${position})`);
		this.name = 'ParseError';
	}
}

const KEYWORD_BINARY_OPS: Record<string, BinaryOperator> = {
	eq: '==',
	ne: '!=',
	lt: '<',
	gt: '>',
	lte: '<=',
	gte: '>=',
};

const MINUS_SPACING =
	"A '-' between two values needs a space before and after it, 'a - b', or parentheses next to it, '(a)- b' or 'a -(b)'";

const isSpace = (char: string | undefined): boolean =>
	char === ' ' || char === '\t' || char === '\n' || char === '\r';

/** The operators of each binary level, as symbols and as keywords. */
const EQUALITY = { symbols: ['==', '!='], keywords: ['eq', 'ne'] };
const RELATIONAL = {
	symbols: ['<=', '>=', '<', '>'],
	keywords: ['lte', 'gte', 'lt', 'gt'],
};
const ADDITIVE = { symbols: ['+', '-'], keywords: [] };
type MembershipOperator = 'in' | 'contains';
const MEMBERSHIP_OPERATORS: readonly MembershipOperator[] = ['in', 'contains'];
const MULTIPLICATIVE = { symbols: ['*', '/', '%'], keywords: [] };

/** What `node` is, with its article, for messages: `An operator expression`. */
function describeNode(node: Node): string {
	switch (node.type) {
		case 'BinaryExpression':
			return 'An operator expression';
		case 'LogicalExpression':
			return "An 'and'/'or' expression";
		case 'MembershipExpression':
			return "An 'in'/'contains' expression";
		case 'ConditionalExpression':
			return "A conditional ('?:') expression";
		case 'ElvisExpression':
			return "An elvis ('?:') expression";
		case 'NamedOperatorExpression':
			return 'An infix function call';
		case 'LambdaExpression':
			return "A 'filter'/'map'/'any'/'all'/'none' chain";
		default:
			return 'An expression';
	}
}

/** Parses a single Blogger expression string into an AST. */
export function parse(source: string): Node {
	const tokens = tokenize(source);
	const parser = new Parser(tokens, source);
	const node = parser.parseExpression();
	parser.expectEOF();
	return node;
}

class Parser {
	private pos = 0;
	private activeParam: string | null = null;

	/**
	 * Tracks exactly which node objects were returned *directly and
	 * unchanged* from a `(...)` primary group (see the `(` branch of
	 * `parsePrimary`). Parens are otherwise "invisible" in the AST — the `(`
	 * branch just returns the inner node as-is — so without this we'd have no
	 * way to tell a properly-wrapped `(data:x path "y")` apart from a bare
	 * `data:x path "y"`, since both produce an identical `NamedOperatorExpression`
	 * node. `parseRestrictedValue` and the postfix-continuation guards below
	 * consult this to allow the wrapped form while rejecting the bare one.
	 */
	private readonly parenWrapped = new WeakSet<object>();

	constructor(
		private readonly tokens: Token[],
		private readonly source: string,
	) {}

	private peek(offset = 0): Token {
		const token = this.tokens[this.pos + offset];
		if (!token) {
			throw new ParseError('Unexpected end of input', this.source.length);
		}
		return token;
	}

	private advance(): Token {
		const token = this.peek();
		if (token.type !== 'EOF') {
			this.pos++;
		}
		return token;
	}

	private span(start: number): Span {
		return { start, end: this.tokens[this.pos]?.start ?? this.source.length };
	}

	// whether the token `offset` tokens ahead is this one

	private isKeyword(name: string, offset = 0): boolean {
		const t = this.peek(offset);
		return t.type === 'IDENT' && t.value === name;
	}

	private isOp(value: string, offset = 0): boolean {
		const t = this.peek(offset);
		return t.type === 'OP' && t.value === value;
	}

	private isPunct(value: string, offset = 0): boolean {
		const t = this.peek(offset);
		return t.type === 'PUNCT' && t.value === value;
	}

	/** Items separated by commas, `parseItem` reading each, with its index. */
	private parseSeparated<T>(parseItem: (index: number) => T): T[] {
		const items = [parseItem(0)];
		while (this.isPunct(',')) {
			this.advance();
			items.push(parseItem(items.length));
		}
		return items;
	}

	private expectPunct(value: string): Token {
		if (!this.isPunct(value)) {
			throw new ParseError(`Expected '${value}'`, this.peek().start);
		}
		return this.advance();
	}

	expectEOF(): void {
		if (this.peek().type !== 'EOF') {
			throw new ParseError(
				`Unexpected token '${this.peek().value}'`,
				this.peek().start,
			);
		}
	}

	private validateArgs(name: FunctionName, args: Node[], span: Span): void {
		const problem = checkCall(name, args);
		if (problem) {
			throw new ParseError(
				problem.message,
				problem.node?.span.start ?? span.start,
			);
		}
	}

	parseExpression(): Node {
		return this.parseConditional();
	}

	/**
	 * Parses an expression in a "restricted" position: a function-call
	 * argument, a list/set-literal element, a map-literal value, or an infix
	 * function operand. Operators — `+`, `and`, `?:`, `in`/`contains`, infix
	 * function calls (`x path "y"`), and `filter`/`map`/`any`/`all`/`none`
	 * chains — are not allowed to appear bare here; the whole subexpression
	 * must be parenthesized instead, e.g. `path(data:url, (data:num + 1))` or
	 * `[(data:x path "y")]`. Literals, list/map/set literals, `data:` chains
	 * (including `.prop`/`[i]`), function calls, unary expressions (`!x`,
	 * `-x`), and parenthesized expressions of any shape are all fine bare.
	 */
	private parseRestrictedValue(context: string): Node {
		const node = this.parseUnary();
		if (!this.parenWrapped.has(node) && REQUIRES_WRAPPING.has(node.type)) {
			throw new ParseError(
				`${describeNode(node)} must be wrapped in parentheses to be used as ${context}, e.g. '(${this.source.slice(node.span.start, node.span.end)})'`,
				node.span.start,
			);
		}
		return node;
	}

	// test ? consequent : alternate   (right-associative)
	// test ?: fallback                (right-associative "elvis"/null-coalescing)
	private parseConditional(): Node {
		const start = this.peek().start;
		const test = this.parseLogicalOr();
		if (this.isOp('?:')) {
			this.advance();
			const right = this.parseConditional();
			return {
				type: 'ElvisExpression',
				left: test,
				right,
				span: this.span(start),
			};
		}
		if (this.isOp('?')) {
			this.advance();
			const consequent = this.parseExpression();
			this.expectPunct(':');
			const alternate = this.parseConditional();
			return {
				type: 'ConditionalExpression',
				test,
				consequent,
				alternate,
				span: this.span(start),
			};
		}
		return test;
	}

	private parseLogicalOr(): Node {
		const start = this.peek().start;
		let left = this.parseLogicalAnd();
		while (this.isKeyword('or') || this.isOp('||')) {
			this.advance();
			const right = this.parseLogicalAnd();
			left = this.makeLogical('or', left, right, start);
		}
		return left;
	}

	private parseLogicalAnd(): Node {
		const start = this.peek().start;
		let left = this.parseMembership();
		while (this.isKeyword('and') || this.isOp('&&')) {
			this.advance();
			const right = this.parseMembership();
			left = this.makeLogical('and', left, right, start);
		}
		return left;
	}

	private makeLogical(
		operator: LogicalOperator,
		left: Node,
		right: Node,
		start: number,
	): Node {
		return {
			type: 'LogicalExpression',
			operator,
			left,
			right,
			span: this.span(start),
		};
	}

	private parseMembership(): Node {
		const start = this.peek().start;
		let left = this.parseEquality();
		for (;;) {
			const membership = this.membershipOperator();
			if (!membership) {
				break;
			}
			this.advance();
			if (membership.negated) {
				this.advance();
			}
			const right = this.parseEquality();
			left = {
				type: 'MembershipExpression',
				operator: membership.operator,
				negated: membership.negated,
				left,
				right,
				span: this.span(start),
			};
		}
		return left;
	}

	/** `in`, `contains`, `not in` or `not contains`, if it is next. */
	private membershipOperator():
		| { operator: MembershipOperator; negated: boolean }
		| undefined {
		for (const operator of MEMBERSHIP_OPERATORS) {
			if (this.isKeyword(operator)) {
				return { operator, negated: false };
			}
			if (this.isKeyword('not') && this.isKeyword(operator, 1)) {
				return { operator, negated: true };
			}
		}
		return undefined;
	}

	private parseEquality(): Node {
		const start = this.peek().start;
		let left = this.parseRelational();
		for (;;) {
			const op = this.matchBinaryOp(EQUALITY);
			if (!op) {
				break;
			}
			const right = this.parseRelational();
			left = {
				type: 'BinaryExpression',
				operator: op,
				left,
				right,
				span: this.span(start),
			};
		}
		return left;
	}

	private parseRelational(): Node {
		const start = this.peek().start;
		let left = this.parseAdditive();
		for (;;) {
			const op = this.matchBinaryOp(RELATIONAL);
			if (!op) {
				break;
			}
			const right = this.parseAdditive();
			left = {
				type: 'BinaryExpression',
				operator: op,
				left,
				right,
				span: this.span(start),
			};
		}
		return left;
	}

	private parseAdditive(): Node {
		const start = this.peek().start;
		let left = this.parseMultiplicative();
		for (;;) {
			const token = this.peek();
			// `a -3` and `a-3`: a negative number right after a value
			if (token.type === 'NUMBER' && token.value.startsWith('-')) {
				throw new ParseError(MINUS_SPACING, token.start);
			}
			const op = this.matchBinaryOp(ADDITIVE);
			if (!op) {
				break;
			}
			if (op === '-') {
				this.checkMinusSpacing(token);
			}
			const right = this.parseMultiplicative();
			left = {
				type: 'BinaryExpression',
				operator: op,
				left,
				right,
				span: this.span(start),
			};
		}
		return left;
	}

	private parseMultiplicative(): Node {
		const start = this.peek().start;
		let left = this.parseUnary();
		for (;;) {
			const op = this.matchBinaryOp(MULTIPLICATIVE);
			if (!op) {
				break;
			}
			const right = this.parseUnary();
			left = {
				type: 'BinaryExpression',
				operator: op,
				left,
				right,
				span: this.span(start),
			};
		}
		return left;
	}

	private matchBinaryOp({
		symbols,
		keywords,
	}: {
		symbols: readonly string[];
		keywords: readonly string[];
	}): BinaryOperator | null {
		const t = this.peek();
		if (t.type === 'OP' && symbols.includes(t.value)) {
			this.advance();
			return t.value as BinaryOperator;
		}
		if (t.type === 'IDENT' && keywords.includes(t.value)) {
			this.advance();
			return KEYWORD_BINARY_OPS[t.value] as BinaryOperator;
		}
		return null;
	}

	/**
	 * A `-` between two values has a space or `)` before it, and a space or
	 * `(` after it: `-` is in names too, `data:n-3`, and starts negative
	 * numbers, `-3`.
	 */
	private checkMinusSpacing({ start }: Token): void {
		const before = this.source[start - 1];
		const after = this.source[start + 1];
		if (
			!(isSpace(before) || before === ')') ||
			!(isSpace(after) || after === '(')
		) {
			throw new ParseError(MINUS_SPACING, start);
		}
	}

	private parseUnary(): Node {
		const start = this.peek().start;
		if (this.isOp('!') || this.isKeyword('not')) {
			this.advance();
			const argument = this.parseUnary();
			return {
				type: 'UnaryExpression',
				operator: '!',
				argument,
				span: this.span(start),
			};
		}
		// with no value before it, a `-` is only in a negative number, `-5`,
		// or before parentheses, which Blogger reads without it: `-(5)` is `5`
		if (this.isOp('-')) {
			const minus = this.advance();
			if (this.source[minus.end] !== '(') {
				throw new ParseError(
					"A '-' with no value before it is only in a negative number, '-5', or before parentheses, '-(...)', which Blogger reads without the '-'",
					minus.start,
				);
			}
			return this.parseUnary();
		}
		return this.parsePostfix();
	}

	private parsePostfix(): Node {
		const start = this.peek().start;
		let node = this.parsePrimary();
		for (;;) {
			if (this.isPunct('.')) {
				if (node.type === 'LambdaExpression' && !this.parenWrapped.has(node)) {
					throw new ParseError(
						"Member access '.' cannot directly follow a 'filter'/'map'/'any'/'all'/'none' " +
							"chain — wrap the chain in parentheses first, e.g. '(...).prop'",
						this.peek().start,
					);
				}
				this.advance();
				const name = this.expectIdentLike();
				node = {
					type: 'MemberExpression',
					object: node,
					property: name,
					span: this.span(start),
				};
				continue;
			}
			if (this.isPunct('[')) {
				if (
					node.type !== 'DataReference' &&
					node.type !== 'MemberExpression' &&
					node.type !== 'IndexExpression'
				) {
					throw new ParseError(
						"Index access '[...]' is only valid directly on a 'data:' reference " +
							'(e.g. data:links[0]), not on list/map literals, calls, or other expressions',
						this.peek().start,
					);
				}
				this.advance();
				const index = this.parseExpression();
				this.expectPunct(']');
				node = {
					type: 'IndexExpression',
					object: node,
					index,
					span: this.span(start),
				};
				continue;
			}
			if (this.isPunct('(')) {
				if (node.type !== 'Identifier') {
					throw new ParseError(
						'Only a function name can be called',
						this.peek().start,
					);
				}
				if (!FUNCTION_NAMES.has(node.name as FunctionName)) {
					throw new ParseError(
						`Unknown function '${node.name}'`,
						node.span.start,
					);
				}
				const callee = node.name as FunctionName;
				this.advance();
				const args = this.parseArgList();
				this.expectPunct(')');
				this.validateArgs(callee, args, this.span(start));
				node = { type: 'CallExpression', callee, args, span: this.span(start) };
				continue;
			}
			if (
				this.peek().type === 'IDENT' &&
				LAMBDA_OPERATORS.has(this.peek().value as LambdaOperator) &&
				this.isPunct('(', 1)
			) {
				const operator = this.advance().value as LambdaOperator;
				this.advance(); // '('
				const param = this.expectIdentLike();
				if (!this.isOp('=>')) {
					throw new ParseError(
						`Expected '=>' after lambda parameter '${param}'`,
						this.peek().start,
					);
				}
				this.advance();
				const prevActive = this.activeParam;
				this.activeParam = param;
				const body = this.parseExpression();
				this.activeParam = prevActive;
				this.expectPunct(')');
				node = {
					type: 'LambdaExpression',
					operator,
					source: node,
					param,
					body,
					span: this.span(start),
				};
				continue;
			}
			if (
				this.peek().type === 'IDENT' &&
				INFIX_FUNCTION_NAMES.has(this.peek().value as InfixFunctionName)
			) {
				if (node.type === 'LambdaExpression' && !this.parenWrapped.has(node)) {
					throw new ParseError(
						`Infix function '${this.peek().value}' cannot directly follow a ` +
							"'filter'/'map'/'any'/'all'/'none' chain — wrap the chain in parentheses " +
							`first, e.g. '(...) ${this.peek().value} ...'`,
						this.peek().start,
					);
				}
				const operator = this.advance().value as InfixFunctionName;
				const right = this.parseRestrictedValue('an infix function operand');
				this.validateArgs(operator, [node, right], this.span(start));
				node = {
					type: 'NamedOperatorExpression',
					operator,
					left: node,
					right,
					span: this.span(start),
				};
				continue;
			}
			break;
		}
		return node;
	}

	private expectIdentLike(): string {
		const t = this.peek();
		if (t.type !== 'IDENT') {
			throw new ParseError('Expected a property name', t.start);
		}
		this.advance();
		return t.value;
	}

	private parseArgList(): Node[] {
		if (this.isPunct(')')) {
			return [];
		}
		return this.parseSeparated(() =>
			this.parseRestrictedValue('a function argument'),
		);
	}

	private parsePrimary(): Node {
		const t = this.peek();
		switch (t.type) {
			case 'NUMBER':
				this.advance();
				return {
					type: 'NumberLiteral',
					value: Number(t.value),
					span: this.span(t.start),
				};
			case 'STRING':
				this.advance();
				return {
					type: 'StringLiteral',
					value: t.value,
					span: this.span(t.start),
				};
			case 'DATA':
				return this.parseDataPath(t);
			case 'IDENT':
				return this.parseWord(t);
			case 'PUNCT':
				if (t.value === '(') {
					return this.parseParenthesized();
				}
				if (t.value === '[') {
					return this.parseList(t);
				}
				if (t.value === '{') {
					return this.parseBraces(t);
				}
		}
		throw new ParseError(`Unexpected token '${t.value || t.type}'`, t.start);
	}

	/** `data:a.b.c`, a reference with a member for each segment after the first. */
	private parseDataPath(t: Token): Node {
		this.advance();
		const segments = t.value.split('.').filter((s) => s.length > 0);
		if (segments.length === 0) {
			return { type: 'EmptyDataReference', span: this.span(t.start) };
		}
		let node: Node = {
			type: 'DataReference',
			name: segments[0],
			span: this.span(t.start),
		};
		for (let k = 1; k < segments.length; k++) {
			node = {
				type: 'MemberExpression',
				object: node,
				property: segments[k] as string,
				span: this.span(t.start),
			};
		}
		return node;
	}

	/** A boolean, a function name, or the parameter of the lambda it is in. */
	private parseWord(t: Token): Node {
		if (
			t.value === 'true' ||
			t.value === 'false' ||
			t.value === 'yes' ||
			t.value === 'no'
		) {
			this.advance();
			return {
				type: 'BooleanLiteral',
				value: t.value === 'true' || t.value === 'yes',
				span: this.span(t.start),
			};
		}
		if (t.value === 'null' || t.value === 'nil') {
			throw new ParseError(
				`Blogger does not support a '${t.value}' literal — there is no way to write a literal null value`,
				t.start,
			);
		}
		if (!this.isPunct('(', 1) && t.value !== this.activeParam) {
			throw new ParseError(
				`Unknown identifier '${t.value}' — values must be accessed as 'data:${t.value}'` +
					(this.activeParam
						? `, or by referencing the in-scope lambda parameter '${this.activeParam}'`
						: ' (no lambda parameter is in scope here)'),
				t.start,
			);
		}
		this.advance();
		return { type: 'Identifier', name: t.value, span: this.span(t.start) };
	}

	private parseParenthesized(): Node {
		this.advance();
		const expr = this.parseExpression();
		this.expectPunct(')');
		// Mark this exact node object as having come straight out of a
		// paren group, so `parseRestrictedValue` and the postfix guards
		// above can tell a wrapped expression apart from a bare one even
		// though the node shape is otherwise identical.
		this.parenWrapped.add(expr);
		return expr;
	}

	/** `[a, b]` */
	private parseList(t: Token): Node {
		this.advance();
		const elements = this.isPunct(']')
			? []
			: this.parseSeparated(() => this.parseRestrictedValue('a list element'));
		this.expectPunct(']');
		return { type: 'ListLiteral', elements, span: this.span(t.start) };
	}

	/** `{}` and `{a, b}`, a set, or `{a: 1, b: 2}`, a map. */
	private parseBraces(t: Token): Node {
		this.advance();
		let node: Node;
		if (this.isPunct('}')) {
			node = { type: 'SetLiteral', elements: [], span: this.span(t.start) };
		} else if (this.peekIsMapKey()) {
			const entries = this.parseSeparated(() => this.parseMapEntry());
			node = { type: 'MapLiteral', entries, span: this.span(t.start) };
		} else {
			const elements = this.parseSeparated((index) => {
				if (index > 0 && this.peekIsMapKey()) {
					throw new ParseError(
						"Cannot mix a keyed map entry into a set literal ('{a, b}' vs '{a: 1, b: 2}')",
						this.peek().start,
					);
				}
				return this.parseRestrictedValue('a set element');
			});
			node = { type: 'SetLiteral', elements, span: this.span(t.start) };
		}
		this.expectPunct('}');
		return node;
	}

	private peekIsMapKey(): boolean {
		const key = this.peek();
		const colon = this.peek(1);
		return (
			(key.type === 'IDENT' || key.type === 'STRING') &&
			colon.type === 'PUNCT' &&
			colon.value === ':'
		);
	}

	private parseMapEntry(): MapEntry {
		const keyToken = this.peek();
		if (keyToken.type !== 'IDENT' && keyToken.type !== 'STRING') {
			throw new ParseError(
				'Expected a map key (identifier or string)',
				keyToken.start,
			);
		}
		const key = keyToken.value;
		this.advance();
		const colon = this.expectPunct(':');
		const afterColon = this.source[colon.end] ?? '';
		if (!/[ \t\r\n]/.test(afterColon)) {
			throw new ParseError(
				`Expected a space after ':' in map entry '${key}'`,
				colon.end,
			);
		}
		const value = this.parseRestrictedValue('a map value');
		return { key, value };
	}
}
