import Handlebars, {
	type HelperDelegate,
	type HelperOptions,
	type TemplateDelegate,
} from 'handlebars/runtime';
import { CHUNK_HASH_KEY, INDENT_HASH_KEY } from '../constants';
import { describeValue } from '../utils/suggest';
import type {
	MinimalChunk,
	MinimalChunks,
	MinimalScriptChunk,
	MinimalStyleChunk,
} from './chunks';
import { HelperError } from './helpers';
import { argumentsOf, optionsOf } from './helpers/args';
import { protectCdataNewlines } from './linebreaks';
import { getOutputMode, renderAsset } from './tags';

const MAX_DEPTH = 64;

/**
 * Key of the data frame holding the ids of the runtimes rendered so far, a set
 * of its own for every render. Plugin names can not start with `_`.
 */
export const RUNTIMES_DATA_KEY = '_runtimes';

/** The chunks an import can resolve to. */
const IMPORTABLE = new Set<MinimalChunk['type']>([
	'data',
	'template',
	'script',
	'style',
]);

/**
 * The `import` helper: embeds templates, renders scripts and styles as tags,
 * and returns the parsed value of json files.
 *
 * `{{#import}}` blocks are available to the imported template as
 * `{{> @partial-block}}`.
 *
 * The compiler tags every import with the id of the chunk it resolved to.
 * Scripts and styles are bundled once but rendered wherever they are imported.
 * The runtime shared by a group of scripts is rendered once per render.
 */
export function createImportHelper(
	chunks: MinimalChunks,
	templates: Map<string, TemplateDelegate>,
): HelperDelegate {
	return function (this: unknown, ...input: unknown[]) {
		const options = optionsOf(input);
		const [specifier] = argumentsOf(input);
		if (typeof specifier !== 'string') {
			throw new HelperError(
				`Expected specifier to be a string, got: ${describeValue(specifier)}`,
				{ options },
			);
		}

		const id: unknown = options.hash[CHUNK_HASH_KEY];
		const chunk = typeof id === 'string' ? chunks.get(id) : undefined;
		if (chunk === undefined || !IMPORTABLE.has(chunk.type)) {
			throw new HelperError(`Failed to resolve '${specifier}'`, { options });
		}

		switch (chunk.type) {
			case 'data':
				return chunk.data;
			case 'template':
				return indented(
					renderImportedTemplate(
						this,
						templates.get(id as string),
						specifier,
						options,
					),
					options,
				);
			default:
				return indented(
					renderImportedAsset(
						chunks,
						chunk as MinimalScriptChunk | MinimalStyleChunk,
						options,
					),
					options,
				);
		}
	};
}

/**
 * An imported template rendered with the same context, a block import being
 * its `{{> @partial-block}}`.
 */
function renderImportedTemplate(
	context: unknown,
	template: TemplateDelegate | undefined,
	specifier: string,
	options: HelperOptions,
): string {
	const depth = (options.data?._depth ?? 0) + 1;
	if (depth > MAX_DEPTH) {
		throw new HelperError(
			`Maximum import depth (${MAX_DEPTH}) exceeded at '${specifier}', is it imported recursively?`,
			{ options },
		);
	}

	const data = { ...options.data, _depth: depth };

	// `{{#import "./layout.hbs"}}...{{/import}}` renders the block where the
	// imported template has `{{> @partial-block}}`
	const block = options.fn;
	if (typeof block === 'function') {
		const outer: unknown = options.data?.['partial-block'];
		data['partial-block'] = (
			blockContext: unknown,
			blockOptions: { data?: Record<string, unknown> } = {},
		) => {
			// the block still sees the partial-block of the template it is written in
			const frame = Handlebars.createFrame(blockOptions.data);
			frame['partial-block'] = outer;
			return block(blockContext, { ...blockOptions, data: frame });
		};
	}

	const result = template?.(context, { data }) ?? '';
	// as with `{{#> partial}}` the whitespace around a block is stripped from
	// the calling template, so the file keeps its own line breaks
	return typeof block === 'function' ? result : result.trim();
}

/**
 * An imported script or style rendered as tags, with the runtime its group of
 * scripts shares when it is the first of them to render its script.
 */
function renderImportedAsset(
	chunks: MinimalChunks,
	chunk: MinimalScriptChunk | MinimalStyleChunk,
	options: HelperOptions,
): string {
	const mode = getOutputMode(options);
	const runtimes: Set<string> =
		options.data?.[RUNTIMES_DATA_KEY] ?? new Set<string>();

	let runtime: string | undefined;
	const runtimeId = chunk.type === 'script' ? chunk.runtime : undefined;
	if (
		runtimeId !== undefined &&
		chunk.code?.trim() &&
		mode?.tag !== 'style' &&
		!runtimes.has(runtimeId)
	) {
		const shared = chunks.get(runtimeId);
		if (shared?.type === 'runtime') {
			runtimes.add(runtimeId);
			runtime = shared.code;
		}
	}

	return renderAsset(chunk, options, mode, runtime);
}

/**
 * The output of an import, indented when the compiler found it alone on its
 * line. The newlines in CDATA sections are kept from the indentation; an
 * import around this one that indents does the same for those it does not.
 */
function indented(
	output: string,
	options: HelperOptions,
): Handlebars.SafeString {
	const indent: unknown = options.hash[INDENT_HASH_KEY];
	if (typeof indent !== 'string' || !output) {
		return new Handlebars.SafeString(output);
	}
	return new Handlebars.SafeString(
		`${indentLines(protectCdataNewlines(output), indent)}\n`,
	);
}

/** Every line of `text` that is not empty, indented. */
function indentLines(text: string, indent: string): string {
	if (!indent) {
		return text;
	}
	const indentedText = text.replace(/\n(?=[^\n])/g, () => `\n${indent}`);
	return text[0] === '\n' ? indentedText : indent + indentedText;
}
