/**
 * Blogger's functions on evaluated values. Each returns a value, or throws an
 * `ArgumentProblem` the evaluator reports with the call's place.
 */

import { decodeHTMLStrict } from 'entities';
import { Parser as HtmlParser } from 'htmlparser2';
import { toText } from './text';
import {
	Decimal,
	isList,
	isMap,
	kindOf,
	plain,
	RichValue,
	read,
	type Value,
	type ValueMap,
} from './values';

export class ArgumentProblem extends Error {
	constructor(
		readonly problem: string,
		/** The argument at fault, from 0. */
		readonly argument: number,
	) {
		super(problem);
	}
}

// ----- URLs -----

/** The text of a URL argument: a number or a boolean as printed, a list or a map as `null`. */
function urlText(value: Value, argument: number): string {
	const v = plain(value);
	if (v === undefined) {
		throw new ArgumentProblem('the URL is missing data', argument);
	}
	if (Array.isArray(v) || isMap(v)) {
		return 'null';
	}
	const text = toText(v);
	if (text === '') {
		throw new ArgumentProblem('the URL is empty', argument);
	}
	return text;
}

/** A string argument, or `""` for missing data. */
function textArgument(value: Value, argument: number, what: string): string {
	const v = plain(value);
	if (v === undefined) {
		return '';
	}
	if (typeof v === 'string') {
		return v;
	}
	throw new ArgumentProblem(
		`${what} must be a string, not ${kindOf(v)}`,
		argument,
	);
}

function splitUrl(url: string): {
	base: string;
	query: string | undefined;
	hash: string;
} {
	const hashAt = url.indexOf('#');
	const rest = hashAt === -1 ? url : url.slice(0, hashAt);
	const hash = hashAt === -1 ? '' : url.slice(hashAt);
	const queryAt = rest.indexOf('?');
	return queryAt === -1
		? { base: rest, query: undefined, hash }
		: { base: rest.slice(0, queryAt), query: rest.slice(queryAt + 1), hash };
}

/** The scheme and the host, `https://a.com:8080`; `mailto:` alone; or nothing. */
function origin(base: string): string {
	const match = /^([a-z][a-z0-9+.-]*:)?(\/\/[^/]*)?/i.exec(base);
	return match ? `${match[1] ?? ''}${match[2] ?? ''}` : '';
}

/** `path(url, path)`: the path replaced, as written; `""` removes it, slash included. */
export function path(url: Value, newPath: Value): string {
	const { base, query, hash } = splitUrl(urlText(url, 0));
	const p = textArgument(newPath, 1, 'the path');
	const withSlash = p === '' || p.startsWith('/') ? p : `/${p}`;
	return `${origin(base)}${withSlash}${query === undefined ? '' : `?${query}`}${hash}`;
}

/** `fragment(url, name)`: a leading `#` of the name is dropped; `""` leaves a bare `#`. */
export function fragment(url: Value, name: Value): string {
	const text = urlText(url, 0);
	const hashAt = text.indexOf('#');
	const base = hashAt === -1 ? text : text.slice(0, hashAt);
	return `${base}#${textArgument(name, 1, 'the name').replace(/^#/, '')}`;
}

/** Encodes a query name or value: a space is `+`; letters, digits and `-_.~*!'()/?:@,;$` are kept. */
function encode(text: string): string {
	// a lone surrogate can not be encoded: it is U+FFFD in a URL
	const wellFormed = text.replace(
		/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
		'\uFFFD',
	);
	return encodeURIComponent(wellFormed)
		.replaceAll('%20', '+')
		.replace(/%(2F|3F|3A|40|2C|3B|24)/g, (m) => decodeURIComponent(m));
}

function decodeQueryPart(text: string): string {
	try {
		return decodeURIComponent(text.replaceAll('+', ' '));
	} catch {
		return text;
	}
}

/** The `name=value` pairs of a map, names sorted; missing data and empty lists are left out. */
function pairs(map: Value, argument: number): string[] {
	if (!isMap(map)) {
		throw new ArgumentProblem(
			`the parameters must be a map, { name: value }, not ${kindOf(map)}`,
			argument,
		);
	}
	const result: string[] = [];
	for (const key of Object.keys(map).sort()) {
		const name = encode(key);
		const value = read(map[key]);
		const items = isList(value)
			? (plain(value) as readonly unknown[]).map(read)
			: [value];
		for (const item of items) {
			const v = plain(item);
			if (v === undefined) {
				continue;
			}
			const text = isList(v) || isMap(v) ? 'null' : toText(v);
			result.push(text === '' ? name : `${name}=${encode(text)}`);
		}
	}
	return result;
}

/**
 * `params(url, map)` sets each parameter: every copy already in the URL is
 * replaced by one, in the place of the first; new ones are added. The query of
 * the URL is encoded again.
 */
export function params(url: Value, map: Value): string {
	const { base, query, hash } = splitUrl(urlText(url, 0));
	const parts = (query ?? '')
		.split('&')
		.filter(Boolean)
		.map((pair) => {
			const [name = '', ...rest] = pair.split('=');
			const encodedName = encode(decodeQueryPart(name));
			return rest.length
				? `${encodedName}=${encode(decodeQueryPart(rest.join('=')))}`
				: encodedName;
		});
	const nameOf = (pair: string) => pair.split('=')[0];
	const added = pairs(map, 1);
	const replaced = new Set<string>();
	for (const pair of added) {
		const name = nameOf(pair) as string;
		const at = replaced.has(name)
			? -1
			: parts.findIndex((p) => nameOf(p) === name);
		if (at === -1 || replaced.has(name)) {
			parts.push(pair);
		} else {
			parts[at] = pair;
			for (let i = parts.length - 1; i > at; i--) {
				if (nameOf(parts[i] as string) === name) {
					parts.splice(i, 1);
				}
			}
		}
		replaced.add(name);
	}
	return `${base}${parts.length || query !== undefined ? `?${parts.join('&')}` : ''}${hash}`;
}

/** `appendParams(url, map)` adds the parameters, even names already there. */
export function appendParams(url: Value, map: Value): string {
	const { base, query, hash } = splitUrl(urlText(url, 0));
	const parts = [...(query ?? '').split('&').filter(Boolean), ...pairs(map, 1)];
	return `${base}${parts.length || query !== undefined ? `?${parts.join('&')}` : ''}${hash}`;
}

// ----- snippet -----

const KEPT_TAGS = new Set(['a', 'b', 'i', 'strong', 'em']);
const REMOVED_WITH_CONTENT = new Set([
	'script',
	'style',
	'iframe',
	'noscript',
	'template',
]);
const SNIPPET_MIN_LENGTH = 50;
const ELLIPSIS = '&#8230;';

type Piece =
	| { kind: 'text'; text: string }
	| { kind: 'space' }
	| { kind: 'tag'; html: string; name: string; closing: boolean };

interface SnippetOptions {
	length: number | undefined;
	links: boolean;
	linebreaks: boolean;
	ellipsis: boolean;
}

/** `length` is a number, rounded half up (a string, even one read as a number, is ignored); a flag is off only for `false`. */
function snippetOptions(
	options: Value | undefined,
	given: boolean,
): SnippetOptions {
	if (given && !isMap(options)) {
		throw new ArgumentProblem(
			`the options must be a map, { length: 100 }, not ${kindOf(options)}`,
			1,
		);
	}
	const map = (given ? options : {}) as ValueMap;
	const length = read(map.length);
	return {
		length:
			length instanceof Decimal && !length.fromText
				? Number(length.roundHalfUp())
				: undefined,
		links: read(map.links) !== false,
		linebreaks: read(map.linebreaks) !== false,
		ellipsis: read(map.ellipsis) !== false,
	};
}

function escapeText(text: string): string {
	return text.replace(
		/[&<>" ]/g,
		(c) =>
			({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				' ': '&#160;',
			})[c] as string,
	);
}

/** How many characters the text counts for: `&`, `<`, `>` as their entities, `&amp;` is 5. */
function countOf(text: string): number {
	let n = 0;
	for (const c of text) {
		n += c === '&' ? 5 : c === '<' || c === '>' ? 4 : 1;
	}
	return n;
}

/**
 * `snippet(html, options)`: the text of the HTML with its links and line
 * breaks, cut to `length` characters (50 at least) with `&#8230;` counted.
 *
 * Kept: `a` with its attributes, `b`, `i`, `strong`, `em`, `br`. Removed with
 * their content: `script`, `style`, `iframe`. Other tags are removed, their
 * text kept. Text between tags that is only whitespace is removed; other text
 * keeps all its spaces; the end tag `</div>` adds a space; the result is
 * trimmed. A cut inside a link closes it after the ellipsis; other tags stay
 * open.
 */
export function snippet(
	html: Value,
	options: Value | undefined,
	optionsGiven: boolean,
): Value {
	const v = plain(html);
	if (v === undefined) {
		return undefined;
	}
	const o = snippetOptions(options, optionsGiven);
	const text = toText(v);
	const pieces = collectPieces(text, o);

	let total = 0;
	for (const p of pieces) {
		if (p.kind === 'text') {
			total += countOf(p.text);
		} else if (p.kind === 'space') {
			total += 1;
		}
	}
	const limit =
		o.length === undefined ? undefined : Math.max(o.length, SNIPPET_MIN_LENGTH);
	const cutAt =
		limit !== undefined && total > limit
			? o.ellipsis
				? limit - 1
				: limit
			: undefined;

	let out = '';
	let count = 0;
	let openLink = false;
	let cut = false;
	for (const p of pieces) {
		if (p.kind === 'tag') {
			if (cutAt !== undefined && count >= cutAt) {
				break;
			}
			if (p.name === 'a') {
				openLink = !p.closing;
			}
			out += p.html;
			continue;
		}
		const chars = p.kind === 'space' ? [' '] : [...p.text];
		for (const c of chars) {
			if (cutAt !== undefined && count >= cutAt) {
				cut = true;
				break;
			}
			count += countOf(c);
			out += escapeText(c);
		}
		if (cut) {
			break;
		}
	}
	out = out.replace(/^(\s|&#160;)+/, '').replace(/(\s|&#160;)+$/, '');
	if (cutAt !== undefined) {
		if (o.ellipsis) {
			out += ELLIPSIS;
		}
		if (openLink) {
			out += '</a>';
		}
	}
	return out;
}

function collectPieces(html: string, o: SnippetOptions): Piece[] {
	const pieces: Piece[] = [];
	let skip = 0;
	let text = '';
	const flushText = () => {
		const decoded = decodeHTMLStrict(text);
		// text between tags that is only whitespace is removed
		if (decoded !== '' && !/^\s*$/.test(decoded)) {
			pieces.push({ kind: 'text', text: decoded });
		}
		text = '';
	};
	const parser = new HtmlParser(
		{
			onopentag(name, attributes) {
				if (skip || REMOVED_WITH_CONTENT.has(name)) {
					if (REMOVED_WITH_CONTENT.has(name)) {
						skip++;
					}
					return;
				}
				flushText();
				if (name === 'br') {
					pieces.push(
						o.linebreaks
							? { kind: 'tag', html: '<br>', name, closing: false }
							: { kind: 'space' },
					);
				} else if (KEPT_TAGS.has(name) && (name !== 'a' || o.links)) {
					const attrs = Object.entries(attributes)
						.map(([k, value]) => ` ${k}="${value.replaceAll('"', '&quot;')}"`)
						.join('');
					pieces.push({
						kind: 'tag',
						html: `<${name}${attrs}>`,
						name,
						closing: false,
					});
					if (name === 'a' && !o.linebreaks) {
						pieces.push({ kind: 'space' });
					}
				}
			},
			ontext(chunk) {
				if (!skip) {
					text += chunk;
				}
			},
			onclosetag(name, implied) {
				if (REMOVED_WITH_CONTENT.has(name)) {
					if (skip) {
						skip--;
					}
					return;
				}
				if (skip) {
					return;
				}
				flushText();
				if (KEPT_TAGS.has(name) && (name !== 'a' || o.links)) {
					pieces.push({ kind: 'tag', html: `</${name}>`, name, closing: true });
					if (name === 'a' && !o.linebreaks) {
						pieces.push({ kind: 'space' });
					}
				} else if (name === 'div' && !implied) {
					pieces.push({ kind: 'space' });
				}
			},
		},
		{
			decodeEntities: false,
			lowerCaseTags: true,
			lowerCaseAttributeNames: true,
		},
	);
	parser.write(html);
	parser.end();
	flushText();
	return pieces;
}

// ----- images -----

/** A width: a number rounded half up, or a string of digits. */
export function widthOf(value: Value): bigint | undefined {
	const v = plain(value);
	if (v instanceof Decimal) {
		return v.roundHalfUp();
	}
	if (typeof v === 'string' && /^\d+$/.test(v)) {
		return BigInt(v);
	}
	return undefined;
}

/** `"16:9"`, spaces allowed around the numbers, both positive; `""` and missing data are no ratio. */
function ratioOf(
	value: Value | undefined,
	argument: number,
): [bigint, bigint] | undefined {
	const v = plain(value);
	if (v === undefined || v === '') {
		return undefined;
	}
	const match =
		typeof v === 'string' ? /^\s*(\d+)\s*:\s*(\d+)\s*$/.exec(v) : null;
	if (
		!match ||
		BigInt(match[1] as string) === 0n ||
		BigInt(match[2] as string) === 0n
	) {
		throw new ArgumentProblem(
			`the ratio must be two positive integers, "16:9", not ${typeof v === 'string' ? `"${v}"` : kindOf(v)}`,
			argument,
		);
	}
	return [BigInt(match[1] as string), BigInt(match[2] as string)];
}

type SizeSlot =
	| { at: 'segment'; start: number; end: number }
	| { at: 'suffix'; start: number; end: number }
	| { at: 'append-path' }
	| { at: 'append-suffix' };

/** Where the size of a Blogger image URL is, or `undefined` for an image Blogger does not resize. */
function sizeSlot(url: string): SizeSlot | undefined {
	const match = /^(?:https?:)?\/\/([^/]+)(\/[^?#]*)?/i.exec(url);
	if (!match) {
		return undefined;
	}
	const host = (match[1] as string).toLowerCase();
	const path = match[2] ?? '';
	const pathStart = (match[0] as string).length - path.length;
	const uploadHost = host === 'blogger.googleusercontent.com';
	const bp = host === 'bp.blogspot.com' || host.endsWith('.bp.blogspot.com');
	const lh = /^lh\d+\.googleusercontent\.com$/.test(host);
	if (!uploadHost && !bp && !lh) {
		return undefined;
	}
	const isSize = (s: string) => /^[swh]\d[\w-]*$/.test(s);
	const eq = path.lastIndexOf('=');
	if (
		eq !== -1 &&
		!path.slice(eq).includes('/') &&
		isSize(path.slice(eq + 1).split('-')[0] as string)
	) {
		return {
			at: 'suffix',
			start: pathStart + eq + 1,
			end: pathStart + path.length,
		};
	}
	const segments = path.split('/');
	const size = segments.at(-2) ?? '';
	const uploadPath =
		uploadHost &&
		segments[1] === 'img' &&
		segments[3] === 'R29vZ2xl' &&
		(segments[4] ?? '').startsWith('AVvXsE') &&
		segments.length === 7;
	if (isSize(size) && (uploadPath || (bp && segments.length >= 6))) {
		const end = pathStart + segments.slice(0, -1).join('/').length;
		return { at: 'segment', start: end - size.length, end };
	}
	if (lh && isSize(size)) {
		return { at: 'append-path' };
	}
	if (lh && path.includes('/blogger_img_proxy/')) {
		return { at: 'append-suffix' };
	}
	return undefined;
}

/**
 * `resizeImage(image, width, ratio)`. A Blogger image gets the width, and a
 * crop for a ratio as wide as tall or wider (`w640-h360-p-k-no-nu`, `n` for a
 * YouTube image, the height rounded down); a taller ratio is ignored; a
 * negative width removes the size. A list of widths gives a list of
 * `{ url, size }`. Any other image is returned as it is.
 */
export function resizeImage(
	image: Value,
	width: Value,
	ratio: Value | undefined,
): Value {
	const widthList = plain(width);
	if (Array.isArray(widthList)) {
		return widthList.map((w) => {
			const resized = resizeImage(image, read(w), ratio);
			return { url: resized, size: read(w) };
		});
	}
	const w = widthOf(width);
	if (w === undefined) {
		throw new ArgumentProblem(
			`the width must be a number, or a string of digits, not ${kindOf(width)}`,
			1,
		);
	}
	const crop = ratioOf(ratio, 2);
	const v = plain(image);
	if (v === undefined || v === '') {
		return undefined;
	}
	if (typeof v !== 'string') {
		return image;
	}
	if (w < 0n && crop) {
		throw new ArgumentProblem(
			'a negative width can not be cropped to a ratio',
			1,
		);
	}
	const slot = sizeSlot(v);
	if (!slot) {
		return v;
	}
	const youtube =
		image instanceof RichValue && image.properties.isYoutube === true;
	const height =
		crop && crop[0] >= crop[1] && w >= 0n ? (w * crop[1]) / crop[0] : undefined;
	let size = w >= 0n ? `w${w}` : '';
	if (height !== undefined) {
		size += `-h${height}-${youtube ? 'n' : 'p'}-k-no-nu`;
	}
	let url: string;
	switch (slot.at) {
		case 'segment':
			url = size
				? `${v.slice(0, slot.start)}${size}${v.slice(slot.end)}`
				: `${v.slice(0, slot.start - 1)}${v.slice(slot.end)}`;
			break;
		case 'suffix':
			url = size
				? `${v.slice(0, slot.start)}${size}${v.slice(slot.end)}`
				: `${v.slice(0, slot.start - 1)}${v.slice(slot.end)}`;
			break;
		case 'append-path':
			url = size ? `${v}/${size}` : v;
			break;
		default:
			url = size ? `${v}=${size}` : v;
	}
	const properties: Record<string, unknown> = {
		isResizable: true,
		width: Decimal.integer(w),
	};
	if (height !== undefined) {
		properties.height = Decimal.integer(height);
	}
	return new RichValue(url, properties, 'image');
}

/** `sourceSet(image, widths, ratio)`: `url 100w, url 200w`; nothing for an image Blogger does not resize. */
export function sourceSet(
	image: Value,
	widths: Value,
	ratio: Value | undefined,
): Value {
	const list = plain(widths);
	if (!Array.isArray(list)) {
		throw new ArgumentProblem(
			`the widths must be a list, [400, 800], not ${kindOf(widths)}`,
			1,
		);
	}
	ratioOf(ratio, 2);
	const v = plain(image);
	if (typeof v !== 'string' || !sizeSlot(v)) {
		list.forEach((w, i) => {
			if (widthOf(read(w)) === undefined) {
				throw new ArgumentProblem(
					`item ${i + 1} of the widths must be a number or a string of digits`,
					1,
				);
			}
		});
		return undefined;
	}
	return list
		.map((raw, i) => {
			const w = widthOf(read(raw));
			if (w === undefined) {
				throw new ArgumentProblem(
					`item ${i + 1} of the widths must be a number or a string of digits`,
					1,
				);
			}
			return `${toText(resizeImage(image, Decimal.integer(w), ratio))} ${w}w`;
		})
		.join(', ');
}
