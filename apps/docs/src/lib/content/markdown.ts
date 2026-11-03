const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;
const NOTATION = /\[!code [^\]]+\]/;
const CODE_TABS = /^\s*<\/?CodeTabs\b[^>]*>\s*$/;
// A trailing comment holding only `[!code …]` notations, in any comment syntax
const NOTATION_COMMENT =
	/\s*(?:\/\/|#|--|<!--|\/\*|\{\/\*)\s*(?:\[!code [^\]]+\]\s*)+(?:-->|\*\/\}?)?\s*$/;

type Line = { text: string; kind: 'text' | 'open' | 'code' | 'close' };

/**
 * As in CommonMark, a fence closes only on a line of the same character, at least as long, with nothing after it.
 * So a fence shown inside a longer one stays code.
 */
function* readLines(markdown: string): Generator<Line> {
	let fence: string | undefined;
	for (const text of markdown.split('\n')) {
		const [, marker, after = ''] = FENCE.exec(text) ?? [];
		if (!fence) {
			// A backtick fence's info string can't contain a backtick, so this isn't a fence
			if (marker && !(marker.startsWith('`') && after.includes('`'))) {
				fence = marker;
				yield { text, kind: 'open' };
			} else {
				yield { text, kind: 'text' };
			}
		} else if (
			marker?.startsWith(fence[0]) &&
			marker.length >= fence.length &&
			after.trim() === ''
		) {
			fence = undefined;
			yield { text, kind: 'close' };
		} else {
			yield { text, kind: 'code' };
		}
	}
}

export function countCodeBlocks(markdown: string): number {
	return [...readLines(markdown)].filter((line) => line.kind === 'open').length;
}

/** Returns `undefined` when the line held only a notation. */
function removeLineNotations(line: string): string | undefined {
	if (!NOTATION.test(line)) {
		return line;
	}
	const code = line
		.replace(NOTATION_COMMENT, '')
		.replace(/\s*\[!code [^\]]+\]/g, '');
	return code.trim() === '' ? undefined : code;
}

/**
 * Prepares page Markdown for the `.md` versions of the pages. Removes `[!code …]` notations from code, unescapes
 * `[\!code`, and unwraps `<CodeTabs>` so its code blocks read one after another.
 */
export function removeNotations(markdown: string): string {
	const out: string[] = [];
	// Also drop the blank line after a removed `<CodeTabs>` line
	let skipBlank = false;
	for (const { text, kind } of readLines(markdown)) {
		if (kind === 'text' && CODE_TABS.test(text)) {
			skipBlank = true;
			continue;
		}
		if (skipBlank) {
			skipBlank = false;
			if (kind === 'text' && text.trim() === '') {
				continue;
			}
		}
		if (kind !== 'code') {
			out.push(text);
			continue;
		}
		const code = removeLineNotations(text);
		if (code !== undefined) {
			out.push(code.replaceAll('[\\!code', '[!code'));
		}
	}
	return out.join('\n');
}
