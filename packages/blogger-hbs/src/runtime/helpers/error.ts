import type { HelperOptions } from 'handlebars/runtime';
import type { SourceLocation } from '../../compiler/ast';

export interface HelperErrorOptions extends ErrorOptions {
	options?: HelperOptions & { name?: string; loc?: SourceLocation };
}

export class HelperError extends Error {
	helper?: string;
	file?: string;
	start?: [number, number];
	end?: [number, number];

	constructor(message: string, { options, ...rest }: HelperErrorOptions = {}) {
		super(message, rest);
		this.name = 'HelperError';

		if (options?.name) {
			this.helper = options.name;
		}

		const loc = options?.loc;
		if (loc?.start) {
			this.file = loc.source;
			this.start = [loc.start.line, loc.start.column];
			this.end = [loc.end.line, loc.end.column];
		}
	}
}
