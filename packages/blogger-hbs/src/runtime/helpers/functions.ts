import type { HelperOptions } from 'handlebars/runtime';
import { HelperError } from './error';

export type TypeOf =
	| 'string'
	| 'number'
	| 'bigint'
	| 'boolean'
	| 'symbol'
	| 'undefined'
	| 'object'
	| 'function';

export function typeOf(...args: unknown[]): TypeOf {
	const options = args.pop() as HelperOptions;

	if (args.length !== 1) {
		throw new HelperError(
			`Expected exactly 1 argument, but got ${args.length}`,
			{ options },
		);
	}

	const [input] = args;

	return typeof input;
}

export function eq(...args: unknown[]): boolean {
	const options = args.pop() as HelperOptions;

	if (args.length !== 2) {
		throw new HelperError(
			`Expected exactly 2 arguments, but got ${args.length}`,
			{ options },
		);
	}

	const [a, b] = args;

	return a === b;
}

export function eqw(...args: unknown[]): boolean {
	const options = args.pop() as HelperOptions;

	if (args.length !== 2) {
		throw new HelperError(
			`Expected exactly 2 arguments, but got ${args.length}`,
			{ options },
		);
	}

	const [a, b] = args;

	// biome-ignore lint/suspicious/noDoubleEquals: the loose counterpart of `eq`
	return a == b;
}

export function lt(...args: unknown[]): boolean {
	const options = args.pop() as HelperOptions;

	if (args.length !== 2) {
		throw new HelperError(
			`Expected exactly 2 arguments, but got ${args.length}`,
			{ options },
		);
	}

	const [a, b] = args;

	// compares like `<` does, numbers and strings alike
	return (a as number) < (b as number);
}

export function fromJson(...args: unknown[]): unknown {
	const options = args.pop() as HelperOptions;
	const input = args[0];

	if (typeof input !== 'string') {
		throw new HelperError(
			`Expected input to be a string, got: ${typeof input}`,
			{ options },
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(input);
	} catch (error) {
		throw new HelperError('Failed to parse json', {
			options,
			cause: error,
		});
	}

	return parsed;
}

export function toJson(...args: unknown[]): string {
	const options = args.pop() as HelperOptions;

	if (args.length === 0) {
		throw new HelperError('Argument 1 is required', { options });
	}

	const input = args[0];
	let space: string | number = 0;

	if (args.length > 1) {
		if (typeof args[1] !== 'string' && typeof args[1] !== 'number') {
			throw new HelperError(
				`Expected argument 2 to be a string or number, got: ${typeof args[1]}`,
			);
		}
		space = args[1];
	}

	let stringified: string;
	try {
		stringified = JSON.stringify(input, null, space);
	} catch (error) {
		throw new HelperError('Failed to serialize to json', {
			options,
			cause: error,
		});
	}

	return stringified;
}

export function hash(...args: unknown[]): Record<string, unknown> {
	const options = args.pop() as HelperOptions;

	if (args.length > 0) {
		throw new HelperError(`Expected no arguments, but got ${args.length}`, {
			options,
		});
	}

	return options.hash;
}

export { hash as object };

export function array(...args: unknown[]): unknown[] {
	args.pop();

	return args;
}
