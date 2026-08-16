import type { FunctionName } from './ast';
import type { Value } from './evaluator';

/**
 * The fixed, non-extensible set of functions callable from an expression.
 * There is no way to register additional functions — see `FUNCTION_NAMES` in
 * parser.ts, which enforces (at parse time) that only these names are ever
 * called, and `FUNCTION_SIGNATURES`, which enforces their arity and (for
 * literal arguments) their types.
 */
export type BuiltinFunction = (...args: Value[]) => Value;

function asString(v: Value, fnName: string, argIndex: number): string {
	if (typeof v === 'string') {
		return v;
	}
	if (typeof v === 'number' || typeof v === 'boolean') {
		return String(v);
	}
	if (v === null) {
		return '';
	}
	throw new TypeError(`${fnName}(): argument ${argIndex} must be a string`);
}

function asNumber(v: Value, fnName: string, argIndex: number): number {
	if (typeof v === 'number') {
		return v;
	}
	if (typeof v === 'string' && v.trim() !== '') {
		return Number(v);
	}
	throw new TypeError(`${fnName}(): argument ${argIndex} must be a number`);
}

function asMap(
	v: Value,
	fnName: string,
	argIndex: number,
): Record<string, Value> {
	if (v && typeof v === 'object' && !Array.isArray(v)) {
		return v as Record<string, Value>;
	}
	throw new TypeError(`${fnName}(): argument ${argIndex} must be a map`);
}

function asList(v: Value, fnName: string, argIndex: number): Value[] {
	if (Array.isArray(v)) {
		return v;
	}
	throw new TypeError(`${fnName}(): argument ${argIndex} must be a list`);
}

/**
 * `path(url, "segment")`
 *
 * Joins a base URL and a path segment with exactly one `/` between them, e.g.
 * `path(data:blog.homepageUrl.canonical, "p/about.html")`.
 */
const path: BuiltinFunction = (...args) => {
	const base = asString(args[0] ?? '', 'path', 0);
	const segment = asString(args[1] ?? '', 'path', 1);
	return `${base.replace(/\/+$/, '')}/${segment.replace(/^\/+/, '')}`;
};

function mergeParams(url: string, extra: Record<string, Value>): string {
	const [base, hash] = url.split('#');
	const [pathPart, query = ''] = (base ?? '').split('?');
	const searchParams = new URLSearchParams(query);
	for (const [key, value] of Object.entries(extra)) {
		searchParams.set(key, value === null ? '' : String(value));
	}
	const qs = searchParams.toString();
	return `${pathPart}${qs ? `?${qs}` : ''}${hash ? `#${hash}` : ''}`;
}

/**
 * `appendParams(url, { key: value, ... })`
 *
 * Adds the given query parameters to `url`, overwriting any that already
 * share the same key (there's no publicly documented distinction between
 * this and `params` beyond the name Blogger templates use for each).
 */
const appendParams: BuiltinFunction = (...args) => {
	const url = asString(args[0] ?? '', 'appendParams', 0);
	const extra = asMap(args[1] ?? {}, 'appendParams', 1);
	return mergeParams(url, extra);
};

/**
 * `params(url, { key: value, ... })`
 *
 * Replaces `url`'s query parameters with the given ones (existing keys not
 * present in the map are left alone; matching keys are overwritten), e.g.
 * `params(data:view.url, { amp: "1" })`.
 */
const params: BuiltinFunction = (...args) => {
	const url = asString(args[0] ?? '', 'params', 0);
	const extra = asMap(args[1] ?? {}, 'params', 1);
	return mergeParams(url, extra);
};

/**
 * `fragment(url, "name")`
 *
 * Returns `url` with its `#fragment` replaced by `name`, e.g.
 * `fragment(data:post.url.canonical, "comment")` -> `.../post.html#comment`.
 */
const fragment: BuiltinFunction = (...args) => {
	const url = asString(args[0] ?? '', 'fragment', 0);
	const name = asString(args[1] ?? '', 'fragment', 1);
	const base = url.split('#')[0];
	return `${base}#${name}`;
};

/**
 * `snippet(text, [{ links, linebreaks, ellipsis, length }])`
 *
 * Makes an excerpt/summary out of `text`:
 * - `length` (number, default 150): truncate to this many characters, at a
 *   whole-word boundary.
 * - `ellipsis` (boolean, default true): append "..." when truncated.
 * - `links` (boolean, default false): when false, strips `<a>` tags (keeping
 *   their text). When true, links are left as-is.
 * - `linebreaks` (boolean, default false): when false, collapses all
 *   whitespace/newlines to single spaces. When true, blank lines become
 *   `<br/>`.
 */
const snippet: BuiltinFunction = (...args) => {
	const raw = asString(args[0] ?? '', 'snippet', 0);
	const options = args.length > 1 ? asMap(args[1] as Value, 'snippet', 1) : {};
	const length =
		options.length !== undefined ? asNumber(options.length, 'snippet', 1) : 150;
	const links = options.links === true;
	const linebreaks = options.linebreaks === true;
	const ellipsis = options.ellipsis !== false;

	let text = links ? raw : raw.replace(/<a\b[^>]*>|<\/a>/gi, '');
	text = text.replace(/<[^>]*>/g, (tag) =>
		links && /^<\/?a\b/i.test(tag) ? tag : '',
	);
	text = linebreaks
		? text.replace(/\n{2,}/g, '<br/>')
		: text.replace(/\s+/g, ' ');
	text = text.trim();

	if (text.length <= length) {
		return text;
	}
	const truncated = text.slice(0, length);
	const lastSpace = truncated.lastIndexOf(' ');
	const cut = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
	return ellipsis ? `${cut}...` : cut;
};

const DATE_TOKEN_PATTERN =
	/YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|A|a/g;
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
 * Formats a date-like value (ISO string, epoch millis, or `Date`) using a
 * subset of common date-format tokens, e.g.
 * `format(data:post.date, "MMMM d, YYYY")` -> "January 5, 2026".
 * Supported tokens: YYYY, YY, MMMM, MMM, MM, M, DD, D, dddd, ddd, HH, H, hh, h, mm, m, ss, s, A, a.
 */
const format: BuiltinFunction = (...args) => {
	const raw = args[0];
	const pattern = asString(args[1] ?? 'YYYY-MM-DD', 'format', 1);
	let date: Date;
	if (raw instanceof Date) {
		date = raw;
	} else if (typeof raw === 'number') {
		date = new Date(raw);
	} else if (typeof raw === 'string') {
		date = new Date(raw);
	} else {
		throw new TypeError(
			'format(): argument 1 must be a date, timestamp, or ISO string',
		);
	}
	if (Number.isNaN(date.getTime())) {
		throw new TypeError('format(): invalid date');
	}

	const hours24 = date.getHours();
	const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
	const replacements: Record<string, string> = {
		YYYY: String(date.getFullYear()),
		YY: String(date.getFullYear()).slice(-2),
		MMMM: MONTHS[date.getMonth()] as string,
		MMM: (MONTHS[date.getMonth()] as string).slice(0, 3),
		MM: pad2(date.getMonth() + 1),
		M: String(date.getMonth() + 1),
		DD: pad2(date.getDate()),
		D: String(date.getDate()),
		dddd: DAYS[date.getDay()] as string,
		ddd: (DAYS[date.getDay()] as string).slice(0, 3),
		HH: pad2(hours24),
		H: String(hours24),
		hh: pad2(hours12),
		h: String(hours12),
		mm: pad2(date.getMinutes()),
		m: String(date.getMinutes()),
		ss: pad2(date.getSeconds()),
		s: String(date.getSeconds()),
		A: hours24 < 12 ? 'AM' : 'PM',
		a: hours24 < 12 ? 'am' : 'pm',
	};
	return pattern.replace(
		DATE_TOKEN_PATTERN,
		(token) => replacements[token] ?? token,
	);
};

/**
 * `resizeImage(image, width, [ratioOrHeight])`
 *
 * Approximates Blogger's Google-hosted image resizing (`googleusercontent.com`
 * / `blogger.googleusercontent.com` URLs), which encode size in a suffix on
 * the URL. Blogger's exact internal encoding isn't publicly specified, so
 * this implements the commonly observed `=w{width}-h{height}-c` convention.
 * `ratioOrHeight` may be a `"W:H"` ratio string (e.g. `"16:9"`) or a plain
 * number (an explicit height).
 */
const resizeImage: BuiltinFunction = (...args) => {
	const url = asString(args[0] ?? '', 'resizeImage', 0);
	const width = Math.round(asNumber(args[1] ?? 0, 'resizeImage', 1));
	const height = resolveHeight(width, args[2]);
	const suffix = height ? `w${width}-h${height}` : `w${width}`;
	// Strip any existing Google image-serving size suffix (e.g. "=s0", "=w200-h200-c")
	// before appending the new one.
	const stripped = url.replace(/=[a-z0-9-]+$/i, '');
	return `${stripped}=${suffix}-c`;
};

function resolveHeight(
	width: number,
	ratioArg: Value | undefined,
): number | null {
	if (ratioArg === undefined || ratioArg === null) {
		return null;
	}
	if (typeof ratioArg === 'number') {
		return Math.round(ratioArg);
	}
	const match = /^(\d+):(\d+)$/.exec(String(ratioArg));
	if (!match) {
		return null;
	}
	const w = Number(match[1]);
	const h = Number(match[2]);
	return Math.round((width * h) / w);
}

/**
 * `sourceSet(image, [width1, width2, ...], [ratioOrHeight])`
 *
 * Builds an `srcset`-style string by calling `resizeImage` for each width in
 * the list, e.g. `sourceSet(data:post.featuredImage, [400, 800, 1200],
 * "16:9")` -> `"...=w400-h225-c 400w, ...=w800-h450-c 800w, ...=w1200-h675-c 1200w"`.
 */
const sourceSet: BuiltinFunction = (...args) => {
	const image = asString(args[0] ?? '', 'sourceSet', 0);
	const widths = asList(args[1] ?? [], 'sourceSet', 1);
	const ratioArg = args[2];
	return widths
		.map((w) => {
			const width = Math.round(asNumber(w, 'sourceSet', 1));
			const resized = resizeImage(image, width, ratioArg as Value);
			return `${resized} ${width}w`;
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
