import { INDENT_HASH_KEY } from '../constants';
import {
	type ContentStatement,
	isImportNode,
	type Program,
	type Statement,
	setHashString,
	walk,
} from './ast';

/**
 * Handlebars only strips the whitespace around "standalone" tags (and records
 * the indentation) for partials. `import` is a helper, so this applies the same
 * rules to it: the indentation and the trailing line break are removed from the
 * surrounding content and the indentation is passed to the runtime, which
 * indents every line of the imported output with it.
 *
 * `embeds` decides which imports are embedded (templates, scripts, styles) as
 * opposed to returning a value (json).
 */
export function markStandaloneImports(
	root: Program,
	embeds: (specifier: string) => boolean,
): void {
	walk(root, (node) => {
		if (node.type !== 'Program') {
			return;
		}

		const { body } = node;
		const isRoot = node === root;

		for (let i = 0; i < body.length; i++) {
			const statement = body[i];
			if (statement.type !== 'MustacheStatement' || !isImportNode(statement)) {
				continue;
			}

			const specifier = statement.params[0];
			if (specifier?.type !== 'StringLiteral' || !embeds(specifier.value)) {
				continue;
			}

			if (!isStandalone(body, i, isRoot)) {
				continue;
			}

			const previous = body[i - 1];
			const next = body[i + 1];
			let indent = '';

			if (isContent(previous)) {
				indent = /[ \t]*$/.exec(previous.original)?.[0] ?? '';
				previous.value = previous.value.replace(/[ \t]+$/, '');
			}
			if (isContent(next)) {
				next.value = next.value.replace(/^[ \t]*\r?\n?/, '');
			}

			setHashString(statement, INDENT_HASH_KEY, indent);
		}
	});
}

/** Mirrors the standalone detection of Handlebars' whitespace control. */
function isStandalone(body: Statement[], i: number, isRoot: boolean): boolean {
	const previous = body[i - 1];
	const next = body[i + 1];

	let before: boolean;
	if (previous === undefined) {
		before = isRoot;
	} else {
		const pattern =
			body[i - 2] || !isRoot ? /\r?\n[ \t]*$/ : /(^|\r?\n)[ \t]*$/;
		before = isContent(previous) && pattern.test(previous.original);
	}

	let after: boolean;
	if (next === undefined) {
		after = isRoot;
	} else {
		const pattern =
			body[i + 2] || !isRoot ? /^[ \t]*\r?\n/ : /^[ \t]*(\r?\n|$)/;
		after = isContent(next) && pattern.test(next.original);
	}

	return before && after;
}

function isContent(
	statement: Statement | undefined,
): statement is ContentStatement {
	return statement?.type === 'ContentStatement';
}
