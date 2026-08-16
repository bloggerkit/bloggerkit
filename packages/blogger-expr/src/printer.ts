import type { MapEntry, Node } from './ast';

export class PrintError extends Error {
	constructor(
		message: string,
		public readonly node: Node,
	) {
		super(message);
		this.name = 'PrintError';
	}
}

export interface PrintOptions {
	/**
	 * Number of spaces per indent level. Omitted (or `0`) reproduces the
	 * original single-line output exactly. When set:
	 *   - `ListLiteral`, `SetLiteral`, `MapLiteral`, and `CallExpression`
	 *     always break one element per line, indented, regardless of length.
	 *   - A same-tier chain of `and`/`or`/comparison/membership operators
	 *     (`a or b or c`, `a < b < c`, ...) breaks into groups of
	 *     `MAX_OPS_PER_LINE` operators per line once it has more than that
	 *     many operators; at or under the threshold it stays single-line.
	 *   - A `filter`/`map`/`any`/`all`/`none` lambda body breaks onto its
	 *     own indented line whenever it contains a further chained lambda
	 *     anywhere within it; the innermost link (no nested chain in its
	 *     body at all) always stays single-line.
	 *   - Everything else (conditional/member-access/index/unary/etc.)
	 *     always stays on a single line, wherever it lands inside a
	 *     broken-out construct.
	 */
	indent?: number;
}

/**
 * Same set as the parser's `REQUIRES_WRAPPING`: node types that can never
 * appear bare in a restricted-value slot (function argument, list/set
 * element, map value, infix-function right operand) and must always be
 * parenthesized there, regardless of precedence.
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

/**
 * Precedence tier each node type is produced at in the grammar (higher =
 * binds tighter), mirroring parser.ts's parseConditional -> ... -> parsePrimary
 * chain. Used to decide when a child needs parens to round-trip correctly.
 */
function level(node: Node): number {
	switch (node.type) {
		case 'ConditionalExpression':
		case 'ElvisExpression':
			return 1;
		case 'LogicalExpression':
			return node.operator === 'or' ? 2 : 3;
		case 'MembershipExpression':
			return 4;
		case 'BinaryExpression':
			switch (node.operator) {
				case '==':
				case '!=':
					return 5;
				case '<':
				case '>':
				case '<=':
				case '>=':
					return 6;
				case '+':
				case '-':
					return 7;
				case '*':
				case '/':
				case '%':
					return 8;
				default: {
					throw new PrintError(
						`Unknown binary operator '${
							// @ts-expect-error
							node.operator
						}'`,
						node,
					);
				}
			}
		case 'UnaryExpression':
			return 9;
		case 'MemberExpression':
		case 'IndexExpression':
		case 'CallExpression':
		case 'LambdaExpression':
		case 'NamedOperatorExpression':
			return 10;
		default:
			// Literals, ListLiteral/MapLiteral/SetLiteral, Identifier,
			// DataReference, EmptyDataReference.
			return 11;
	}
}

/** Prints a string literal's *value* back into a quoted, escaped token. */
function printStringLiteral(value: string): string {
	if (/[\n\r]/.test(value)) {
		throw new PrintError(
			"Cannot print a StringLiteral containing a newline — this grammar's strings cannot span lines",
			{ type: 'StringLiteral', value, span: { start: 0, end: 0 } },
		);
	}
	// The lexer only treats `\"` as an escape; every other backslash is kept
	// literal. So the only character that needs escaping on the way out is a
	// bare `"` -> `\"` (verified this round-trips correctly even when the
	// value already contains a literal backslash immediately before a quote).
	return `"${value.replace(/"/g, '\\"')}"`;
}

function printNumberLiteral(value: number): string {
	if (!Number.isFinite(value)) {
		throw new PrintError(
			`Cannot print a non-finite NumberLiteral (${value}) — the grammar has no representation for it`,
			{ type: 'NumberLiteral', value, span: { start: 0, end: 0 } },
		);
	}
	const text = String(value);
	if (/e/i.test(text)) {
		throw new PrintError(
			`Cannot print NumberLiteral ${value} — the grammar doesn't support scientific notation`,
			{ type: 'NumberLiteral', value, span: { start: 0, end: 0 } },
		);
	}
	// NumberLiteral is only ever non-negative when produced by the real
	// parser (negative numbers always come out as UnaryExpression{"-", ...}
	// wrapping a positive NumberLiteral, since the lexer's NUMBER token never
	// includes a sign). We still print a best-effort "-N" for a hand-built
	// negative NumberLiteral, but note that re-parsing it will yield a
	// structurally different (though numerically equivalent) UnaryExpression
	// node rather than a NumberLiteral — there is no literal-only way to
	// spell a negative number in this grammar.
	return text;
}

/** Wraps `text` in parens if `condition`, otherwise returns it unchanged. */
function maybeWrap(text: string, condition: boolean): string {
	return condition ? `(${text})` : text;
}

/**
 * True if `node` is, or contains anywhere in its subtree, a
 * `LambdaExpression` (a filter/map/any/all/none link). Used to decide
 * whether a lambda body should break onto its own indented line: a link is
 * "innermost" — and stays single-line — only when there's no further chain
 * buried anywhere in its body, not merely when its body isn't *directly*
 * another LambdaExpression (the chain can be buried inside a
 * LogicalExpression, BinaryExpression, etc., as in `a.target filter (a =>
 * a.hello) or a == data:b`).
 */
function containsLambdaOperator(node: Node): boolean {
	if (node.type === 'LambdaExpression') {
		return true;
	}
	switch (node.type) {
		case 'StringLiteral':
		case 'NumberLiteral':
		case 'BooleanLiteral':
		case 'EmptyDataReference':
		case 'Identifier':
		case 'DataReference':
			return false;
		case 'ListLiteral':
		case 'SetLiteral':
			return node.elements.some((e) => containsLambdaOperator(e));
		case 'MapLiteral':
			return node.entries.some((e) => containsLambdaOperator(e.value));
		case 'MemberExpression':
			return containsLambdaOperator(node.object);
		case 'IndexExpression':
			return (
				containsLambdaOperator(node.object) ||
				containsLambdaOperator(node.index)
			);
		case 'CallExpression':
			return node.args.some(containsLambdaOperator);
		case 'UnaryExpression':
			return containsLambdaOperator(node.argument);
		case 'BinaryExpression':
		case 'LogicalExpression':
		case 'MembershipExpression':
		case 'NamedOperatorExpression':
			return (
				containsLambdaOperator(node.left) || containsLambdaOperator(node.right)
			);
		case 'ConditionalExpression':
			return (
				containsLambdaOperator(node.test) ||
				containsLambdaOperator(node.consequent) ||
				containsLambdaOperator(node.alternate)
			);
		case 'ElvisExpression':
			return (
				containsLambdaOperator(node.left) || containsLambdaOperator(node.right)
			);
		default: {
			const exhaustive: never = node;
			throw new PrintError(
				`Unknown node type ${(exhaustive as Node).type}`,
				node,
			);
		}
	}
}

const BINARY_OP_TEXT: Record<string, string> = {
	'+': '+',
	'-': '-',
	'*': '*',
	'/': '/',
	'%': '%',
	'==': '==',
	'!=': '!=',
	'<': '<',
	'>': '>',
	'<=': '<=',
	'>=': '>=',
};

/** Node types that participate in same-tier left-associative chain flattening. */
type ChainNode = Extract<
	Node,
	{ type: 'BinaryExpression' | 'LogicalExpression' | 'MembershipExpression' }
>;

function isChainNode(node: Node): node is ChainNode {
	return (
		node.type === 'BinaryExpression' ||
		node.type === 'LogicalExpression' ||
		node.type === 'MembershipExpression'
	);
}

function chainOpText(node: ChainNode): string {
	switch (node.type) {
		case 'BinaryExpression':
			return BINARY_OP_TEXT[node.operator] as string;
		case 'LogicalExpression':
			return node.operator;
		case 'MembershipExpression':
			return `${node.negated ? 'not ' : ''}${node.operator}`;
	}
}

/**
 * Max operators allowed on one printed line for a same-tier chain (`a or b
 * or c`, `a < b < c`, `a in b contains c`) before it wraps, in indent mode.
 * A chain with this many operators or fewer always stays single-line.
 */
const MAX_OPS_PER_LINE = 2;

/**
 * Converts an AST node back into a parseable expression string. Does not
 * attempt to preserve the original source's exact spelling or its
 * (semantically irrelevant) parenthesization choices — only that
 * `parse(print(node))` reproduces a structurally equivalent AST.
 *
 * Throws `PrintError` for nodes that have no valid textual representation in
 * this grammar at all (an empty MapLiteral, a non-finite/scientific-notation
 * NumberLiteral, a multi-line StringLiteral, or an IndexExpression whose
 * object isn't a `data:` chain) — these can only arise from a hand-built
 * AST, never from `parse()`.
 *
 * Pass `{ indent: N }` to pretty-print: `ListLiteral`, `SetLiteral`,
 * `MapLiteral`, and `CallExpression` then always break one element per line,
 * indented N spaces per level. Everything else always stays single-line.
 * Omitting `indent` (or passing `0`) reproduces the original all-on-one-line
 * output.
 */
export function print(node: Node, options: PrintOptions = {}): string {
	return new Printer(options.indent ?? 0).print(node);
}

class Printer {
	constructor(private readonly indentSize: number) {}

	print(node: Node): string {
		return this.printNode(node, 0);
	}

	private pad(depth: number): string {
		return ' '.repeat(this.indentSize * depth);
	}

	/**
	 * Joins already-printed child strings — each already rendered at
	 * `depth + 1`, so any nested breakable collections inside them already
	 * carry their own correct absolute indentation — into either a
	 * single-line `a, b, c` (indent disabled) or one-per-line, indented,
	 * with the closing bracket dedented back to `depth` (indent enabled).
	 * Callers wrap the result in their own open/close bracket text.
	 */
	private breakList(items: string[], depth: number): string {
		if (items.length === 0) {
			return '';
		}
		if (this.indentSize === 0) {
			return items.join(', ');
		}
		const inner = items
			.map((item) => `${this.pad(depth + 1)}${item}`)
			.join(',\n');
		return `\n${inner}\n${this.pad(depth)}`;
	}

	private printRestricted(node: Node, depth: number): string {
		return maybeWrap(
			this.printNode(node, depth),
			REQUIRES_WRAPPING.has(node.type),
		);
	}

	/**
	 * Prints a node used as the "object"/"source"/"left" operand immediately
	 * before a postfix continuation (`.prop`, `filter(...)`, `x path y`).
	 * `forbidBareLambdaOperator` mirrors the parser's rule that `.prop` and
	 * infix function names can't directly follow an unwrapped
	 * filter/map/any/all/none chain (list-operator chaining onto itself,
	 * e.g. `filter(...) map(...)`, is exempt — pass `false` there).
	 */
	private printPostfixOperand(
		node: Node,
		forbidBareLambdaOperator: boolean,
		depth: number,
	): string {
		const needsWrap =
			level(node) < 10 ||
			(forbidBareLambdaOperator && node.type === 'LambdaExpression');
		return maybeWrap(this.printNode(node, depth), needsWrap);
	}

	/**
	 * Prints the object of an IndexExpression. Unlike other postfix
	 * operands, `[...]` is only ever grammatically valid directly on a
	 * `data:`-rooted chain (DataReference/MemberExpression/IndexExpression)
	 * — and parentheses don't help, since the parser checks the pre-paren
	 * node type either way. So this throws rather than producing text the
	 * parser would reject.
	 */
	private printIndexObject(node: Node, depth: number): string {
		if (
			node.type !== 'DataReference' &&
			node.type !== 'MemberExpression' &&
			node.type !== 'IndexExpression'
		) {
			throw new PrintError(
				`Cannot print IndexExpression: its object must be a 'data:' reference chain, got ${node.type} ` +
					'(the grammar has no valid syntax for indexing anything else, with or without parens)',
				node,
			);
		}
		return this.printNode(node, depth);
	}

	/**
	 * Flattens a left-associative chain of same-tier BinaryExpression /
	 * LogicalExpression / MembershipExpression nodes (matching how the
	 * parser's parseLogicalOr/parseMembership/etc. loops actually build
	 * these left-deep trees) into an ordered list of leaves. `opText` is
	 * `null` for the first (leftmost) leaf and the connecting operator text
	 * for every leaf after it. A "leaf" is any node NOT part of the same
	 * chain — it may still itself be an arbitrarily complex expression.
	 */
	private flattenChain(
		node: ChainNode,
	): { node: Node; opText: string | null }[] {
		const ownLevel = level(node);
		const opText = chainOpText(node);
		const leaves: { node: Node; opText: string | null }[] = [];

		if (isChainNode(node.left) && level(node.left) === ownLevel) {
			leaves.push(...this.flattenChain(node.left));
		} else {
			leaves.push({ node: node.left, opText: null });
		}
		leaves.push({ node: node.right, opText });
		return leaves;
	}

	/**
	 * Prints a same-tier chain. Stays single-line whenever it has
	 * `MAX_OPS_PER_LINE` operators or fewer, or indent is disabled;
	 * otherwise groups leaves into chunks of `MAX_OPS_PER_LINE + 1`,
	 * one chunk per line, indented one level deeper, with each
	 * continuation line's leading operator connecting back to the
	 * previous line's last leaf.
	 */
	private printChain(node: ChainNode, depth: number): string {
		const ownLevel = level(node);
		const leaves = this.flattenChain(node);

		const renderLeaf = (
			leaf: { node: Node; opText: string | null },
			isFirst: boolean,
		): string => {
			const text = this.printNode(leaf.node, depth);
			const needsWrap = isFirst
				? level(leaf.node) < ownLevel
				: level(leaf.node) <= ownLevel;
			const wrapped = maybeWrap(text, needsWrap);
			return leaf.opText === null ? wrapped : `${leaf.opText} ${wrapped}`;
		};

		const opCount = leaves.length - 1;
		if (this.indentSize === 0 || opCount <= MAX_OPS_PER_LINE) {
			return leaves.map((leaf, i) => renderLeaf(leaf, i === 0)).join(' ');
		}

		const groupSize = MAX_OPS_PER_LINE + 1;
		const lines: string[] = [];
		for (let i = 0; i < leaves.length; i += groupSize) {
			const group = leaves.slice(i, i + groupSize);
			const groupText = group
				.map((leaf, j) => renderLeaf(leaf, i === 0 && j === 0))
				.join(' ');
			lines.push(i === 0 ? groupText : `${this.pad(depth + 1)}${groupText}`);
		}
		return lines.join('\n');
	}

	private printMapEntry(entry: MapEntry, depth: number): string {
		return `${entry.key}: ${this.printRestricted(entry.value, depth)}`;
	}

	private printNode(node: Node, depth: number): string {
		switch (node.type) {
			case 'StringLiteral':
				return printStringLiteral(node.value);
			case 'NumberLiteral':
				return printNumberLiteral(node.value);
			case 'BooleanLiteral':
				return node.value ? 'true' : 'false';
			case 'EmptyDataReference':
				return 'data:.';

			case 'ListLiteral': {
				const items = node.elements.map((el) =>
					this.printRestricted(el, depth + 1),
				);
				return `[${this.breakList(items, depth)}]`;
			}

			case 'SetLiteral': {
				const items = node.elements.map((el) =>
					this.printRestricted(el, depth + 1),
				);
				return `{${this.breakList(items, depth)}}`;
			}

			case 'MapLiteral': {
				if (node.entries.length === 0) {
					throw new PrintError(
						"Cannot print an empty MapLiteral — '{}' is unconditionally an empty SetLiteral " +
							'in this grammar, so an empty map has no valid spelling',
						node,
					);
				}
				if (node.entries.length === 0) {
					return '{}';
				}
				const items = node.entries.map((e) => this.printMapEntry(e, depth + 1));
				if (this.indentSize === 0) {
					return `{ ${items.join(', ')} }`;
				}
				return `{${this.breakList(items, depth)}}`;
			}

			case 'Identifier':
				return node.name;

			case 'DataReference':
				return `data:${node.name}`;

			case 'MemberExpression':
				return `${this.printPostfixOperand(node.object, true, depth)}.${node.property}`;

			case 'IndexExpression':
				return `${this.printIndexObject(node.object, depth)}[${this.printNode(node.index, depth)}]`;

			case 'CallExpression': {
				const items = node.args.map((a) => this.printRestricted(a, depth + 1));
				if (items.length === 0) {
					return `${node.callee}()`;
				}
				return `${node.callee}(${this.breakList(items, depth)})`;
			}

			case 'UnaryExpression': {
				const opText = node.operator;
				const argText = maybeWrap(
					this.printNode(node.argument, depth),
					level(node.argument) < 9,
				);
				return `${opText}${argText}`;
			}

			case 'BinaryExpression':
			case 'LogicalExpression':
			case 'MembershipExpression':
				return this.printChain(node, depth);

			case 'ConditionalExpression': {
				const testText = maybeWrap(
					this.printNode(node.test, depth),
					level(node.test) < 2,
				);
				// consequent/alternate are both parsed via the full top production,
				// so neither ever needs wrapping regardless of type.
				return `${testText} ? ${this.printNode(node.consequent, depth)} : ${this.printNode(node.alternate, depth)}`;
			}

			case 'ElvisExpression': {
				const leftText = maybeWrap(
					this.printNode(node.left, depth),
					level(node.left) < 2,
				);
				return `${leftText} ?: ${this.printNode(node.right, depth)}`;
			}

			case 'LambdaExpression': {
				const sourceText = this.printPostfixOperand(node.source, false, depth);
				// Break the lambda body onto its own indented line whenever
				// there's further chain beneath it anywhere in the body's
				// subtree (not just when the body is directly another
				// LambdaExpression) — the innermost link, whose body
				// has no nested chain at all, always stays single-line.
				const bodyIsChain = containsLambdaOperator(node.body);
				if (this.indentSize === 0 || !bodyIsChain) {
					return `${sourceText} ${node.operator} (${node.param} => ${this.printNode(node.body, depth)})`;
				}
				const bodyText = this.printNode(node.body, depth + 1);
				return `${sourceText} ${node.operator} (${node.param} =>\n${this.pad(depth + 1)}${bodyText}\n${this.pad(depth)})`;
			}

			case 'NamedOperatorExpression': {
				const leftText = this.printPostfixOperand(node.left, true, depth);
				const rightText = this.printRestricted(node.right, depth);
				return `${leftText} ${node.operator} ${rightText}`;
			}

			default: {
				const exhaustive: never = node;
				throw new PrintError(
					`Unknown node type ${(exhaustive as Node).type}`,
					node,
				);
			}
		}
	}
}
