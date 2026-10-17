import {
	FILE_EXTENSIONS,
	INDEX_EXTENSIONS,
	RESOLVE_EXTENSIONS,
	TEMPLATE_FORMAT,
} from '../constants';
import type { CompilePlugin } from '../plugins';
import type { PluginData } from '../runtime/chunks';
import { toSpecifier } from '../utils/path';
import { createResolver, type Resolver } from '../utils/resolver';
import { bundleAssets } from './bundle';
import type { Chunks, PartialChunk } from './chunks';
import { linkDependencies } from './dependencies';
import { emitSource } from './emit';
import {
	assertCompileOptions,
	assertDirectories,
	assertEntry,
	resolvePaths,
} from './options';
import {
	createPluginContexts,
	endCompilePlugins,
	type RuntimeRequest,
	runCompilePlugins,
	sortPlugins,
} from './plugins';
import { precompileTemplates } from './precompile';
import type { RsbuildOptions } from './rsbuild';
import {
	type BundledRuntime,
	bundleRuntimes,
	type RuntimeBundle,
} from './runtimes';
import { scan } from './scan';
import { validateTemplateXml } from './validate';

export interface CompileTemplateOptions {
	root?: string;
	entry?: string;
	alias?: Record<string, string>;
	plugins?: CompilePlugin[];
	/** Rsbuild config for bundling scripts and styles, merged over the defaults. */
	rsbuild?: RsbuildOptions;
	/** Called with the warnings of plugins, `console.warn` by default. */
	onWarn?: (message: string) => void;
}

export interface CompiledTemplate {
	/** Version of the compiled output, checked by the runtime. */
	format: number;
	chunks: Chunks;
	/** Templates provided by plugins, by partial name. */
	pluginPartials: Map<string, object>;
	/** Data provided by plugins, by plugin name and data name. */
	pluginData: PluginData;
	/** Runtime halves of the plugins, bundled. */
	bundledPlugins: BundledRuntime[];
	entry: string;
	/** The ES module to render the template with, it imports nothing. */
	source: string;
}

/**
 * scan imports -> compile plugins -> validate dependencies -> precompile
 * templates -> bundle assets and plugin runtimes -> emit module source.
 */
export async function compileTemplate(
	options: CompileTemplateOptions = {},
): Promise<CompiledTemplate> {
	assertCompileOptions(options);
	await assertDirectories(options);

	const prepared = await prepareTemplate(options);
	// two builds of their own, side by side, an error of the scripts and styles first
	const [assets, runtimes] = await Promise.allSettled([
		bundleAssets(
			prepared.chunks,
			prepared.root,
			options.rsbuild,
			prepared.dependencies,
		),
		bundleRuntimes(prepared.root, prepared.runtimes),
	]);
	if (assets.status === 'rejected') {
		throw assets.reason;
	}
	if (runtimes.status === 'rejected') {
		throw runtimes.reason;
	}
	return finishTemplate(prepared, runtimes.value);
}

/** A template compiled up to the bundling of its scripts, styles and plugin runtimes. */
export interface PreparedTemplate {
	root: string;
	/** Id of the entry template. */
	entry: string;
	chunks: Chunks;
	partials: PartialChunk[];
	pluginData: PluginData;
	/** The runtime halves of the plugins, to bundle. */
	runtimes: RuntimeRequest[];
	/** The entries each script entry depends on. */
	dependencies: Map<string, string[]>;
}

export interface PrepareOptions {
	/**
	 * Called with every template and json file before it is read, and the files
	 * plugins add, even when compiling fails.
	 */
	onRead?: (file: string) => void;
	/** Whether the template is compiled again on changes, told to plugins. */
	watch?: boolean;
	/**
	 * The resolver to reuse between compilations, cleared when files change,
	 * see `createTemplateResolver`. A new one without it.
	 */
	resolver?: Resolver;
}

/** The resolver of the imports of the templates, for the root and aliases of the options. */
export function createTemplateResolver(
	options: CompileTemplateOptions,
): Resolver {
	return createResolver({
		root: resolvePaths(options).root,
		alias: options.alias ?? {},
		extensions: {
			index: [...INDEX_EXTENSIONS],
			file: [...FILE_EXTENSIONS],
			resolve: [...RESOLVE_EXTENSIONS],
		},
	});
}

/** Everything but bundling the scripts, styles and plugin runtimes, for validated options. */
export async function prepareTemplate(
	options: CompileTemplateOptions = {},
	{
		onRead,
		watch = false,
		resolver = createTemplateResolver(options),
	}: PrepareOptions = {},
): Promise<PreparedTemplate> {
	const { root, entry } = resolvePaths(options);
	const { onWarn = console.warn } = options;
	const plugins = sortPlugins(options.plugins ?? []);

	onRead?.(entry);
	await assertEntry(options);

	const contexts = createPluginContexts(plugins, {
		root,
		entry,
		watch,
		resolver,
		onRead,
		onWarn,
	});

	let prepared: PreparedTemplate;
	try {
		const { chunks, templates, requirements } = await scan(entry, {
			root,
			resolver,
			onRead,
		});

		const {
			partials,
			data: pluginData,
			runtimes,
		} = await runCompilePlugins(plugins, chunks, contexts);
		const dependencies = linkDependencies(chunks, requirements);

		// always, after the plugins changed the templates and provided theirs, the
		// options of the rendered output do not turn it off
		for (const template of templates) {
			validateTemplateXml(template.parsed, toSpecifier(root, template.path));
		}
		for (const partial of partials) {
			validateTemplateXml(partial.parsed, partial.name, partial.plugin);
		}

		precompileTemplates([...templates, ...partials]);

		prepared = {
			root,
			entry: toSpecifier(root, entry),
			chunks,
			partials,
			pluginData,
			runtimes,
			dependencies,
		};
	} catch (error) {
		await endCompilePlugins(plugins, contexts, error);
		throw error;
	}

	await endCompilePlugins(plugins, contexts);
	return prepared;
}

/** Emits the module source of a template whose scripts, styles and runtimes are bundled. */
export function finishTemplate(
	{ entry, chunks, partials, pluginData }: PreparedTemplate,
	bundle: RuntimeBundle | undefined,
): CompiledTemplate {
	const pluginPartials = new Map(
		partials.map((partial) => [partial.name, partial.spec as object]),
	);

	return {
		format: TEMPLATE_FORMAT,
		chunks,
		pluginPartials,
		pluginData,
		bundledPlugins: bundle?.plugins ?? [],
		entry,
		source: emitSource({
			chunks,
			partials: new Map(
				partials.map((partial) => [partial.name, partial.compiled as string]),
			),
			pluginData,
			bundle,
			entry,
		}),
	};
}
