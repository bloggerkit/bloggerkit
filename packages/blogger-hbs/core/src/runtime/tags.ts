import Handlebars, { type HelperOptions } from 'handlebars/runtime';
import { ATTRIBUTE_NAME_REGEX, OUTPUT_FLAGS } from '../constants';
import { describeValue } from '../utils/suggest';
import type { MinimalScriptChunk, MinimalStyleChunk } from './chunks';
import { HelperError } from './helpers';
import { protectNewlines } from './linebreaks';

type Tag = 'script' | 'style';

/**
 * Renders a script chunk as `<style>` (when it imports css) followed by
 * `<script>`, and a style chunk as `<style>`. Empty code renders no tag.
 *
 * With `script:only` / `style:only` only the script or the styles are
 * rendered, and with `script:raw` / `style:raw` only their bare code, without
 * a tag or CDATA section.
 *
 * `mode` is the one of `getOutputMode`, and `runtime` is put in front of the
 * script.
 */
export function renderAsset(
	chunk: MinimalScriptChunk | MinimalStyleChunk,
	options: HelperOptions,
	mode: OutputMode | undefined,
	runtime?: string,
): string {
	const css = chunk.type === 'script' ? chunk.css : chunk.code;
	const js = chunk.type === 'script' ? chunk.code : undefined;
	const outputs: string[] = [];

	if (css?.trim() && mode?.tag !== 'script') {
		outputs.push(
			mode?.raw
				? protectNewlines(css.trim())
				: renderTag('style', css, options),
		);
	}
	if (js?.trim() && mode?.tag !== 'style') {
		const code = runtime ? `${runtime}\n${js}` : js;
		outputs.push(
			mode?.raw
				? protectNewlines(code.trim())
				: renderTag('script', code, options),
		);
	}

	return outputs.join('\n');
}

export interface OutputMode {
	/** The only tag rendered. */
	tag: Tag;
	/** Whether the bare code is rendered without the tag. */
	raw: boolean;
}

/** Set by `script:only` / `style:only` / `script:raw` / `style:raw`. */
export function getOutputMode(options: HelperOptions): OutputMode | undefined {
	const set = [...OUTPUT_FLAGS.keys()].filter((key) =>
		isFlagValue(options.hash[key]),
	);
	if (set.length > 1) {
		throw new HelperError(`'${set[0]}' cannot be combined with '${set[1]}'`, {
			options,
		});
	}
	return set[0] === undefined ? undefined : OUTPUT_FLAGS.get(set[0]);
}

/** The compiler only lets through `true`, `'true'` and `''`. */
function isFlagValue(value: unknown): boolean {
	return value === true || value === 'true' || value === '';
}

function renderTag(tag: Tag, code: string, options: HelperOptions): string {
	const body = protectNewlines(`/*<![CDATA[*/\n${code.trim()}\n/*]]>*/`);

	return `<${tag}${renderAttributes(tag, options)}>${body}</${tag}>`;
}

/**
 * Attributes come from `script=(object ...)` / `style=(object ...)` and from
 * `script:name=value` / `style:name=value`, the latter taking precedence.
 */
function renderAttributes(tag: Tag, options: HelperOptions): string {
	const attributes: Record<string, unknown> = Object.create(null);
	const bulk: unknown = options.hash[tag];

	if (bulk !== undefined) {
		if (typeof bulk !== 'object' || bulk === null || Array.isArray(bulk)) {
			throw new HelperError(
				`Expected '${tag}' to be an object, got: ${describeValue(bulk)}`,
				{ options },
			);
		}
		Object.assign(attributes, bulk);
	}

	for (const [key, value] of Object.entries(options.hash)) {
		// `script:only` is an option of the import, not an attribute of the tag
		if (key.startsWith(`${tag}:`) && key !== `${tag}:only`) {
			attributes[key.slice(tag.length + 1)] = value;
		}
	}

	let attributesText = '';
	for (const [name, value] of Object.entries(attributes)) {
		if (!ATTRIBUTE_NAME_REGEX.test(name)) {
			throw new HelperError(`Invalid attribute name '${name}'`, { options });
		}
		if (value === false || value === null || value === undefined) {
			continue;
		}

		if (value === true) {
			// XML requires a value for every attribute
			attributesText += ` ${name}="${name}"`;
		} else if (typeof value === 'string' || typeof value === 'number') {
			attributesText += ` ${name}="${Handlebars.escapeExpression(String(value))}"`;
		} else {
			throw new HelperError(
				`Expected attribute '${name}' to be a string, number or boolean, got: ${describeValue(value)}`,
				{ options },
			);
		}
	}

	return attributesText;
}
