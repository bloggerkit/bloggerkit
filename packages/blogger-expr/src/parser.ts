import type {
	ArithmeticName,
	ComparisonName,
	FunctionName,
	LambdaName,
	LambdaOperation,
	Location,
	MapEntry,
	Name,
	Node,
	Operator,
	OperatorFunctionName,
	PropertyAccess,
	Root,
} from './ast';
import { isPath } from './ast';
import type { DiagnosticCode } from './diagnostics';
import {
	LexError,
	stringValue,
	type Token,
	type TokenKind,
	tokenize,
} from './lexer';
import { join, type Span } from './source';
import { table } from './table';

/** Where the expression is written: most attributes, or the `values` of a loop, where ranges are allowed. */
export type ExpressionContext = 'expression' | 'loop-values';

/** Thrown by the parser; `parse` turns it into an error diagnostic. */
export class SyntaxFailure extends Error {
	constructor(
		readonly code: DiagnosticCode,
		readonly span: Span,
		readonly detail: Record<string, string> = {},
	) {
		super(code);
	}
}

/**
 * How tightly each operator binds, loosest first. Operators of a level take
 * operands of the levels after it.
 */
enum Level {
	Conditional = 1, // a ? b : c, from the right
	Or = 2, // or, ||
	And = 3, // and, &&
	Equality = 4, // ==, !=, eq, neq
	Membership = 5, // in, contains, not in, not contains
	Comparison = 6, // <, >, <=, >=, lt, gt, lte, gte
	Additive = 7, // +, -
	Multiplicative = 8, // *, /, %
	Fallback = 9, // ?:, from the right
	Chain = 10, // lambdas, take, skip, on the value before them
}

const EQUALITY = table<'equal' | 'notEqual'>({
	'==': 'equal',
	eq: 'equal',
	'!=': 'notEqual',
	neq: 'notEqual',
});
const COMPARISON = table<ComparisonName>({
	'<': 'less',
	lt: 'less',
	'>': 'greater',
	gt: 'greater',
	'<=': 'lessOrEqual',
	lte: 'lessOrEqual',
	'>=': 'greaterOrEqual',
	gte: 'greaterOrEqual',
});
const MULTIPLICATIVE = table<ArithmeticName>({
	'*': 'multiply',
	'/': 'divide',
	'%': 'remainder',
});

const LAMBDAS = table<LambdaName>({
	filter: 'filter',
	where: 'filter',
	map: 'map',
	select: 'map',
	any: 'any',
	all: 'all',
	none: 'none',
	count: 'count',
	first: 'first',
});

const TAKE_OR_SKIP = table<'take' | 'skip'>({
	take: 'take',
	limit: 'take',
	skip: 'skip',
	offset: 'skip',
});

const FUNCTIONS = table<FunctionName>({
	path: 'path',
	params: 'params',
	appendParams: 'appendParams',
	fragment: 'fragment',
	snippet: 'snippet',
	format: 'format',
	resizeImage: 'resizeImage',
	sourceSet: 'sourceSet',
	take: 'take',
	limit: 'take',
	skip: 'skip',
	offset: 'skip',
});

/** Functions that can be written between their two arguments. */
const INFIX = new Set<FunctionName>([
	'path',
	'params',
	'appendParams',
	'fragment',
	'snippet',
	'format',
	'resizeImage',
	'sourceSet',
]);

/** Operators that have a function form, written as a token or a word: `+(1, 2)`, `and(a, b)`. */
const OPERATOR_FUNCTIONS = table<OperatorFunctionName>({
	'+': '+',
	'-': '-',
	'*': '*',
	'/': '/',
	'%': '%',
	'==': '==',
	eq: '==',
	'!=': '!=',
	neq: '!=',
	'<': '<',
	lt: '<',
	'>': '>',
	gt: '>',
	'<=': '<=',
	lte: '<=',
	'>=': '>=',
	gte: '>=',
	and: 'and',
	'&&': 'and',
	or: 'or',
	'||': 'or',
	'?:': '?:',
	in: 'in',
	contains: 'contains',
});

const OPERATOR_TOKENS = new Set<TokenKind>([
	'?',
	'?:',
	'+',
	'-',
	'*',
	'/',
	'%',
	'==',
	'!=',
	'<',
	'>',
	'<=',
	'>=',
	'&&',
	'||',
]);

const isBooleanWord = (word: string) => /^(true|false|yes|no)$/i.test(word);

const MAX_DEPTH = 256;

const SINGLE_VALUE_PLACES = 'arguments, list items and map values';

/** Reads tokens into a tree. Throws `SyntaxFailure` at the first error. */
export function parseTokens(source: string, context: ExpressionContext): Root {
	let tokens: Token[];
	try {
		tokens = tokenize(source);
	} catch (error) {
		if (error instanceof LexError) {
			throw new SyntaxFailure(error.code, error.span, error.detail);
		}
		throw error;
	}
	return new Parser(source, tokens, context).parse();
}

/** The fields of a node, without its place. */
type Fields<T extends Root> = T extends Root ? Omit<T, 'span' | 'loc'> : never;

class Parser {
	private pos = 0;
	/** The parameters of the lambdas being read, the innermost last. */
	private readonly parameters: string[] = [];
	private depth = 0;
	/** The offset where each line starts. */
	private readonly lineStarts: number[] = [0];

	constructor(
		source: string,
		private readonly tokens: Token[],
		private readonly context: ExpressionContext,
	) {
		for (let i = 0; i < source.length; i++) {
			if (source[i] === '\n') {
				this.lineStarts.push(i + 1);
			}
		}
	}

	parse(): Root {
		const root =
			this.context === 'loop-values' ? this.loopValues() : this.group();
		this.expect('end', 'an operator or the end of the expression');
		return root;
	}

	// ----- nodes -----

	/** A node with its span and location. */
	/** A node of `fields`, an object of its own, which it becomes. */
	private node<T extends Root = Node>(fields: Fields<T>, at: Span): T {
		const node = fields as unknown as T;
		node.span = at;
		node.loc = this.locate(at);
		return node;
	}

	private locate(at: Span): Location {
		return { start: this.position(at.start), end: this.position(at.end) };
	}

	private position(offset: number) {
		let line = 0;
		while (
			line + 1 < this.lineStarts.length &&
			(this.lineStarts[line + 1] as number) <= offset
		) {
			line++;
		}
		return {
			line: line + 1,
			column: offset - (this.lineStarts[line] as number) + 1,
			offset,
		};
	}

	private operator<N extends string>(token: Token, name: N): Operator<N> {
		return { name, spelling: token.text, span: token.span };
	}

	// ----- tokens -----

	private peek(offset = 0): Token {
		return this.tokens[
			Math.min(this.pos + offset, this.tokens.length - 1)
		] as Token;
	}

	private previous(): Token | undefined {
		return this.tokens[this.pos - 1];
	}

	private next(): Token {
		const token = this.peek();
		if (token.kind !== 'end') {
			this.pos++;
		}
		return token;
	}

	private at(kind: TokenKind): boolean {
		return this.peek().kind === kind;
	}

	private atWord(...words: string[]): boolean {
		const token = this.peek();
		return token.kind === 'word' && words.includes(token.text);
	}

	private expect(kind: TokenKind, expected: string): Token {
		if (this.at(kind)) {
			return this.next();
		}
		throw this.unexpected(expected);
	}

	private unexpected(expected: string): SyntaxFailure {
		const token = this.peek();
		if (token.kind === 'word' && token.text === 'ne') {
			return new SyntaxFailure('unknown-operator-word', token.span, {
				text: 'ne',
				suggestion: 'neq',
			});
		}
		if ((token.kind === 'word' && token.text === 'to') || token.kind === '..') {
			return new SyntaxFailure('range-outside-loop', token.span);
		}
		// `5-3`, `5 -3`: a negative number right after a value
		const before = this.previous();
		if (token.kind === 'number' && token.text.startsWith('-') && before) {
			return new SyntaxFailure('minus-spacing', join(before.span, token.span), {
				text: `${before.text}${token.spaceBefore ? ' ' : ''}${token.text}`,
			});
		}
		const found =
			token.kind === 'end' ? 'the end of the expression' : `\`${token.text}\``;
		return new SyntaxFailure('expected', token.span, { expected, found });
	}

	private enter(): void {
		this.depth++;
		if (this.depth > MAX_DEPTH) {
			throw new SyntaxFailure('nested-too-deep', this.peek().span);
		}
	}

	// ----- groups -----

	/**
	 * A whole expression: the top level, the inside of parentheses or an index,
	 * a lambda body. A property that applies to everything before it wraps what
	 * was read so far, then the expression goes on.
	 */
	private group(): Node {
		this.enter();
		let node = this.expression(0);
		for (;;) {
			const access = this.propertyOfEverythingBefore(node);
			if (!access) {
				break;
			}
			node = this.expression(0, this.postfix(access, false));
		}
		this.depth--;
		return node;
	}

	/**
	 * A `.name` that applies to everything before it: right after a string,
	 * or after a number, data path or parameter with a space before the dot.
	 * `1 ..3` is read as the property `.3`.
	 */
	private propertyOfEverythingBefore(object: Node): PropertyAccess | undefined {
		const dot = this.peek();
		const before = this.previous();
		if (!before) {
			return undefined;
		}
		const spaced =
			dot.spaceBefore && ['number', 'data', 'word'].includes(before.kind);
		if (dot.kind === '.' && (before.kind === 'string' || spaced)) {
			this.next();
			const property = this.propertyName();
			return this.node<PropertyAccess>(
				{
					type: 'PropertyAccess',
					object,
					property,
					appliesTo: 'everythingBefore',
				},
				join(object.span, property.span),
			);
		}
		if (
			dot.kind === '..' &&
			spaced &&
			this.peek(1).kind === 'number' &&
			!this.peek(1).spaceBefore
		) {
			this.next();
			const number = this.next();
			const property: Name = {
				text: `.${number.text}`,
				quoted: false,
				span: join(dot.span, number.span),
			};
			return this.node<PropertyAccess>(
				{
					type: 'PropertyAccess',
					object,
					property,
					appliesTo: 'everythingBefore',
				},
				join(object.span, number.span),
			);
		}
		return undefined;
	}

	/** The name after `.`: a word, digits, or a quoted name. */
	private propertyName(): Name {
		const token = this.peek();
		if (
			token.kind === 'word' ||
			(token.kind === 'number' && /^\d+$/.test(token.text))
		) {
			this.next();
			return { text: token.text, quoted: false, span: token.span };
		}
		if (token.kind === 'string') {
			this.next();
			return { text: stringValue(token), quoted: true, span: token.span };
		}
		throw this.unexpected('a name after `.`');
	}

	// ----- operators -----

	/** Operators binding at least as tightly as `minLevel`, from `left` or a new operand. */
	private expression(minLevel: number, left?: Node): Node {
		let node = left ?? this.unary(false);
		for (;;) {
			const next = this.binaryOperator(node, minLevel);
			if (!next) {
				return node;
			}
			node = next;
		}
	}

	/** Reads the operator after `left`, if it binds at least as tightly as `minLevel`. */
	private binaryOperator(left: Node, minLevel: number): Node | undefined {
		const token = this.peek();
		const text = token.text;

		if (token.kind === '?' && minLevel <= Level.Conditional) {
			this.next();
			const whenTrue = this.expression(0);
			this.expect(':', '`:` of the ternary');
			const whenFalse = this.expression(Level.Conditional);
			return this.node(
				{ type: 'Conditional', condition: left, whenTrue, whenFalse },
				join(left.span, whenFalse.span),
			);
		}
		if (
			(token.kind === '||' || (token.kind === 'word' && text === 'or')) &&
			minLevel <= Level.Or
		) {
			this.next();
			const right = this.expression(Level.Or + 1);
			return this.node(
				{ type: 'Logical', operator: this.operator(token, 'or'), left, right },
				join(left.span, right.span),
			);
		}
		if (
			(token.kind === '&&' || (token.kind === 'word' && text === 'and')) &&
			minLevel <= Level.And
		) {
			this.next();
			const right = this.expression(Level.And + 1);
			return this.node(
				{ type: 'Logical', operator: this.operator(token, 'and'), left, right },
				join(left.span, right.span),
			);
		}
		const equality = EQUALITY[text];
		if (equality && minLevel <= Level.Equality) {
			this.next();
			const right = this.expression(Level.Equality + 1);
			return this.node(
				{
					type: 'Equality',
					operator: this.operator(token, equality),
					left,
					right,
				},
				join(left.span, right.span),
			);
		}
		if (minLevel <= Level.Membership && this.atMembership()) {
			return this.membership(left);
		}
		const comparison = COMPARISON[text];
		if (comparison && minLevel <= Level.Comparison) {
			this.next();
			const right = this.expression(Level.Comparison + 1);
			return this.node(
				{
					type: 'Comparison',
					operator: this.operator(token, comparison),
					left,
					right,
				},
				join(left.span, right.span),
			);
		}
		if (token.kind === '+' && minLevel <= Level.Additive) {
			this.next();
			const right = this.expression(Level.Additive + 1);
			const plus = this.operator(token, 'plus');
			// a + b + c is one chain; parentheses start a new one
			const chain = left.type === 'PlusChain' ? left : undefined;
			return this.node(
				{
					type: 'PlusChain',
					operands: chain ? [...chain.operands, right] : [left, right],
					operators: chain ? [...chain.operators, plus] : [plus],
				},
				join(left.span, right.span),
			);
		}
		if (token.kind === '-' && minLevel <= Level.Additive) {
			this.checkMinusSpacing();
			this.next();
			const right = this.expression(Level.Additive + 1);
			return this.node(
				{
					type: 'Arithmetic',
					operator: this.operator(token, 'subtract'),
					left,
					right,
				},
				join(left.span, right.span),
			);
		}
		const multiplicative = MULTIPLICATIVE[text];
		if (multiplicative && minLevel <= Level.Multiplicative) {
			this.next();
			const right = this.expression(Level.Multiplicative + 1);
			return this.node(
				{
					type: 'Arithmetic',
					operator: this.operator(token, multiplicative),
					left,
					right,
				},
				join(left.span, right.span),
			);
		}
		if (token.kind === '?:' && minLevel <= Level.Fallback) {
			this.next();
			const fallback = this.expression(Level.Fallback);
			return this.node(
				{
					type: 'Fallback',
					operator: this.operator(token, 'fallback'),
					value: left,
					fallback,
				},
				join(left.span, fallback.span),
			);
		}
		if (token.kind === 'word' && minLevel <= Level.Chain) {
			if (LAMBDAS[text]) {
				return this.lambda(left);
			}
			if (TAKE_OR_SKIP[text]) {
				return this.takeOrSkip(left);
			}
			// an infix call can follow a lambda or take/skip
			const fn = FUNCTIONS[text];
			if (
				fn &&
				INFIX.has(fn) &&
				(left.type === 'LambdaOperation' || left.type === 'TakeOrSkip')
			) {
				return this.infixCall(left);
			}
		}
		return undefined;
	}

	/** A minus between values has a space or `)` before it, and a space or `(` after it. */
	private checkMinusSpacing(): void {
		const minus = this.peek();
		const before = this.previous() as Token;
		const after = this.peek(1);
		const beforeOk = minus.spaceBefore || before.kind === ')';
		const afterOk = after.spaceBefore || after.kind === '(';
		if (!beforeOk || !afterOk) {
			throw new SyntaxFailure('minus-spacing', join(before.span, after.span), {
				text: `${before.text}${minus.spaceBefore ? ' ' : ''}-${after.spaceBefore ? ' ' : ''}${after.text}`,
			});
		}
	}

	private atMembership(): boolean {
		if (this.atWord('in', 'contains')) {
			return true;
		}
		const next = this.peek(1);
		return (
			this.atWord('not') &&
			next.kind === 'word' &&
			(next.text === 'in' || next.text === 'contains')
		);
	}

	private membership(left: Node): Node {
		const not = this.atWord('not') ? this.next() : undefined;
		const word = this.next();
		const name = word.text === 'contains' ? 'contains' : 'in';
		const right = this.expression(Level.Membership + 1);
		const [item, collection] =
			name === 'contains' ? [right, left] : [left, right];
		const operator: Operator<'in' | 'contains'> = {
			name,
			spelling: not ? `${not.text} ${word.text}` : word.text,
			span: not ? join(not.span, word.span) : word.span,
		};
		return this.node(
			{
				type: 'Membership',
				operator,
				negated: not !== undefined,
				item,
				collection,
			},
			join(left.span, right.span),
		);
	}

	// ----- lambdas, take, skip -----

	private lambda(list: Node): Node {
		const word = this.next();
		const operator = this.operator(word, LAMBDAS[word.text] as LambdaName);
		const parenthesized = this.at('(');
		if (parenthesized) {
			this.next();
		}
		const name = this.peek();
		if (name.kind !== 'word') {
			throw this.unexpected("the name of the lambda's parameter");
		}
		if (name.text === 'not') {
			throw new SyntaxFailure('not-parameter-name', name.span);
		}
		this.next();
		this.expect('=>', '`=>` after the parameter');
		this.parameters.push(name.text);
		const body = this.group();
		this.parameters.pop();
		let end = body.span;
		if (parenthesized) {
			end = this.expect(')', '`)` closing the lambda').span;
		} else if (!this.at('end') && !this.at(')')) {
			throw new SyntaxFailure('bare-lambda-not-last', this.peek().span);
		}
		return this.node<LambdaOperation>(
			{
				type: 'LambdaOperation',
				operator,
				list,
				parameter: { name: name.text, span: name.span },
				body,
				notation: parenthesized ? 'parenthesized' : 'bare',
			},
			join(list.span, end),
		);
	}

	private takeOrSkip(list: Node): Node {
		const word = this.next();
		const name = TAKE_OR_SKIP[word.text] as 'take' | 'skip';
		if (list.type === 'TakeOrSkip' && list.operator.name === name) {
			throw new SyntaxFailure('slice-after-slice', word.span, {
				operator: word.text,
				previous: list.operator.spelling,
			});
		}
		const count = this.count(word.text);
		return this.node(
			{ type: 'TakeOrSkip', operator: this.operator(word, name), list, count },
			join(list.span, count.span),
		);
	}

	/** The count of `take` or `skip`: a number literal, data, a parameter or parentheses. */
	private count(operator: string): Node {
		const token = this.peek();
		const isParameter =
			token.kind === 'word' && token.text === this.parameters.at(-1);
		if (
			token.kind === 'number' ||
			token.kind === 'data' ||
			token.kind === '(' ||
			isParameter
		) {
			return this.unary(true);
		}
		const text = token.kind === 'end' ? 'nothing' : token.text;
		throw new SyntaxFailure('slice-count', token.span, { operator, text });
	}

	// ----- unary, postfix -----

	/** `!x`, `not x`, or a value with its properties, indexes and infix calls. */
	private unary(valueOnly: boolean): Node {
		this.enter();
		const token = this.peek();
		let node: Node;
		if (token.kind === '!' || (token.kind === 'word' && token.text === 'not')) {
			this.next();
			const operand = this.unary(valueOnly);
			node = this.node(
				{ type: 'LogicalNot', operator: this.operator(token, 'not'), operand },
				join(token.span, operand.span),
			);
		} else {
			node = this.postfix(this.primary(), valueOnly);
		}
		this.depth--;
		return node;
	}

	/**
	 * Properties, indexes and infix calls after a value. `valueOnly` is set
	 * where a single value is expected, in arguments, items and map values,
	 * where only data paths take properties.
	 */
	private postfix(start: Node, valueOnly: boolean): Node {
		let node = start;
		let infixUsed = false;
		for (;;) {
			const token = this.peek();
			const before = this.previous() as Token;
			// `(1)..3`, `[1]..2`: the property `.3` of the value, which reads nothing
			if (
				token.kind === '..' &&
				!token.spaceBefore &&
				[')', ']', '}'].includes(before.kind) &&
				this.peek(1).kind === 'number' &&
				!this.peek(1).spaceBefore
			) {
				this.next();
				const number = this.next();
				const property: Name = {
					text: `.${number.text}`,
					quoted: false,
					span: join(token.span, number.span),
				};
				node = this.node<PropertyAccess>(
					{
						type: 'PropertyAccess',
						object: node,
						property,
						appliesTo: 'value',
					},
					join(node.span, number.span),
				);
				continue;
			}
			if (token.kind === '.') {
				// a property of everything before it: left to `group`
				if (
					before.kind === 'string' ||
					(token.spaceBefore &&
						['number', 'data', 'word'].includes(before.kind))
				) {
					return node;
				}
				if (before.kind === 'number') {
					throw new SyntaxFailure(
						'number-member',
						join(before.span, this.peek(1).span),
						{
							text: `${before.text}.${this.peek(1).text}`,
						},
					);
				}
				if (valueOnly && !isPath(node)) {
					throw new SyntaxFailure(
						'needs-parentheses',
						join(node.span, this.peek(1).span),
						{
							what: 'A property',
							where: SINGLE_VALUE_PLACES,
						},
					);
				}
				this.next();
				const property = this.propertyName();
				node = this.node<PropertyAccess>(
					{
						type: 'PropertyAccess',
						object: node,
						property,
						appliesTo: 'value',
					},
					join(node.span, property.span),
				);
			} else if (token.kind === '[') {
				if (!isPath(node)) {
					throw new SyntaxFailure('index-on-value', token.span);
				}
				this.next();
				const index = this.group();
				const end = this.expect(']', '`]`');
				node = this.node(
					{ type: 'IndexAccess', object: node, index },
					join(node.span, end.span),
				);
			} else if (
				token.kind === 'word' &&
				INFIX.has(FUNCTIONS[token.text] as FunctionName)
			) {
				if (valueOnly) {
					throw new SyntaxFailure(
						'needs-parentheses',
						join(node.span, token.span),
						{
							what: 'An infix call',
							where: SINGLE_VALUE_PLACES,
						},
					);
				}
				if (infixUsed) {
					throw new SyntaxFailure('infix-after-infix', token.span, {
						name: token.text,
					});
				}
				node = this.infixCall(node);
				infixUsed = true;
			} else {
				return node;
			}
		}
	}

	/** `left name right`: the right side is one value; properties after it apply to the call. */
	private infixCall(left: Node): Node {
		const word = this.next();
		const right = this.primary();
		return this.node(
			{
				type: 'FunctionCall',
				function: this.operator(word, FUNCTIONS[word.text] as FunctionName),
				arguments: [left, right],
				notation: 'infix',
			},
			join(left.span, right.span),
		);
	}

	// ----- values -----

	private primary(): Node {
		const token = this.peek();
		switch (token.kind) {
			case 'number':
				this.next();
				return this.node(
					{ type: 'NumberLiteral', raw: token.text, value: Number(token.text) },
					token.span,
				);
			case 'string':
				this.next();
				return this.node(
					{ type: 'StringLiteral', raw: token.text, value: stringValue(token) },
					token.span,
				);
			case 'data': {
				this.next();
				const [root, ...properties] = token.text
					.slice('data:'.length)
					.split('.')
					.filter(Boolean);
				return this.node({ type: 'DataPath', root, properties }, token.span);
			}
			case 'word':
				return this.word(token);
			case '(': {
				this.next();
				const expression = this.group();
				const end = this.expect(')', '`)`');
				return this.node(
					{ type: 'Parenthesized', expression },
					join(token.span, end.span),
				);
			}
			case '[': {
				this.next();
				const items = this.values(']');
				const end = this.next();
				return this.node(
					{ type: 'ListLiteral', notation: 'brackets', items },
					join(token.span, end.span),
				);
			}
			case '{':
				return this.braces();
			case '-':
				// `-(x)`, also with a space: the operator function `-`
				if (this.peek(1).kind === '(') {
					return this.operatorFunctionCall(token, '-');
				}
				throw new SyntaxFailure('unary-minus', token.span);
			default:
				break;
		}
		const operator = OPERATOR_FUNCTIONS[token.text];
		if (operator && this.peek(1).kind === '(' && !this.peek(1).spaceBefore) {
			return this.operatorFunctionCall(token, operator);
		}
		throw this.unexpected('a value');
	}

	private word(token: Token): Node {
		const text = token.text;
		// `data:` alone, before a space: the lexer leaves `data` a word, for a map key `{ data: 1 }`
		const colon = this.peek(1);
		if (text === 'data' && colon.kind === ':' && !colon.spaceBefore) {
			this.next();
			this.next();
			return this.node(
				{ type: 'DataPath', root: undefined, properties: [] },
				join(token.span, colon.span),
			);
		}
		if (isBooleanWord(text)) {
			this.next();
			return this.node(
				{
					type: 'BooleanLiteral',
					raw: text,
					value: /^(true|yes)$/i.test(text),
				},
				token.span,
			);
		}
		const followedByParenthesis =
			this.peek(1).kind === '(' && !this.peek(1).spaceBefore;
		const fn = FUNCTIONS[text];
		if (fn && followedByParenthesis) {
			return this.functionCall(token, fn);
		}
		const operator = OPERATOR_FUNCTIONS[text];
		if (operator && followedByParenthesis) {
			return this.operatorFunctionCall(token, operator);
		}
		if (text === this.parameters.at(-1)) {
			this.next();
			return this.node({ type: 'Parameter', name: text }, token.span);
		}
		if (this.parameters.includes(text)) {
			throw new SyntaxFailure('outer-parameter', token.span, { text });
		}
		if (text === 'null' || text === 'nil') {
			throw new SyntaxFailure('null-literal', token.span, { text });
		}
		if (text === 'to') {
			throw new SyntaxFailure('range-outside-loop', token.span);
		}
		if (fn) {
			throw new SyntaxFailure('expected', token.span, {
				expected: `\`(\` after the function ${text}`,
				found: `\`${text}\``,
			});
		}
		throw new SyntaxFailure('bare-word', token.span, { text });
	}

	private functionCall(name: Token, fn: FunctionName): Node {
		this.next();
		this.next();
		const args = this.values(')');
		const end = this.next();
		return this.node(
			{
				type: 'FunctionCall',
				function: this.operator(name, fn),
				arguments: args,
				notation: 'prefix',
			},
			join(name.span, end.span),
		);
	}

	private operatorFunctionCall(
		name: Token,
		operator: OperatorFunctionName,
	): Node {
		this.next();
		this.next();
		const args = this.values(')');
		const end = this.next();
		return this.node(
			{
				type: 'OperatorFunctionCall',
				operator: this.operator(name, operator),
				arguments: args,
			},
			join(name.span, end.span),
		);
	}

	/**
	 * Values separated by commas up to `close`, which is left to read. One
	 * trailing comma is allowed. Each value is single: see `postfix`.
	 */
	private values(close: ')' | ']' | '}'): Node[] {
		const values: Node[] = [];
		while (!this.at(close)) {
			if (this.at(',')) {
				throw new SyntaxFailure('empty-item', this.peek().span);
			}
			values.push(this.unary(true));
			if (this.at(',')) {
				this.next();
				continue;
			}
			if (!this.at(close)) {
				throw this.notSingleValue(values.at(-1) as Node, close);
			}
		}
		return values;
	}

	/** The error for something after a value in an argument, an item or a map value. */
	private notSingleValue(value: Node, close: string): SyntaxFailure {
		const token = this.peek();
		const at = join(value.span, token.span);
		if (token.kind === '.' || token.kind === '..') {
			return new SyntaxFailure('needs-parentheses', at, {
				what: 'A property',
				where: SINGLE_VALUE_PLACES,
			});
		}
		if (
			token.kind === 'word' &&
			(LAMBDAS[token.text] || TAKE_OR_SKIP[token.text])
		) {
			return new SyntaxFailure('needs-parentheses', at, {
				what: `\`${token.text}\``,
				where: SINGLE_VALUE_PLACES,
			});
		}
		const operatorWord =
			token.kind === 'word' &&
			/^(and|or|in|contains|not|eq|neq|lt|gt|lte|gte)$/.test(token.text);
		if (OPERATOR_TOKENS.has(token.kind) || operatorWord) {
			return new SyntaxFailure('needs-parentheses', at, {
				what: `An operator (\`${token.text}\`)`,
				where: SINGLE_VALUE_PLACES,
			});
		}
		return this.unexpected(`\`,\` or \`${close}\``);
	}

	/** `{1, 2}` is a list, `{}` an empty one; `{ a: 1 }` is a map. */
	private braces(): Node {
		const open = this.next();
		const first = this.peek();
		const isMap =
			['word', 'string', 'number'].includes(first.kind) &&
			this.peek(1).kind === ':';
		if (!isMap) {
			const items = this.values('}');
			const end = this.next();
			return this.node(
				{ type: 'ListLiteral', notation: 'braces', items },
				join(open.span, end.span),
			);
		}
		const entries: MapEntry[] = [];
		while (!this.at('}')) {
			if (this.at(',')) {
				throw new SyntaxFailure('empty-item', this.peek().span);
			}
			const keyToken = this.next();
			if (!['word', 'string', 'number'].includes(keyToken.kind)) {
				throw new SyntaxFailure('expected', keyToken.span, {
					expected: 'a key of the map',
					found: `\`${keyToken.text}\``,
				});
			}
			const key: Name =
				keyToken.kind === 'string'
					? { text: stringValue(keyToken), quoted: true, span: keyToken.span }
					: { text: keyToken.text, quoted: false, span: keyToken.span };
			this.expect(':', '`:` after the key');
			if (!this.peek().spaceBefore) {
				throw new SyntaxFailure(
					'map-colon-space',
					join(keyToken.span, this.peek().span),
					{ key: keyToken.text },
				);
			}
			const value = this.unary(true);
			entries.push({ key, value, span: join(keyToken.span, value.span) });
			if (this.at(',')) {
				this.next();
				continue;
			}
			if (!this.at('}')) {
				throw this.notSingleValue(value, '}');
			}
		}
		const end = this.next();
		return this.node(
			{ type: 'MapLiteral', entries },
			join(open.span, end.span),
		);
	}

	// ----- loop values -----

	/** `values` of a loop: an expression, `a to b`, or `1..5`. */
	private loopValues(): Root {
		const [from, dots, to, end] = [
			this.peek(0),
			this.peek(1),
			this.peek(2),
			this.peek(3),
		];
		if (from.kind === 'number' && dots.kind === '..' && !dots.spaceBefore) {
			if (to.kind !== 'number' || to.spaceBefore || end.kind !== 'end') {
				throw new SyntaxFailure('dots-range', dots.span);
			}
			for (const t of [from, to]) {
				if (!/^-?\d+$/.test(t.text)) {
					throw new SyntaxFailure('range-end', t.span, { text: t.text });
				}
			}
			this.pos += 3;
			return this.node(
				{
					type: 'LoopRange',
					start: this.node(
						{ type: 'NumberLiteral', raw: from.text, value: Number(from.text) },
						from.span,
					),
					end: this.node(
						{ type: 'NumberLiteral', raw: to.text, value: Number(to.text) },
						to.span,
					),
					notation: 'dots',
				},
				join(from.span, to.span),
			);
		}
		if (from.kind === 'number' && dots.kind === '..' && to.spaceBefore) {
			throw new SyntaxFailure('dots-range', dots.span);
		}
		const start = this.group();
		if (!this.atWord('to')) {
			return start;
		}
		this.next();
		const stop = this.group();
		return this.node(
			{ type: 'LoopRange', start, end: stop, notation: 'to' },
			join(start.span, stop.span),
		);
	}
}
