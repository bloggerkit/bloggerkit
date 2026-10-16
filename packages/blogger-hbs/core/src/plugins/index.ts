import type Handlebars from 'handlebars/runtime';
import type { HelperDelegate } from 'handlebars/runtime';
import type { Program } from '../compiler/ast';
import {
	FORBIDDEN_KEYS,
	NAME_DENYLIST_REGEX,
	RESERVED_PLUGIN_NAMES,
} from '../constants';
import type { HelperError } from '../runtime/helpers';

export class PluginError extends Error {
	/** Where the error is, when the plugin gave it. */
	loc?: Location;

	constructor(message: string, options?: PluginErrorOptions) {
		super(message, options);
		this.name = 'PluginError';
		if (options?.loc) {
			this.loc = options.loc;
		}
	}
}

export interface PluginErrorOptions extends ErrorOptions {
	loc?: Location;
}

/** A place in a template or a partial provided by a plugin. */
export interface Location {
	/** Path of the template, or `partial 'plugin-name.template-name'`. */
	path: string;
	/** 1-based. */
	line: number;
	/** 1-based. */
	column: number;
}

/**
 * Value of a hash argument, `{{> lucide.house size=16}}`. Literals are given as
 * they are, anything else (`size=data.size`, `size=(add 1 2)`) as the
 * expression it is written with, as it is only known when rendering.
 */
export type HashValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| { expression: string };

/** A place where a partial of a plugin is used. */
export interface PartialUsage extends Location {
	hash: Record<string, HashValue>;
}

/** A partial of a plugin and every place it is used. */
export interface PartialRequest {
	/** Name of the partial, without the plugin name. */
	name: string;
	usages: PartialUsage[];
}

export interface TemplateContext {
	/** Id of the template, for example `./index.hbs`. */
	id: string;
	/** Absolute path of the template. */
	path: string;
	source: string;
	/** The parsed template, it can be modified. */
	ast: Program;
}

/** Given to every hook of a compile plugin, it is the same during a compilation. */
export interface PluginContext {
	/** Absolute path of the root directory. */
	root: string;
	/** Absolute path of the entry template. */
	entry: string;
	/** `development` when `NODE_ENV` is, `production` otherwise. */
	mode: 'development' | 'production';
	/** Whether the template is compiled again on changes. */
	watch: boolean;
	/**
	 * Resolves a specifier as `import` does, with the aliases, relative to
	 * `importer` or to the entry. Undefined when it can not be resolved.
	 */
	resolve(specifier: string, importer?: string): Promise<string | undefined>;
	/** Compiles again when the file changes, when watching. */
	addWatchFile(file: string): void;
	/** Reports a problem that does not stop the compilation. */
	warn(message: string, loc?: Location): void;
	/** Stops the compilation with an error, at `loc` when given. */
	error(message: string, loc?: Location): never;
}

export interface ProvideContext {
	/**
	 * Names of the plugin's partials (without the plugin name) that are used by
	 * the templates, or by what plugins provided, and were not asked for before.
	 */
	partials: string[];
	/** The same partials, with the places they are used. */
	requests: PartialRequest[];
	/** All the scanned templates. */
	templates: readonly TemplateContext[];
}

export interface FinalizeContext {
	/** Names of the plugin's partials (without the plugin name) provided so far. */
	provided: readonly string[];
	/** Names of the plugin's partials that are used but were not provided. */
	missing: readonly string[];
	/** Every partial of the plugin that is used, with the places it is used. */
	requests: readonly PartialRequest[];
	/**
	 * Full names (`plugin-name.template-name`) of the partials provided so far
	 * by all the plugins, the only ones what `finalize` provides can use.
	 */
	available: readonly string[];
}

export interface DataContext {
	/** Names of the plugin's partials (without the plugin name). */
	provided: readonly string[];
	/** Full names (`plugin-name.template-name`) of all the provided partials. */
	available: readonly string[];
	/** All the scanned templates. */
	templates: readonly TemplateContext[];
}

/** Template sources by name, used as `{{> plugin-name.template-name}}`. */
export type ProvideResult = Record<string, string>;

/** JSON serializable values by name, read as `@plugin-name.data-name`. */
export type DataResult = Record<string, unknown>;

type MaybePromise<T> = T | Promise<T>;

/** A JSON serializable value. */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

/**
 * The runtime half of a compile plugin: a module whose default export is made
 * with `defineRuntimePlugin`. It is bundled into the compiled module, so the
 * template renders with it wherever the module runs.
 */
export interface RuntimeEntry {
	/**
	 * Absolute path of the module, for example
	 * `fileURLToPath(new URL('./runtime.js', import.meta.url))`. It is bundled
	 * for any JavaScript runtime: it can not use Node.js modules.
	 */
	entry: string;
	/** Given to the setup of the runtime plugin. */
	options?: JsonValue;
}

/**
 * Compile stage plugin. The partials and data it provides are compiled into the
 * output and need no plugin when rendering. Hooks run in the order of the
 * plugins, those with `enforce: 'pre'` first and `enforce: 'post'` last.
 */
export interface CompilePlugin {
	/** Required, partials and data of the plugin are namespaced with it. */
	name: string;
	enforce?: 'pre' | 'post';
	/** Called first in every compilation, also each time when watching. */
	buildStart?(context: PluginContext): MaybePromise<void>;
	/**
	 * Called once with all the scanned templates before the partials they use
	 * are collected, so their ASTs can be inspected or changed.
	 */
	preprocess?(
		templates: readonly TemplateContext[],
		context: PluginContext,
	): MaybePromise<void>;
	/**
	 * Provides templates. It is called once with the partials used so far and
	 * again with the new ones, as long as what is provided uses more of its
	 * partials. Something already provided is not replaced.
	 */
	provide?(
		context: ProvideContext,
		plugin: PluginContext,
	): MaybePromise<ProvideResult | undefined>;
	/**
	 * Called once after `provide` with every partial provided, for templates
	 * that depend on all of them, for example one rendering each partial. A used
	 * partial can be left out by `provide` to be provided here. What it provides
	 * can only use partials provided before.
	 */
	finalize?(
		context: FinalizeContext,
		plugin: PluginContext,
	): MaybePromise<ProvideResult | undefined>;
	/** Called once at the end, when all the templates and partials are known. */
	data?(
		context: DataContext,
		plugin: PluginContext,
	): MaybePromise<DataResult | undefined>;
	/**
	 * Called last in every compilation, once the templates are compiled, with
	 * the error when it failed.
	 */
	buildEnd?(context: PluginContext, error?: unknown): MaybePromise<void>;
	/** Helpers, and more, for rendering, see `RuntimeEntry`. */
	runtime?: RuntimeEntry;
}

/** What the runtime gives to the setup of a runtime plugin. */
export interface RuntimeApi {
	SafeString: typeof Handlebars.SafeString;
	escapeExpression: typeof Handlebars.escapeExpression;
	createFrame: typeof Handlebars.createFrame;
	HelperError: typeof HelperError;
}

export interface RuntimePluginHooks {
	/** Helpers to register, they can not replace existing ones. */
	helpers?: Record<string, HelperDelegate>;
	/**
	 * Called before every render, it can be async. The values it returns are
	 * read as `@plugin-name.data-name`, over the data of the compile plugin.
	 */
	prepare?(context: unknown): MaybePromise<Record<string, unknown> | undefined>;
	/** Changes the rendered output, in the order of the plugins. */
	transform?(output: string, context: unknown): MaybePromise<string>;
}

/** Runtime stage plugin, passed to `createRenderer` or `renderTemplate`. */
export interface RuntimePlugin extends RuntimePluginHooks {
	/** Required. */
	name: string;
}

/** Default export of the runtime half of a compile plugin. */
export type RuntimePluginSetup<Options = never> = (
	api: RuntimeApi,
	options: Options,
) => RuntimePluginHooks;

/** Gives type checking to the runtime half of a compile plugin. */
export function defineRuntimePlugin<Options = never>(
	setup: RuntimePluginSetup<Options>,
): RuntimePluginSetup<Options> {
	return setup;
}

/** Throws unless `name` can be used as the name of a plugin, partial, data or helper. */
export function assertName(
	name: unknown,
	label: string,
): asserts name is string {
	if (typeof name !== 'string' || name === '') {
		throw new PluginError(`${label} name is required`);
	}
	if (NAME_DENYLIST_REGEX.test(name) || FORBIDDEN_KEYS.has(name)) {
		throw new PluginError(`${label} name '${name}' is not valid`);
	}
}

export function assertPlugins(
	plugins: readonly { name: unknown }[],
	kind: 'compile' | 'runtime',
): void {
	const names = new Set<string>();

	for (const { name } of plugins) {
		assertName(name, 'Plugin');
		if (RESERVED_PLUGIN_NAMES.has(name) || name.startsWith('_')) {
			throw new PluginError(`Plugin name '${name}' is reserved`);
		}
		if (names.has(name)) {
			throw new PluginError(`Duplicate ${kind} plugin '${name}'`);
		}
		names.add(name);
	}
}

/** Only the place, of a `PartialUsage` for example. */
export function toLocation(loc: Location): Location;
export function toLocation(loc: Location | undefined): Location | undefined;
export function toLocation(loc: Location | undefined): Location | undefined {
	return loc && { path: loc.path, line: loc.line, column: loc.column };
}

/** `message (path:line:column)` */
export function withLocation(message: string, loc?: Location): string {
	return loc ? `${message} (${loc.path}:${loc.line}:${loc.column})` : message;
}
