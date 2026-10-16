import type { HelperOptions } from 'handlebars/runtime';
import type { SourceLocation } from '../../compiler/ast';
import { type Location, withLocation } from '../../plugins';

export interface HelperErrorOptions extends ErrorOptions {
	options?: HelperOptions & { name?: string; loc?: SourceLocation };
}

/**
 * An error of a helper, the message says which one and where it is used:
 * `Helper 'eq': Expected exactly 2 arguments, but got 1 (./index.hbs:2:6)`.
 * Without a message it only wraps its `cause`: `Helper 'x' failed (...)`.
 * Anything else a helper throws is one with its message, the error as cause.
 */
export class HelperError extends Error {
	helper?: string;
	/** Where the helper is used, when Handlebars tells it. */
	loc?: Location;

	constructor(message?: string, { options, ...rest }: HelperErrorOptions = {}) {
		const helper = options?.name || undefined;
		const start = options?.loc?.start;
		const loc: Location | undefined =
			options?.loc?.source && start
				? {
						path: options.loc.source,
						line: start.line,
						// Handlebars counts columns from 0
						column: start.column + 1,
					}
				: undefined;

		const subject = helper ? `Helper '${helper}'` : 'A helper';
		const text =
			message === undefined || message === ''
				? `${subject} failed`
				: helper
					? `${subject}: ${message}`
					: message;

		super(withLocation(text, loc), rest);
		this.name = 'HelperError';
		if (helper) {
			this.helper = helper;
		}
		if (loc) {
			this.loc = loc;
		}
	}
}
