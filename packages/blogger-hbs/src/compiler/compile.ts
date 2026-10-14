import {
	FILE_EXTENSIONS,
	INDEX_EXTENSIONS,
	RESOLVE_EXTENSIONS,
} from '../constants';
import type { CompilePlugin } from '../plugins';
import type { PluginData } from '../runtime/chunks';
import { toSpecifier } from '../utils/path';
import { createResolver } from '../utils/resolver';
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
import { runCompilePlugins } from './plugins';
import { precompileTemplates } from './precompile';
import type { RsbuildOptions } from './rsbuild';
import { scan } from './scan';
import { validateTemplateXml } from './validate';

export interface CompileTemplateOptions {
	root?: string;
	entry?: string;
	alias?: Record<string, string>;
	plugins?: CompilePlugin[];
	/** Rsbuild config for bundling scripts and styles, merged over the defaults. */
	rsbuild?: RsbuildOptions;
}

export interface CompiledTemplate {
	chunks: Chunks;
	/** Templates provided by plugins, by partial name. */
	pluginPartials: Map<string, object>;
	/** Data provided by plugins, by plugin name and data name. */
	pluginData: PluginData;
	entry: string;
	source: string;
}

/**
 * scan imports -> compile plugins -> validate dependencies -> precompile
 * templates -> bundle assets -> emit module source.
 */
export async function compileTemplate(
	options: CompileTemplateOptions = {},
): Promise<CompiledTemplate> {
	assertCompileOptions(options);
	await assertDirectories(options);

	const prepared = await prepareTemplate(options);
	await bundleAssets(
		prepared.chunks,
		prepared.root,
		options.rsbuild,
		prepared.dependencies,
	);
	return finishTemplate(prepared);
}

/** A template compiled up to the bundling of its scripts and styles. */
export interface PreparedTemplate {
	root: string;
	/** Id of the entry template. */
	entry: string;
	chunks: Chunks;
	partials: PartialChunk[];
	pluginData: PluginData;
	/** The entries each script entry depends on. */
	dependencies: Map<string, string[]>;
}

/**
 * Everything but bundling the scripts and styles, for validated options.
 * `onRead` is called with every template and json file before it is read,
 * even when compiling fails.
 */
export async function prepareTemplate(
	options: CompileTemplateOptions = {},
	onRead?: (file: string) => void,
): Promise<PreparedTemplate> {
	const { root, entry } = resolvePaths(options);
	const { alias = {}, plugins = [] } = options;

	onRead?.(entry);
	await assertEntry(options);

	const resolver = createResolver({
		root,
		alias,
		extensions: {
			index: [...INDEX_EXTENSIONS],
			file: [...FILE_EXTENSIONS],
			resolve: [...RESOLVE_EXTENSIONS],
		},
	});

	const { chunks, templates, requirements } = await scan(entry, {
		root,
		resolver,
		onRead,
	});

	const { partials, data: pluginData } = await runCompilePlugins(
		plugins,
		chunks,
	);
	const dependencies = linkDependencies(chunks, requirements);

	// always, after the plugins changed the templates and provided theirs, the
	// options of the rendered output do not turn it off
	for (const template of templates) {
		validateTemplateXml(template.parsed, template.path);
	}
	for (const partial of partials) {
		validateTemplateXml(partial.parsed, `partial '${partial.name}'`);
	}

	precompileTemplates([...templates, ...partials]);

	return {
		root,
		entry: toSpecifier(root, entry),
		chunks,
		partials,
		pluginData,
		dependencies,
	};
}

/** Emits the module source of a template whose scripts and styles are bundled. */
export function finishTemplate({
	entry,
	chunks,
	partials,
	pluginData,
}: PreparedTemplate): CompiledTemplate {
	const pluginPartials = new Map(
		partials.map((partial) => [partial.name, partial.spec as object]),
	);

	return {
		chunks,
		pluginPartials,
		pluginData,
		entry,
		source: emitSource({
			chunks,
			partials: new Map(
				partials.map((partial) => [partial.name, partial.compiled as string]),
			),
			pluginData,
			entry,
		}),
	};
}
