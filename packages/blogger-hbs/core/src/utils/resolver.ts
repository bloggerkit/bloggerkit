import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';

export interface Extensions {
	index?: string[];
	file?: string[];
	resolve: string[];
}

export interface ResolveOptions {
	root: string;
	alias: Record<string, string>;
	extensions: Extensions;
}

export type ResolveFn = (
	importer: string,
	specifier: string,
) => Promise<string>;

export interface Resolver {
	resolve: ResolveFn;
	/**
	 * Forgets what was read: the entries of `directory` and every resolution,
	 * or everything without one. The next resolves read the file system again.
	 */
	clear(directory?: string): void;
}

export function createResolver({
	root,
	alias: aliasRecord,
	extensions,
}: ResolveOptions): Resolver {
	const require = createRequire(import.meta.url);
	const aliasEntries = normalizeAliases(aliasRecord);

	const indexExtensions = new Set(extensions.index);
	const fileExtensions = new Set(extensions.file);
	const allExtensions = new Set([
		...indexExtensions,
		...fileExtensions,
		...extensions.resolve,
	]);

	const fail = (specifier: string, importer: string) => {
		return new Error(
			`Failed to resolve '${specifier}' imported from ${importer}`,
		);
	};

	const files = createFileKinds();
	/** The resolutions, by the directory of the importer and the specifier. */
	const resolved = new Map<string, Promise<string>>();
	/** The real path of the root, for files in it reached through symlinks. */
	let realRoot: Promise<string> | undefined;

	/**
	 * The real path of a file, symlinks followed, as an import has it: one
	 * file is one module however it is reached. A file in the root keeps the
	 * root as it is given, so its id is the same when the root itself is
	 * reached through a symlink, as the temporary directory of macOS is.
	 */
	const toRealPath = async (file: string): Promise<string> => {
		realRoot ??= fs.realpath(root).catch(() => root);
		const [real, rootReal] = await Promise.all([fs.realpath(file), realRoot]);
		const relative = path.relative(rootReal, real);
		const outside =
			relative === '..' ||
			relative.startsWith(`..${path.sep}`) ||
			path.isAbsolute(relative);
		return outside ? real : path.join(root, relative);
	};

	/** The first of the candidates that is a file, in their order. */
	const findFirstExisting = async (candidates: string[]) => {
		for (const candidate of candidates) {
			if ((await files.kindOf(candidate)) === 'file') {
				return candidate;
			}
		}
	};

	const resolveUncached: ResolveFn = async (importer, specifier) => {
		if (
			specifier === '.' ||
			specifier.includes('\\') ||
			specifier.trim().length === 0
		) {
			throw fail(specifier, importer);
		}

		let targetPath: string | undefined;

		if (specifier.startsWith('./') || specifier.startsWith('../')) {
			targetPath = path.resolve(path.dirname(importer), specifier);
		} else if (specifier.startsWith('/')) {
			targetPath = path.resolve(root, `.${specifier}`);
		} else {
			for (const [alias, aliasTarget] of aliasEntries) {
				if (specifier === alias || specifier.startsWith(`${alias}/`)) {
					const suffix = specifier.slice(alias.length);
					targetPath = path.resolve(root, aliasTarget, `.${suffix}`);
					break;
				}
			}
			if (!targetPath) {
				let bareResolved: string;
				try {
					bareResolved = require.resolve(specifier, { paths: [root] });
				} catch {
					throw fail(specifier, importer);
				}
				if (!allExtensions.has(path.extname(bareResolved))) {
					throw fail(specifier, importer);
				}
				return bareResolved;
			}
		}

		const kind = await files.kindOf(targetPath);

		if (kind === 'file') {
			if (allExtensions.has(path.extname(targetPath))) {
				return targetPath;
			}
			throw fail(specifier, importer);
		}

		if (kind === 'directory') {
			const indexCandidates = [...indexExtensions].map((ext) =>
				path.join(targetPath, `index${ext}`),
			);
			const found = await findFirstExisting(indexCandidates);
			if (found) {
				return found;
			}
			throw fail(specifier, importer);
		}

		if (!/[\\/]$/.test(targetPath)) {
			const fileCandidates = [...fileExtensions].map(
				(ext) => `${targetPath}${ext}`,
			);
			const found = await findFirstExisting(fileCandidates);
			if (found) {
				return found;
			}
		}

		throw fail(specifier, importer);
	};

	return {
		resolve(importer, specifier) {
			const key = `${path.dirname(importer)}\0${specifier}`;
			let resolution = resolved.get(key);
			if (resolution === undefined) {
				resolution = resolveUncached(importer, specifier).then(toRealPath);
				resolved.set(key, resolution);
			}
			return resolution;
		},
		clear(directory) {
			resolved.clear();
			realRoot = undefined;
			files.clear(directory);
		},
	};
}

type FileKind = 'file' | 'directory' | undefined;

/**
 * What a path is, from the entries of its directory, each directory read
 * once: as an import does, the file system has the last word. An entry of
 * the same name says it, no entry in any case says there is nothing, on
 * any file system. Another case or a symlink is left to `stat`, so
 * `./Header` is `header.hbs` where the file system ignores case.
 */
function createFileKinds(): {
	kindOf(file: string): Promise<FileKind>;
	clear(directory?: string): void;
} {
	/** The entries of every directory read, by their name in lower case. */
	const directories = new Map<string, Promise<Map<string, Dirent[]>>>();
	// the file system may store a name in another normalization than it is written
	const keyOf = (name: string) => name.normalize('NFC').toLowerCase();

	const entriesOf = (directory: string): Promise<Map<string, Dirent[]>> => {
		let entries = directories.get(directory);
		if (entries === undefined) {
			entries = fs
				.readdir(directory, { withFileTypes: true })
				.then((list) => {
					const byName = new Map<string, Dirent[]>();
					for (const entry of list) {
						const key = keyOf(entry.name);
						byName.set(key, [...(byName.get(key) ?? []), entry]);
					}
					return byName;
				})
				.catch(() => new Map());
			directories.set(directory, entries);
		}
		return entries;
	};

	return {
		async kindOf(file) {
			const name = path.basename(file);
			const entries = (await entriesOf(path.dirname(file))).get(keyOf(name));
			if (entries === undefined) {
				return undefined;
			}
			const exact = entries.find((entry) => entry.name === name);
			if (exact !== undefined && !exact.isSymbolicLink()) {
				return exact.isFile()
					? 'file'
					: exact.isDirectory()
						? 'directory'
						: undefined;
			}
			const stats = await fs.stat(file).catch(() => undefined);
			return stats?.isFile()
				? 'file'
				: stats?.isDirectory()
					? 'directory'
					: undefined;
		},
		clear(directory) {
			if (directory === undefined) {
				directories.clear();
			} else {
				directories.delete(path.resolve(directory));
			}
		},
	};
}

function normalizeAliases(
	aliasRecord: Record<string, string>,
): [string, string][] {
	const aliasEntries = Object.entries(aliasRecord).sort(
		([a], [b]) => b.length - a.length,
	);
	for (const [alias, aliasTarget] of aliasEntries) {
		if (!isValidAlias(alias)) {
			throw new Error(`Alias "${alias}" is invalid`);
		}
		if (!aliasTarget.trim()) {
			throw new Error(`Alias "${alias}" has invalid target '${aliasTarget}'`);
		}
	}
	return aliasEntries;
}

const VALID_ALIAS_REGEX =
	/^(?:[@~#$](?:(?!\.{1,2}$)[\w.-]+)?|(?!\.{1,2}$)[\w.-]+)(?:\/(?!\.{1,2}(?:\/|$))[\w.-]+)*$/;
function isValidAlias(alias: string): boolean {
	return VALID_ALIAS_REGEX.test(alias);
}
