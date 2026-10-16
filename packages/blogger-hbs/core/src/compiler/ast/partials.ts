import type {
	Expression,
	Hash,
	PartialBlockStatement,
	PartialStatement,
	Program,
} from './types';
import { walk } from './walk';

/** Names of the partials used by name, `{{> name}}` and `{{#> name}}`. */
export function findPartials(root: Program): string[] {
	return [...new Set(findPartialUsages(root).map(({ name }) => name))];
}

export type HashLiteral = string | number | boolean | null | undefined;

export interface PartialUsageNode {
	/** The name as Handlebars reads it. */
	name: string;
	/**
	 * The name as it is written, when the source is given, `name` otherwise:
	 * Handlebars reads `p.` and `p..a` as `p`, and `p.a.` as `p.a`.
	 */
	raw: string;
	/** 1-based, undefined when the node has no location, made by a plugin. */
	line?: number;
	/** 1-based. */
	column?: number;
	hash: Record<string, HashLiteral | { expression: string }>;
}

/**
 * Every use of a partial by name, in the order they are written. With the
 * `source` of the template, as it was parsed, the names are as written.
 */
export function findPartialUsages(
	root: Program,
	source?: string,
): PartialUsageNode[] {
	const usages: PartialUsageNode[] = [];
	const offsetOf = source === undefined ? undefined : createOffsets(source);

	walk(root, (node) => {
		if (
			(node.type === 'PartialStatement' ||
				node.type === 'PartialBlockStatement') &&
			node.name.type === 'PathExpression' &&
			!node.name.original.startsWith('@')
		) {
			const { original, loc } = node.name;
			// a name ends at what can not be in one, a space, `}`, `~` or `(`,
			// unless it is in a `[segment]`
			const written =
				loc && offsetOf && source !== undefined
					? /^(?:\[[^\]]*\]|[^\s}~()[])+/.exec(
							source.slice(offsetOf(loc.start.line, loc.start.column)),
						)?.[0]
					: undefined;
			usages.push(toUsage(node, original, written ?? original));
		}
	});

	return usages;
}

export interface InlinePartial {
	name: string;
	/** 1-based, undefined when the node has no location. */
	line?: number;
	/** 1-based. */
	column?: number;
}

/** The partials defined in the template, `{{#*inline "name"}}`. */
export function findInlinePartials(root: Program): InlinePartial[] {
	const inline: InlinePartial[] = [];

	walk(root, (node) => {
		if (node.type !== 'DecoratorBlock' || node.path.original !== 'inline') {
			return;
		}
		const [name] = node.params;
		if (name?.type === 'StringLiteral') {
			const start = node.loc?.start;
			inline.push({
				name: name.value,
				line: start?.line,
				column: start === undefined ? undefined : start.column + 1,
			});
		}
	});

	return inline;
}

/** The offset in `source` of a line (1-based) and a column (0-based). */
function createOffsets(
	source: string,
): (line: number, column: number) => number {
	const starts = [0];
	for (
		let i = source.indexOf('\n');
		i !== -1;
		i = source.indexOf('\n', i + 1)
	) {
		starts.push(i + 1);
	}
	return (line, column) => (starts[line - 1] ?? 0) + column;
}

function toUsage(
	node: PartialStatement | PartialBlockStatement,
	name: string,
	raw: string,
): PartialUsageNode {
	const start = node.loc?.start;
	return {
		name,
		raw,
		line: start?.line,
		// Handlebars counts columns from 0
		column: start === undefined ? undefined : start.column + 1,
		hash: hashValues(node.hash),
	};
}

function hashValues(
	hash: Hash | undefined,
): Record<string, HashLiteral | { expression: string }> {
	const values: Record<string, HashLiteral | { expression: string }> =
		Object.create(null);
	for (const { key, value } of hash?.pairs ?? []) {
		values[key] = isLiteral(value)
			? literalValue(value)
			: { expression: print(value) };
	}
	return values;
}

function isLiteral(node: Expression): boolean {
	return node.type !== 'PathExpression' && node.type !== 'SubExpression';
}

function literalValue(node: Expression): HashLiteral {
	switch (node.type) {
		case 'StringLiteral':
		case 'NumberLiteral':
		case 'BooleanLiteral':
			return node.value;
		case 'NullLiteral':
			return null;
		default:
			return undefined;
	}
}

/** The expression as it can be written in a template. */
function print(node: Expression): string {
	switch (node.type) {
		case 'PathExpression':
			return node.original;
		case 'StringLiteral':
			return JSON.stringify(node.value);
		case 'NumberLiteral':
		case 'BooleanLiteral':
			return String(node.value);
		case 'NullLiteral':
			return 'null';
		case 'UndefinedLiteral':
			return 'undefined';
		case 'SubExpression': {
			const parts = [node.path.original, ...node.params.map(print)];
			for (const { key, value } of node.hash?.pairs ?? []) {
				parts.push(`${key}=${print(value)}`);
			}
			return `(${parts.join(' ')})`;
		}
	}
}
