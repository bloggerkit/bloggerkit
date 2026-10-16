import type { HelperOptions } from 'handlebars/runtime';
import { describeValue } from '../../utils/suggest';

/** The arguments of a helper, without the options Handlebars gives last. */
export function argumentsOf(args: readonly unknown[]): unknown[] {
	return args.slice(0, -1);
}

/** The options Handlebars gives a helper, its last argument. */
export function optionsOf(args: readonly unknown[]): HelperOptions {
	return args.at(-1) as HelperOptions;
}

/** Throws unless there are `count` arguments, or `min` to `max`. */
export function expectCount(
	args: readonly unknown[],
	min: number,
	max = min,
): void {
	if (args.length >= min && args.length <= max) {
		return;
	}
	throw new TypeError(
		`Expected ${describeCount(min, max)}, but got ${args.length}`,
	);
}

/** `no arguments`, `exactly 2 arguments`, `1 or 2 arguments`, ... */
function describeCount(min: number, max: number): string {
	if (max === 0) {
		return 'no arguments';
	}
	if (min === max) {
		return `exactly ${plural(min)}`;
	}
	if (max === Number.POSITIVE_INFINITY) {
		return `at least ${plural(min)}`;
	}
	return max === min + 1
		? `${min} or ${plural(max)}`
		: `${min} to ${plural(max)}`;
}

function plural(count: number): string {
	return `${count} argument${count === 1 ? '' : 's'}`;
}

/** Throws unless argument `index` (0-based) is a string. */
export function expectString(args: readonly unknown[], index: number): string {
	const value = args[index];
	if (typeof value !== 'string') {
		throw invalidArgument(index, 'a string', value);
	}
	return value;
}

/** Throws unless argument `index` (0-based) is a finite number. */
export function expectNumber(args: readonly unknown[], index: number): number {
	const value = args[index];
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw invalidArgument(index, 'a number', value);
	}
	return value;
}

/** Throws unless argument `index` (0-based) is an integer. */
export function expectInteger(args: readonly unknown[], index: number): number {
	const value = args[index];
	if (!Number.isInteger(value)) {
		throw invalidArgument(index, 'an integer', value);
	}
	return value as number;
}

/** Throws unless argument `index` (0-based) is an array or a string. */
export function expectList(
	args: readonly unknown[],
	index: number,
): unknown[] | string {
	const value = args[index];
	if (!Array.isArray(value) && typeof value !== 'string') {
		throw invalidArgument(index, 'an array or a string', value);
	}
	return value;
}

/** Throws unless argument `index` (0-based) is an array. */
export function expectArray(
	args: readonly unknown[],
	index: number,
): unknown[] {
	const value = args[index];
	if (!Array.isArray(value)) {
		throw invalidArgument(index, 'an array', value);
	}
	return value;
}

/** Throws unless argument `index` (0-based) is an object, an array is not. */
export function expectObject(
	args: readonly unknown[],
	index: number,
): Record<string, unknown> {
	const value = args[index];
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw invalidArgument(index, 'an object', value);
	}
	return value as Record<string, unknown>;
}

/** `Expected argument 2 to be a string, got: 5` */
export function invalidArgument(
	index: number,
	expected: string,
	value: unknown,
): TypeError {
	return new TypeError(
		`Expected argument ${index + 1} to be ${expected}, got: ${describeValue(value)}`,
	);
}

/** Truthy as `{{#if}}` sees it: an empty array is not. */
export function isTruthy(value: unknown): boolean {
	return Boolean(value) && !(Array.isArray(value) && value.length === 0);
}
