import * as path from 'node:path';
import { loadConfig as loadRsbuildConfig } from '@rsbuild/core';
import { CompileError, type CompileTemplateOptions } from './compiler';
import { assertCompileOptions, invalidOption } from './compiler/options';
import type { RuntimePlugin } from './plugins';
import { didYouMean, isPlainObject } from './utils/suggest';

const CONFIG_KEYS = ['context', 'runtimePlugins', 'output', 'publicDir'];
const OUTPUT_KEYS = [
	'dir',
	'module',
	'template',
	'clean',
	'validate',
	'format',
];

export const CONFIG_FILE_NAMES = [
	'blogger-hbs.config.ts',
	'blogger-hbs.config.mts',
	'blogger-hbs.config.js',
	'blogger-hbs.config.mjs',
];

export interface OutputConfig {
	/** Directory of the output, relative to the root, `dist` by default. */
	dir?: string;
	/**
	 * File name of the compiled module (the ES module consumed by
	 * `renderTemplate`), `compiled.js` by default, `false` to not write it.
	 */
	module?: string | false;
	/** File name of the rendered template, `theme.xml` by default, `false` to not render it. */
	template?: string | false;
	/** Whether the directory is emptied before the first build, `true` by default. */
	clean?: boolean;
	/**
	 * Whether the rendered template is validated as a Blogger theme: well-formed
	 * XML with the XML declaration and the doctype on the first two lines, and
	 * expressions (`b:if cond`, `expr:*`, ...) that parse with `blogger-expr`.
	 * `true` by default, formatting needs it. The templates and the partials of
	 * plugins are validated when compiling either way.
	 */
	validate?: boolean;
	/**
	 * Whether the rendered template is formatted as Blogger saves it: the
	 * declarations added or moved to the top, start tags on a single line, line
	 * breaks in attribute values collapsed, the attributes sorted and quoted
	 * with single quotes, and the
	 * expressions printed by `blogger-expr` on a single line. `true` by default,
	 * nothing is formatted without validation.
	 */
	format?: boolean;
}

export interface UserConfig extends CompileTemplateOptions {
	/** The context the template is rendered with. */
	context?: unknown;
	/** Plugins used when rendering. */
	runtimePlugins?: RuntimePlugin[];
	output?: OutputConfig;
	/**
	 * Directory whose files are copied as they are into the output directory,
	 * relative to the root. `public` by default, when it exists, `false` to not
	 * copy anything.
	 */
	publicDir?: string | false;
}

export interface ConfigEnv {
	/** `NODE_ENV` */
	env: string;
	/** The command of the CLI, `build`. */
	command: string;
	envMode: string;
	meta?: {
		/** Whether the CLI watches for changes. */
		watch?: boolean;
	};
}

export type UserConfigExport =
	| UserConfig
	| ((env: ConfigEnv) => UserConfig | Promise<UserConfig>);

/** Gives type checking and completions to a config file. */
export function defineConfig<T extends UserConfigExport>(config: T): T {
	return config;
}

export interface LoadedConfig {
	config: UserConfig;
	/** Path of the config file, undefined when there is none. */
	file?: string;
	/** The config file and the files it imports. */
	dependencies: string[];
}

/** Throws unless `config` is a valid config. */
export function assertUserConfig(
	config: unknown,
): asserts config is UserConfig {
	assertCompileOptions(config, CONFIG_KEYS);
	const { runtimePlugins, output, publicDir } = config as UserConfig;

	if (
		publicDir !== undefined &&
		publicDir !== false &&
		(typeof publicDir !== 'string' || publicDir === '')
	) {
		throw invalidOption('publicDir', 'a path or false', publicDir);
	}

	if (runtimePlugins !== undefined) {
		if (!Array.isArray(runtimePlugins)) {
			throw invalidOption(
				'runtimePlugins',
				'an array of runtime plugins',
				runtimePlugins,
			);
		}
		runtimePlugins.forEach((plugin: unknown, i) => {
			if (typeof plugin !== 'object' || plugin === null) {
				throw invalidOption(`runtimePlugins[${i}]`, 'a runtime plugin', plugin);
			}
			const { helpers } = plugin as RuntimePlugin;
			if (helpers !== undefined && !isPlainObject(helpers)) {
				throw invalidOption(
					`runtimePlugins[${i}].helpers`,
					'an object of helpers by name',
					helpers,
				);
			}
		});
	}

	if (output === undefined) {
		return;
	}
	if (!isPlainObject(output)) {
		throw invalidOption('output', 'an object', output);
	}
	for (const key of Object.keys(output)) {
		if (!OUTPUT_KEYS.includes(key)) {
			const known = OUTPUT_KEYS.map((name) => `output.${name}`);
			const hint = didYouMean(`output.${key}`, known);
			throw new CompileError(
				`Unknown option 'output.${key}'${hint}${hint ? ' Valid' : ', valid'} options: ${known.join(', ')}`,
			);
		}
	}

	const { dir, module, template, clean, validate, format } = output;
	if (dir !== undefined && (typeof dir !== 'string' || dir === '')) {
		throw invalidOption('output.dir', 'a path', dir);
	}
	for (const [name, value] of [
		['module', module],
		['template', template],
	] as const) {
		if (
			value !== undefined &&
			value !== false &&
			(typeof value !== 'string' || value === '')
		) {
			throw invalidOption(`output.${name}`, 'a file name or false', value);
		}
	}
	if (
		(module ?? 'compiled.js') !== false &&
		(module ?? 'compiled.js') === (template ?? 'theme.xml')
	) {
		throw new CompileError(
			`'output.module' and 'output.template' are both '${module ?? template}', they would overwrite each other`,
		);
	}
	for (const [name, value] of [
		['clean', clean],
		['validate', validate],
		['format', format],
	] as const) {
		if (value !== undefined && typeof value !== 'boolean') {
			throw invalidOption(`output.${name}`, 'a boolean', value);
		}
	}
}

/**
 * Loads `blogger-hbs.config.*` from `cwd`, or the file at `configFile`. A
 * relative `root` in it is resolved from the directory of the file.
 */
export async function loadConfig({
	cwd = process.cwd(),
	configFile,
	command = 'build',
	watch = false,
}: {
	cwd?: string;
	configFile?: string;
	command?: string;
	watch?: boolean;
} = {}): Promise<LoadedConfig> {
	const { content, filePath, dependencies } =
		await loadRsbuildConfig<UserConfig>({
			cwd,
			path: configFile,
			configFileNames: CONFIG_FILE_NAMES,
			command,
			meta: { watch },
		});

	if (!filePath) {
		return { config: {}, dependencies: [] };
	}

	// rsbuild records where its own config came from, which is not needed here
	const { _privateMeta, ...config } = content as UserConfig & {
		_privateMeta?: unknown;
	};

	try {
		assertUserConfig(config);
	} catch (error) {
		throw new CompileError(
			`Invalid config '${path.relative(cwd, filePath) || filePath}': ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	return {
		config: {
			...config,
			root: path.resolve(path.dirname(filePath), config.root ?? '.'),
		},
		file: filePath,
		// the loader does not always list the config file itself
		dependencies: [...new Set([filePath, ...(dependencies ?? [])])],
	};
}
