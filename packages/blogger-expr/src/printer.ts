import type { FunctionName, InfixFunctionName, MapEntry, Node } from './ast';
import {
	checkCall,
	DATA_SEGMENT,
	FUNCTION_NAMES,
	IDENTIFIER,
	INFIX_FUNCTION_NAMES,
	LAMBDA_OPERATORS,
	REQUIRES_WRAPPING,
	RESERVED_WORDS,
} from './grammar';

export class PrintError extends Error {
	/** The node that can not be printed, as it was given. */
	readonly node: unknown;
	/** Where the node is in the tree, e.g. `root.args[1].left`. */
	readonly path: string;

	constructor(message: string, node: unknown, path = 'root') {
		super(`${message} (at ${path})`);
		this.name = 'PrintError';
		this.node = node;
		this.path = path;
	}
}

export interface PrintOptions {
	/**
	 * Spaces per indentation level. `0`, the default, prints everything on a
	 * single line. Otherwise what does not fit in `printWidth` is broken over
	 * lines: lists, sets, maps and call arguments one item per line, chains of
	 * operators and lambdas before each operator, conditionals before `?` and
	 * `:`, and lambda bodies on their own lines.
	 */
	indent?: number;
	/** The line width to fit in when `indent` is set, `80` by default. */
	printWidth?: number;
}

/**
 * Converts an AST back into an expression. Reading the result with `parse`
 * gives the same AST, spans aside: parentheses are added only where the
 * grammar needs them, and the original spelling (`eq`, `&&`, `yes`, extra
 * parentheses, ...) is not kept.
 *
 * Nodes no expression can produce throw a `PrintError` naming where they are
 * in the tree, instead of printing something the parser would reject or read
 * differently: an empty map, a string with a line break or ending with a
 * backslash, a non-finite number, an identifier out of the scope of its
 * lambda, a call with wrong arguments, indexing anything but a `data:` path,
 * and malformed or cyclic nodes. A negative number literal, which the parser
 * never produces, prints as `-N` and is read back as a unary minus.
 */
export function print(node: Node, options: PrintOptions = {}): string {
	const { indent = 0, printWidth = 80 } = options;
	if (!Number.isInteger(indent) || indent < 0) {
		throw new RangeError(
			`Expected 'indent' to be a non-negative integer, got: ${String(indent)}`,
		);
	}
	if (!Number.isInteger(printWidth) || printWidth < 1) {
		throw new RangeError(
			`Expected 'printWidth' to be a positive integer, got: ${String(printWidth)}`,
		);
	}

	let doc: Doc;
	try {
		doc = new DocBuilder().build(node);
	} catch (error) {
		if (error instanceof RangeError) {
			throw new PrintError(
				'The expression is nested too deeply to print',
				node,
			);
		}
		throw error;
	}

	return indent === 0 ? renderFlat(doc) : render(doc, printWidth, indent);
}

// ---------------------------------------------------------------------------
// Precedence
// ---------------------------------------------------------------------------

/**
 * How tightly a node binds, following the parser's chain of productions:
 * parseConditional -> parseLogicalOr -> ... -> parseUnary -> parsePostfix ->
 * parsePrimary. A child at a lower level than its slot needs parentheses.
 */
enum Level {
	Conditional = 1,
	Or = 2,
	And = 3,
	Membership = 4,
	Equality = 5,
	Relational = 6,
	Additive = 7,
	Multiplicative = 8,
	Unary = 9,
	Postfix = 10,
	Primary = 11,
}

const BINARY_LEVELS: Record<string, Level> = {
	'==': Level.Equality,
	'!=': Level.Equality,
	'<': Level.Relational,
	'>': Level.Relational,
	'<=': Level.Relational,
	'>=': Level.Relational,
	'+': Level.Additive,
	'-': Level.Additive,
	'*': Level.Multiplicative,
	'/': Level.Multiplicative,
	'%': Level.Multiplicative,
};

function levelOf(node: Node): Level {
	switch (node.type) {
		case 'ConditionalExpression':
		case 'ElvisExpression':
			return Level.Conditional;
		case 'LogicalExpression':
			return node.operator === 'or' ? Level.Or : Level.And;
		case 'MembershipExpression':
			return Level.Membership;
		case 'BinaryExpression':
			return BINARY_LEVELS[node.operator] as Level;
		case 'UnaryExpression':
			return Level.Unary;
		case 'NumberLiteral':
			// printed with a leading `-`, kept in parentheses where a `.` follows
			return isNegative(node.value) ? Level.Unary : Level.Primary;
		case 'MemberExpression':
		case 'IndexExpression':
		case 'CallExpression':
		case 'LambdaExpression':
		case 'NamedOperatorExpression':
			return Level.Postfix;
		default:
			return Level.Primary;
	}
}

/** Where a child is printed, which decides whether it needs parentheses. */
type Slot =
	/** Anything, it is delimited: inside brackets, a lambda body, the top. */
	| { kind: 'any' }
	/** An operand, at least this tight. */
	| { kind: 'level'; level: Level }
	/** A single value: an argument, an element, a map value. */
	| { kind: 'value' }
	/** Followed by `.` or by an infix function. */
	| { kind: 'object' }
	/** Followed by a lambda operator, which can chain onto another one. */
	| { kind: 'lambdaSource' };

const ANY: Slot = { kind: 'any' };
const VALUE: Slot = { kind: 'value' };
const OBJECT: Slot = { kind: 'object' };
const LAMBDA_SOURCE: Slot = { kind: 'lambdaSource' };
const level = (value: Level): Slot => ({ kind: 'level', level: value });

function needsParentheses(node: Node, slot: Slot): boolean {
	switch (slot.kind) {
		case 'any':
			return false;
		case 'level':
			return levelOf(node) < slot.level;
		case 'value':
			// read with parseUnary, then rejected unless it was in parentheses
			return REQUIRES_WRAPPING.has(node.type);
		case 'object':
			return (
				levelOf(node) < Level.Postfix ||
				// `.` and infix functions can not follow a bare lambda chain
				node.type === 'LambdaExpression' ||
				// the right operand of an infix function is read greedily, it
				// would take what follows: `a path "x".b` is `a path ("x".b)`
				node.type === 'NamedOperatorExpression' ||
				// `data:.` and `.b` are read as a single `data:.b` path
				node.type === 'EmptyDataReference'
			);
		case 'lambdaSource':
			return (
				levelOf(node) < Level.Postfix || node.type === 'NamedOperatorExpression'
			);
	}
}

// ---------------------------------------------------------------------------
// Building the document
// ---------------------------------------------------------------------------

/** Where a node is in the tree, built up lazily for error messages. */
interface TreePath {
	readonly parent: TreePath | null;
	readonly segment: string;
}

function pathToString(path: TreePath): string {
	const segments: string[] = [];
	for (let current: TreePath | null = path; current; current = current.parent) {
		segments.push(current.segment);
	}
	segments.reverse();

	// long left-deep chains repeat a segment, `.left×200` reads better
	let text = '';
	for (let i = 0; i < segments.length; ) {
		let count = 1;
		while (segments[i + count] === segments[i] && i > 0) {
			count++;
		}
		text += count > 2 ? `${segments[i]}×${count}` : segments[i]?.repeat(count);
		i += count;
	}
	return text;
}

const child = (parent: TreePath, segment: string): TreePath => ({
	parent,
	segment,
});

const ROOT: TreePath = { parent: null, segment: 'root' };

const BINARY_OPERATORS = new Set(Object.keys(BINARY_LEVELS));
const UNARY_OPERATORS = new Set(['!']);
const LOGICAL_OPERATORS = new Set(['and', 'or']);
const MEMBERSHIP_OPERATORS = new Set(['in', 'contains']);

type ChainNode = Extract<
	Node,
	{ type: 'BinaryExpression' | 'LogicalExpression' | 'MembershipExpression' }
>;

class DocBuilder {
	/** The nodes being printed, to find cycles. */
	private readonly ancestors = new Set<object>();
	/** The parameter of the innermost lambda, the only identifier in scope. */
	private scope: string | null = null;

	build(node: Node): Doc {
		return this.print(node, ANY, ROOT);
	}

	private fail(message: string, node: unknown, path: TreePath): never {
		throw new PrintError(message, node, pathToString(path));
	}

	/** Prints `node` in `slot`, with parentheses when it needs them there. */
	private print(node: Node, slot: Slot, path: TreePath): Doc {
		this.assertNode(node, path);
		if (this.ancestors.has(node)) {
			this.fail('The tree has a cycle, a node contains itself', node, path);
		}

		this.ancestors.add(node);
		try {
			const doc = this.printNode(node, path);
			return needsParentheses(node, slot) ? parenthesize(doc) : doc;
		} finally {
			this.ancestors.delete(node);
		}
	}

	private assertNode(node: unknown, path: TreePath): asserts node is Node {
		if (typeof node !== 'object' || node === null) {
			this.fail(
				`Expected a node, got: ${node === null ? 'null' : typeof node}`,
				node,
				path,
			);
		}
		const { type } = node as { type?: unknown };
		if (typeof type !== 'string') {
			this.fail("Expected a node, it has no 'type'", node, path);
		}
	}

	private printNode(node: Node, path: TreePath): Doc {
		switch (node.type) {
			case 'StringLiteral':
				return this.printString(node.value, node, path);

			case 'NumberLiteral':
				return this.printNumber(node.value, node, path);

			case 'BooleanLiteral':
				if (typeof node.value !== 'boolean') {
					this.fail("Expected 'value' to be a boolean", node, path);
				}
				return node.value ? 'true' : 'false';

			case 'EmptyDataReference':
				return 'data:.';

			case 'DataReference':
				if (typeof node.name !== 'string' || !DATA_SEGMENT.test(node.name)) {
					this.fail(
						`Invalid 'data:' name ${JSON.stringify(node.name)}, it has to be made of letters, digits, '_', '$' and '-'`,
						node,
						path,
					);
				}
				return `data:${node.name}`;

			case 'Identifier':
				return this.printIdentifier(node, path);

			case 'ListLiteral':
				return this.printItems(
					'[',
					']',
					this.array(node, 'elements', path).map((element, i) =>
						this.print(element, VALUE, child(path, `.elements[${i}]`)),
					),
				);

			case 'SetLiteral':
				// `{}` is an empty set
				return this.printItems(
					'{',
					'}',
					this.array(node, 'elements', path).map((element, i) =>
						this.print(element, VALUE, child(path, `.elements[${i}]`)),
					),
				);

			case 'MapLiteral':
				return this.printMap(node, path);

			case 'MemberExpression':
			case 'IndexExpression':
			case 'CallExpression':
				return this.printPostfix(node, path);

			case 'NamedOperatorExpression':
				return this.printNamedOperator(node, path);

			case 'LambdaExpression':
				return this.printLambdaChain(node, path);

			case 'UnaryExpression':
				if (!UNARY_OPERATORS.has(node.operator)) {
					this.fail(
						`Unknown unary operator '${String(node.operator)}'`,
						node,
						path,
					);
				}
				return [
					node.operator,
					this.print(
						node.argument,
						level(Level.Unary),
						child(path, '.argument'),
					),
				];

			case 'BinaryExpression':
			case 'LogicalExpression':
			case 'MembershipExpression':
				return this.printChain(node, path);

			case 'ConditionalExpression':
				return group([
					this.print(node.test, level(Level.Or), child(path, '.test')),
					indent([
						line,
						'? ',
						this.print(node.consequent, ANY, child(path, '.consequent')),
						line,
						': ',
						this.print(node.alternate, ANY, child(path, '.alternate')),
					]),
				]);

			case 'ElvisExpression':
				return group([
					this.print(node.left, level(Level.Or), child(path, '.left')),
					indent([
						line,
						'?: ',
						this.print(node.right, ANY, child(path, '.right')),
					]),
				]);

			default:
				return this.fail(
					`Unknown node type '${(node as { type: string }).type}'`,
					node,
					path,
				);
		}
	}

	private array(node: Node, field: string, path: TreePath): Node[] {
		const value = (node as unknown as Record<string, unknown>)[field];
		if (!Array.isArray(value)) {
			this.fail(`Expected '${field}' to be an array`, node, path);
		}
		return value;
	}

	private printString(value: unknown, node: unknown, path: TreePath): string {
		if (typeof value !== 'string') {
			this.fail("Expected 'value' to be a string", node, path);
		}
		if (/[\n\r]/.test(value)) {
			this.fail(
				'A string can not have a line break, strings can not span lines',
				node,
				path,
			);
		}
		// only `\"` is an escape, a backslash can not be escaped: one before
		// the closing quote would escape it
		if (value.endsWith('\\')) {
			this.fail(
				'A string can not end with a backslash, it would escape the closing quote',
				node,
				path,
			);
		}
		return `"${value.replaceAll('"', '\\"')}"`;
	}

	private printNumber(value: unknown, node: unknown, path: TreePath): string {
		if (typeof value !== 'number') {
			this.fail("Expected 'value' to be a number", node, path);
		}
		if (!Number.isFinite(value)) {
			this.fail(`A number has to be finite, got: ${value}`, node, path);
		}

		const digits = toDecimal(Math.abs(value));
		// the decimal form is exact, but it is checked to be sure
		if (Number(digits) !== Math.abs(value)) {
			this.fail(`The number ${value} can not be written exactly`, node, path);
		}
		return isNegative(value) ? `-${digits}` : digits;
	}

	private printIdentifier(
		node: Extract<Node, { type: 'Identifier' }>,
		path: TreePath,
	): string {
		const { name } = node;
		if (typeof name !== 'string' || !IDENTIFIER.test(name)) {
			this.fail(`Invalid identifier ${JSON.stringify(name)}`, node, path);
		}
		if (RESERVED_WORDS.has(name)) {
			this.fail(
				`The identifier '${name}' can not be referenced, '${name}' is read as a keyword`,
				node,
				path,
			);
		}
		if (name !== this.scope) {
			this.fail(
				this.scope === null
					? `The identifier '${name}' is out of scope, an identifier can only be the parameter of the lambda it is in`
					: `The identifier '${name}' is out of scope, only the parameter of the innermost lambda ('${this.scope}') can be referenced`,
				node,
				path,
			);
		}
		return name;
	}

	/** `[a, b]`, `{a, b}` and `name(a, b)`, broken one item per line. */
	private printItems(open: string, close: string, items: Doc[]): Doc {
		if (items.length === 0) {
			return open + close;
		}
		return group([
			open,
			indent([softline, join([',', line], items)]),
			softline,
			close,
		]);
	}

	private printMap(
		node: Extract<Node, { type: 'MapLiteral' }>,
		path: TreePath,
	): Doc {
		const entries = this.array(node, 'entries', path) as unknown as MapEntry[];
		if (entries.length === 0) {
			this.fail(
				"An empty map can not be printed, '{}' is an empty set",
				node,
				path,
			);
		}

		const items = entries.map((entry, i) => {
			const entryPath = child(path, `.entries[${i}]`);
			if (typeof entry !== 'object' || entry === null) {
				this.fail('Expected a map entry', entry, entryPath);
			}
			return [
				this.printMapKey(entry.key, entry, entryPath),
				': ',
				this.print(entry.value, VALUE, child(entryPath, '.value')),
			];
		});

		return group(['{', indent([line, join([',', line], items)]), line, '}']);
	}

	private printMapKey(key: unknown, entry: unknown, path: TreePath): string {
		if (typeof key !== 'string') {
			this.fail("Expected 'key' to be a string", entry, path);
		}
		// `data:` starts a data path, so a `data` key is quoted
		if (IDENTIFIER.test(key) && key !== 'data') {
			return key;
		}
		return this.printString(key, entry, child(path, '.key'));
	}

	/**
	 * A chain of member accesses and indexes, printed from its root. The chain
	 * is walked without recursion, `data:` paths can be long.
	 */
	private printPostfix(node: Node, path: TreePath): Doc {
		if (node.type === 'CallExpression') {
			return this.printCall(node, path);
		}

		const links: { node: Node & { object: Node }; path: TreePath }[] = [];
		const seen = new Set<Node>();
		let root: Node = node;
		let rootPath = path;

		while (
			(root.type === 'MemberExpression' || root.type === 'IndexExpression') &&
			!seen.has(root)
		) {
			seen.add(root);
			links.push({ node: root, path: rootPath });
			rootPath = child(rootPath, '.object');
			this.assertNode(root.object, rootPath);
			root = root.object;
		}

		const innermost = links.at(-1) as { node: Node; path: TreePath };
		// indexing is checked on the type of the object, parentheses do not
		// help, and the members and indexes on the way are part of the chain
		if (
			innermost.node.type === 'IndexExpression' &&
			root.type !== 'DataReference'
		) {
			this.fail(
				`Only a 'data:' path can be indexed, got ${root.type === 'Identifier' ? 'a lambda parameter' : `a ${root.type}`}`,
				innermost.node,
				innermost.path,
			);
		}

		for (const link of links) {
			this.ancestors.add(link.node);
		}
		try {
			// a node of the chain met again is a cycle, `print` reports it
			let doc = this.print(root, OBJECT, rootPath);
			// in a `data:` path, the properties are part of the same token
			let pure = root.type === 'DataReference';

			for (let i = links.length - 1; i >= 0; i--) {
				const { node: link, path: linkPath } = links[
					i
				] as (typeof links)[number];
				if (link.type === 'MemberExpression') {
					doc = [doc, '.', this.printProperty(link, pure, linkPath)];
				} else if (link.type === 'IndexExpression') {
					doc = [
						doc,
						'[',
						group([
							indent([
								softline,
								this.print(link.index, ANY, child(linkPath, '.index')),
							]),
							softline,
						]),
						']',
					];
					pure = false;
				}
			}
			return doc;
		} finally {
			for (const link of links) {
				this.ancestors.delete(link.node);
			}
		}
	}

	private printCall(
		node: Extract<Node, { type: 'CallExpression' }>,
		path: TreePath,
	): Doc {
		if (!FUNCTION_NAMES.has(node.callee)) {
			this.fail(`Unknown function '${String(node.callee)}'`, node, path);
		}
		const args = this.array(node, 'args', path);
		// printed first, which checks they are well-formed
		const docs = args.map((arg, i) =>
			this.print(arg, VALUE, child(path, `.args[${i}]`)),
		);
		this.checkCall(node.callee, args, node, path);
		return this.printItems(`${node.callee}(`, ')', docs);
	}

	private printProperty(
		node: Extract<Node, { type: 'MemberExpression' }>,
		pure: boolean,
		path: TreePath,
	): string {
		const { property } = node;
		if (typeof property !== 'string') {
			this.fail("Expected 'property' to be a string", node, path);
		}
		// in a `data:` path, it is part of the same token as the rest of it
		if (pure ? DATA_SEGMENT.test(property) : IDENTIFIER.test(property)) {
			return property;
		}
		return this.fail(
			pure
				? `Invalid property '${property}' of a 'data:' path, it has to be made of letters, digits, '_', '$' and '-'`
				: `Invalid property '${property}', out of a 'data:' path it has to be an identifier`,
			node,
			path,
		);
	}

	private printNamedOperator(
		node: Extract<Node, { type: 'NamedOperatorExpression' }>,
		path: TreePath,
	): Doc {
		if (!INFIX_FUNCTION_NAMES.has(node.operator)) {
			this.fail(
				`Unknown infix function '${String(node.operator)}'`,
				node,
				path,
			);
		}
		const left = this.print(node.left, OBJECT, child(path, '.left'));
		const right = this.print(node.right, VALUE, child(path, '.right'));
		this.checkCall(node.operator, [node.left, node.right], node, path);

		return group([left, indent([line, `${node.operator} `, right])]);
	}

	/** Checks the arguments the way the parser does, they are well-formed. */
	private checkCall(
		name: FunctionName | InfixFunctionName,
		args: Node[],
		node: Node,
		path: TreePath,
	): void {
		const problem = checkCall(name, args);
		if (problem) {
			this.fail(problem.message, problem.node ?? node, path);
		}
	}

	/**
	 * `source filter (a => ...) map (b => ...)`, a chain of lambdas printed
	 * from its source, without recursion.
	 */
	private printLambdaChain(
		node: Extract<Node, { type: 'LambdaExpression' }>,
		path: TreePath,
	): Doc {
		const links: {
			node: Extract<Node, { type: 'LambdaExpression' }>;
			path: TreePath;
		}[] = [];
		const seen = new Set<Node>();
		let source: Node = node;
		let sourcePath = path;

		while (source.type === 'LambdaExpression' && !seen.has(source)) {
			seen.add(source);
			links.push({ node: source, path: sourcePath });
			sourcePath = child(sourcePath, '.source');
			this.assertNode(source.source, sourcePath);
			source = source.source;
		}

		for (const link of links) {
			this.ancestors.add(link.node);
		}
		try {
			const base = this.print(source, LAMBDA_SOURCE, sourcePath);
			const printed = links
				.reverse()
				.map(({ node: lambda, path: linkPath }) => {
					if (!LAMBDA_OPERATORS.has(lambda.operator)) {
						this.fail(
							`Unknown lambda operator '${String(lambda.operator)}'`,
							lambda,
							linkPath,
						);
					}
					if (
						typeof lambda.param !== 'string' ||
						!IDENTIFIER.test(lambda.param)
					) {
						this.fail(
							`Invalid lambda parameter ${JSON.stringify(lambda.param)}`,
							lambda,
							linkPath,
						);
					}

					const outer = this.scope;
					this.scope = lambda.param;
					let body: Doc;
					try {
						body = this.print(lambda.body, ANY, child(linkPath, '.body'));
					} finally {
						this.scope = outer;
					}

					return [
						`${lambda.operator} (${lambda.param} =>`,
						group([indent([line, body]), softline]),
						')',
					];
				});

			// a single lambda stays on the line of its source
			return printed.length === 1
				? [base, ' ', printed[0] as Doc]
				: group([base, indent(printed.map((link) => [line, link]))]);
		} finally {
			for (const link of links) {
				this.ancestors.delete(link.node);
			}
		}
	}

	/**
	 * A left-deep chain of operators of the same precedence, `a or b or c`,
	 * walked without recursion: the parser builds them in a loop, so they can
	 * be long.
	 */
	private printChain(node: ChainNode, path: TreePath): Doc {
		const chainLevel = this.chainLevel(node, path);
		const operands: { operator: string; node: Node; path: TreePath }[] = [];
		const members = new Set<ChainNode>();
		let left: Node = node;
		let leftPath = path;

		for (;;) {
			const current = left as ChainNode;
			members.add(current);
			operands.push({
				operator: this.chainOperator(current, leftPath),
				node: current.right,
				path: child(leftPath, '.right'),
			});
			leftPath = child(leftPath, '.left');
			this.assertNode(current.left, leftPath);
			left = current.left;

			// a node met again is a cycle, `print` reports it
			if (
				!isChainNode(left) ||
				members.has(left) ||
				this.chainLevel(left, leftPath) !== chainLevel
			) {
				break;
			}
		}

		for (const member of members) {
			this.ancestors.add(member);
		}
		try {
			// left-associative: the first operand can be at the same level,
			// the others have to bind tighter
			const first = this.print(left, level(chainLevel), leftPath);
			const rest = operands
				.reverse()
				.map(({ operator, node: operand, path: operandPath }) => [
					line,
					`${operator} `,
					this.print(operand, level(chainLevel + 1), operandPath),
				]);

			// `a in [` keeps a bracketed operand on the line, its own items break
			const [only] = operands;
			if (operands.length === 1 && only && isBracketed(only.node)) {
				return [first, ' ', (rest[0] as Doc[]).slice(1)];
			}
			return group([first, indent(rest)]);
		} finally {
			for (const member of members) {
				this.ancestors.delete(member);
			}
		}
	}

	private chainLevel(node: ChainNode, path: TreePath): Level {
		switch (node.type) {
			case 'BinaryExpression':
				if (!BINARY_OPERATORS.has(node.operator)) {
					this.fail(
						`Unknown binary operator '${String(node.operator)}'`,
						node,
						path,
					);
				}
				return BINARY_LEVELS[node.operator] as Level;
			case 'LogicalExpression':
				if (!LOGICAL_OPERATORS.has(node.operator)) {
					this.fail(
						`Unknown logical operator '${String(node.operator)}'`,
						node,
						path,
					);
				}
				return node.operator === 'or' ? Level.Or : Level.And;
			case 'MembershipExpression':
				return Level.Membership;
		}
	}

	private chainOperator(node: ChainNode, path: TreePath): string {
		if (node.type !== 'MembershipExpression') {
			return node.operator;
		}
		if (!MEMBERSHIP_OPERATORS.has(node.operator)) {
			this.fail(
				`Unknown membership operator '${String(node.operator)}'`,
				node,
				path,
			);
		}
		if (typeof node.negated !== 'boolean') {
			this.fail("Expected 'negated' to be a boolean", node, path);
		}
		return node.negated ? `not ${node.operator}` : node.operator;
	}
}

function isChainNode(node: Node): node is ChainNode {
	return (
		node.type === 'BinaryExpression' ||
		node.type === 'LogicalExpression' ||
		node.type === 'MembershipExpression'
	);
}

/** A non-empty list, set, map or call, which breaks inside its brackets. */
function isBracketed(node: Node): boolean {
	switch (node.type) {
		case 'ListLiteral':
		case 'SetLiteral':
			return Array.isArray(node.elements) && node.elements.length > 0;
		case 'MapLiteral':
			return true;
		case 'CallExpression':
			return Array.isArray(node.args) && node.args.length > 0;
		default:
			return false;
	}
}

function isNegative(value: number): boolean {
	return value < 0 || Object.is(value, -0);
}

/**
 * The digits of a non-negative number without an exponent, which the grammar
 * does not have: `1e21` is `1000000000000000000000`. The shortest digits of
 * `String` are kept, so reading it back gives the same number.
 */
function toDecimal(value: number): string {
	const text = String(value);
	const match = /^(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(text);
	if (!match) {
		return text;
	}

	const [, whole = '', fraction = '', exponent = ''] = match;
	const digits = whole + fraction;
	const point = whole.length + Number(exponent);

	if (point <= 0) {
		return `0.${'0'.repeat(-point)}${digits}`;
	}
	if (point >= digits.length) {
		return digits + '0'.repeat(point - digits.length);
	}
	return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

// ---------------------------------------------------------------------------
// Document and rendering
// ---------------------------------------------------------------------------

/**
 * A layout to render: text, a line break that is a space (`line`) or nothing
 * (`softline`) when its group fits on the line, groups and indentation.
 */
type Doc = string | Doc[] | Group | Indent | Line;

interface Group {
	readonly kind: 'group';
	readonly doc: Doc;
}

interface Indent {
	readonly kind: 'indent';
	readonly doc: Doc;
}

interface Line {
	readonly kind: 'line';
	readonly soft: boolean;
}

const line: Line = { kind: 'line', soft: false };
const softline: Line = { kind: 'line', soft: true };
const group = (doc: Doc): Group => ({ kind: 'group', doc });
const indent = (doc: Doc): Indent => ({ kind: 'indent', doc });

function join(separator: Doc, docs: Doc[]): Doc[] {
	const joined: Doc[] = [];
	for (let i = 0; i < docs.length; i++) {
		if (i > 0) {
			joined.push(separator);
		}
		joined.push(docs[i] as Doc);
	}
	return joined;
}

function parenthesize(doc: Doc): Doc {
	return group(['(', indent([softline, doc]), softline, ')']);
}

/** Everything on a single line. */
function renderFlat(doc: Doc): string {
	let output = '';
	const stack: Doc[] = [doc];

	while (stack.length > 0) {
		const current = stack.pop() as Doc;
		if (typeof current === 'string') {
			output += current;
		} else if (Array.isArray(current)) {
			for (let i = current.length - 1; i >= 0; i--) {
				stack.push(current[i] as Doc);
			}
		} else if (current.kind === 'line') {
			output += current.soft ? '' : ' ';
		} else {
			stack.push(current.doc);
		}
	}

	return output;
}

type Mode = 'flat' | 'break';
type Command = readonly [indentation: number, mode: Mode, doc: Doc];

/**
 * Breaks the groups that do not fit in `width`, outermost first. Both the
 * rendering and the measuring use a stack, a document can be deep.
 */
function render(doc: Doc, width: number, indentSize: number): string {
	let output = '';
	let column = 0;
	const stack: Command[] = [[0, 'break', doc]];

	while (stack.length > 0) {
		const [indentation, mode, current] = stack.pop() as Command;

		if (typeof current === 'string') {
			output += current;
			column += current.length;
		} else if (Array.isArray(current)) {
			for (let i = current.length - 1; i >= 0; i--) {
				stack.push([indentation, mode, current[i] as Doc]);
			}
		} else if (current.kind === 'indent') {
			stack.push([indentation + indentSize, mode, current.doc]);
		} else if (current.kind === 'group') {
			const flat: Command = [indentation, 'flat', current.doc];
			stack.push(
				mode === 'flat' || fits(flat, stack, width - column)
					? flat
					: [indentation, 'break', current.doc],
			);
		} else if (mode === 'flat') {
			if (!current.soft) {
				output += ' ';
				column += 1;
			}
		} else {
			output += `\n${' '.repeat(indentation)}`;
			column = indentation;
		}
	}

	return output;
}

/**
 * Whether `next` fits in `width`, with what follows it up to the next line
 * break that is already decided to break.
 */
function fits(next: Command, rest: readonly Command[], width: number): boolean {
	let remaining = width;
	let restIndex = rest.length;
	const stack: Command[] = [next];

	while (remaining >= 0) {
		if (stack.length === 0) {
			if (restIndex === 0) {
				return true;
			}
			stack.push(rest[--restIndex] as Command);
			continue;
		}

		const [indentation, mode, current] = stack.pop() as Command;
		if (typeof current === 'string') {
			remaining -= current.length;
		} else if (Array.isArray(current)) {
			for (let i = current.length - 1; i >= 0; i--) {
				stack.push([indentation, mode, current[i] as Doc]);
			}
		} else if (current.kind === 'line') {
			if (mode === 'break') {
				return true;
			}
			remaining -= current.soft ? 0 : 1;
		} else {
			stack.push([indentation, mode, current.doc]);
		}
	}

	return false;
}
