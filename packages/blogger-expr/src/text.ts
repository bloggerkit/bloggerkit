import { formatDate } from './dates';
import { Decimal, plain, read, type Value } from './values';

export interface TextOptions {
	/** The blog's language, for the names in dates. Default `en-GB`. */
	language?: string;
	/** The blog's time zone, for the text of dates. Default `UTC`. */
	timeZone?: string;
	/** The blog's Timestamp format, an ICU pattern. Default `MMMM dd, yyyy`, Blogger's default. */
	timestampFormat?: string;
}

export const DEFAULT_TEXT_OPTIONS: Required<TextOptions> = {
	language: 'en-GB',
	timeZone: 'UTC',
	timestampFormat: 'MMMM dd, yyyy',
};

/**
 * A value as Blogger writes it, in `<b:eval>`, in a `+` with text, and when it
 * compares a value with a string: missing data is nothing; a number its text;
 * a date in the blog's Timestamp format; a list `[1,"a"]`, its strings in
 * quotes, not escaped, an empty list `]`; a map `[Object]`.
 */
export function toText(value: Value, options: TextOptions = {}): string {
	const v = plain(value);
	if (v === undefined) {
		return '';
	}
	if (typeof v === 'string') {
		return v;
	}
	if (typeof v === 'boolean') {
		return v ? 'true' : 'false';
	}
	if (v instanceof Decimal) {
		return v.text;
	}
	if (v instanceof Date) {
		const o = { ...DEFAULT_TEXT_OPTIONS, ...options };
		return formatDate(v, o.timestampFormat, {
			language: o.language,
			timeZone: o.timeZone,
		});
	}
	if (Array.isArray(v)) {
		if (v.length === 0) {
			return ']';
		}
		return `[${v.map((item) => listItemText(item, options)).join(',')}]`;
	}
	return '[Object]';
}

function listItemText(raw: unknown, options: TextOptions): string {
	// items of a list keep their kind as given: a string stays a string here
	if (typeof raw === 'string') {
		return `"${raw}"`;
	}
	const item = read(raw);
	const v = plain(item);
	if (v === undefined) {
		return '""';
	}
	if (typeof v === 'string' || v instanceof Date) {
		return `"${toText(v, options)}"`;
	}
	return toText(item, options);
}
