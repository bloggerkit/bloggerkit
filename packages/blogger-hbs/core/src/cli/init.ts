import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The starter a new theme is made from, in the package, from `src/cli` and `dist/cli` alike. */
const STARTER = fileURLToPath(
	new URL('../../templates/starter/', import.meta.url),
);

/** What the files of the starter have in place of the name of the theme. */
const THEME_NAME = /%THEME_NAME%/g;

/** The files of the starter written under another name: npm leaves `.gitignore` out of a package. */
const RENAMED: Readonly<Record<string, string>> = { gitignore: '.gitignore' };

export interface InitOptions {
	/** The name of the theme, the name of the directory by default. */
	name?: string;
	/** Whether to write into a directory that is not empty. */
	force?: boolean;
	/** The version of blogger-hbs the theme depends on. */
	version: string;
}

export interface InitResult {
	/** The directory written to. */
	dir: string;
	/** The files written, relative to it, in order. */
	files: string[];
	name: string;
}

/**
 * Writes a new theme in `dir`, made from the starter, its name in its files
 * and a `package.json` depending on this version of blogger-hbs. Refuses a
 * directory that is not empty, but with `force`, and never deletes a file.
 */
export async function init(
	dirArg: string | undefined,
	{ name: nameArg, force = false, version }: InitOptions,
): Promise<InitResult> {
	const dir = path.resolve(dirArg ?? '.');
	const shown = path.relative(process.cwd(), dir) || '.';
	const existing = await fs
		.readdir(dir)
		.catch((error: NodeJS.ErrnoException) => {
			if (error.code === 'ENOENT') {
				return [];
			}
			throw error;
		});
	if (existing.length > 0 && !force) {
		const listed = existing.slice(0, 5).join(', ');
		throw new Error(
			`${shown} is not empty, it has ${listed}${existing.length > 5 ? ', …' : ''}: choose another directory, or pass --force to write into it`,
		);
	}

	const name = nameArg?.trim() || path.basename(dir);
	const files: string[] = [];
	for (const file of await starterFiles()) {
		const target = RENAMED[file] ?? file;
		const text = await fs.readFile(path.join(STARTER, file), 'utf-8');
		await fs.mkdir(path.dirname(path.join(dir, target)), { recursive: true });
		await fs.writeFile(path.join(dir, target), text.replace(THEME_NAME, name));
		files.push(target);
	}
	const manifest = {
		name: packageName(name),
		version: '0.0.0',
		private: true,
		type: 'module',
		scripts: { build: 'blogger-hbs', watch: 'blogger-hbs --watch' },
		devDependencies: { 'blogger-hbs': `^${version}` },
	};
	await fs.writeFile(
		path.join(dir, 'package.json'),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
	files.push('package.json');
	return { dir, files: files.sort(), name };
}

/** The files of the starter, relative to it. */
async function starterFiles(): Promise<string[]> {
	const entries = await fs.readdir(STARTER, {
		recursive: true,
		withFileTypes: true,
	});
	return entries
		.filter((entry) => entry.isFile())
		.map((entry) =>
			path
				.relative(STARTER, path.join(entry.parentPath, entry.name))
				.split(path.sep)
				.join('/'),
		)
		.sort();
}

/** A name npm takes for a package, from the name of the theme: lowercase, its other characters as dashes. */
export function packageName(name: string): string {
	const valid = name
		.toLowerCase()
		.replace(/[^a-z0-9._~-]+/g, '-')
		.replace(/^[-._]+|-+$/g, '');
	return valid || 'blogger-theme';
}

/** The package manager the CLI is run with, from what it sets, npm without it. */
export function packageManager(
	userAgent = process.env.npm_config_user_agent ?? '',
): 'pnpm' | 'yarn' | 'bun' | 'npm' {
	const [tool] = userAgent.split('/');
	return tool === 'pnpm' || tool === 'yarn' || tool === 'bun' ? tool : 'npm';
}
