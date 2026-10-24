/**
 * The values of expressions, and the rules Blogger applies to them:
 * conversion when read, truthiness, equality, and numbers with decimal places.
 */

/**
 * A number. Its `text` is what Blogger prints and compares: a literal keeps how
 * it was written (`007`, `1.50`, `.5`), a computed number keeps its decimal
 * places (`.5 * 2` is `1.0`). `fromText` marks a number read from data that
 * was a string written like a number; it still has a `.length`.
 */
export class Decimal {
	constructor(
		/** The value is `mantissa / 10^scale`. */
		readonly mantissa: bigint,
		readonly scale: number,
		readonly text: string,
		readonly fromText = false,
	) {}

	/** A number written as text, `"007"`, `-1.50`; `undefined` when it is not one. */
	static parse(text: string, fromText = false): Decimal | undefined {
		if (!NUMBER_TEXT.test(text)) {
			return undefined;
		}
		const negative = text.startsWith('-');
		const digits = negative ? text.slice(1) : text;
		const [whole = '', fraction = ''] = digits.split('.');
		const mantissa = BigInt(`${whole || '0'}${fraction}`);
		return new Decimal(
			negative ? -mantissa : mantissa,
			fraction.length,
			text,
			fromText,
		);
	}

	/** A computed number, printed with its decimal places. */
	static of(mantissa: bigint, scale: number): Decimal {
		return new Decimal(mantissa, scale, decimalText(mantissa, scale));
	}

	static integer(n: number | bigint): Decimal {
		return Decimal.of(BigInt(n), 0);
	}

	/** A number given by JavaScript, `1.5`, `2026`. */
	static fromJs(n: number): Decimal | undefined {
		if (!Number.isFinite(n)) {
			return undefined;
		}
		return Decimal.parse(withoutExponent(String(n)));
	}

	/** The same value as a computed number: `007` becomes `7`. */
	computed(): Decimal {
		return Decimal.of(this.mantissa, this.scale);
	}

	isInteger(): boolean {
		return this.mantissa % 10n ** BigInt(this.scale) === 0n;
	}

	/** Rounded to an integer, halves away from zero: `1.5` is `2`, `0.4` is `0`. */
	roundHalfUp(): bigint {
		const factor = 10n ** BigInt(this.scale);
		const quotient = this.mantissa / factor;
		const remainder = this.mantissa % factor;
		const abs = remainder < 0n ? -remainder : remainder;
		if (abs * 2n >= factor) {
			return this.mantissa < 0n ? quotient - 1n : quotient + 1n;
		}
		return quotient;
	}

	valueOf(): number {
		return Number(this.text);
	}

	toString(): string {
		return this.text;
	}

	toJSON(): number {
		return Number(this.text);
	}
}

/** `1e+21` as `1000000000000000000000`, `1.5e-7` as `0.00000015`: the shortest digits JavaScript gives, without an exponent. */
function withoutExponent(text: string): string {
	const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(text);
	if (!match) {
		return text;
	}
	const [, sign, whole = '', fraction = '', exponent = '0'] = match;
	const digits = whole + fraction;
	const point = whole.length + Number(exponent);
	if (point <= 0) {
		return `${sign}0.${'0'.repeat(-point)}${digits}`;
	}
	if (point >= digits.length) {
		return `${sign}${digits}${'0'.repeat(point - digits.length)}`;
	}
	return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/** A number as the expression language writes it: an optional `-`, digits, and `.` and digits. */
const NUMBER_TEXT = /^-?(\d+(\.\d+)?|\.\d+)$/;

function decimalText(mantissa: bigint, scale: number): string {
	const negative = mantissa < 0n;
	let digits = (negative ? -mantissa : mantissa).toString();
	if (scale > 0) {
		digits = digits.padStart(scale + 1, '0');
		digits = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
	}
	return negative ? `-${digits}` : digits;
}

/**
 * A string or a list with properties of its own: a URL with `.canonical`, an
 * image with `.isResizable`. The `kind` gives it Blogger's properties: a `url`
 * has `.raw`, its text; the properties of an `image` are found in any case.
 */
export class RichValue {
	constructor(
		readonly value: Value,
		readonly properties: Readonly<Record<string, unknown>>,
		readonly kind?: 'url' | 'image',
	) {}
}

/**
 * A boolean read from text, `"yes"`, `"FALSE"`: it is `true` or `false`
 * everywhere, and keeps its `text` for `.length` and the escapes.
 */
export class TextBoolean {
	constructor(
		readonly value: boolean,
		readonly text: string,
	) {}
}

/** A map: the data, or a map written in the expression. */
export type ValueMap = Readonly<Record<string, unknown>>;

/**
 * A value: `undefined` is missing data. Lists and maps hold raw data, read
 * through `read`.
 */
export type Value =
	| undefined
	| boolean
	| Decimal
	| string
	| readonly unknown[]
	| ValueMap
	| Date
	| RichValue
	| TextBoolean;

/**
 * A value as Blogger reads it out of data, a list or a map: a string written
 * like a number becomes a number that keeps its text, `"true"`, `"false"`,
 * `"yes"`, `"no"` in any case become booleans; JavaScript numbers become
 * numbers; `null` is missing data.
 */
export function read(raw: unknown): Value {
	if (raw === null || raw === undefined) {
		return undefined;
	}
	if (typeof raw === 'string') {
		const number = Decimal.parse(raw, true);
		if (number) {
			return number;
		}
		if (BOOLEAN_WORD.test(raw)) {
			return new TextBoolean(TRUE_WORD.test(raw), raw);
		}
		return raw;
	}
	if (typeof raw === 'number') {
		return Decimal.fromJs(raw);
	}
	if (typeof raw === 'bigint') {
		return Decimal.integer(raw);
	}
	if (
		typeof raw === 'boolean' ||
		raw instanceof Decimal ||
		raw instanceof Date ||
		raw instanceof RichValue ||
		raw instanceof TextBoolean
	) {
		return raw;
	}
	if (Array.isArray(raw)) {
		return readList(raw);
	}
	if (typeof raw === 'object') {
		return raw as ValueMap;
	}
	return undefined;
}

/** A list read from data has its strings converted too: printed, `["9999", "x"]` is `[9999,"x"]`. */
function readList(list: readonly unknown[]): readonly unknown[] {
	return list.some((item) => typeof item === 'string')
		? list.map((item) => (typeof item === 'string' ? read(item) : item))
		: list;
}

const BOOLEAN_WORD = /^(true|false|yes|no)$/i;
const TRUE_WORD = /^(true|yes)$/i;

export function isBooleanWord(text: string): boolean {
	return BOOLEAN_WORD.test(text);
}

/** The value without its properties, and without the text of a boolean. */
export function plain(value: Value): Exclude<Value, RichValue | TextBoolean> {
	let v: Value = value;
	while (v instanceof RichValue) {
		v = v.value;
	}
	return v instanceof TextBoolean ? v.value : v;
}

/**
 * The text a value has for `.length` and the escapes: a string, the text a
 * number or a boolean was read from, a date as printed by `dateText`.
 * `undefined` for other values.
 */
export function textOf(
	value: Value,
	dateText: (date: Date) => string,
): string | undefined {
	let v: Value = value;
	while (v instanceof RichValue) {
		v = v.value;
	}
	if (typeof v === 'string') {
		return v;
	}
	if (v instanceof TextBoolean || (v instanceof Decimal && v.fromText)) {
		return v.text;
	}
	if (v instanceof Date) {
		return dateText(v);
	}
	return undefined;
}

export function isList(value: Value): value is readonly unknown[] {
	return Array.isArray(plain(value));
}

export function isMap(value: Value): value is ValueMap {
	const v = plain(value);
	return (
		typeof v === 'object' &&
		v !== null &&
		!Array.isArray(v) &&
		!(v instanceof Decimal) &&
		!(v instanceof Date)
	);
}

/** A name for the kind of a value, for messages: `a number`, `missing data`. */
export function kindOf(value: Value): string {
	const v = plain(value);
	if (v === undefined) {
		return 'missing data';
	}
	if (typeof v === 'boolean') {
		return 'a boolean';
	}
	if (typeof v === 'string') {
		return 'a string';
	}
	if (v instanceof Decimal) {
		return 'a number';
	}
	if (v instanceof Date) {
		return 'a date';
	}
	if (Array.isArray(v)) {
		return 'a list';
	}
	return 'a map';
}

/**
 * Whether `<b:if cond>` takes it as true. False are `false`, missing data, the
 * empty string, and the strings `"false"` and `"no"` in any case. Everything
 * else is true: `0`, `"0"`, an empty list, a map.
 */
export function isTruthy(value: Value): boolean {
	const v = plain(value);
	if (v === undefined) {
		return false;
	}
	if (typeof v === 'boolean') {
		return v;
	}
	if (typeof v === 'string') {
		return !(v === '' || /^(false|no)$/i.test(v));
	}
	return true;
}

/**
 * `==`: a string on either side compares both as printed (`5 == "5"`, missing
 * data equals `""`); numbers compare by their text (`007 == 7` is false);
 * lists and maps item by item, without turning items into text.
 */
export function looseEquals(
	a: Value,
	b: Value,
	text: (v: Value) => string,
): boolean {
	const x = plain(a);
	const y = plain(b);
	if (x === undefined && y === undefined) {
		return true;
	}
	const xText = typeof x === 'string' || x instanceof Date;
	const yText = typeof y === 'string' || y instanceof Date;
	if (xText || yText) {
		return text(x) === text(y);
	}
	if (x === undefined || y === undefined) {
		return false;
	}
	return strictEquals(x, y);
}

/** Equality of items of lists and values of maps: `[1, 2] == [1, "2"]` is false. */
export function strictEquals(a: unknown, b: unknown): boolean {
	const x = plain(read(a));
	const y = plain(read(b));
	if (x === undefined || y === undefined) {
		return x === y;
	}
	if (x instanceof Decimal && y instanceof Decimal) {
		return x.text === y.text;
	}
	if (x instanceof Date && y instanceof Date) {
		return x.getTime() === y.getTime();
	}
	if (Array.isArray(x) && Array.isArray(y)) {
		return (
			x.length === y.length && x.every((item, i) => strictEquals(item, y[i]))
		);
	}
	if (isMap(x) && isMap(y)) {
		const keys = Object.keys(x);
		return (
			keys.length === Object.keys(y).length &&
			keys.every((k) => Object.hasOwn(y, k) && strictEquals(x[k], y[k]))
		);
	}
	return x === y;
}

/** The number of a number, or of a string written like one: `"5"`, `"1.50"`, not `" 5"`. */
export function toNumber(value: Value): Decimal | undefined {
	const v = plain(value);
	if (v instanceof Decimal) {
		return v;
	}
	if (typeof v === 'string') {
		return Decimal.parse(v);
	}
	return undefined;
}

// ----- arithmetic -----

function align(a: Decimal, b: Decimal): [bigint, bigint, number] {
	const scale = Math.max(a.scale, b.scale);
	return [
		a.mantissa * 10n ** BigInt(scale - a.scale),
		b.mantissa * 10n ** BigInt(scale - b.scale),
		scale,
	];
}

export function add(a: Decimal, b: Decimal): Decimal {
	const [x, y, scale] = align(a, b);
	return Decimal.of(x + y, scale);
}

export function subtract(a: Decimal, b: Decimal): Decimal {
	const [x, y, scale] = align(a, b);
	return Decimal.of(x - y, scale);
}

/** The scale of a product is the sum of the scales: `2 * 0.10` is `0.20`. */
export function multiply(a: Decimal, b: Decimal): Decimal {
	return Decimal.of(a.mantissa * b.mantissa, a.scale + b.scale);
}

/**
 * An exact quotient is written in full, with at least the dividend's scale
 * minus the divisor's (`1.5 / 3` is `0.5`, `1 / 1024` is `0.0009765625`); one
 * that does not end is rounded half up to 4 places (`2 / 3` is `0.6667`).
 * `undefined` for a division by 0.
 */
export function divide(a: Decimal, b: Decimal): Decimal | undefined {
	if (b.mantissa === 0n) {
		return undefined;
	}
	let num = a.mantissa * 10n ** BigInt(b.scale);
	let den = b.mantissa * 10n ** BigInt(a.scale);
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	const g = gcd(num < 0n ? -num : num, den);
	num /= g;
	den /= g;
	let rest = den;
	let twos = 0;
	let fives = 0;
	while (rest % 2n === 0n) {
		rest /= 2n;
		twos++;
	}
	while (rest % 5n === 0n) {
		rest /= 5n;
		fives++;
	}
	if (rest === 1n) {
		const scale = Math.max(twos, fives, a.scale - b.scale, 0);
		return Decimal.of((num * 10n ** BigInt(scale)) / den, scale);
	}
	const scaled = num * 10_000n;
	let q = scaled / den;
	const r = scaled % den;
	if ((r < 0n ? -r : r) * 2n >= den) {
		q += scaled < 0n ? -1n : 1n;
	}
	return Decimal.of(q, 4);
}

/** The remainder takes the sign of the dividend: `-7 % 3` is `-1`. `undefined` for 0. */
export function remainder(a: Decimal, b: Decimal): Decimal | undefined {
	if (b.mantissa === 0n) {
		return undefined;
	}
	const [x, y, scale] = align(a, b);
	return Decimal.of(x % y, scale);
}

/** Compares values, whatever their decimal places: `1.0 <= 1.00`. */
export function compare(a: Decimal, b: Decimal): number {
	const [x, y] = align(a, b);
	return x < y ? -1 : x > y ? 1 : 0;
}

function gcd(a: bigint, b: bigint): bigint {
	let [x, y] = [a, b];
	while (y !== 0n) {
		[x, y] = [y, x % y];
	}
	return x === 0n ? 1n : x;
}
