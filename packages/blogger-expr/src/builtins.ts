import { BloggerImage } from 'blogger-images';
import type { FunctionName } from './ast';
import { WIDTH_PROBLEM, widthOf } from './grammar';
import { imageValue, plain, RichValue, type Value } from './values';

/**
 * The fixed, non-extensible set of functions callable from an expression.
 * There is no way to register additional functions — see `FUNCTION_NAMES` in
 * grammar.ts, which enforces (at parse time) that only these names are ever
 * called, and `FUNCTION_SIGNATURES`, which enforces their arity and (for
 * literal arguments) their types.
 */
export type BuiltinFunction = (...args: Value[]) => Value;

function asString(value: Value, fnName: string, argIndex: number): string {
	const v = plain(value);
	if (typeof v === 'string') {
		return v;
	}
	if (typeof v === 'number' || typeof v === 'boolean') {
		return String(v);
	}
	if (v === null) {
		return '';
	}
	throw new TypeError(`${fnName}(): argument ${argIndex + 1} must be a string`);
}

function asNumber(value: Value, fnName: string, argIndex: number): number {
	const v = plain(value);
	if (typeof v === 'number') {
		return v;
	}
	if (typeof v === 'string' && v.trim() !== '') {
		return Number(v);
	}
	throw new TypeError(`${fnName}(): argument ${argIndex + 1} must be a number`);
}

/** A width of an image, see `widthOf`, the argument or an item of it, at `itemIndex`. */
function asWidth(
	value: Value,
	fnName: string,
	argIndex: number,
	itemIndex?: number,
): number {
	const width = widthOf(plain(value));
	if (width === undefined) {
		const item = itemIndex === undefined ? '' : `item ${itemIndex + 1} of `;
		throw new TypeError(
			`${fnName}(): ${item}argument ${argIndex + 1} ${WIDTH_PROBLEM}, got: ${JSON.stringify(value)}`,
		);
	}
	return width;
}

function asMap(
	value: Value,
	fnName: string,
	argIndex: number,
): Record<string, Value> {
	const v = plain(value);
	if (v && typeof v === 'object' && !Array.isArray(v)) {
		return v as Record<string, Value>;
	}
	throw new TypeError(`${fnName}(): argument ${argIndex + 1} must be a map`);
}

function asList(value: Value, fnName: string, argIndex: number): Value[] {
	const v = plain(value);
	if (Array.isArray(v)) {
		return v;
	}
	throw new TypeError(`${fnName}(): argument ${argIndex + 1} must be a list`);
}

/** Splits a URL at its first `#`, which starts the fragment. */
function splitHash(url: string): [string, string] {
	const index = url.indexOf('#');
	return index === -1 ? [url, ''] : [url.slice(0, index), url.slice(index)];
}

/** Splits a URL without a fragment at its first `?`, which starts the query. */
function splitQuery(url: string): [string, string] {
	const index = url.indexOf('?');
	return index === -1 ? [url, ''] : [url.slice(0, index), url.slice(index + 1)];
}

/**
 * `path(url, "path")`
 *
 * Replaces the path of `url`, keeping its query and fragment, e.g.
 * `path(data:blog.homepageUrl.canonical, "search")` -> `https://.../search`.
 */
const path: BuiltinFunction = (...args) => {
	const url = asString(args[0] ?? '', 'path', 0);
	const newPath = asString(args[1] ?? '', 'path', 1);
	const [rest, hash] = splitHash(url);
	const [base, query] = splitQuery(rest);
	// the scheme and the host, if any
	const origin = /^(?:[a-z][a-z0-9+.-]*:)?\/\/[^/]*/i.exec(base)?.[0] ?? '';
	return `${origin}/${newPath.replace(/^\/+/, '')}${query ? `?${query}` : ''}${hash}`;
};

function withParams(
	url: string,
	extra: Record<string, Value>,
	append: boolean,
): string {
	const [rest, hash] = splitHash(url);
	const [base, query] = splitQuery(rest);
	// appended after the parameters of the URL, or instead of them
	const searchParams = new URLSearchParams(append ? query : '');
	for (const [key, extraValue] of Object.entries(extra)) {
		const value = plain(extraValue);
		if (value !== null && typeof value === 'object') {
			throw new TypeError(
				`The value of the parameter '${key}' must be a string, a number or a boolean`,
			);
		}
		searchParams.append(key, value === null ? '' : String(value));
	}
	const qs = searchParams.toString();
	return `${base}${qs ? `?${qs}` : ''}${hash}`;
}

/**
 * `appendParams(url, { key: value, ... })`
 *
 * Appends the given query parameters to the ones of `url`, e.g.
 * `appendParams(data:post.commentFormIframeSrc, { skin: "contempo" })`.
 */
const appendParams: BuiltinFunction = (...args) => {
	const url = asString(args[0] ?? '', 'appendParams', 0);
	const extra = asMap(args[1] ?? {}, 'appendParams', 1);
	return withParams(url, extra, true);
};

/**
 * `params(url, { key: value, ... })`
 *
 * Replaces the query parameters of `url` with the given ones, e.g.
 * `params(data:view.url, { amp: "1" })` -> `...?amp=1`.
 */
const params: BuiltinFunction = (...args) => {
	const url = asString(args[0] ?? '', 'params', 0);
	const extra = asMap(args[1] ?? {}, 'params', 1);
	return withParams(url, extra, false);
};

/**
 * `fragment(url, "name")`
 *
 * Returns `url` with its `#fragment` replaced by `name`, e.g.
 * `fragment(data:post.url.canonical, "comment")` -> `.../post.html#comment`.
 * An empty name removes the fragment.
 */
const fragment: BuiltinFunction = (...args) => {
	const url = asString(args[0] ?? '', 'fragment', 0);
	const name = asString(args[1] ?? '', 'fragment', 1);
	const [base] = splitHash(url);
	return name ? `${base}#${name}` : base;
};

/**
 * `snippet(text, [{ links, linebreaks, ellipsis, length }])`
 *
 * Makes an excerpt/summary out of `text`:
 * - `length` (number, default 150): truncate to this many characters, at a
 *   whole-word boundary.
 * - `ellipsis` (boolean, default true): append "..." when truncated.
 * - `links` (boolean, default true): when false, strips `<a>` tags (keeping
 *   their text). When true, links are left as-is.
 * - `linebreaks` (boolean, default true): when false, collapses all
 *   whitespace/newlines to single spaces. When true, line breaks (`<br>`,
 *   the end of a paragraph, blank lines) become `<br/>`.
 */
const snippet: BuiltinFunction = (...args) => {
	const raw = asString(args[0] ?? '', 'snippet', 0);
	const options = args.length > 1 ? asMap(args[1] as Value, 'snippet', 1) : {};
	const length =
		options.length !== undefined ? asNumber(options.length, 'snippet', 1) : 150;
	if (!Number.isFinite(length) || length < 0) {
		throw new TypeError(
			"snippet(): option 'length' must be a number of characters",
		);
	}
	const links = options.links !== false;
	const linebreaks = options.linebreaks !== false;
	const ellipsis = options.ellipsis !== false;

	// a line break in the markup is a blank line, or a space without breaks,
	// before the tags are removed
	let text = raw.replace(/<br\s*\/?>|<\/p>/gi, linebreaks ? '\n\n' : ' ');
	text = links ? text : text.replace(/<a\b[^>]*>|<\/a>/gi, '');
	text = text.replace(/<[^>]*>/g, (tag) =>
		links && /^<\/?a\b/i.test(tag) ? tag : '',
	);
	if (linebreaks) {
		// blank lines become a break, with the spaces around them
		text = text.replace(/\s*\n[ \t]*\n\s*/g, '<br/>');
	}
	text = text.replace(/\s+/g, ' ');
	text = text.trim();

	if (text.length <= length) {
		return text;
	}
	const truncated = text.slice(0, length);
	const lastSpace = truncated.lastIndexOf(' ');
	const cut = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
	return ellipsis ? `${cut}...` : cut;
};

/** Blogger's (Java) date pattern letters, and text in single quotes. */
const DATE_TOKEN_PATTERN =
	/'[^']*'|yyyy|YYYY|yy|YY|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|hh|h|mm|m|ss|s|a/g;
const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];
const DAYS = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
];
const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * `format(date, "pattern")`
 *
 * Formats a date-like value (ISO string, epoch millis, or `Date`) in UTC
 * with Blogger's (Java) pattern letters, e.g.
 * `format(data:post.date, "MMMM d, YYYY")` -> "January 5, 2026".
 * Supported: yyyy/YYYY, yy/YY, MMMM, MMM, MM, M, dd, d, EEEE, EEE, HH, H, hh,
 * h, mm, m, ss, s, a. Text in single quotes is kept as it is, `''` is a quote.
 */
const format: BuiltinFunction = (...args) => {
	const raw = plain(args[0] ?? null) as unknown;
	const pattern = asString(args[1] ?? 'yyyy-MM-dd', 'format', 1);
	let date: Date;
	if (raw instanceof Date) {
		date = raw;
	} else if (typeof raw === 'number' || typeof raw === 'string') {
		date = new Date(raw);
	} else {
		throw new TypeError(
			'format(): argument 1 must be a date, timestamp, or ISO string',
		);
	}
	if (Number.isNaN(date.getTime())) {
		throw new TypeError('format(): invalid date');
	}

	const hours24 = date.getUTCHours();
	const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
	const year = String(date.getUTCFullYear());
	const month = MONTHS[date.getUTCMonth()] as string;
	const day = DAYS[date.getUTCDay()] as string;
	const replacements: Record<string, string> = {
		yyyy: year,
		YYYY: year,
		yy: year.slice(-2),
		YY: year.slice(-2),
		MMMM: month,
		MMM: month.slice(0, 3),
		MM: pad2(date.getUTCMonth() + 1),
		M: String(date.getUTCMonth() + 1),
		dd: pad2(date.getUTCDate()),
		d: String(date.getUTCDate()),
		EEEE: day,
		EEE: day.slice(0, 3),
		HH: pad2(hours24),
		H: String(hours24),
		hh: pad2(hours12),
		h: String(hours12),
		mm: pad2(date.getUTCMinutes()),
		m: String(date.getUTCMinutes()),
		ss: pad2(date.getUTCSeconds()),
		s: String(date.getUTCSeconds()),
		a: hours24 < 12 ? 'AM' : 'PM',
	};
	return pattern.replace(DATE_TOKEN_PATTERN, (token) => {
		if (token.startsWith("'")) {
			return token === "''" ? "'" : token.slice(1, -1);
		}
		return replacements[token] ?? token;
	});
};

/**
 * `resizeImage(image, width, [ratio])`
 *
 * Resizes a Blogger hosted image (`blogger.googleusercontent.com`,
 * `bp.blogspot.com`) to `width`, an integer of 0 or more as a number or a
 * string of digits only, `...=w640`, and crops it to `ratio` when
 * Blogger supports it, `...=w640-h360-p-k-no-nu`. `ratio` is a `"W:H"`
 * string of positive integers, `"16:9"`, its first one at least as large as
 * the second: a taller one, `"9:16"`, is ignored. Other URLs are returned
 * unchanged.
 *
 * The image it gives has `.isResizable`, `.width` and `.height`, `null` when
 * it is not known.
 */
const resizeImage: BuiltinFunction = (...args) => {
	const url = asString(args[0] ?? '', 'resizeImage', 0);
	const width = asWidth(args[1] ?? null, 'resizeImage', 1);
	const height = resolveHeight(width, args[2], 'resizeImage');

	// the size of the URL is replaced, other URLs are left as they are
	const image = new BloggerImage(url, { existing: false, passThrough: true });
	if (!image.isSupported()) {
		return imageValue(url);
	}
	image.width(width);
	if (height !== null) {
		image
			.height(height)
			.alternateCrop(true)
			.disableAnimation(true)
			.noButton(true)
			.noUpscaling(true);
	}
	return new RichValue(image.url(), { isResizable: true, width, height });
};

/** A ratio, `"16:9"`, spaces allowed around its numbers. */
const RATIO = /^\s*(\d+)\s*:\s*(\d+)\s*$/;

/**
 * The height for `width` at a `"W:H"` ratio, `null` without one, and for a
 * ratio Blogger does not crop to, taller than wide. A ratio that is not two
 * positive integers is an error, Blogger does not render it.
 */
function resolveHeight(
	width: number,
	ratioArg: Value | undefined,
	fnName: string,
): number | null {
	if (ratioArg === undefined || ratioArg === null) {
		return null;
	}
	const ratio = plain(ratioArg);
	const match = typeof ratio === 'string' ? RATIO.exec(ratio) : null;
	const w = Number(match?.[1]);
	const h = Number(match?.[2]);
	if (!match || w === 0 || h === 0) {
		throw new TypeError(
			`${fnName}(): argument 3 must be a ratio of positive integers like "16:9", got: ${JSON.stringify(ratioArg)}`,
		);
	}
	return w >= h ? Math.round((width * h) / w) : null;
}

/**
 * `sourceSet(image, [width1, width2, ...], [ratio])`
 *
 * Builds an `srcset`-style string by calling `resizeImage` for each width in
 * the list, e.g. `sourceSet(data:post.featuredImage, [400, 800, 1200],
 * "16:9")` -> `"...=w400-h225-p-k-no-nu 400w, ...=w800-h450-p-k-no-nu 800w, ..."`.
 */
const sourceSet: BuiltinFunction = (...args) => {
	const image = asString(args[0] ?? '', 'sourceSet', 0);
	const widths = asList(args[1] ?? [], 'sourceSet', 1);
	const ratioArg = args[2];
	// checked here, for the error to name this function
	resolveHeight(1, ratioArg, 'sourceSet');
	return widths
		.map((w, index) => {
			const width = asWidth(w, 'sourceSet', 1, index);
			const resized = resizeImage(image, width, ratioArg as Value);
			return `${String(plain(resized))} ${width}w`;
		})
		.join(', ');
};

export const FIXED_BUILTINS: Record<FunctionName, BuiltinFunction> = {
	path,
	appendParams,
	params,
	snippet,
	fragment,
	resizeImage,
	sourceSet,
	format,
};
