import Handlebars, {
	type HelperDelegate,
	type TemplateDelegate,
} from 'handlebars/runtime';
import { CHUNK_HASH_KEY, INDENT_HASH_KEY } from '../constants';
import { describeValue } from '../utils/suggest';
import type { MinimalChunks } from './chunks';
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
		if (
			chunk?.type !== 'data' &&
			chunk?.type !== 'template' &&
			chunk?.type !== 'script' &&
			chunk?.type !== 'style'
		) {
			throw new HelperError(`Failed to resolve '${specifier}'`, { options });
		}

		if (chunk.type === 'data') {
			return chunk.data;
		}

		let output = '';

		if (chunk.type === 'template') {
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
			if (typeof options.fn === 'function') {
				const block = options.fn;
				const outer: unknown = options.data?.['partial-block'];
				data['partial-block'] = (
					context: unknown,
					blockOptions: { data?: Record<string, unknown> } = {},
				) => {
					// the block still sees the partial-block of the template it is written in
					const frame = Handlebars.createFrame(blockOptions.data);
					frame['partial-block'] = outer;
					return block(context, { ...blockOptions, data: frame });
				};
			}

			const result = templates.get(id as string)?.(this, { data }) ?? '';

			// as with `{{#> partial}}` the whitespace around a block is stripped from
			// the calling template, so the file keeps its own line breaks
			output = protectCdataNewlines(
				typeof options.fn === 'function' ? result : result.trim(),
			);
		} else {
			// the runtime shared by a group of scripts comes with the first one
			// that renders its script
			let runtime: string | undefined;
			const runtimeId = chunk.type === 'script' ? chunk.runtime : undefined;
			const runtimes: Set<string> =
				options.data?.[RUNTIMES_DATA_KEY] ?? new Set<string>();
			if (
				runtimeId !== undefined &&
				chunk.code?.trim() &&
				getOutputMode(options)?.tag !== 'style' &&
				!runtimes.has(runtimeId)
			) {
				const shared = chunks.get(runtimeId);
				if (shared?.type === 'runtime') {
					runtimes.add(runtimeId);
					runtime = shared.code;
				}
			}

			output = renderAsset(chunk, options, runtime);
		}

		// Set by the compiler when the import is alone on its line
		const indent: unknown = options.hash[INDENT_HASH_KEY];
		if (typeof indent === 'string' && output) {
			output = `${indentLines(output, indent)}\n`;
		}

		return new Handlebars.SafeString(output);
	};
}

function indentLines(text: string, indent: string): string {
	if (!indent) {
		return text;
	}
	return text
		.split('\n')
		.map((line) => (line ? indent + line : line))
		.join('\n');
}
