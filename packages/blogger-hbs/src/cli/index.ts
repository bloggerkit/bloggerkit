import { type FSWatcher, watch } from 'node:fs';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { styleText } from 'node:util';
import { cac } from 'cac';
import {
	type CompiledTemplate,
	CompileError,
	type CompileTemplateOptions,
	compileTemplate,
	type TemplateWatcher,
	watchTemplate,
} from '../compiler';
import {
	assertCompileOptions,
	assertDirectories,
	assertEntry,
	COMPILE_OPTION_KEYS,
	resolvePaths,
} from '../compiler/options';
import { type LoadedConfig, loadConfig } from '../config';
import { renderTemplate } from '../runtime';
import { didYouMean } from '../utils/suggest';
import { formatXml, validateXml } from '../xml';

const { version } = createRequire(import.meta.url)('../../package.json') as {
	version: string;
};

interface BuildFlags {
	config?: string;
	entry?: string;
	outDir?: string;
	context?: string;
	watch?: boolean;
	clean?: boolean;
	validate?: boolean;
	format?: boolean;
}

/** Everything a build needs, from the config file and the flags. */
interface BuildSetup {
	options: CompileTemplateOptions;
	loaded: LoadedConfig;
	outDir: string;
	moduleFile: string | false;
	templateFile: string | false;
	clean: boolean;
	context: unknown;
	/** Whether the rendered template is validated. */
	validate: boolean;
	/** Whether the rendered template is formatted, only when it is validated. */
	format: boolean;
	/** Absolute path of the public directory, undefined when nothing is copied. */
	publicDir?: string;
}

const log = {
	success: (message: string) =>
		console.log(`${styleText('green', '✓')} ${message}`),
	info: (message: string) =>
		console.log(`${styleText('cyan', '●')} ${message}`),
	error: (error: unknown) =>
		console.error(`${styleText('red', '✗')} ${formatError(error)}`),
};

const cli = cac('blogger-hbs');

cli
	.command('[root]', 'Compile the template and render it')
	.alias('build')
	.option('-c, --config <file>', 'Path of the config file')
	.option('--entry <file>', 'Entry template, relative to the root')
	.option('-o, --out-dir <dir>', 'Output directory, relative to the root')
	.option('--context <file>', 'JSON file with the context to render with')
	.option('-w, --watch', 'Build again when a file changes')
	.option('--no-clean', 'Keep the files in the output directory')
	.option(
		'--no-validate',
		'Do not validate the rendered template as XML, nor format it (templates are always validated when compiling)',
	)
	.option('--no-format', 'Do not format the rendered template')
	.example('blogger-hbs')
	.example('blogger-hbs --watch')
	.example('blogger-hbs ./theme --entry src/index.hbs --context context.json')
	.action(async (rootArg: unknown, rawFlags: BuildFlags) => {
		// cac turns values that look like numbers into numbers, `-o 2024`
		const text = (value: unknown) =>
			value === undefined ? undefined : String(value);
		const root = text(rootArg);
		const flags: BuildFlags = {
			...rawFlags,
			config: text(rawFlags.config),
			entry: text(rawFlags.entry),
			outDir: text(rawFlags.outDir),
			context: text(rawFlags.context),
		};

		if (flags.watch) {
			await watchBuild(root, flags);
		} else {
			await build(root, flags);
		}
	});

cli.help();
cli.version(version);

try {
	cli.parse(process.argv, { run: false });
	await cli.runMatchedCommand();
} catch (error) {
	log.error(describeCliError(error));
	process.exitCode = 1;
}

/** Adds a suggestion and a pointer to `--help` to the errors of the arguments. */
function describeCliError(error: unknown): unknown {
	if (!(error instanceof Error) || error.name !== 'CACError') {
		return error;
	}

	const flags = [...cli.commands, cli.globalCommand].flatMap((command) =>
		command.options.flatMap(
			(option) => option.rawName.match(/--[\w-]+/g) ?? [],
		),
	);
	const unknown = /^Unknown option `(.+)`$/.exec(error.message)?.[1];
	const hint = unknown ? didYouMean(unknown, flags, '`') : '';

	return new Error(
		`${error.message}${hint}\n  Run 'blogger-hbs --help' to see the available options`,
	);
}

async function setup(
	root: string | undefined,
	flags: BuildFlags,
): Promise<BuildSetup> {
	const cwd = process.cwd();
	const rootFlag = root === undefined ? undefined : path.resolve(cwd, root);

	// the config is looked for in the root, which has to exist for that
	if (rootFlag !== undefined && !(await isDirectory(rootFlag))) {
		throw new CompileError(
			(await exists(rootFlag))
				? `Root '${root}' is not a directory`
				: `Root directory '${root}' does not exist`,
		);
	}

	const loaded = await loadConfig({
		cwd: rootFlag ?? cwd,
		configFile: flags.config && path.resolve(cwd, flags.config),
		watch: flags.watch,
	});
	const { config } = loaded;

	const resolvedRoot = rootFlag ?? config.root ?? cwd;
	const output = config.output ?? {};

	// the config has more than the compile options
	const options: CompileTemplateOptions = {};
	for (const key of COMPILE_OPTION_KEYS) {
		if (key in config) {
			Object.assign(options, { [key]: config[key as keyof typeof config] });
		}
	}
	options.root = resolvedRoot;
	options.entry = flags.entry ?? config.entry;

	assertCompileOptions(options);
	await assertDirectories(options);

	const outDir = path.resolve(
		resolvedRoot,
		flags.outDir ?? output.dir ?? 'dist',
	);
	const clean = flags.clean === false ? false : (output.clean ?? true);
	if (clean) {
		assertCleanable(outDir, options);
	}

	return {
		options,
		loaded,
		outDir,
		moduleFile: output.module ?? 'compiled.js',
		templateFile: output.template ?? 'theme.xml',
		validate: flags.validate === false ? false : (output.validate ?? true),
		format: flags.format === false ? false : (output.format ?? true),
		clean,
		context: flags.context
			? await readContext(path.resolve(cwd, flags.context), flags.context)
			: (config.context ?? {}),
		publicDir: await resolvePublicDir(resolvedRoot, config.publicDir, outDir),
	};
}

/** The public directory, `public` when it exists unless set otherwise. */
async function resolvePublicDir(
	root: string,
	value: string | false | undefined,
	outDir: string,
): Promise<string | undefined> {
	if (value === false) {
		return;
	}

	const directory = path.resolve(root, value ?? 'public');
	const shown = path.relative(process.cwd(), directory) || '.';

	if (!(await isDirectory(directory))) {
		if (value === undefined) {
			return;
		}
		throw new CompileError(
			(await exists(directory))
				? `Public directory '${shown}' is not a directory`
				: `Public directory '${shown}' does not exist, set 'publicDir: false' to not copy anything`,
		);
	}

	if (isInside(outDir, directory) || isInside(directory, outDir)) {
		throw new CompileError(
			`Public directory '${shown}' and output directory '${path.relative(process.cwd(), outDir) || '.'}' overlap, they must be separate`,
		);
	}

	return directory;
}

/** Copies the public directory into the output directory. */
async function copyPublic({
	publicDir,
	outDir,
	moduleFile,
	templateFile,
}: BuildSetup): Promise<void> {
	if (publicDir === undefined) {
		return;
	}

	for (const name of await fs.readdir(publicDir)) {
		if (name === moduleFile || name === templateFile) {
			throw new CompileError(
				`'${name}' in the public directory has the same name as the ${name === moduleFile ? 'compiled module' : 'rendered template'} and would be overwritten, rename it or set 'output.${name === moduleFile ? 'module' : 'template'}'`,
			);
		}
	}

	await fs.cp(publicDir, outDir, { recursive: true, force: true });
}

/**
 * Cleaning removes everything in the output directory, which must not hold the
 * project: the root, the working directory, the templates or an alias target.
 */
function assertCleanable(outDir: string, options: CompileTemplateOptions) {
	const { root, entry } = resolvePaths(options);
	const shown = path.relative(process.cwd(), outDir) || '.';
	const kept: [string, string][] = [
		[root, 'the root'],
		[process.cwd(), 'the working directory'],
		[path.dirname(entry), 'the entry template'],
		...Object.entries(options.alias ?? {}).map(
			([name, target]): [string, string] => [
				path.resolve(root, target),
				`the target of the alias '${name}'`,
			],
		),
	];

	for (const [directory, what] of kept) {
		if (isInside(directory, outDir)) {
			throw new CompileError(
				`Refusing to clean the output directory '${shown}', it contains ${what}. Use another output directory, or --no-clean / 'output.clean: false' to keep its files`,
			);
		}
	}
}

async function readContext(file: string, shown: string): Promise<unknown> {
	let text: string;
	try {
		text = await fs.readFile(file, 'utf-8');
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new CompileError(`Context file '${shown}' not found`);
		}
		throw new CompileError(`Failed to read the context file '${shown}'`, {
			cause,
		});
	}

	try {
		return JSON.parse(text);
	} catch (cause) {
		throw new CompileError(
			`Context file '${shown}' is not valid JSON: ${(cause as Error).message}`,
		);
	}
}

/** Whether `child` is `parent` or inside of it. */
function isInside(child: string, parent: string): boolean {
	const relative = path.relative(parent, child);
	return (
		relative === '' ||
		(!relative.startsWith('..') && !path.isAbsolute(relative))
	);
}

async function exists(file: string): Promise<boolean> {
	return fs.stat(file).then(
		() => true,
		() => false,
	);
}

async function isDirectory(file: string): Promise<boolean> {
	return fs.stat(file).then(
		(stats) => stats.isDirectory(),
		() => false,
	);
}

async function build(root: string | undefined, flags: BuildFlags) {
	const current = await setup(root, flags);
	// nothing is written when there is nothing to build, the watcher waits
	// for the entry instead
	await assertEntry(current.options);
	await prepareOutDir(current);
	await copyPublic(current);

	const start = performance.now();
	const compiled = await compileTemplate(current.options);
	log.success(`Compiled in ${elapsed(start)}`);

	await write(current, compiled);
}

/** Watches the template and restarts when the config file changes. */
async function watchBuild(root: string | undefined, flags: BuildFlags) {
	let current = await setup(root, flags);
	await prepareOutDir(current);

	let watcher: TemplateWatcher | undefined;
	let watchers: FSWatcher[] = [];
	let restarting = false;

	const start = async () => {
		let begin = performance.now();
		let first = true;

		try {
			await copyPublic(current);
		} catch (error) {
			log.error(error);
		}

		watcher = await watchTemplate({
			...current.options,
			onStart() {
				begin = performance.now();
			},
			async onCompile(compiled) {
				log.success(`${first ? 'Compiled' : 'Rebuilt'} in ${elapsed(begin)}`);
				first = false;
				await write(current, compiled);
			},
			onError: log.error,
		});

		for (const file of current.loaded.dependencies) {
			try {
				const configWatcher = watch(file, () => {
					// saving fires more than once, a restart is enough
					if (!restarting) {
						restarting = true;
						restart().finally(() => {
							restarting = false;
						});
					}
				});
				configWatcher.on('error', () => configWatcher.close());
				watchers.push(configWatcher);
			} catch {
				// a dependency that can not be watched does not restart
			}
		}

		if (current.publicDir !== undefined) {
			watchers.push(watchPublic(current));
		}
	};

	const stopWatchers = () => {
		for (const fileWatcher of watchers) {
			fileWatcher.close();
		}
		watchers = [];
	};

	const restart = async () => {
		log.info(
			`Config changed, restarting ${styleText('dim', path.relative(process.cwd(), current.loaded.file ?? ''))}`,
		);
		stopWatchers();
		await watcher?.close();
		try {
			current = await setup(root, flags);
		} catch (error) {
			log.error(error);
		}
		await start();
	};

	await start();
	log.info(
		`Watching for changes ${styleText('dim', '(press Ctrl+C to stop)')}`,
	);

	const stop = async () => {
		stopWatchers();
		await watcher?.close();
		process.exit(0);
	};
	process.once('SIGINT', stop);
	process.once('SIGTERM', stop);
}

/** Copies the public directory again when something in it changes. */
function watchPublic(current: BuildSetup): FSWatcher {
	const publicDir = current.publicDir as string;
	const changed = new Set<string>();
	let timer: NodeJS.Timeout | undefined;

	const sync = async () => {
		const names = [...changed];
		changed.clear();
		try {
			// what was deleted from the public directory goes from the output too
			for (const name of names) {
				if (!(await exists(path.join(publicDir, name)))) {
					await fs.rm(path.join(current.outDir, name), {
						recursive: true,
						force: true,
					});
				}
			}
			await copyPublic(current);
			log.success(
				`Copied ${styleText('dim', path.relative(process.cwd(), publicDir))}`,
			);
		} catch (error) {
			log.error(error);
		}
	};

	const publicWatcher = watch(
		publicDir,
		{ recursive: true },
		(_event, name) => {
			if (name) {
				changed.add(name);
			}
			clearTimeout(timer);
			timer = setTimeout(sync, 50);
		},
	);
	publicWatcher.on('error', () => publicWatcher.close());
	publicWatcher.on('close', () => clearTimeout(timer));
	return publicWatcher;
}

async function prepareOutDir({ outDir, clean }: BuildSetup) {
	if (clean) {
		await fs.rm(outDir, { recursive: true, force: true });
	}
	await fs.mkdir(outDir, { recursive: true });
}

/**
 * Writes the compiled module and the rendered template, validated and
 * formatted after rendering when enabled.
 */
async function write(current: BuildSetup, compiled: CompiledTemplate) {
	const { outDir, moduleFile, templateFile, context, loaded } = current;

	if (moduleFile) {
		await fs.writeFile(path.join(outDir, moduleFile), compiled.source);
	}
	if (!templateFile) {
		return;
	}

	const file = path.join(outDir, templateFile);
	const shown = path.relative(process.cwd(), file);

	let start = performance.now();
	const rendered = renderTemplate({
		...compiled,
		context,
		plugins: loaded.config.runtimePlugins,
	});
	log.success(`Rendered in ${elapsed(start)}`);

	start = performance.now();
	let output: string;
	try {
		output = finalizeXml(current, rendered);
	} catch (error) {
		// written anyway, to look at where it is invalid
		await fs.writeFile(file, rendered);
		throw new CompileError(
			`The rendered template ${shown} is not valid XML: ${(error as Error).message}`,
		);
	}
	if (current.validate) {
		log.success(
			`${current.format ? 'Formatted' : 'Validated'} in ${elapsed(start)}`,
		);
	}

	await fs.writeFile(file, output);
	log.success(`Written ${styleText('dim', shown)}`);
}

/** Validates and formats the rendered template, as enabled. */
function finalizeXml({ validate, format }: BuildSetup, xml: string): string {
	if (!validate) {
		return xml;
	}
	if (!format) {
		validateXml(xml);
		return xml;
	}
	return formatXml(xml);
}

function elapsed(start: number): string {
	return styleText('yellow', `${Math.round(performance.now() - start)}ms`);
}

/** The message of the error and of everything that caused it. */
function formatError(error: unknown): string {
	const lines: string[] = [];
	let current: unknown = error;

	while (current !== undefined) {
		lines.push(
			current instanceof Error
				? `${lines.length === 0 ? '' : 'Caused by: '}${current.message}`
				: String(current),
		);
		current = current instanceof Error ? current.cause : undefined;
	}

	return lines.join('\n  ');
}
