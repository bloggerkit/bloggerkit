import type { Program } from './types';
import { walk } from './walk';

/** Names of the partials used by name, `{{> name}}` and `{{#> name}}`. */
export function findPartials(root: Program): string[] {
	const names = new Set<string>();

	walk(root, (node) => {
		if (
			(node.type === 'PartialStatement' ||
				node.type === 'PartialBlockStatement') &&
			node.name.type === 'PathExpression' &&
			!node.name.original.startsWith('@')
		) {
			names.add(node.name.original);
		}
	});

	return [...names];
}
