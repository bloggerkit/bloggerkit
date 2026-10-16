import {
	argumentsOf,
	expectArray,
	expectCount,
	expectInteger,
	expectList,
	expectNumber,
	expectObject,
	expectString,
	invalidArgument,
	isTruthy,
	optionsOf,
} from './args';

/** The most items `range` and `repeat` make, a typo does not hang a render. */
const MAX_ITEMS = 10_000;

// comparison

export function eq(...input: unknown[]): boolean {
	const args = argumentsOf(input);
	expectCount(args, 2);
	return args[0] === args[1];
}

export function ne(...input: unknown[]): boolean {
	const args = argumentsOf(input);
	expectCount(args, 2);
	return args[0] !== args[1];
}

export function eqw(...input: unknown[]): boolean {
	const args = argumentsOf(input);
	expectCount(args, 2);
	// biome-ignore lint/suspicious/noDoubleEquals: the loose counterpart of `eq`
	return args[0] == args[1];
}

/** The loose counterpart of `ne`, as `eqw` is of `eq`. */
function neWeak(...input: unknown[]): boolean {
	const args = argumentsOf(input);
	expectCount(args, 2);
	// biome-ignore lint/suspicious/noDoubleEquals: the loose counterpart of `ne`
	return args[0] != args[1];
}

export { neWeak as new };

export function lt(...input: unknown[]): boolean {
	const args = argumentsOf(input);
	expectCount(args, 2);
	// compares like `<` does, numbers and strings alike
	return (args[0] as number) < (args[1] as number);
}

export function lte(...input: unknown[]): boolean {
	const args = argumentsOf(input);
	expectCount(args, 2);
	return (args[0] as number) <= (args[1] as number);
}

export function gt(...input: unknown[]): boolean {
	const args = argumentsOf(input);
	expectCount(args, 2);
	// compares like `>` does, numbers and strings alike
	return (args[0] as number) > (args[1] as number);
}

export function gte(...input: unknown[]): boolean {
	const args = argumentsOf(input);
	expectCount(args, 2);
	return (args[0] as number) >= (args[1] as number);
}

// logic, truthy as `{{#if}}` sees it

/** The first value that is not truthy, or the last one, as `&&`. */
export function and(...input: unknown[]): unknown {
	const args = argumentsOf(input);
	expectCount(args, 2, Number.POSITIVE_INFINITY);
	return args.find((value) => !isTruthy(value)) ?? args.at(-1);
}

/** The first value that is truthy, or the last one, as `||`. */
export function or(...input: unknown[]): unknown {
	const args = argumentsOf(input);
	expectCount(args, 2, Number.POSITIVE_INFINITY);
	return args.find(isTruthy) ?? args.at(-1);
}

export function not(...input: unknown[]): boolean {
	const args = argumentsOf(input);
	expectCount(args, 1);
	return !isTruthy(args[0]);
}

/** The first value that is not `null`, `undefined` or `''`, or the last one. */
function defaultValue(...input: unknown[]): unknown {
	const args = argumentsOf(input);
	expectCount(args, 2, Number.POSITIVE_INFINITY);
	return (
		args.find(
			(value) => value !== null && value !== undefined && value !== '',
		) ?? args.at(-1)
	);
}

export { defaultValue as default };

/** `yes` when `condition` is truthy, `no` otherwise, `''` by default. */
export function iif(...input: unknown[]): unknown {
	const args = argumentsOf(input);
	expectCount(args, 2, 3);
	return isTruthy(args[0]) ? args[1] : (args[2] ?? '');
}

// strings

/** Strings and numbers joined, `{{concat "page-" number}}`. */
export function concat(...input: unknown[]): string {
	const args = argumentsOf(input);
	expectCount(args, 1, Number.POSITIVE_INFINITY);
	return args
		.map((value, i) =>
			typeof value === 'number' ? String(value) : expectString(args, i),
		)
		.join('');
}

export function lower(...input: unknown[]): string {
	const args = argumentsOf(input);
	expectCount(args, 1);
	return expectString(args, 0).toLowerCase();
}

export function upper(...input: unknown[]): string {
	const args = argumentsOf(input);
	expectCount(args, 1);
	return expectString(args, 0).toUpperCase();
}

export function trim(...input: unknown[]): string {
	const args = argumentsOf(input);
	expectCount(args, 1);
	return expectString(args, 0).trim();
}

/** The first `search` replaced, `{{replace title "-" " "}}`. */
export function replace(...input: unknown[]): string {
	const args = argumentsOf(input);
	expectCount(args, 3);
	// a function, `$&` and the like are not special in the replacement
	const replacement = expectString(args, 2);
	return expectString(args, 0).replace(
		expectString(args, 1),
		() => replacement,
	);
}

/** Every `search` replaced, `{{replaceAll title "-" " "}}`. */
export function replaceAll(...input: unknown[]): string {
	const args = argumentsOf(input);
	expectCount(args, 3);
	const replacement = expectString(args, 2);
	return expectString(args, 0).replaceAll(
		expectString(args, 1),
		() => replacement,
	);
}

export function startsWith(...input: unknown[]): boolean {
	const args = argumentsOf(input);
	expectCount(args, 2);
	return expectString(args, 0).startsWith(expectString(args, 1));
}

export function endsWith(...input: unknown[]): boolean {
	const args = argumentsOf(input);
	expectCount(args, 2);
	return expectString(args, 0).endsWith(expectString(args, 1));
}

export function split(...input: unknown[]): string[] {
	const args = argumentsOf(input);
	expectCount(args, 2);
	return expectString(args, 0).split(expectString(args, 1));
}

/**
 * At most `length` characters, the end replaced by `suffix` (`…` by default)
 * when it is cut, `{{truncate title 60}}`.
 */
export function truncate(...input: unknown[]): string {
	const args = argumentsOf(input);
	expectCount(args, 2, 3);
	const text = expectString(args, 0);
	const length = expectInteger(args, 1);
	const suffix = args.length > 2 ? expectString(args, 2) : '…';
	if (length < 0) {
		throw new RangeError(`Expected argument 2 to be 0 or more, got: ${length}`);
	}
	const characters = [...text];
	if (characters.length <= length) {
		return text;
	}
	const kept = Math.max(0, length - [...suffix].length);
	return `${characters.slice(0, kept).join('').trimEnd()}${suffix}`;
}

/** `{{padStart 7 3 "0"}}` is `007`, the fill is a space by default. */
export function padStart(...input: unknown[]): string {
	const [text, length, fill] = padding(argumentsOf(input));
	return text.padStart(length, fill);
}

export function padEnd(...input: unknown[]): string {
	const [text, length, fill] = padding(argumentsOf(input));
	return text.padEnd(length, fill);
}

/** The text, a number as a string, the length and the fill of a padding. */
function padding(args: unknown[]): [string, number, string] {
	expectCount(args, 2, 3);
	const value = args[0];
	if (typeof value !== 'string' && typeof value !== 'number') {
		throw invalidArgument(0, 'a string or a number', value);
	}
	const length = expectInteger(args, 1);
	const fill = args.length > 2 ? expectString(args, 2) : ' ';
	if (fill === '') {
		throw new RangeError('Expected argument 3 to not be empty');
	}
	return [String(value), length, fill];
}

export function repeat(...input: unknown[]): string {
	const args = argumentsOf(input);
	expectCount(args, 2);
	const text = expectString(args, 0);
	const count = expectInteger(args, 1);
	if (count < 0 || count > MAX_ITEMS) {
		throw new RangeError(
			`Expected argument 2 to be 0 to ${MAX_ITEMS}, got: ${count}`,
		);
	}
	return text.repeat(count);
}

/** The first character in upper case, the others as they are. */
export function capitalize(...input: unknown[]): string {
	const args = argumentsOf(input);
	expectCount(args, 1);
	const [initial = '', ...rest] = expectString(args, 0);
	return `${initial.toUpperCase()}${rest.join('')}`;
}

/**
 * Letters and digits, of any script, in lower case and joined with `-`,
 * accents taken off: `{{slugify "Héllo, World!"}}` is `hello-world`.
 */
export function slugify(...input: unknown[]): string {
	const args = argumentsOf(input);
	expectCount(args, 1);
	return expectString(args, 0)
		.normalize('NFKD')
		.replace(/\p{Mark}/gu, '')
		.toLowerCase()
		.replace(/[^\p{Letter}\p{Number}]+/gu, '-')
		.replace(/^-+|-+$/g, '');
}

export function encodeUri(...input: unknown[]): string {
	const args = argumentsOf(input);
	expectCount(args, 1);
	return encodeURI(expectString(args, 0));
}

/** For a part of a URL: `?text={{encodeUriComponent title}}`. */
export function encodeUriComponent(...input: unknown[]): string {
	const args = argumentsOf(input);
	expectCount(args, 1);
	return encodeURIComponent(expectString(args, 0));
}

// numbers

export function add(...input: unknown[]): number {
	const args = argumentsOf(input);
	expectCount(args, 2);
	return expectNumber(args, 0) + expectNumber(args, 1);
}

export function sub(...input: unknown[]): number {
	const args = argumentsOf(input);
	expectCount(args, 2);
	return expectNumber(args, 0) - expectNumber(args, 1);
}

export function mul(...input: unknown[]): number {
	const args = argumentsOf(input);
	expectCount(args, 2);
	return expectNumber(args, 0) * expectNumber(args, 1);
}

export function div(...input: unknown[]): number {
	const args = argumentsOf(input);
	expectCount(args, 2);
	const divisor = expectNumber(args, 1);
	if (divisor === 0) {
		throw new RangeError('Division by zero');
	}
	return expectNumber(args, 0) / divisor;
}

/** The remainder, its sign the one of the first number, as `%`. */
export function mod(...input: unknown[]): number {
	const args = argumentsOf(input);
	expectCount(args, 2);
	const divisor = expectNumber(args, 1);
	if (divisor === 0) {
		throw new RangeError('Division by zero');
	}
	return expectNumber(args, 0) % divisor;
}

export function min(...input: unknown[]): number {
	const args = argumentsOf(input);
	expectCount(args, 1, Number.POSITIVE_INFINITY);
	return Math.min(...args.map((_, i) => expectNumber(args, i)));
}

export function max(...input: unknown[]): number {
	const args = argumentsOf(input);
	expectCount(args, 1, Number.POSITIVE_INFINITY);
	return Math.max(...args.map((_, i) => expectNumber(args, i)));
}

/** Rounded to `digits` decimals, none by default, `{{round rating 1}}`. */
export function round(...input: unknown[]): number {
	const args = argumentsOf(input);
	expectCount(args, 1, 2);
	const value = expectNumber(args, 0);
	const digits = args.length > 1 ? expectInteger(args, 1) : 0;
	if (digits < 0 || digits > 15) {
		throw new RangeError(`Expected argument 2 to be 0 to 15, got: ${digits}`);
	}
	// through the decimal text, `1.005` is not `1.00499...`
	return Number(`${Math.round(Number(`${value}e${digits}`))}e-${digits}`);
}

export function floor(...input: unknown[]): number {
	const args = argumentsOf(input);
	expectCount(args, 1);
	return Math.floor(expectNumber(args, 0));
}

export function ceil(...input: unknown[]): number {
	const args = argumentsOf(input);
	expectCount(args, 1);
	return Math.ceil(expectNumber(args, 0));
}

export function abs(...input: unknown[]): number {
	const args = argumentsOf(input);
	expectCount(args, 1);
	return Math.abs(expectNumber(args, 0));
}

/** The number, within `min` and `max`, `{{clamp rating 0 5}}`. */
export function clamp(...input: unknown[]): number {
	const args = argumentsOf(input);
	expectCount(args, 3);
	const value = expectNumber(args, 0);
	const low = expectNumber(args, 1);
	const high = expectNumber(args, 2);
	if (low > high) {
		throw new RangeError(
			`Expected argument 2 to be at most argument 3, got: ${low} and ${high}`,
		);
	}
	return Math.min(Math.max(value, low), high);
}

// collections

/** Characters of a string, items of an array, keys of an object. */
export function length(...input: unknown[]): number {
	const args = argumentsOf(input);
	expectCount(args, 1);
	const value = args[0];
	if (typeof value === 'string') {
		return [...value].length;
	}
	if (Array.isArray(value)) {
		return value.length;
	}
	return Object.keys(expectObject(args, 0)).length;
}

/** Whether the array has the item, or the string the text. */
export function includes(...input: unknown[]): boolean {
	const args = argumentsOf(input);
	expectCount(args, 2);
	const list = expectList(args, 0);
	return typeof list === 'string'
		? list.includes(expectString(args, 1))
		: list.includes(args[1]);
}

export function first(...input: unknown[]): unknown {
	const args = argumentsOf(input);
	expectCount(args, 1);
	const list = expectList(args, 0);
	return typeof list === 'string' ? [...list][0] : list[0];
}

export function last(...input: unknown[]): unknown {
	const args = argumentsOf(input);
	expectCount(args, 1);
	const list = expectList(args, 0);
	return typeof list === 'string' ? [...list].at(-1) : list.at(-1);
}

/** Items, or characters, from `start` to before `end`, `{{#each (slice posts 0 3)}}`. */
export function slice(...input: unknown[]): unknown[] | string {
	const args = argumentsOf(input);
	expectCount(args, 2, 3);
	const list = expectList(args, 0);
	const start = expectInteger(args, 1);
	const end = args.length > 2 ? expectInteger(args, 2) : undefined;
	return typeof list === 'string'
		? [...list].slice(start, end).join('')
		: list.slice(start, end);
}

/** Items joined with `separator`, `, ` by default. */
export function join(...input: unknown[]): string {
	const args = argumentsOf(input);
	expectCount(args, 1, 2);
	const items = expectArray(args, 0);
	const separator = args.length > 1 ? expectString(args, 1) : ', ';
	return items.join(separator);
}

export function keys(...input: unknown[]): string[] {
	const args = argumentsOf(input);
	expectCount(args, 1);
	return Object.keys(expectObject(args, 0));
}

export function values(...input: unknown[]): unknown[] {
	const args = argumentsOf(input);
	expectCount(args, 1);
	return Object.values(expectObject(args, 0));
}

/** An array of the arguments, `(array 1 2 3)`. */
export function array(...input: unknown[]): unknown[] {
	return argumentsOf(input);
}

/** An object of the hash, `(hash a=1 b=2)`. */
export function hash(...input: unknown[]): Record<string, unknown> {
	const options = optionsOf(input);
	expectCount(argumentsOf(input), 0);
	return options.hash;
}

export { hash as object };

/**
 * Integers from `start` to `end`, both included, `{{#each (range 1 5)}}`.
 * The step is 1, or -1 when `end` is before `start`.
 */
export function range(...input: unknown[]): number[] {
	const args = argumentsOf(input);
	expectCount(args, 2, 3);
	const start = expectInteger(args, 0);
	const end = expectInteger(args, 1);
	const step = args.length > 2 ? expectInteger(args, 2) : end < start ? -1 : 1;
	if (step === 0 || Math.sign(end - start) * step < 0) {
		throw new RangeError(
			`Expected argument 3 to go from ${start} to ${end}, got: ${step}`,
		);
	}
	const count = Math.floor((end - start) / step) + 1;
	if (count > MAX_ITEMS) {
		throw new RangeError(
			`Expected at most ${MAX_ITEMS} items, the range has ${count}`,
		);
	}
	return Array.from({ length: count }, (_, i) => start + i * step);
}

/** Items, or characters, in the other order, the array is not changed. */
export function reverse(...input: unknown[]): unknown[] | string {
	const args = argumentsOf(input);
	expectCount(args, 1);
	const list = expectList(args, 0);
	return typeof list === 'string'
		? [...list].reverse().join('')
		: [...list].reverse();
}

/** Items once each, in their first place. */
export function unique(...input: unknown[]): unknown[] {
	const args = argumentsOf(input);
	expectCount(args, 1);
	return [...new Set(expectArray(args, 0))];
}

/** `{ key, value }` of every key: `{{#each (entries links)}}{{key}}{{/each}}`. */
export function entries(
	...input: unknown[]
): { key: string; value: unknown }[] {
	const args = argumentsOf(input);
	expectCount(args, 1);
	return Object.entries(expectObject(args, 0)).map(([key, value]) => ({
		key,
		value,
	}));
}

// values

export type TypeOf =
	| 'string'
	| 'number'
	| 'bigint'
	| 'boolean'
	| 'symbol'
	| 'undefined'
	| 'object'
	| 'function';

export function typeOf(...input: unknown[]): TypeOf {
	const args = argumentsOf(input);
	expectCount(args, 1);
	return typeof args[0];
}

/** The value as JSON, indented with `space` when it is given. */
export function toJson(...input: unknown[]): string {
	const args = argumentsOf(input);
	expectCount(args, 1, 2);
	const space = args[1] ?? 0;
	if (typeof space !== 'string' && typeof space !== 'number') {
		throw invalidArgument(1, 'a string or a number', space);
	}
	try {
		return JSON.stringify(args[0], null, space);
	} catch (error) {
		throw new TypeError('Failed to serialize to JSON', { cause: error });
	}
}

export function fromJson(...input: unknown[]): unknown {
	const args = argumentsOf(input);
	expectCount(args, 1);
	const text = expectString(args, 0);
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new SyntaxError('Failed to parse JSON', { cause: error });
	}
}
