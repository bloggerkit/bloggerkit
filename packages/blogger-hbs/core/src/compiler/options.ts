import type { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as z from 'zod';
import { TEMPLATE_EXTENSIONS } from '../constants';
import {
	expected,
	fn,
	formatIssues,
	json,
	options,
	path as pathSchema,
	wholeIssue,
} from '../utils/schema';
import { didYouMean } from '../utils/suggest';
import type { CompileTemplateOptions } from './compile';
import { CompileError } from './errors';

/** Shown when a template is expected, `.hbs, .handlebars, .xml, .html`. */
const TEMPLATE_EXTENSION_LIST = [...TEMPLATE_EXTENSIONS].join(', ');

/** What is checked of a compile plugin, its name is checked when it runs. */
const compilePlugin = z.looseObject(
	{
		enforce: z.optional(z.enum(['pre', 'post'], expected("'pre' or 'post'"))),
		buildStart: z.optional(fn()),
		preprocess: z.optional(fn()),
		provide: z.optional(fn()),
		finalize: z.optional(fn()),
		data: z.optional(fn()),
		buildEnd: z.optional(fn()),
		runtime: z.optional(
			z.looseObject(
				{ entry: pathSchema(), options: z.optional(json) },
				expected("an object with an 'entry'"),
			),
		),
	},
	expected('a compile plugin'),
);

/** The compile options, the config and the options of `watchTemplate` have more. */
export const compileOptionsShape = {
	root: z.optional(pathSchema()),
	entry: z.optional(pathSchema()),
	alias: z.optional(
		z
			.record(z.string(), pathSchema(), expected('an object of paths by name'))
			.check((ctx) => {
				if (Object.hasOwn(ctx.value, '')) {
					ctx.issues.push({
						code: 'custom',
						input: ctx.value,
						message: wholeIssue("Invalid option 'alias', a name is empty"),
					});
				}
			}),
	),
	plugins: z.optional(
		z.array(compilePlugin, expected('an array of compile plugins')),
	),
	rsbuild: z.optional(
		z.union(
			[fn(), z.record(z.string(), z.unknown())],
			expected('an rsbuild config or a function returning one'),
		),
	),
	onWarn: z.optional(fn()),
};

export const COMPILE_OPTION_KEYS: readonly string[] =
	Object.keys(compileOptionsShape);

const compileOptions = options(compileOptionsShape);

/**
 * Throws a `CompileError` unless `value` matches the schema of options,
 * whose issues are described as the others: `Invalid option 'entry', ...`,
 * and `Invalid 'provide' of plugin 'p', ...` for those of a plugin.
 */
export function assertOptions(schema: z.ZodType, value: unknown): void {
	const result = schema.safeParse(value);
	if (result.success) {
		return;
	}

	throw new CompileError(
		formatIssues(result.error, {
			records: ['alias'],
			scope(issuePath) {
				const [key, index, ...rest] = issuePath;
				if (key !== 'plugins' || typeof index !== 'number') {
					return;
				}
				const plugins = (value as { plugins?: unknown[] }).plugins;
				const name = (plugins?.[index] as { name?: unknown } | undefined)?.name;
				return {
					subject:
						typeof name === 'string' ? `plugin '${name}'` : `plugins[${index}]`,
					rest,
				};
			},
		}),
	);
}

/** Throws unless `options` are compile options. */
export function assertCompileOptions(
	options: unknown,
): asserts options is CompileTemplateOptions | undefined {
	if (options !== undefined) {
		assertOptions(compileOptions, options);
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
