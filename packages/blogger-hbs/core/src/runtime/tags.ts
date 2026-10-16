import Handlebars, { type HelperOptions } from 'handlebars/runtime';
import { ATTRIBUTE_NAME_REGEX } from '../constants';
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
 * `runtime` is put in front of the script.
 */
export function renderAsset(
	chunk: MinimalScriptChunk | MinimalStyleChunk,
	options: HelperOptions,
	runtime?: string,
): string {
	const css = chunk.type === 'script' ? chunk.css : chunk.code;
	const js = chunk.type === 'script' ? chunk.code : undefined;
	const mode = getOutputMode(options);
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
	const modes: OutputMode[] = [];

	for (const tag of ['script', 'style'] as const) {
		for (const raw of [false, true]) {
			if (isFlagValue(options.hash[flagKey(tag, raw)])) {
				modes.push({ tag, raw });
			}
		}
	}

	if (modes.length > 1) {
		const [a, b] = modes.map((mode) => flagKey(mode.tag, mode.raw));
		throw new HelperError(`'${a}' cannot be combined with '${b}'`, {
			options,
		});
	}

	return modes[0];
}

function flagKey(tag: Tag, raw: boolean): string {
	return `${tag}:${raw ? 'raw' : 'only'}`;
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
				`Expected '${tag}' to be an object, got: ${bulk === null ? 'null' : typeof bulk}`,
				{ options },
			);
		}
		Object.assign(attributes, bulk);
	}

	for (const [key, value] of Object.entries(options.hash)) {
		// `script:only` is an option of the import, not an attribute of the tag
		if (key.startsWith(`${tag}:`) && key !== flagKey(tag, false)) {
			attributes[key.slice(tag.length + 1)] = value;
		}
	}

	let html = '';
	for (const [name, value] of Object.entries(attributes)) {
		if (!ATTRIBUTE_NAME_REGEX.test(name)) {
			throw new HelperError(`Invalid attribute name '${name}'`, { options });
		}
		if (value === false || value === null || value === undefined) {
			continue;
		}

		if (value === true) {
			// XML requires a value for every attribute
			html += ` ${name}="${name}"`;
		} else if (typeof value === 'string' || typeof value === 'number') {
			html += ` ${name}="${Handlebars.escapeExpression(String(value))}"`;
		} else {
			throw new HelperError(
				`Expected attribute '${name}' to be a string, number or boolean, got: ${typeof value}`,
				{ options },
			);
		}
	}

	return html;
}
