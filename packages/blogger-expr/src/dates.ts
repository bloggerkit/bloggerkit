/**
 * Dates written with ICU's pattern letters, the patterns of `format` and of
 * the blog's Timestamp format. Names (months, days, eras, day periods, time
 * zones) come from `Intl.DateTimeFormat`, in any language.
 */

export interface DateOptions {
	/** A BCP 47 language tag, `en-GB`, `fr`, `hi`. */
	language: string;
	/** An IANA time zone, `UTC`, `America/Los_Angeles`. */
	timeZone: string;
}

/** The letters ICU reads in a pattern; any other ASCII letter is an error. */
const PATTERN_LETTERS = new Set('GyYuUrQqMLlwWdDFgEecabBhHkKmsSAzZOvVXx');

export class PatternError extends Error {
	constructor(readonly letter: string) {
		super(`\`${letter}\` is not a pattern letter`);
	}
}

interface Fields {
	year: number;
	month: number; // 1–12
	day: number;
	hour: number; // 0–23
	minute: number;
	second: number;
	millisecond: number;
	weekday: number; // 0 Sunday – 6 Saturday
	dayOfYear: number;
	/** minutes east of UTC */
	offset: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(
	language: string,
	options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
	const key = `${language}|${JSON.stringify(options)}`;
	let f = formatters.get(key);
	if (!f) {
		f = new Intl.DateTimeFormat(language, options);
		formatters.set(key, f);
	}
	return f;
}

function part(
	date: Date,
	language: string,
	options: Intl.DateTimeFormatOptions,
	type: Intl.DateTimeFormatPartTypes,
): string {
	return (
		formatter(language, options)
			.formatToParts(date)
			.find((p) => p.type === type)?.value ?? ''
	);
}

function fieldsOf(date: Date, timeZone: string): Fields {
	const parts = formatter('en-US', {
		timeZone,
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric',
		second: 'numeric',
		hourCycle: 'h23',
	}).formatToParts(date);
	const get = (type: string) =>
		Number(parts.find((p) => p.type === type)?.value ?? 0);
	const year = get('year');
	const month = get('month');
	const day = get('day');
	const hour = get('hour') % 24;
	const minute = get('minute');
	const second = get('second');
	const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
	const offset = Math.round(
		(localAsUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000,
	);
	const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
	const dayOfYear =
		(Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86_400_000 + 1;
	return {
		year,
		month,
		day,
		hour,
		minute,
		second,
		millisecond: date.getUTCMilliseconds(),
		weekday,
		dayOfYear,
		offset,
	};
}

/** The first day of the week of a language, 1 Monday … 7 Sunday. */
function firstDayOfWeek(language: string): number {
	try {
		const locale = new Intl.Locale(language) as Intl.Locale & {
			getWeekInfo?: () => { firstDay: number };
			weekInfo?: { firstDay: number };
		};
		return locale.getWeekInfo?.().firstDay ?? locale.weekInfo?.firstDay ?? 1;
	} catch {
		return 1;
	}
}

/** The ISO week of a date and its year: Monday first, the first week having 4 days or more. */
function isoWeek(f: Fields): { week: number; year: number } {
	const mondayBased = (f.weekday + 6) % 7;
	const thursday = new Date(
		Date.UTC(f.year, f.month - 1, f.day - mondayBased + 3),
	);
	const year = thursday.getUTCFullYear();
	const week =
		Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * 86_400_000)) +
		1;
	return { week, year };
}

const pad = (n: number, width: number) =>
	n < 0
		? `-${String(-n).padStart(width, '0')}`
		: String(n).padStart(width, '0');

function offsetText(minutes: number, colon: boolean, short: boolean): string {
	const sign = minutes < 0 ? '-' : '+';
	const abs = Math.abs(minutes);
	const h = Math.floor(abs / 60);
	const m = abs % 60;
	if (short) {
		return m
			? `${sign}${pad(h, 2)}${colon ? ':' : ''}${pad(m, 2)}`
			: `${sign}${pad(h, 2)}`;
	}
	return `${sign}${pad(h, 2)}${colon ? ':' : ''}${pad(m, 2)}`;
}

function gmtText(minutes: number, long: boolean): string {
	if (!long) {
		if (minutes === 0) {
			return 'GMT+0';
		}
		const h = Math.floor(Math.abs(minutes) / 60);
		const m = Math.abs(minutes) % 60;
		return `GMT${minutes < 0 ? '-' : '+'}${h}${m ? `:${pad(m, 2)}` : ''}`;
	}
	return `GMT${offsetText(minutes, true, false)}`;
}

/**
 * The date written with an ICU pattern: letters are fields, text in single
 * quotes is written as it is, `''` is a quote. Throws `PatternError` for a
 * letter ICU does not know.
 */
/** The day of the week in a time zone, 0 for Sunday to 6 for Saturday. */
export function weekdayOf(date: Date, timeZone: string): number {
	return fieldsOf(date, timeZone).weekday;
}

export function formatDate(
	date: Date,
	pattern: string,
	options: DateOptions,
): string {
	const { language, timeZone } = options;
	const f = fieldsOf(date, timeZone);
	const names = (
		field: 'month' | 'weekday' | 'era',
		width: 'long' | 'short' | 'narrow',
	) =>
		part(
			date,
			language,
			{
				timeZone,
				[field]: width,
				...(field === 'month' ? { day: 'numeric' } : {}),
			},
			field,
		);
	let out = '';
	let i = 0;
	while (i < pattern.length) {
		const c = pattern[i] as string;
		if (c === "'") {
			if (pattern[i + 1] === "'") {
				out += "'";
				i += 2;
				continue;
			}
			// quoted text, to the next lone quote; '' inside it is a quote
			i++;
			while (i < pattern.length) {
				if (pattern[i] === "'") {
					if (pattern[i + 1] !== "'") {
						break;
					}
					i++;
				}
				out += pattern[i];
				i++;
			}
			i++;
			continue;
		}
		if (!/[A-Za-z]/.test(c)) {
			out += c;
			i++;
			continue;
		}
		if (!PATTERN_LETTERS.has(c)) {
			throw new PatternError(c);
		}
		let n = 1;
		while (pattern[i + n] === c) {
			n++;
		}
		i += n;
		out += field(c, n);
	}
	return out;

	function field(c: string, n: number): string {
		const hour12 = f.hour % 12 === 0 ? 12 : f.hour % 12;
		const year = (y: number) =>
			n === 2 ? pad(((y % 100) + 100) % 100, 2) : pad(y, n);
		const textual = (field: 'month' | 'weekday') =>
			n === 4
				? names(field, 'long')
				: n === 5
					? names(field, 'narrow')
					: n === 6
						? names(field, 'short').slice(0, 2)
						: names(field, 'short');
		const dayPeriod = () =>
			part(
				date,
				language,
				{ timeZone, hour: 'numeric', hourCycle: 'h12' },
				'dayPeriod',
			);
		switch (c) {
			case 'G':
				return n === 4
					? names('era', 'long')
					: n === 5
						? names('era', 'narrow')
						: names('era', 'short');
			case 'y':
			case 'u':
			case 'U':
			case 'r':
				return year(f.year);
			case 'Y':
				return year(isoWeek(f).year);
			case 'Q':
			case 'q': {
				const q = Math.floor((f.month - 1) / 3) + 1;
				if (n <= 2) {
					return pad(q, n);
				}
				if (n === 3) {
					return `Q${q}`;
				}
				if (n === 4) {
					return `${q}${['st', 'nd', 'rd', 'th'][q - 1]} quarter`;
				}
				return String(q);
			}
			case 'M':
			case 'L':
				return n <= 2 || n >= 6 ? pad(f.month, n) : textual('month');
			case 'l':
				return '';
			case 'w':
				return pad(isoWeek(f).week, n);
			case 'W': {
				const firstWeekday = (f.weekday - ((f.day - 1) % 7) + 7) % 7;
				const mondayBased = (firstWeekday + 6) % 7;
				return pad(
					Math.floor((f.day - 1 + mondayBased) / 7) +
						(mondayBased <= 3 ? 1 : 0),
					n,
				);
			}
			case 'd':
				return pad(f.day, n);
			case 'D':
				return pad(f.dayOfYear, n);
			case 'F':
				return pad(Math.floor((f.day - 1) / 7) + 1, n);
			case 'g':
				return pad(
					Math.floor(Date.UTC(f.year, f.month - 1, f.day) / 86_400_000) +
						2_440_588,
					n,
				);
			case 'E':
				return textual('weekday');
			case 'e':
			case 'c': {
				if (n > 2) {
					return textual('weekday');
				}
				const first = firstDayOfWeek(language) % 7; // 0 Sunday
				return pad(((f.weekday - first + 7) % 7) + 1, n);
			}
			case 'a':
			case 'b': {
				const period = dayPeriod();
				return n === 5 ? period.slice(0, 1) : period;
			}
			case 'B':
				return part(
					date,
					language,
					{ timeZone, hour: 'numeric', dayPeriod: n >= 4 ? 'long' : 'short' },
					'dayPeriod',
				);
			case 'h':
				return pad(hour12, n);
			case 'H':
				return pad(f.hour, n);
			case 'k':
				return pad(f.hour === 0 ? 24 : f.hour, n);
			case 'K':
				return pad(f.hour % 12, n);
			case 'm':
				return pad(f.minute, n);
			case 's':
				return pad(f.second, n);
			case 'S':
				return pad(f.millisecond, 3).padEnd(n, '0').slice(0, n);
			case 'A':
				return pad(
					((f.hour * 60 + f.minute) * 60 + f.second) * 1000 + f.millisecond,
					n,
				);
			case 'z':
				return part(
					date,
					language,
					{ timeZone, timeZoneName: n >= 4 ? 'long' : 'short' },
					'timeZoneName',
				);
			case 'Z':
				return n === 4
					? gmtText(f.offset, true)
					: n >= 5
						? f.offset === 0
							? 'Z'
							: offsetText(f.offset, true, false)
						: offsetText(f.offset, false, false);
			case 'O':
				return gmtText(f.offset, n >= 4);
			case 'v':
				return gmtText(f.offset, n >= 4);
			case 'V':
				if (n === 1) {
					return timeZone.toLowerCase() === 'utc' ? 'utc' : 'unk';
				}
				if (n === 2) {
					return timeZone;
				}
				if (n === 3) {
					return 'Unknown Location';
				}
				return gmtText(f.offset, true);
			case 'X':
				if (f.offset === 0) {
					return 'Z';
				}
				return offsetText(f.offset, n >= 3 && n !== 4, n === 1);
			default:
				// x
				return offsetText(f.offset, n === 3 || n === 5, n === 1);
		}
	}
}
