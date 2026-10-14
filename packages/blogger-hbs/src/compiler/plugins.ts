import Handlebars from 'handlebars';
import {
	assertName,
	assertPlugins,
	type CompilePlugin,
	PluginError,
	type TemplateContext,
} from '../plugins';
import type { PluginData } from '../runtime/chunks';
import { extractImports, findPartials, type Program } from './ast';
import type { Chunks, PartialChunk } from './chunks';

export interface PluginOutput {
	/** Still to be precompiled. */
	partials: PartialChunk[];
	data: PluginData;
}

interface Request {
	plugin: string;
	/** Name of the partial without the plugin name. */
	name: string;
	/** Where it is used first. */
	where: string;
}

/**
 * Runs the compile plugins.
 *
 * 1. `preprocess` gets all the templates at once, so plugins can inspect or
 *    change their ASTs.
 * 2. The partials used by name (`{{> plugin-name.template-name}}`) are collected
 *    and `provide` is called with the ones of each plugin. What is provided is
 *    scanned for partials of other plugins (or its own) as well, and the plugins
 *    are asked again until nothing new is used.
 * 3. `finalize` gets the partials of the plugin provided so far and still
 *    missing, and the ones of all the plugins available. The partials it provides are not scanned for
 *    new requests, everything they use has to be provided already.
 * 4. `data` is called once with all the templates and partials.
 *
 * Returns what the plugins provided, the partials still have to be precompiled.
 * It is kept apart from the chunks.
 */
export async function runCompilePlugins(
	plugins: CompilePlugin[],
	chunks: Chunks,
): Promise<PluginOutput> {
	assertPlugins(plugins, 'compile');
	const data: PluginData = Object.create(null);
	if (plugins.length === 0) {
		return { partials: [], data };
	}

	const owners = new Map(plugins.map((plugin) => [plugin.name, plugin]));
	const contexts: TemplateContext[] = [];
	const requests = new Map<string, Request>();
	const partials = new Map<string, PartialChunk>();

	const collect = (program: Program, where: string): void => {
		for (const full of findPartials(program)) {
			const dot = full.indexOf('.');
			const plugin = full.slice(0, dot);
			// anything else can still be registered when rendering
			if (dot > 0 && owners.has(plugin) && !requests.has(full)) {
				requests.set(full, { plugin, name: full.slice(dot + 1), where });
			}
		}
	};

	for (const [id, chunk] of chunks) {
		if (chunk.type === 'template') {
			contexts.push({
				id,
				path: chunk.path,
				source: chunk.source,
				ast: chunk.parsed,
			});
		}
	}

	for (const plugin of plugins) {
		await call(plugin, 'preprocess', () => plugin.preprocess?.(contexts));
	}

	for (const context of contexts) {
		const chunk = chunks.get(context.id);
		if (chunk?.type === 'template') {
			chunk.parsed = context.ast;
		}
		collect(context.ast, context.path);
	}

	const asked = new Set<string>();
	for (let round = 0; ; round++) {
		const batch = new Map<string, string[]>(plugins.map((p) => [p.name, []]));
		for (const [full, request] of requests) {
			if (!asked.has(full)) {
				asked.add(full);
				if (!partials.has(full)) {
					batch.get(request.plugin)?.push(request.name);
				}
			}
		}

		// plugins providing everything up front are always called once
		const active = plugins.filter(
			(plugin) => round === 0 || (batch.get(plugin.name)?.length ?? 0) > 0,
		);
		if (active.length === 0) {
			break;
		}

		for (const plugin of active) {
			const names = batch.get(plugin.name) ?? [];
			const result = await call(plugin, 'provide', () =>
				plugin.provide?.({ partials: names, templates: contexts }),
			);
			addPartials(plugin.name, 'provide', result);
		}
	}

	// everything `provide` could give is known now, what `finalize` provides is
	// not asked for again, so it can only use partials that are already there
	const available = [...partials.keys()];
	for (const plugin of plugins) {
		const missing: string[] = [];
		for (const [full, request] of requests) {
			if (request.plugin === plugin.name && !partials.has(full)) {
				missing.push(request.name);
			}
		}

		const provided = ownPartials(available, plugin.name);
		const result = await call(plugin, 'finalize', () =>
			plugin.finalize?.({ provided, missing, available }),
		);
		addPartials(plugin.name, 'finalize', result);
	}

	for (const [full, request] of requests) {
		if (!partials.has(full)) {
			const hint =
				available.includes(request.where) || !partials.has(request.where)
					? ''
					: ', partials provided by finalize can only use partials provided before';
			throw new PluginError(
				`Plugin '${request.plugin}' did not provide the partial '${request.name}' (used in ${request.where})${hint}`,
			);
		}
	}

	const all = [...partials.keys()];
	for (const plugin of plugins) {
		const provided = ownPartials(all, plugin.name);
		const result = await call(plugin, 'data', () =>
			plugin.data?.({ provided, available: all, templates: contexts }),
		);
		for (const [name, value] of Object.entries(
			assertRecord(plugin.name, 'data', result),
		)) {
			addData(plugin.name, name, value);
		}
	}

	function addPartials(plugin: string, hook: Hook, result: unknown): void {
		for (const [name, source] of Object.entries(
			assertRecord(plugin, hook, result),
		)) {
			addPartial(plugin, name, source);
		}
	}

	function addPartial(plugin: string, name: string, source: unknown): void {
		assertName(name, `Partial of plugin '${plugin}'`);
		if (typeof source !== 'string') {
			throw new PluginError(
				`Partial '${name}' of plugin '${plugin}' must be a string, got: ${typeof source}`,
			);
		}

		const full = `${plugin}.${name}`;
		if (partials.has(full)) {
			return;
		}

		let parsed: Program;
		try {
			parsed = Handlebars.parse(source, { srcName: full }) as Program;
		} catch (error) {
			throw new PluginError(`Failed to parse partial '${full}'`, {
				cause: error,
			});
		}
		if (extractImports(parsed).length > 0) {
			throw new PluginError(`Partial '${full}' can not use 'import'`);
		}

		const chunk: PartialChunk = { name: full, source, parsed };
		partials.set(full, chunk);
		collect(parsed, full);
	}

	function addData(plugin: string, name: string, value: unknown): void {
		assertName(name, `Data of plugin '${plugin}'`);

		let serialized: string | undefined;
		try {
			serialized = JSON.stringify(value);
		} catch (error) {
			throw new PluginError(
				`Data '${name}' of plugin '${plugin}' is not serializable`,
				{ cause: error },
			);
		}
		if (serialized === undefined) {
			throw new PluginError(
				`Data '${name}' of plugin '${plugin}' is not serializable`,
			);
		}

		data[plugin] ??= Object.create(null);
		data[plugin][name] = value;
	}

	return { partials: [...partials.values()], data };
}

/** Names of the partials of `plugin` among full names, without the plugin name. */
function ownPartials(names: readonly string[], plugin: string): string[] {
	const prefix = `${plugin}.`;
	return names
		.filter((name) => name.startsWith(prefix))
		.map((name) => name.slice(prefix.length));
}

type Hook = 'preprocess' | 'provide' | 'finalize' | 'data';

/** What `provide`, `finalize` and `data` return, an object by name or nothing. */
function assertRecord(
	plugin: string,
	hook: Hook,
	result: unknown,
): Record<string, unknown> {
	if (result === undefined) {
		return {};
	}
	if (typeof result !== 'object' || result === null || Array.isArray(result)) {
		throw new PluginError(
			`Plugin '${plugin}' must return an object or nothing from '${hook}', got: ${result === null ? 'null' : Array.isArray(result) ? 'array' : typeof result}`,
		);
	}
	return result as Record<string, unknown>;
}

async function call<T>(
	plugin: CompilePlugin,
	hook: Hook,
	fn: () => T | Promise<T>,
): Promise<T | undefined> {
	try {
		return await fn();
	} catch (error) {
		// by name too, a plugin can get `PluginError` from another copy of the package
		if (
			error instanceof PluginError ||
			(error instanceof Error && error.name === 'PluginError')
		) {
			throw error;
		}
		throw new PluginError(`Plugin '${plugin.name}' failed in '${hook}'`, {
			cause: error,
		});
	}
}
