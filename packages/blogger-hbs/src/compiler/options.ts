import type { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { TEMPLATE_EXTENSIONS } from '../constants';
import { describeValue, didYouMean, isPlainObject } from '../utils/suggest';
import type { CompileTemplateOptions } from './compile';
import { CompileError } from './errors';

export const COMPILE_OPTION_KEYS: readonly string[] = [
	'root',
	'entry',
	'alias',
	'plugins',
	'rsbuild',
];

const PLUGIN_HOOKS = ['preprocess', 'provide', 'finalize', 'data'];

/** Shown when a template is expected, `.hbs, .handlebars, .xml, .html`. */
const TEMPLATE_EXTENSION_LIST = [...TEMPLATE_EXTENSIONS].join(', ');

export function invalidOption(
	name: string,
	expected: string,
	value: unknown,
): CompileError {
	return new CompileError(
		`Invalid option '${name}', expected ${expected}, got: ${describeValue(value)}`,
	);
}

/**
 * Throws unless `options` are compile options, `extraKeys` are the other
 * options allowed, for example those of `watchTemplate`.
 */
export function assertCompileOptions(
	options: unknown,
	extraKeys: readonly string[] = [],
): asserts options is CompileTemplateOptions | undefined {
	if (options === undefined) {
		return;
	}
	if (!isPlainObject(options)) {
		throw new CompileError(
			`Expected the options to be an object, got: ${describeValue(options)}`,
		);
	}

	const known = [...COMPILE_OPTION_KEYS, ...extraKeys];
	for (const key of Object.keys(options)) {
		if (!known.includes(key)) {
			const hint = didYouMean(key, known);
			throw new CompileError(
				`Unknown option '${key}'${hint}${hint ? ' Valid' : ', valid'} options: ${known.join(', ')}`,
			);
		}
	}

	const { root, entry, alias, plugins, rsbuild } = options;

	for (const [name, value] of [
		['root', root],
		['entry', entry],
	] as const) {
		if (value !== undefined && (typeof value !== 'string' || value === '')) {
			throw invalidOption(name, 'a path', value);
		}
	}

	if (alias !== undefined) {
		if (!isPlainObject(alias)) {
			throw invalidOption('alias', 'an object of paths by name', alias);
		}
		for (const [name, target] of Object.entries(alias)) {
			if (name === '') {
				throw new CompileError("Invalid option 'alias', a name is empty");
			}
			if (typeof target !== 'string' || target === '') {
				throw invalidOption(`alias['${name}']`, 'a path', target);
			}
		}
	}

	if (plugins !== undefined) {
		if (!Array.isArray(plugins)) {
			throw invalidOption('plugins', 'an array of compile plugins', plugins);
		}
		plugins.forEach((plugin: unknown, i) => {
			if (typeof plugin !== 'object' || plugin === null) {
				throw invalidOption(`plugins[${i}]`, 'a compile plugin', plugin);
			}
			const hooks = plugin as Record<string, unknown>;
			const label =
				typeof hooks.name === 'string'
					? `plugin '${hooks.name}'`
					: `plugins[${i}]`;
			for (const hook of PLUGIN_HOOKS) {
				if (hooks[hook] !== undefined && typeof hooks[hook] !== 'function') {
					throw new CompileError(
						`Invalid '${hook}' of ${label}, expected a function, got: ${describeValue(hooks[hook])}`,
					);
				}
			}
		});
	}

	if (
		rsbuild !== undefined &&
		typeof rsbuild !== 'function' &&
		!isPlainObject(rsbuild)
	) {
		throw invalidOption(
			'rsbuild',
			'an rsbuild config or a function returning one',
			rsbuild,
		);
	}
}

/** The absolute root and entry of the options. */
export function resolvePaths(options: CompileTemplateOptions): {
	root: string;
	entry: string;
} {
	const root = path.resolve(process.cwd(), options.root ?? '.');
	return { root, entry: path.resolve(root, options.entry ?? 'index.hbs') };
}

/** Throws unless the root and the targets of the aliases are directories. */
export async function assertDirectories(
	options: CompileTemplateOptions,
): Promise<void> {
	const { root } = resolvePaths(options);
	const rootStats = await stat(root);
	if (!rootStats) {
		throw new CompileError(`Root directory '${root}' does not exist`);
	}
	if (!rootStats.isDirectory()) {
		throw new CompileError(`Root '${root}' is not a directory`);
	}

	for (const [name, target] of Object.entries(options.alias ?? {})) {
		const directory = path.resolve(root, target);
		if (!(await stat(directory))?.isDirectory()) {
			throw new CompileError(
				`Alias '${name}' points to '${display(root, directory)}', which is not a directory in the root '${root}'`,
			);
		}
	}
}

/** Throws a helpful error unless the entry is an existing template file. */
export async function assertEntry(
	options: CompileTemplateOptions,
): Promise<void> {
	const { root, entry } = resolvePaths(options);
	const shown = display(root, entry);
	const extension = path.extname(entry);
	const stats = await stat(entry);

	if (stats?.isDirectory()) {
		const index = await findIndex(entry);
		throw new CompileError(
			`Entry '${shown}' is a directory${
				index
					? `, did you mean '${display(root, index)}'?`
					: ', expected a template file'
			}`,
		);
	}

	if (!TEMPLATE_EXTENSIONS.has(extension)) {
		throw new CompileError(
			`Entry '${shown}' is not a template, the extension must be one of ${TEMPLATE_EXTENSION_LIST}`,
		);
	}

	if (stats) {
		return;
	}

	const directory = path.dirname(entry);
	let hint: string;

	if (!(await stat(directory))?.isDirectory()) {
		hint = `the directory '${display(root, directory)}' does not exist`;
	} else {
		const templates = await listTemplates(directory);
		const name = path.basename(entry);
		const similar = didYouMean(name, templates);
		const nested =
			templates.length === 0 ? await findNestedIndex(directory) : undefined;
		hint =
			similar !== ''
				? similar.slice(2)
				: nested !== undefined
					? `did you mean '${display(root, nested)}'?`
					: templates.length > 0
						? `the templates in '${display(root, directory)}' are: ${templates.slice(0, 10).join(', ')}`
						: `there are no templates in '${display(root, directory)}'`;
	}

	const option =
		options.entry === undefined
			? " (the default, set 'entry' for another)"
			: '';
	throw new CompileError(
		`Entry template '${shown}'${option} not found in the root '${root}', ${hint}`,
	);
}

async function stat(file: string): Promise<Stats | undefined> {
	return fs.stat(file).catch(() => undefined);
}

/** `index` template of a directory. */
async function findIndex(directory: string): Promise<string | undefined> {
	for (const extension of TEMPLATE_EXTENSIONS) {
		const file = path.join(directory, `index${extension}`);
		if ((await stat(file))?.isFile()) {
			return file;
		}
	}
}

/** The `index` template of the first subdirectory having one, `src/index.hbs`. */
async function findNestedIndex(directory: string): Promise<string | undefined> {
	const entries = await fs
		.readdir(directory, { withFileTypes: true })
		.catch(() => []);
	const directories = entries
		.filter(
			(item) =>
				item.isDirectory() &&
				!item.name.startsWith('.') &&
				item.name !== 'node_modules',
		)
		.map((item) => item.name)
		.sort();

	for (const name of directories) {
		const index = await findIndex(path.join(directory, name));
		if (index !== undefined) {
			return index;
		}
	}
}

async function listTemplates(directory: string): Promise<string[]> {
	const names = await fs.readdir(directory).catch(() => []);
	return names
		.filter((name) => TEMPLATE_EXTENSIONS.has(path.extname(name)))
		.sort();
}

/** The path relative to the root when it is inside of it. */
function display(root: string, file: string): string {
	const relative = path.relative(root, file);
	return relative === '' ||
		relative.startsWith('..') ||
		path.isAbsolute(relative)
		? file
		: relative;
}
