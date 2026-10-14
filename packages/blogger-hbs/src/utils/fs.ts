import * as fs from 'node:fs/promises';

/**
 * Checks whether a file or directory exists.
 *
 * @param path - The path to check.
 * @returns `true` if the path exists, otherwise `false`.
 */
export function fsExists(path: string): Promise<boolean> {
	return fs.access(path, fs.constants.F_OK).then(
		() => true,
		() => false,
	);
}
