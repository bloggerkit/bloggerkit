import type { Location } from '../plugins';

export interface CompileErrorOptions extends ErrorOptions {
	loc?: Location;
}

/** An error in the templates or the options, `message (./index.hbs:2:3)`. */
export class CompileError extends Error {
	/** Where the error is, when it is in a template. */
	loc?: Location;

	constructor(message: string, options?: CompileErrorOptions) {
		super(message, options);
		this.name = 'CompileError';
		if (options?.loc) {
			this.loc = options.loc;
		}
	}
}
