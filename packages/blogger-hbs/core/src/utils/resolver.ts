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

	const statFile = async (filePath: string) => {
		return (await fs.stat(filePath).catch(() => null))?.isFile()
			? filePath
			: undefined;
	};

	const findFirstExisting = async (candidates: string[]) => {
		const results = await Promise.all(candidates.map(statFile));
		return results.find((candidate) => candidate !== undefined);
	};

	const resolve: ResolveFn = async (importer, specifier) => {
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

		const targetStat = await fs.stat(targetPath).catch(() => null);

		if (targetStat?.isFile()) {
			if (allExtensions.has(path.extname(targetPath))) {
				return targetPath;
			}
			throw fail(specifier, importer);
		}

		if (targetStat?.isDirectory()) {
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

	return { resolve };
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
