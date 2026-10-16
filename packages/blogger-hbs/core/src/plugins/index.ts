import type { HelperDelegate } from 'handlebars/runtime';
import type { Program } from '../compiler/ast';
import {
	FORBIDDEN_KEYS,
	NAME_DENYLIST_REGEX,
	RESERVED_PLUGIN_NAMES,
} from '../constants';

export class PluginError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'PluginError';
	}
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

export interface ProvideContext {
	/**
	 * Names of the plugin's partials (without the plugin name) that are used by
	 * the templates, or by what plugins provided, and were not asked for before.
	 */
	partials: string[];
	/** All the scanned templates. */
	templates: readonly TemplateContext[];
}

export interface FinalizeContext {
	/** Names of the plugin's partials (without the plugin name) provided so far. */
	provided: readonly string[];
	/** Names of the plugin's partials that are used but were not provided. */
	missing: readonly string[];
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

/**
 * Compile stage plugin. The partials and data it provides are compiled into the
 * output and need no plugin when rendering.
 */
export interface CompilePlugin {
	/** Required, partials and data of the plugin are namespaced with it. */
	name: string;
	/**
	 * Called once with all the scanned templates before the partials they use
	 * are collected, so their ASTs can be inspected or changed.
	 */
	preprocess?(templates: readonly TemplateContext[]): MaybePromise<void>;
	/**
	 * Provides templates. It is called once with the partials used so far and
	 * again with the new ones, as long as what is provided uses more of its
	 * partials. Something already provided is not replaced.
	 */
	provide?(context: ProvideContext): MaybePromise<ProvideResult | undefined>;
	/**
	 * Called once after `provide` with every partial provided, for templates
	 * that depend on all of them, for example one rendering each partial. A used
	 * partial can be left out by `provide` to be provided here. What it provides
	 * can only use partials provided before.
	 */
	finalize?(context: FinalizeContext): MaybePromise<ProvideResult | undefined>;
	/** Called once at the end, when all the templates and partials are known. */
	data?(context: DataContext): MaybePromise<DataResult | undefined>;
}

/** Runtime stage plugin, passed to `renderTemplate`. */
export interface RuntimePlugin {
	/** Required. */
	name: string;
	/** Helpers to register, they can not replace existing ones. */
	helpers?: Record<string, HelperDelegate>;
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
