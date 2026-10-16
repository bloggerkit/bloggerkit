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
	name: string;
	/** 1-based, undefined when the node has no location, made by a plugin. */
	line?: number;
	/** 1-based. */
	column?: number;
	hash: Record<string, HashLiteral | { expression: string }>;
}

/** Every use of a partial by name, in the order they are written. */
export function findPartialUsages(root: Program): PartialUsageNode[] {
	const usages: PartialUsageNode[] = [];

	walk(root, (node) => {
		if (
			(node.type === 'PartialStatement' ||
				node.type === 'PartialBlockStatement') &&
			node.name.type === 'PathExpression' &&
			!node.name.original.startsWith('@')
		) {
			usages.push(toUsage(node, node.name.original));
		}
	});

	return usages;
}

function toUsage(
	node: PartialStatement | PartialBlockStatement,
	name: string,
): PartialUsageNode {
	const start = node.loc?.start;
	return {
		name,
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
