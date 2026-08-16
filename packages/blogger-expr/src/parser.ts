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

const LAMBDA_OPERATORS = new Set<LambdaOperator>([
	'filter',
	'map',
	'any',
	'all',
	'none',
]);

const FUNCTION_NAMES = new Set<FunctionName>([
	'path',
	'appendParams',
	'params',
	'snippet',
	'fragment',
	'resizeImage',
	'sourceSet',
	'format',
]);

const INFIX_FUNCTION_NAMES = new Set<InfixFunctionName>([
	'path',
	'appendParams',
	'params',
	'snippet',
	'fragment',
	'format',
]);

const SNIPPET_OPTION_TYPES: Record<string, 'NumberLiteral' | 'BooleanLiteral'> =
	{
		length: 'NumberLiteral',
		links: 'BooleanLiteral',
		linebreaks: 'BooleanLiteral',
		ellipsis: 'BooleanLiteral',
	};

const LITERAL_TYPES = new Set<Node['type']>([
	'StringLiteral',
	'NumberLiteral',
	'BooleanLiteral',
	'ListLiteral',
	'MapLiteral',
	'SetLiteral',
	'EmptyDataReference',
]);
const isLiteral = (n: Node): boolean => LITERAL_TYPES.has(n.type);

type ArgValidator = (n: Node) => string | null;

const anyType: ArgValidator = () => null;
const stringType: ArgValidator = (n) =>
	isLiteral(n) && n.type !== 'StringLiteral'
		? 'must be a string literal'
		: null;
const numberType: ArgValidator = (n) =>
	isLiteral(n) && n.type !== 'NumberLiteral'
		? 'must be a number literal'
		: null;
const mapType: ArgValidator = (n) =>
	isLiteral(n) && n.type !== 'MapLiteral'
		? 'must be a map literal, e.g. { key: value }'
		: null;
const listType: ArgValidator = (n) =>
	isLiteral(n) && n.type !== 'ListLiteral'
		? 'must be a list literal, e.g. [1, 2, 3]'
		: null;
const stringOrNumberType: ArgValidator = (n) =>
	isLiteral(n) && n.type !== 'StringLiteral' && n.type !== 'NumberLiteral'
		? 'must be a string or number literal'
		: null;

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
		args: [stringType, numberType, stringOrNumberType],
	},
	sourceSet: {
		min: 2,
		max: 3,
		args: [stringType, listType, stringOrNumberType],
	},
	format: { min: 2, max: 2, args: [anyType, stringType] },
};

/**
 * Node types that are not allowed to appear *bare* in a "restricted value"
 * position (function-call argument, list/set-literal element, map-literal
 * value, or infix-function operand) — they must be fully wrapped in parens
 * instead, e.g. `path(data:url, (data:num + 1))`. See `parseRestrictedValue`.
 *
 * In practice `BinaryExpression`/`LogicalExpression`/`MembershipExpression`/
 * `ConditionalExpression`/`ElvisExpression` can only ever reach the top of a
 * restricted-value parse via an explicit paren group in the first place
 * (nothing in the unary/postfix/primary chain that `parseRestrictedValue`
 * uses can construct them otherwise), so for those five this check is a
 * defensive backstop rather than the primary mechanism — the primary
 * mechanism is that leftover, un-consumed operator tokens make the
 * surrounding `)`/`]`/`}`/`,` expectation fail on its own. `LambdaExpression`
 * and `NamedOperatorExpression`, by contrast, *are* constructed directly by
 * the postfix loop with no parens at all (`data:x path "y"`,
 * `data:x filter (i => i.ok)`), so for those two this check is load-bearing.
 */
const REQUIRES_WRAPPING = new Set<Node['type']>([
	'BinaryExpression',
	'LogicalExpression',
	'MembershipExpression',
	'ConditionalExpression',
	'ElvisExpression',
	'NamedOperatorExpression',
	'LambdaExpression',
]);

function describeNode(node: Node): string {
	switch (node.type) {
		case 'BinaryExpression':
			return 'operator expression';
		case 'LogicalExpression':
			return "'and'/'or' expression";
		case 'MembershipExpression':
			return "'in'/'contains' expression";
		case 'ConditionalExpression':
			return "conditional ('?:') expression";
		case 'ElvisExpression':
			return "elvis ('?:') expression";
		case 'NamedOperatorExpression':
			return 'infix function call';
		case 'LambdaExpression':
			return "'filter'/'map'/'any'/'all'/'none' chain";
		default:
			return 'expression';
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

	private isKeyword(...names: string[]): boolean {
		const t = this.peek();
		return t.type === 'IDENT' && names.includes(t.value);
	}

	private isOp(value: string): boolean {
		const t = this.peek();
		return t.type === 'OP' && t.value === value;
	}

	private isPunct(value: string): boolean {
		const t = this.peek();
		return t.type === 'PUNCT' && t.value === value;
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
		const sig = FUNCTION_SIGNATURES[name];
		if (args.length < sig.min || args.length > sig.max) {
			const arity =
				sig.min === sig.max ? `${sig.min}` : `${sig.min}-${sig.max}`;
			throw new ParseError(
				`${name}() expects ${arity} argument(s), got ${args.length}`,
				span.start,
			);
		}
		for (let i = 0; i < args.length; i++) {
			const validator = sig.args[i];
			const arg = args[i];
			if (!validator || !arg) {
				continue;
			}
			const error = validator(arg);
			if (error) {
				throw new ParseError(
					`${name}(): argument ${i + 1} ${error}`,
					arg.span.start,
				);
			}
		}
		if (
			name === 'snippet' &&
			args.length === 2 &&
			args[1]?.type === 'MapLiteral'
		) {
			this.validateSnippetOptions(args[1]);
		}
	}

	private validateSnippetOptions(
		options: Extract<Node, { type: 'MapLiteral' }>,
	): void {
		for (const entry of options.entries) {
			const expected = SNIPPET_OPTION_TYPES[entry.key];
			if (!expected) {
				throw new ParseError(
					`snippet(): unsupported option '${entry.key}' (expected one of: ${Object.keys(SNIPPET_OPTION_TYPES).join(', ')})`,
					entry.value.span.start,
				);
			}
			if (isLiteral(entry.value) && entry.value.type !== expected) {
				throw new ParseError(
					`snippet(): option '${entry.key}' must be a ${expected === 'NumberLiteral' ? 'number' : 'boolean'}`,
					entry.value.span.start,
				);
			}
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
				`A ${describeNode(node)} must be wrapped in parentheses to be used as ${context}, e.g. '(${this.source.slice(node.span.start, node.span.end)})'`,
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
			if (this.isKeyword('in')) {
				this.advance();
				const right = this.parseEquality();
				left = {
					type: 'MembershipExpression',
					operator: 'in',
					negated: false,
					left,
					right,
					span: this.span(start),
				};
				continue;
			}
			if (this.isKeyword('contains')) {
				this.advance();
				const right = this.parseEquality();
				left = {
					type: 'MembershipExpression',
					operator: 'contains',
					negated: false,
					left,
					right,
					span: this.span(start),
				};
				continue;
			}
			if (
				this.isKeyword('not') &&
				this.peek(1).type === 'IDENT' &&
				this.peek(1).value === 'in'
			) {
				this.advance();
				this.advance();
				const right = this.parseEquality();
				left = {
					type: 'MembershipExpression',
					operator: 'in',
					negated: true,
					left,
					right,
					span: this.span(start),
				};
				continue;
			}
			if (
				this.isKeyword('not') &&
				this.peek(1).type === 'IDENT' &&
				this.peek(1).value === 'contains'
			) {
				this.advance();
				this.advance();
				const right = this.parseEquality();
				left = {
					type: 'MembershipExpression',
					operator: 'contains',
					negated: true,
					left,
					right,
					span: this.span(start),
				};
				continue;
			}
			break;
		}
		return left;
	}

	private parseEquality(): Node {
		const start = this.peek().start;
		let left = this.parseRelational();
		for (;;) {
			const op = this.matchBinaryOp(['==', '!='], ['eq', 'ne']);
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
			const op = this.matchBinaryOp(
				['<=', '>=', '<', '>'],
				['lte', 'gte', 'lt', 'gt'],
			);
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
			const op = this.matchBinaryOp(['+', '-'], []);
			if (!op) {
				break;
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
			const op = this.matchBinaryOp(['*', '/', '%'], []);
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

	private matchBinaryOp(
		symbols: string[],
		keywords: string[],
	): BinaryOperator | null {
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
		if (this.isOp('-')) {
			this.advance();
			const argument = this.parseUnary();
			return {
				type: 'UnaryExpression',
				operator: '-',
				argument,
				span: this.span(start),
			};
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
				this.peek(1).type === 'PUNCT' &&
				this.peek(1).value === '('
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
		const args: Node[] = [];
		if (this.isPunct(')')) {
			return args;
		}
		args.push(this.parseRestrictedValue('a function argument'));
		while (this.isPunct(',')) {
			this.advance();
			args.push(this.parseRestrictedValue('a function argument'));
		}
		return args;
	}

	private parsePrimary(): Node {
		const t = this.peek();
		const start = t.start;

		if (t.type === 'NUMBER') {
			this.advance();
			return {
				type: 'NumberLiteral',
				value: Number(t.value),
				span: this.span(start),
			};
		}

		if (t.type === 'STRING') {
			this.advance();
			return { type: 'StringLiteral', value: t.value, span: this.span(start) };
		}

		if (t.type === 'DATA') {
			this.advance();
			const segments = t.value.split('.').filter((s) => s.length > 0);
			if (segments.length === 0) {
				return { type: 'EmptyDataReference', span: this.span(start) };
			}
			let node: Node = {
				type: 'DataReference',
				name: segments[0],
				span: this.span(start),
			};
			for (let k = 1; k < segments.length; k++) {
				node = {
					type: 'MemberExpression',
					object: node,
					property: segments[k] as string,
					span: this.span(start),
				};
			}
			return node;
		}

		if (t.type === 'IDENT') {
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
					span: this.span(start),
				};
			}
			if (t.value === 'null' || t.value === 'nil') {
				throw new ParseError(
					`Blogger does not support a '${t.value}' literal — there is no way to write a literal null value`,
					t.start,
				);
			}
			const followedByCall =
				this.peek(1).type === 'PUNCT' && this.peek(1).value === '(';
			if (!followedByCall && t.value !== this.activeParam) {
				throw new ParseError(
					`Unknown identifier '${t.value}' — values must be accessed as 'data:${t.value}'` +
						(this.activeParam
							? `, or by referencing the in-scope lambda parameter '${this.activeParam}'`
							: ' (no lambda parameter is in scope here)'),
					t.start,
				);
			}
			this.advance();
			return { type: 'Identifier', name: t.value, span: this.span(start) };
		}

		if (t.type === 'PUNCT' && t.value === '(') {
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

		if (t.type === 'PUNCT' && t.value === '[') {
			this.advance();
			const elements: Node[] = [];
			if (!this.isPunct(']')) {
				elements.push(this.parseRestrictedValue('a list element'));
				while (this.isPunct(',')) {
					this.advance();
					elements.push(this.parseRestrictedValue('a list element'));
				}
			}
			this.expectPunct(']');
			return { type: 'ListLiteral', elements, span: this.span(start) };
		}

		if (t.type === 'PUNCT' && t.value === '{') {
			this.advance();
			let node: Node;
			if (this.isPunct('}')) {
				node = { type: 'SetLiteral', elements: [], span: this.span(start) };
			} else if (this.peekIsMapKey()) {
				const entries: MapEntry[] = [this.parseMapEntry()];
				while (this.isPunct(',')) {
					this.advance();
					entries.push(this.parseMapEntry());
				}
				node = { type: 'MapLiteral', entries, span: this.span(start) };
			} else {
				const elements: Node[] = [this.parseRestrictedValue('a set element')];
				while (this.isPunct(',')) {
					this.advance();
					if (this.peekIsMapKey()) {
						throw new ParseError(
							"Cannot mix a keyed map entry into a set literal ('{a, b}' vs '{a: 1, b: 2}')",
							this.peek().start,
						);
					}
					elements.push(this.parseRestrictedValue('a set element'));
				}
				node = { type: 'SetLiteral', elements, span: this.span(start) };
			}
			this.expectPunct('}');
			return node;
		}

		throw new ParseError(`Unexpected token '${t.value || t.type}'`, t.start);
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
