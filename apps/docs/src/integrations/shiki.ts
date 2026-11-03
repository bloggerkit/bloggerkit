import {
	transformerMetaHighlight,
	transformerMetaWordHighlight,
	transformerNotationDiff,
	transformerNotationErrorLevel,
	transformerNotationFocus,
	transformerNotationHighlight,
	transformerNotationMap,
	transformerNotationWordHighlight,
	transformerRemoveNotationEscape,
} from '@shikijs/transformers';
import type { ShikiTransformer } from '@shikijs/types';

const TITLE = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)')/;
const ICON = /(?:^|\s)icon=(?:"([^"]*)"|'([^']*)'|([^\s"']+))/;
const LINE_NUMBERS = /(?:^|\s)(?:lineNumbers|showLineNumbers)=(\d+)(?=\s|$)/;
const NO_LINE_NUMBERS = /(?:^|\s)noLineNumbers(?=\s|$)/;
const WRAP = /(?:^|\s)wrap(?=\s|$)/;
// Whitespace before a `[!code …]` comment. Shiki removes the comment but not the space before it,
// which would leave a trailing space in the shown and copied line
const NOTATION_SPACES =
	/[ \t]+(?=(?:\/\/|#|--|<!--|\/\*|\{\/\*)\s*\[!code [^\]]+\])/g;

interface BlockOptions {
	title?: string;
	icon?: string;
	lineStart: number;
	lineNumbers: boolean;
	wrap: boolean;
}

// Where `codeMeta` keeps the parsed options on `this.meta` between its two hooks
const blockOptions = Symbol('code-block-options');

/**
 * Replaces Astro's unused `astro-code` and theme-name classes on `<pre>` with `code-block`. Classes from other
 * transformers stay.
 */
const codeBlockClass: ShikiTransformer = {
	name: 'code-block-class',
	pre(node) {
		const options = this.options as {
			themes?: Record<string, string | { name?: string }>;
		};
		const themes = Object.values(options.themes ?? {}).map((theme) =>
			typeof theme === 'string' ? theme : theme.name,
		);
		const classes = String(node.properties.class ?? '')
			.split(/\s+/)
			.filter(
				(name) =>
					name && !name.startsWith('astro-code') && !themes.includes(name),
			);
		node.properties.class = ['code-block', ...classes].join(' ');
	},
};

/**
 * Reads the fence options and puts them on `<pre>` as `data-*` attributes for `Pre.astro`. `title` and `icon` are
 * removed from the meta first, so a `/` or `{` inside them isn't read as a word or line highlight.
 */
const codeMeta: ShikiTransformer = {
	name: 'code-meta',
	preprocess(code, options) {
		const meta = options.meta as { __raw?: string } | undefined;
		let raw = meta?.__raw ?? '';
		const title = TITLE.exec(raw);
		raw = raw.replace(TITLE, ' ');
		const icon = ICON.exec(raw);
		raw = raw.replace(ICON, ' ');
		if (meta?.__raw !== undefined) {
			meta.__raw = raw;
		}
		(this.meta as Record<symbol, BlockOptions>)[blockOptions] = {
			title: title ? (title[1] ?? title[2]) : undefined,
			icon: icon ? (icon[1] ?? icon[2] ?? icon[3]) : undefined,
			lineStart: Number(LINE_NUMBERS.exec(raw)?.[1] ?? 1),
			lineNumbers: !NO_LINE_NUMBERS.test(raw),
			wrap: WRAP.test(raw),
		};
		return code.replace(NOTATION_SPACES, '');
	},
	pre(node) {
		const block = (this.meta as Record<symbol, BlockOptions | undefined>)[
			blockOptions
		];
		if (!block) {
			return;
		}
		if (block.title !== undefined) {
			node.properties['data-title'] = block.title;
		}
		if (block.icon !== undefined) {
			node.properties['data-icon'] = block.icon;
		}
		if (block.lineStart !== 1) {
			node.properties.style = `${node.properties.style ?? ''};--line-start:${block.lineStart - 1}`;
		}
		if (!block.lineNumbers) {
			node.properties['data-no-line-numbers'] = '';
		}
		if (block.wrap) {
			node.properties['data-wrap'] = '';
		}
	},
};

/** Fence options and `[!code …]` notations are documented in the README. */
export const shikiTransformers: ShikiTransformer[] = [
	codeMeta,
	codeBlockClass,
	transformerMetaHighlight(),
	transformerMetaWordHighlight(),
	transformerNotationDiff(),
	// `[!code add]` and `[!code remove]`, for XML and HTML comments, which can't contain `--`
	transformerNotationMap(
		{
			classMap: { add: 'diff add', remove: 'diff remove' },
			classActivePre: 'has-diff',
		},
		'notation-diff-words',
	),
	transformerNotationHighlight(),
	transformerNotationWordHighlight(),
	transformerNotationFocus(),
	transformerNotationErrorLevel(),
	transformerRemoveNotationEscape(),
];
