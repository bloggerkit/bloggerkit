import * as path from 'node:path';
import normalizePath from 'normalize-path';

/**
 * Converts a filesystem path into a relative module specifier.
 *
 * @param from - The base directory.
 * @param to - The target path.
 * @returns A normalized relative module specifier.
 */
export function toSpecifier(from: string, to: string): string {
	const normalized = normalizePath(path.relative(from, to));

	if (normalized === '') {
		return '.';
	}

	return normalized.startsWith('./') ||
		normalized.startsWith('../') ||
		normalized.startsWith('/')
		? normalized
		: `./${normalized}`;
}
