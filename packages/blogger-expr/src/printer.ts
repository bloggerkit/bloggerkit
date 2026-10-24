import { type Name, type Node, nameOf, type Root } from './ast';

export interface PrintOptions {
	/** The width lines are fitted in. `Infinity` prints on one line. Default 80. */
	printWidth?: number;
	/** The columns of one level of indentation. Default 2. */
	tabWidth?: number;
	/** Indents with tabs, each counted as `tabWidth` columns. Default `false`. */
	useTabs?: boolean;
	/** `all` ends a broken list or map with a comma; never a call. Default `none`. */
	trailingComma?: 'all' | 'none';
	/** Spaces inside the braces of a map: `{ a: 1 }`. Default `true`. */
	bracketSpacing?: boolean;
}

/**
 * The expression of a tree, formatted the way Prettier formats JavaScript:
 * each part stays on one line while it fits in `printWidth`, and breaks
 * otherwise, the outer parts first. What the expression means and how it was
 * written are kept: number text, keyword spellings (`eq`, `&&`, `not`, `yes`),
 * parentheses, lambdas with or without them. Parsing the result gives the same
 * tree. A line is never broken before `.` or `[`, where whitespace changes what
 * a property applies to.
 */
export function print(node: Root, options: PrintOptions = {}): string {
	const settings: Settings = {
		printWidth: options.printWidth ?? 80,
		tabWidth: options.tabWidth ?? 2,
		useTabs: options.useTabs ?? false,
		trailingComma: options.trailingComma ?? 'none',
		bracketSpacing: options.bracketSpacing ?? true,
	};
	return layout(group(new Builder(settings).root(node)), settings);
}

type Settings = Required<PrintOptions>;

// ----- documents -----

/**
 * What is printed: text, parts in a row, and the places where a line may
 * break. A group is printed on one line, or with all its own lines broken.
 */
type Doc = string | Doc[] | Group | Indent | Line | IfBreak | Flat | Choice;

interface Group {
	kind: 'group';
	contents: Doc;
	/** Broken whatever the width. */
	broken: boolean;
}

interface Indent {
	kind: 'indent';
	contents: Doc;
}

/** A space, or nothing when `soft`, on one line; a line break otherwise. */
interface Line {
	kind: 'line';
	soft: boolean;
}

interface IfBreak {
	kind: 'ifBreak';
	broken: Doc;
	flat: Doc;
}

/** Contents always on one line. */
interface Flat {
	kind: 'flat';
	contents: Doc;
}

/** The first of the layouts whose first line fits; the last one otherwise. */
interface Choice {
	kind: 'choice';
	layouts: Doc[];
}

const group = (contents: Doc, broken = false): Group => ({
	kind: 'group',
	contents,
	broken,
});
const indent = (contents: Doc): Indent => ({ kind: 'indent', contents });
const line: Line = { kind: 'line', soft: false };
const softline: Line = { kind: 'line', soft: true };
const ifBreak = (broken: Doc, flat: Doc = ''): IfBreak => ({
	kind: 'ifBreak',
	broken,
	flat,
});
const flat = (contents: Doc): Flat => ({ kind: 'flat', contents });
const choice = (layouts: Doc[]): Choice => ({ kind: 'choice', layouts });

function join(separator: Doc, docs: Doc[]): Doc[] {
	return docs.flatMap((doc, i) => (i === 0 ? [doc] : [separator, doc]));
}

// ----- from a tree -----

/** The node types whose operands are written around an operator. */
type Binary = Extract<
	Node,
	{
		type:
			| 'Arithmetic'
			| 'Comparison'
			| 'Equality'
			| 'Logical'
			| 'Membership'
			| 'Fallback'
			| 'PlusChain';
	}
>;

/** The steps written after a list, each on its own line when a chain breaks. */
type Step = Extract<
	Node,
	{ type: 'LambdaOperation' | 'TakeOrSkip' | 'FunctionCall' }
>;

class Builder {
	constructor(private readonly settings: Settings) {}

	/** A range is only ever the root: `1..5`, or `start to⏎  end`. */
	root(node: Root): Doc {
		if (node.type !== 'LoopRange') {
			return this.doc(node);
		}
		return node.notation === 'dots'
			? [this.doc(node.start), '..', this.doc(node.end)]
			: [this.doc(node.start), ' to', indent([line, this.doc(node.end)])];
	}

	doc(node: Node): Doc {
		switch (node.type) {
			case 'NumberLiteral':
			case 'StringLiteral':
			case 'BooleanLiteral':
				return node.raw;
			case 'DataPath':
				return `data:${[node.root ?? '', ...node.properties].join('.')}`;
			case 'Parameter':
				return node.name;
			case 'ListLiteral':
				return node.notation === 'braces'
					? this.items(
							'{',
							node.items.map((item) => this.doc(item)),
							'}',
							false,
						)
					: this.items(
							'[',
							node.items.map((item) => this.doc(item)),
							']',
							false,
						);
			case 'MapLiteral':
				return this.items(
					'{',
					node.entries.map((entry) => [
						key(entry.key),
						': ',
						this.doc(entry.value),
					]),
					'}',
					this.settings.bracketSpacing,
				);
			case 'PropertyAccess':
				// a property of everything before it is written after a space, so it is read the same way again
				if (node.property.text.startsWith('.')) {
					// `1 ..3` after a space; `(1)..3` right after a closing bracket
					const space = node.appliesTo === 'everythingBefore' ? ' ' : '';
					return [this.doc(node.object), `${space}.${node.property.text}`];
				}
				return [
					this.doc(node.object),
					node.appliesTo === 'everythingBefore' ? ' .' : '.',
					key(node.property),
				];
			case 'IndexAccess':
				return [this.doc(node.object), '[', this.doc(node.index), ']'];
			case 'Parenthesized': {
				return group([
					'(',
					indent([softline, this.inner(node.expression)]),
					softline,
					')',
				]);
			}
			case 'LogicalNot':
				return [
					node.operator.spelling === 'not' ? 'not ' : '!',
					this.doc(node.operand),
				];
			case 'Arithmetic':
			case 'Comparison':
			case 'Equality':
			case 'Logical':
			case 'Membership':
			case 'Fallback':
			case 'PlusChain':
				return group(this.binary(node));
			case 'Conditional':
				return group(this.conditional(node));
			case 'LambdaOperation':
			case 'TakeOrSkip':
				return this.chain(node);
			case 'FunctionCall':
				if (node.notation === 'infix') {
					return this.chain(node);
				}
				return this.call(node.function.spelling, node.arguments);
			case 'OperatorFunctionCall':
				return this.call(node.operator.spelling, node.arguments);
		}
	}

	/** What is inside parentheses or a lambda: its operands line up under the first, already indented. */
	private inner(node: Node): Doc {
		return isBinary(node) ? group(this.binary(node, false)) : this.doc(node);
	}

	/** `[a, b]`, `{a, b}`, `{ a: 1 }`: on one line, or one item a line. */
	private items(
		open: string,
		items: Doc[],
		close: string,
		spaced: boolean,
	): Doc {
		if (items.length === 0) {
			return `${open}${close}`;
		}
		const inner = spaced ? line : softline;
		const comma = this.settings.trailingComma === 'all' ? ifBreak(',') : '';
		return group([
			open,
			indent([inner, join([',', line], items)]),
			comma,
			inner,
			close,
		]);
	}

	/** `name(a, b)`; a last map or list is kept beside the others while they fit: `f(a, {⏎…⏎})`. */
	private call(name: string, args: Node[]): Doc {
		const docs = args.map((arg) => this.doc(arg));
		if (docs.length === 0) {
			return `${name}()`;
		}
		const expanded = [
			name,
			'(',
			indent([softline, join([',', line], docs)]),
			softline,
			')',
		];
		const last = args.at(-1) as Node;
		const huggable =
			(last.type === 'MapLiteral' && last.entries.length > 0) ||
			(last.type === 'ListLiteral' && last.items.length > 0);
		if (!huggable) {
			return group(expanded);
		}
		const others = docs.slice(0, -1);
		const hugged = [
			name,
			'(',
			flat(join(', ', others)),
			others.length ? ', ' : '',
			group(docs.at(-1) as Doc, true),
			')',
		];
		return choice([
			flat([name, '(', join(', ', docs), ')']),
			hugged,
			group(expanded, true),
		]);
	}

	/**
	 * Operands around operators, broken after each operator: `a and⏎  b and⏎  c`.
	 * A left operand with the same operators continues the chain, as does the
	 * right side of `?:`.
	 */
	private binary(node: Binary, indented = true): Doc {
		const { operands, operators } = flatten(node);
		const [first, ...rest] = operands.map((operand) => this.doc(operand));
		const tail = rest.map((operand, i) => [` ${operators[i]}`, line, operand]);
		return [first as Doc, indented ? indent(tail) : tail];
	}

	/** `c ? a : b`, broken before `?` and `:`; a ternary after `:` breaks with it, one level further in. */
	private conditional(node: Extract<Node, { type: 'Conditional' }>): Doc[] {
		const whenFalse =
			node.whenFalse.type === 'Conditional'
				? this.conditional(node.whenFalse)
				: this.doc(node.whenFalse);
		return [
			this.doc(node.condition),
			indent([line, '? ', this.doc(node.whenTrue), line, ': ', whenFalse]),
		];
	}

	/**
	 * A list and its lambdas, `take`, `skip` and infix calls. Two steps or more
	 * break before each step, like a chain of methods; one step stays beside
	 * its list.
	 */
	private chain(node: Step): Doc {
		const steps: Step[] = [];
		let base: Node = node;
		while (isStep(base)) {
			steps.unshift(base);
			base =
				base.type === 'FunctionCall' ? (base.arguments[0] as Node) : base.list;
		}
		const docs = steps.map((step) => this.step(step));
		if (docs.length === 1) {
			return [this.doc(base), ' ', docs[0] as Doc];
		}
		return group([this.doc(base), indent(docs.map((doc) => [line, doc]))]);
	}

	private step(node: Step): Doc {
		switch (node.type) {
			case 'LambdaOperation': {
				const head = `${node.operator.spelling} ${node.notation === 'parenthesized' ? '(' : ''}${node.parameter.name} =>`;
				const body = this.inner(node.body);
				return node.notation === 'parenthesized'
					? group([head, indent([line, body]), softline, ')'])
					: group([head, indent([line, body])]);
			}
			case 'TakeOrSkip':
				return [node.operator.spelling, ' ', this.doc(node.count)];
			case 'FunctionCall':
				return [
					node.function.spelling,
					' ',
					this.doc(node.arguments[1] as Node),
				];
		}
	}
}

function isBinary(node: Node): node is Binary {
	return [
		'Arithmetic',
		'Comparison',
		'Equality',
		'Logical',
		'Membership',
		'Fallback',
		'PlusChain',
	].includes(node.type);
}

function isStep(node: Node): node is Step {
	return (
		node.type === 'LambdaOperation' ||
		node.type === 'TakeOrSkip' ||
		(node.type === 'FunctionCall' && node.notation === 'infix')
	);
}

/** The operators of one level, which chain: `+` and `-` apart, `*`, `/` and `%` together. */
function level(node: Node): string | undefined {
	switch (node.type) {
		case 'Arithmetic':
			return node.operator.name === 'subtract' ? 'subtract' : 'multiply';
		case 'Logical':
			return node.operator.name;
		case 'Comparison':
		case 'Equality':
		case 'Membership':
		case 'Fallback':
		case 'PlusChain':
			return node.type;
		default:
			return undefined;
	}
}

/** The operands and operators of a chain of one level, in the order they are written. */
function flatten(node: Binary): { operands: Node[]; operators: string[] } {
	switch (node.type) {
		case 'PlusChain':
			return {
				operands: node.operands,
				operators: node.operators.map((o) => o.spelling),
			};
		case 'Fallback': {
			const right =
				node.fallback.type === 'Fallback'
					? flatten(node.fallback)
					: { operands: [node.fallback], operators: [] };
			return {
				operands: [node.value, ...right.operands],
				operators: [node.operator.spelling, ...right.operators],
			};
		}
		case 'Membership': {
			const [first, second] =
				node.operator.name === 'contains'
					? [node.collection, node.item]
					: [node.item, node.collection];
			return { operands: [first, second], operators: [node.operator.spelling] };
		}
		default: {
			const left =
				isBinary(node.left) && level(node.left) === level(node)
					? flatten(node.left)
					: { operands: [node.left], operators: [] };
			return {
				operands: [...left.operands, node.right],
				operators: [...left.operators, node.operator.spelling],
			};
		}
	}
}

/** A key or property name; a quoted one is written with its quotes escaped. */
function key(name: Name): string {
	return name.quoted ? `"${name.text.replaceAll('"', '\\"')}"` : nameOf(name);
}

// ----- layout -----

type Mode = 'break' | 'flat';
type Command = [depth: number, mode: Mode, doc: Doc];

/** The text of a document: each group flat when the rest of its line fits, broken otherwise. */
function layout(doc: Doc, settings: Settings): string {
	const out: string[] = [];
	let column = 0;
	const commands: Command[] = [[0, 'break', doc]];
	while (commands.length) {
		const [depth, mode, d] = commands.pop() as Command;
		if (typeof d === 'string') {
			out.push(d);
			column += d.length;
			continue;
		}
		if (Array.isArray(d)) {
			for (let i = d.length - 1; i >= 0; i--) {
				commands.push([depth, mode, d[i] as Doc]);
			}
			continue;
		}
		switch (d.kind) {
			case 'indent':
				commands.push([depth + 1, mode, d.contents]);
				break;
			case 'flat':
				commands.push([depth, 'flat', d.contents]);
				break;
			case 'group': {
				const attempt: Command = [depth, 'flat', d.contents];
				const fitsFlat =
					mode === 'flat' ||
					(!d.broken && fits(attempt, commands, settings.printWidth - column));
				commands.push(
					fitsFlat && !d.broken ? attempt : [depth, 'break', d.contents],
				);
				break;
			}
			case 'choice': {
				const room = settings.printWidth - column;
				const layouts = d.layouts;
				let chosen: Command = [depth, 'break', layouts.at(-1) as Doc];
				if (
					mode === 'flat' ||
					fits([depth, 'flat', layouts[0] as Doc], commands, room)
				) {
					chosen = [depth, 'flat', layouts[0] as Doc];
				} else {
					for (const option of layouts.slice(1, -1)) {
						if (fits([depth, 'break', option], commands, room)) {
							chosen = [depth, 'break', option];
							break;
						}
					}
				}
				commands.push(chosen);
				break;
			}
			case 'ifBreak':
				commands.push([depth, mode, mode === 'break' ? d.broken : d.flat]);
				break;
			case 'line':
				if (mode === 'flat') {
					if (!d.soft) {
						out.push(' ');
						column += 1;
					}
				} else {
					out.push(`\n${indentation(depth, settings)}`);
					column = depth * settings.tabWidth;
				}
				break;
		}
	}
	return out.join('');
}

/**
 * Whether `next`, then what follows it up to the next line break, fits in
 * `width` columns.
 */
function fits(next: Command, rest: Command[], width: number): boolean {
	if (width === Number.POSITIVE_INFINITY) {
		return true;
	}
	let room = width;
	const stack: Command[] = [next];
	let restIndex = rest.length;
	while (room >= 0) {
		if (stack.length === 0) {
			if (restIndex === 0) {
				return true;
			}
			stack.push(rest[--restIndex] as Command);
			continue;
		}
		const [depth, mode, d] = stack.pop() as Command;
		if (typeof d === 'string') {
			room -= d.length;
			continue;
		}
		if (Array.isArray(d)) {
			for (let i = d.length - 1; i >= 0; i--) {
				stack.push([depth, mode, d[i] as Doc]);
			}
			continue;
		}
		switch (d.kind) {
			case 'indent':
				stack.push([depth + 1, mode, d.contents]);
				break;
			case 'flat':
				stack.push([depth, 'flat', d.contents]);
				break;
			case 'group':
				stack.push([depth, d.broken ? 'break' : mode, d.contents]);
				break;
			case 'choice':
				stack.push([
					depth,
					mode,
					(mode === 'break' ? d.layouts.at(-1) : d.layouts[0]) as Doc,
				]);
				break;
			case 'ifBreak':
				stack.push([depth, mode, mode === 'break' ? d.broken : d.flat]);
				break;
			case 'line':
				if (mode === 'break') {
					return true;
				}
				room -= d.soft ? 0 : 1;
				break;
		}
	}
	return false;
}

function indentation(depth: number, settings: Settings): string {
	return settings.useTabs
		? '\t'.repeat(depth)
		: ' '.repeat(depth * settings.tabWidth);
}
