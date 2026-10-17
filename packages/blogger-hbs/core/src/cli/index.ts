import { type FSWatcher, watch } from 'node:fs';
import * as fs from 'node:fs/promises';
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
import { type Location, withLocation } from '../plugins';
import { createRenderer } from '../runtime';
import { didYouMean } from '../utils/suggest';
import { processXml, XmlError, type XmlInfo, type XmlResult } from '../xml';
import {
	type BuildStats,
	collectStats,
	formatStats,
	type WrittenFile,
} from './stats';

const { version, license, repository } = JSON.parse(
	await fs.readFile(new URL('../../package.json', import.meta.url), 'utf-8'),
) as { version: string; license: string; repository: { url: string } };

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
	/** Sizes of the files written last, by path, to show their changes when watching. */
	sizes: Map<string, number>;
	/** What the theme was made of at the last build, when watching. */
	theme?: BuildStats['theme'];
}

/** What the CLI prints, with `write`, warnings and errors on stderr. */
function logTo(write: (text: string) => void) {
	return {
		write,
		success: (message: string) =>
			write(`${styleText('green', '✓')} ${message}`),
		info: (message: string) => write(`${styleText('cyan', '●')} ${message}`),
		warn: (message: string) =>
			console.warn(`${styleText('yellow', '⚠')} ${message}`),
		error: (error: unknown) =>
			console.error(`${styleText('red', '✗')} ${formatError(error)}`),
	};
}

const log = logTo(console.log);

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
		printHeader();
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

cli
	.command('validate <file>', 'Validate a theme as Blogger reads it')
	.option('--json', 'Print the result as JSON')
	.example('blogger-hbs validate dist/theme.xml')
	.example('blogger-hbs validate dist/theme.xml --json')
	.action(async (file: unknown, flags: { json?: boolean }) => {
		await processFile(String(file), { format: false, json: flags.json });
	});

cli
	.command(
		'format <file>',
		'Format a theme as Blogger saves it, written to stdout, or to --out',
	)
	.option('-o, --out <file>', 'Write it to this file instead of stdout')
	.option('--json', 'Print the result as JSON, the theme in it without --out')
	.example('blogger-hbs format theme.xml')
	.example('blogger-hbs format theme.xml -o theme.formatted.xml')
	.action(async (file: unknown, flags: { out?: unknown; json?: boolean }) => {
		const out = flags.out === undefined ? undefined : String(flags.out);
		await processFile(String(file), { format: true, out, json: flags.json });
	});

cli.help();
// cac's own `--version` prints `name/version platform`, this one says more,
// and the help still has the version in its heading
cli.globalCommand.versionNumber = version;
cli.option(
	'-v, --version',
	'Display the version, the copyright and the license',
);

/** Whether the header is printed, so that an error before a command runs prints it too. */
let headerPrinted = false;

try {
	cli.parse(process.argv, { run: false });
	if (cli.options.version) {
		await printVersion();
	} else {
		await cli.runMatchedCommand();
	}
} catch (error) {
	// with the theme on stdout, the header of an error is on stderr with it
	if (!headerPrinted && !cli.options.json) {
		printHeader(formatsToStdout() ? console.error : console.log);
	}
	log.error(describeCliError(error));
	process.exitCode = 1;
}

/** Whether the command formats a theme to stdout, which has nothing else on it. */
function formatsToStdout(): boolean {
	return cli.matchedCommandName === 'format' && cli.options.out === undefined;
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
		`${error.message}${hint}\nRun 'blogger-hbs ${cli.matchedCommandName ? `${cli.matchedCommandName} ` : ''}--help' to see the available options`,
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
	options.onWarn ??= log.warn;

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
		sizes: new Map(),
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

	await write(current, compiled, start);
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
		/** Shown before what a rebuild prints, after the first build. */
		let divider = '';

		/** Once, before the first thing a rebuild prints, its output can be the same. */
		const printDivider = () => {
			if (divider) {
				console.log(divider);
				divider = '';
			}
		};

		try {
			await copyPublic(current);
		} catch (error) {
			log.error(error);
		}

		watcher = await watchTemplate({
			...current.options,
			onStart({ files }) {
				begin = performance.now();
				divider = first ? '' : formatDivider(files);
			},
			async onCompile(compiled) {
				printDivider();
				log.success(`${first ? 'Compiled' : 'Rebuilt'} in ${elapsed(begin)}`);
				await write(current, compiled, begin);
				first = false;
			},
			onError(error) {
				printDivider();
				log.error(error);
			},
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
		// the process ends once nothing is left running: `process.exit` would skip
		// the cleanup of rspack's native bindings, which then warn about leaks,
		// so it is only a fallback for something left running, a plugin's timer
		setTimeout(() => process.exit(0), 3000).unref();
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
async function write(
	current: BuildSetup,
	compiled: CompiledTemplate,
	begin: number,
) {
	const { outDir, moduleFile, templateFile } = current;
	const written: WrittenFile[] = [];
	let theme: WrittenTheme | undefined;

	if (moduleFile) {
		const file = path.join(outDir, moduleFile);
		await fs.writeFile(file, compiled.source);
		written.push({
			path: path.relative(process.cwd(), file),
			content: compiled.source,
		});
	}
	if (templateFile) {
		theme = await writeTheme(current, compiled, templateFile);
		written.unshift(theme.file);
	}

	const stats = await collectStats(
		compiled,
		written,
		theme?.info && { ...theme.file, info: theme.info },
	);
	console.log(
		formatStats(stats, current.sizes, { previousTheme: current.theme }),
	);
	current.sizes = new Map(stats.files.map(({ path, size }) => [path, size]));
	current.theme = stats.theme;
	log.success(`Built in ${elapsed(begin)}`);
}

/** `─── 14:32:05 · src/header.hbs +2 ───────`, dim. */
function formatDivider(files: readonly string[]): string {
	const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
	const [file, ...others] = files.map((item) =>
		path.relative(process.cwd(), item),
	);
	const what = file
		? ` · ${file}${others.length > 0 ? ` +${others.length}` : ''}`
		: '';
	const text = `─── ${time}${what} `;
	return `\n${styleText('dim', text + '─'.repeat(Math.max(3, 50 - text.length)))}`;
}

interface WrittenTheme {
	file: WrittenFile;
	/** What it is made of, when it is validated. */
	info?: XmlInfo;
}

/** Renders, validates and formats the theme, as enabled, and writes it. */
async function writeTheme(
	current: BuildSetup,
	compiled: CompiledTemplate,
	templateFile: string,
): Promise<WrittenTheme> {
	const { outDir, context } = current;
	const file = path.join(outDir, templateFile);
	const shown = path.relative(process.cwd(), file);

	// the same as anywhere else the compiled module is rendered
	let start = performance.now();
	const renderer = createRenderer(compiled);
	const rendered = await renderer.render(context);
	log.success(`Rendered in ${elapsed(start)}`);

	if (!current.validate) {
		await fs.writeFile(file, rendered);
		return { file: { path: shown, content: rendered } };
	}

	start = performance.now();
	let result: XmlResult;
	try {
		result = processXml(rendered, { path: shown, format: current.format });
	} catch (error) {
		// written anyway, to look at where it is invalid
		await fs.writeFile(file, rendered);
		throw new CompileError('The rendered template is not valid XML', {
			cause: error,
			loc: (error as XmlError).loc,
		});
	}
	for (const { message, loc } of result.warnings) {
		log.warn(withLocation(message, loc));
	}
	log.success(
		`${current.format ? 'Formatted' : 'Validated'} in ${elapsed(start)}`,
	);

	await fs.writeFile(file, result.xml);
	return { file: { path: shown, content: result.xml }, info: result.info };
}

interface ProcessFileOptions {
	format: boolean;
	/** The file to write the formatted theme to, stdout without it. */
	out?: string;
	/** Whether to print the result as JSON, alone on stdout. */
	json?: boolean;
}

/**
 * Validates the theme in `file`, and with `format` formats it, written to
 * `out` or to stdout. Warnings are placed in what is written, errors in
 * `file`, and nothing is written when it is not valid.
 */
async function processFile(
	file: string,
	{ format, out, json }: ProcessFileOptions,
): Promise<void> {
	if (json) {
		const report = await reportOf(file, { format, out });
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		if (!report.valid) {
			process.exitCode = 1;
		}
		return;
	}

	// a formatted theme on stdout has it to itself
	const toStdout = format && out === undefined;
	const print = toStdout ? logTo(console.error) : log;
	// on stdout, only the theme, with warnings and errors besides it
	if (!toStdout) {
		printHeader(print.write);
	}

	const start = performance.now();
	const { result, written } = await processTheme(file, { format, out });
	for (const { message, loc } of result.warnings) {
		print.warn(withLocation(message, loc));
	}

	if (!format) {
		print.success(`Validated in ${elapsed(start)}`);
	} else if (out === undefined) {
		process.stdout.write(result.xml);
	} else {
		print.success(`Formatted in ${elapsed(start)}, written to ${written}`);
	}
}

/**
 * Reads, processes and, with `out`, writes the theme in `file`. Its
 * warnings and info are placed in what is written, and an error throws.
 */
async function processTheme(
	file: string,
	{ format, out }: ProcessFileOptions,
): Promise<{ result: XmlResult; written: string }> {
	const shown = path.relative(process.cwd(), path.resolve(file));
	const xml = await readTheme(file, shown);

	let result: XmlResult;
	try {
		result = processXml(xml, { path: shown, format });
	} catch (error) {
		throw new Error(`${shown} is not valid XML`, { cause: error });
	}

	const written = !format
		? shown
		: out === undefined
			? '<stdout>'
			: path.relative(process.cwd(), path.resolve(out));
	const at = <T extends { loc: Location }>(item: T): T => ({
		...item,
		loc: { ...item.loc, path: written },
	});
	result = {
		...result,
		warnings: result.warnings.map(at),
		info: {
			...result.info,
			sections: result.info.sections.map(at),
			widgets: result.info.widgets.map(at),
			groups: result.info.groups.map(at),
			variables: result.info.variables.map(at),
		},
	};

	if (format && out !== undefined) {
		await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
		await fs.writeFile(out, result.xml);
	}
	return { result, written };
}

/** What `--json` prints: the result of a valid theme, or every error. */
type Report =
	| {
			valid: true;
			warnings: XmlResult['warnings'];
			info: XmlResult['info'];
			/** The formatted theme, without `--out`. */
			xml?: string;
			/** Where the formatted theme is written, with `--out`. */
			written?: string;
	  }
	| { valid: false; errors: { message: string; loc?: Location }[] };

async function reportOf(
	file: string,
	{ format, out }: ProcessFileOptions,
): Promise<Report> {
	try {
		const { result, written } = await processTheme(file, { format, out });
		return {
			valid: true,
			warnings: result.warnings,
			info: result.info,
			...(format && out === undefined && { xml: result.xml }),
			...(format && out !== undefined && { written }),
		};
	} catch (error) {
		const cause = error instanceof Error ? error.cause : undefined;
		return {
			valid: false,
			errors:
				cause instanceof XmlError
					? [...cause.errors]
					: [{ message: messageOf(error) }],
		};
	}
}

/** The message of an error and of what caused it, on one line. */
function messageOf(error: unknown): string {
	const messages: string[] = [];
	for (let current: unknown = error; current !== undefined; ) {
		messages.push(current instanceof Error ? current.message : String(current));
		current = current instanceof Error ? current.cause : undefined;
	}
	return messages.join(': ');
}

/** The text of the theme in `file`, an error saying so when it can not be read. */
async function readTheme(file: string, shown: string): Promise<string> {
	try {
		return await fs.readFile(file, 'utf-8');
	} catch (error) {
		throw new Error(`Can not read ${shown}`, { cause: error });
	}
}

/** The version, the copyright and the license, where the project is, and the runtime. */
async function printVersion(): Promise<void> {
	printHeader();
	// the copyright of the license, npm publishing it with the package
	const notice = await fs
		.readFile(new URL('../../LICENSE.md', import.meta.url), 'utf-8')
		.catch(() => '');
	const copyright = /^Copyright .*$/m.exec(notice)?.[0];
	console.log(
		[
			copyright,
			`Released under the ${license} License, provided as is, without warranty.`,
			repository.url,
			'',
			`Node.js ${process.version} on ${process.platform}-${process.arch}`,
		]
			.filter((line) => line !== undefined)
			.join('\n'),
	);
}

/**
 * A blank line, `blogger-hbs v0.0.4` right-aligned on a cyan line under it,
 * before what a command prints, with `write`.
 */
function printHeader(write: (text: string) => void = console.log): void {
	headerPrinted = true;
	const text = `blogger-hbs v${version}`;
	const width = text.length + 2;
	write(
		`\n${' '.repeat(width - text.length)}${styleText('bold', 'blogger-hbs')} ${styleText('dim', `v${version}`)}\n${styleText('cyan', '─'.repeat(width))}`,
	);
}

function elapsed(start: number): string {
	return styleText('yellow', `${Math.round(performance.now() - start)}ms`);
}

/**
 * The message of the error and of everything that caused it, a cause whose
 * message is already in the one before is not repeated. The lines of a
 * message are indented under its first.
 */
function formatError(error: unknown): string {
	const lines: string[] = [];
	let previous = '';
	let current: unknown = error;

	while (current !== undefined) {
		const message =
			current instanceof Error ? current.message : String(current);
		if (lines.length === 0 || !previous.includes(message)) {
			lines.push(
				`${lines.length === 0 ? '' : 'Caused by: '}${message.replaceAll('\n', '\n  ')}`,
			);
		}
		previous = message;
		current = current instanceof Error ? current.cause : undefined;
	}

	return lines.join('\n  ');
}
