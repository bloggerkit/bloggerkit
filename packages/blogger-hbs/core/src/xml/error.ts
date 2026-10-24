import { type Location, withLocation } from '../plugins';
import type { XmlDiagnostic } from './check';

/**
 * The errors of a theme, to throw them: with one, its message is
 * `message (theme.xml:3:7)`, with more, a line for each.
 */
export class XmlError extends Error {
	/** Where the first error is. */
	readonly loc: Location;
	/** Every error, in the order of the theme. */
	readonly errors: readonly XmlDiagnostic[];

	constructor(errors: readonly XmlDiagnostic[]) {
		const placed = ({ message, loc }: XmlDiagnostic) =>
			withLocation(message, loc);
		super(
			errors.length === 1
				? placed(errors[0])
				: `${errors.length} errors:\n${errors.map((error) => `  ${placed(error)}`).join('\n')}`,
		);
		this.name = 'XmlError';
		this.loc = errors[0].loc;
		this.errors = errors;
	}
}
