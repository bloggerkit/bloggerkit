import * as z from 'zod';
import { describeValue, didYouMean, isPlainObject } from './suggest';

/**
 * Helpers to write option schemas with zod whose errors read as the others:
 * `Invalid option 'output.dir', expected a path, got: 5` and
 * `Unknown option 'entri', did you mean 'entry'? Valid options: ...`.
 */

/** The `error` of a schema: `expected <what>, got: <value>`. */
export function expected(what: string): {
	error: (issue: { input?: unknown }) => string;
} {
	return {
		error: (issue) => `expected ${what}, got: ${describeValue(issue.input)}`,
	};
}

/** A non-empty string. */
export function path(what = 'a path') {
	return z.string(expected(what)).min(1, expected(what));
}

/** Any function, it is not called. */
export function fn(what = 'a function') {
	return z.custom<(...args: never[]) => unknown>(
		(value) => typeof value === 'function',
		expected(what),
	);
}

/** Marks a message as a whole sentence, without `Invalid option '...',` before it. */
const WHOLE = '\0';

/** An issue with a message of its own, see `WHOLE`. */
export function wholeIssue(message: string): string {
	return `${WHOLE}${message}`;
}

/**
 * An object of options, unknown ones are reported with the closest known
 * name. `prefix` is put before the names, `output.` for `output.dir`.
 */
export function options<Shape extends z.ZodRawShape>(
	shape: Shape,
	{ prefix = '', what = 'an object' }: { prefix?: string; what?: string } = {},
) {
	const known = Object.keys(shape).map((key) => `${prefix}${key}`);

	return z.strictObject(shape, {
		error: (issue) => {
			if (issue.code === 'unrecognized_keys') {
				const key = `${prefix}${issue.keys[0]}`;
				const hint = didYouMean(key, known);
				return wholeIssue(
					`Unknown option '${key}'${hint}${hint ? ' Valid' : ', valid'} options: ${known.join(', ')}`,
				);
			}
			return expected(what).error(issue);
		},
	});
}

/**
 * A JSON value: what is serialized and parsed again is the same. The issue is
 * at the value that is not, `options.list[1]`, which a union of zod schemas
 * can not tell.
 */
export const json = z.unknown().check((ctx) => {
	const problem = findNonJson(ctx.value);
	if (problem) {
		ctx.issues.push({
			code: 'custom',
			path: problem.path,
			input: problem.value,
			message: expected('a JSON value').error({ input: problem.value }),
		});
	}
});

/** `parents` are the objects the value is in, to find cycles. */
function findNonJson(
	value: unknown,
	path: PropertyKey[] = [],
	parents: unknown[] = [],
): { path: PropertyKey[]; value: unknown } | undefined {
	if (
		value === null ||
		value === undefined ||
		typeof value === 'string' ||
		typeof value === 'boolean'
	) {
		return;
	}
	if (typeof value === 'number') {
		// `NaN` and `Infinity` would be `null`
		return Number.isFinite(value) ? undefined : { path, value };
	}
	if (
		typeof value !== 'object' ||
		parents.includes(value) ||
		!(Array.isArray(value) || isPlainObject(value))
	) {
		return { path, value };
	}

	const inside = [...parents, value];
	const items: [PropertyKey, unknown][] = Array.isArray(value)
		? value.map((item, i) => [i, item])
		: Object.entries(value);

	for (const [key, item] of items) {
		// `undefined` is dropped from objects but becomes `null` in arrays
		const problem =
			Array.isArray(value) && item === undefined
				? { path: [...path, key], value: item }
				: findNonJson(item, [...path, key], inside);
		if (problem) {
			return problem;
		}
	}
}

export interface FormatOptions {
	/**
	 * Describes the issues of a part of the options in its own words, for
	 * example `Invalid 'provide' of plugin 'p'` for those of a plugin. Gets the
	 * path of the issue and returns the subject and the rest of the path.
	 */
	scope?: (
		path: readonly PropertyKey[],
	) => { subject: string; rest: readonly PropertyKey[] } | undefined;
	/** Keys of records, written `alias['~']` rather than `alias.~`. */
	records?: readonly string[];
}

/**
 * The message of the most relevant issue: an unknown option first, as it is
 * often what makes the others.
 */
export function formatIssues(
	error: z.ZodError,
	{ scope, records = [] }: FormatOptions = {},
): string {
	const issue =
		error.issues.find(({ code }) => code === 'unrecognized_keys') ??
		error.issues[0];
	const { message } = issue;

	if (message.startsWith(WHOLE)) {
		return message.slice(WHOLE.length);
	}

	const scoped = scope?.(issue.path);
	if (scoped && scoped.rest.length > 0) {
		return `Invalid '${formatPath(scoped.rest, records)}' of ${scoped.subject}, ${message}`;
	}
	if (issue.path.length === 0) {
		return `Expected the options to be ${message.replace(/^expected /, '')}`;
	}
	return `Invalid option '${formatPath(issue.path, records)}', ${message}`;
}

/** `plugins[0].runtime.entry`, `alias['~']` */
export function formatPath(
	path: readonly PropertyKey[],
	records: readonly string[] = [],
): string {
	let result = '';
	for (const [i, key] of path.entries()) {
		if (typeof key === 'number') {
			result += `[${key}]`;
		} else if (i > 0 && records.includes(String(path[i - 1]))) {
			result += `['${String(key)}']`;
		} else {
			result += i === 0 ? String(key) : `.${String(key)}`;
		}
	}
	return result;
}
