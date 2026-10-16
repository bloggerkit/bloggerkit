import * as path from 'node:path';
import { loadConfig as loadRsbuildConfig } from '@rsbuild/core';
import * as z from 'zod';
import { CompileError, type CompileTemplateOptions } from './compiler';
import { assertOptions, compileOptionsShape } from './compiler/options';
import {
	expected,
	options,
	path as pathSchema,
	wholeIssue,
} from './utils/schema';

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

// the label of the union on the string too, for an empty one
const fileName = z.union(
	[pathSchema('a file name or false'), z.literal(false)],
	expected('a file name or false'),
);
const flag = z.optional(z.boolean(expected('a boolean')));

const outputConfig = options(
	{
		dir: z.optional(pathSchema()),
		module: z.optional(fileName),
		template: z.optional(fileName),
		clean: flag,
		validate: flag,
		format: flag,
	},
	{ prefix: 'output.' },
).check((ctx) => {
	const module = ctx.value.module ?? 'compiled.js';
	const template = ctx.value.template ?? 'theme.xml';
	if (module !== false && module === template) {
		ctx.issues.push({
			code: 'custom',
			input: ctx.value,
			message: wholeIssue(
				`'output.module' and 'output.template' are both '${module}', they would overwrite each other`,
			),
		});
	}
});

const userConfig = options({
	...compileOptionsShape,
	context: z.optional(z.unknown()),
	output: z.optional(outputConfig),
	publicDir: z.optional(
		z.union(
			[pathSchema('a path or false'), z.literal(false)],
			expected('a path or false'),
		),
	),
});

/** Throws unless `config` is a valid config. */
export function assertUserConfig(
	config: unknown,
): asserts config is UserConfig {
	assertOptions(userConfig, config);
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
