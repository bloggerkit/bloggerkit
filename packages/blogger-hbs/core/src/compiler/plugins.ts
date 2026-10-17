import * as path from 'node:path';
import Handlebars from 'handlebars';
import * as z from 'zod';
import { FORBIDDEN_KEYS, NAME_DENYLIST_REGEX } from '../constants';
import {
	assertPlugins,
	type CompilePlugin,
	callHook,
	type JsonValue,
	type Location,
	type PartialRequest,
	type PartialUsage,
	type PluginContext,
	PluginError,
	type TemplateContext,
	toLocation,
	withLocation,
} from '../plugins';
import type { PluginData } from '../runtime/chunks';
import type { Resolver } from '../utils/resolver';
import { describeValue } from '../utils/suggest';
import {
	extractImports,
	findInlinePartials,
	findPartialUsages,
	type Program,
} from './ast';
import type { Chunks, PartialChunk } from './chunks';
import { CompileError } from './errors';

/** The runtime half of a compile plugin, to be bundled. */
export interface RuntimeRequest {
	plugin: string;
	entry: string;
	options?: JsonValue;
}

export interface PluginOutput {
	/** Still to be precompiled. */
	partials: PartialChunk[];
	data: PluginData;
	runtimes: RuntimeRequest[];
}

export interface PluginEnvironment {
	root: string;
	/** Absolute path of the entry. */
	entry: string;
	watch: boolean;
	resolver: Resolver;
	/** Called with the files plugins add to watch. */
	onRead?: (file: string) => void;
	onWarn: (message: string) => void;
}

/** The plugins in the order their hooks run, `pre`, the others, then `post`. */
export function sortPlugins(
	plugins: readonly CompilePlugin[],
): CompilePlugin[] {
	const rank = (plugin: CompilePlugin) =>
		plugin.enforce === 'pre' ? 0 : plugin.enforce === 'post' ? 2 : 1;
	return [...plugins].sort((a, b) => rank(a) - rank(b));
}

/** The context of every plugin, by name, for one compilation. */
export function createPluginContexts(
	plugins: readonly CompilePlugin[],
	environment: PluginEnvironment,
): Map<string, PluginContext> {
	const { root, entry, watch, resolver, onRead, onWarn } = environment;
	const mode =
		process.env.NODE_ENV === 'development' ? 'development' : 'production';

	return new Map(
		plugins.map(({ name }) => [
			name,
			{
				root,
				entry,
				mode,
				watch,
				async resolve(specifier, importer = entry) {
					try {
						return await resolver.resolve(importer, specifier);
					} catch {
						return undefined;
					}
				},
				addWatchFile(file) {
					onRead?.(path.resolve(root, file));
				},
				warn(message, loc) {
					onWarn(withLocation(`Plugin '${name}': ${message}`, loc));
				},
				error(message, loc): never {
					throw new PluginError(
						withLocation(`Plugin '${name}': ${message}`, loc),
						{ plugin: name, loc: toLocation(loc) },
					);
				},
			} satisfies PluginContext,
		]),
	);
}

interface Request {
	plugin: string;
	/** Name of the partial without the plugin name. */
	name: string;
	/** Where it is used first. */
	where: string;
	/** Every place it is used, more are added as partials are provided. */
	usages: PartialUsage[];
}

/**
 * Runs the compile plugins, sorted with `sortPlugins`.
 *
 * 1. `buildStart` and then `preprocess` get all the templates at once, so
 *    plugins can inspect or change their ASTs.
 * 2. The partials used by name (`{{> plugin-name.template-name}}`) are collected
 *    and `provide` is called with the ones of each plugin. What is provided is
 *    scanned for partials of other plugins (or its own) as well, and the plugins
 *    are asked again until nothing new is used.
 * 3. `finalize` gets the partials of the plugin provided so far and still
 *    missing, and the ones of all the plugins available. The partials it
 *    provides are not scanned for new requests, everything they use has to be
 *    provided already.
 * 4. `data` is called once with all the templates and partials.
 *
 * Returns what the plugins provided, the partials still have to be precompiled.
 * It is kept apart from the chunks. `buildEnd` is called by `endCompilePlugins`.
 */
export async function runCompilePlugins(
	plugins: CompilePlugin[],
	chunks: Chunks,
	contexts: Map<string, PluginContext>,
): Promise<PluginOutput> {
	assertPlugins(plugins, 'compile');
	if (plugins.length === 0) {
		return { partials: [], data: Object.create(null), runtimes: [] };
	}

	const hook = <T>(
		plugin: CompilePlugin,
		name: Hook,
		fn: (context: PluginContext) => T | Promise<T>,
	): Promise<T> =>
		callHook(plugin.name, name, () =>
			fn(contexts.get(plugin.name) as PluginContext),
		);

	const templates = templatesOf(chunks);
	const partials = new PartialRequests(plugins);

	for (const plugin of plugins) {
		await hook(plugin, 'buildStart', (context) => plugin.buildStart?.(context));
	}
	// as written, before `preprocess` can change the templates
	for (const template of templates) {
		partials.checkWritten(template.ast, template.id, template.source);
	}
	for (const plugin of plugins) {
		await hook(plugin, 'preprocess', (context) =>
			plugin.preprocess?.(templates, context),
		);
	}
	for (const template of templates) {
		const chunk = chunks.get(template.id);
		if (chunk?.type === 'template') {
			chunk.parsed = template.ast;
		}
		partials.collect(template.ast, template.id);
	}

	// `provide` until no partial is asked for that was not asked for before,
	// plugins providing everything up front are always called once
	for (let round = 0; ; round++) {
		const asking = partials.newRequests();
		const active = plugins.filter(
			(plugin) => round === 0 || (asking.get(plugin.name)?.length ?? 0) > 0,
		);
		if (active.length === 0) {
			break;
		}
		for (const plugin of active) {
			const requests = asking.get(plugin.name) ?? [];
			const result = await hook(plugin, 'provide', (context) =>
				plugin.provide?.(
					{
						partials: requests.map(({ name }) => name),
						requests: requests.map(toRequest),
						templates,
					},
					context,
				),
			);
			partials.add(plugin.name, 'provide', result);
		}
	}

	// everything `provide` could give is known now, what `finalize` provides is
	// not asked for again, so it can only use partials that are already there
	const available = partials.names();
	for (const plugin of plugins) {
		const own = partials.requestsOf(plugin.name);
		const result = await hook(plugin, 'finalize', (context) =>
			plugin.finalize?.(
				{
					provided: ownPartials(available, plugin.name),
					missing: own
						.filter((request) => !partials.has(plugin.name, request.name))
						.map(({ name }) => name),
					requests: own.map(toRequest),
					available,
				},
				context,
			),
		);
		partials.add(plugin.name, 'finalize', result);
	}
	partials.assertProvided(available);

	const all = partials.names();
	const data: PluginData = Object.create(null);
	for (const plugin of plugins) {
		const result = await hook(plugin, 'data', (context) =>
			plugin.data?.(
				{ provided: ownPartials(all, plugin.name), available: all, templates },
				context,
			),
		);
		for (const [name, value] of Object.entries(
			assertRecord(plugin.name, 'data', result),
		)) {
			addData(data, plugin.name, name, value);
		}
	}

	return {
		partials: partials.provided(),
		data,
		runtimes: plugins.flatMap((plugin) =>
			plugin.runtime === undefined
				? []
				: [
						{
							plugin: plugin.name,
							entry: plugin.runtime.entry,
							options: plugin.runtime.options,
						},
					],
		),
	};
}

/** The templates of the chunks, as plugins get them. */
function templatesOf(chunks: Chunks): TemplateContext[] {
	const templates: TemplateContext[] = [];
	for (const [id, chunk] of chunks) {
		if (chunk.type === 'template') {
			templates.push({
				id,
				path: chunk.path,
				source: chunk.source,
				ast: chunk.parsed,
			});
		}
	}
	return templates;
}

const toRequest = ({ name, usages }: Request): PartialRequest => ({
	name,
	usages,
});

/**
 * The partials of the plugins asked for in the templates and in the partials
 * provided, and those provided, by full name, `plugin` or `plugin.name`.
 */
class PartialRequests {
	private readonly owners: Set<string>;
	private readonly requests = new Map<string, Request>();
	private readonly partials = new Map<string, PartialChunk>();
	/** The requests a plugin was asked for already. */
	private readonly asked = new Set<string>();

	constructor(plugins: readonly CompilePlugin[]) {
		this.owners = new Set(plugins.map((plugin) => plugin.name));
	}

	/**
	 * Checks the names of the partials of plugins as they are written in the
	 * `source` of `program`, before anything can change it: Handlebars reads
	 * `p..a` as `p`, which is valid.
	 */
	checkWritten(program: Program, where: string, source: string): void {
		for (const usage of findPartialUsages(program, source)) {
			const plugin = pluginOf(usage.raw);
			if (this.owners.has(plugin)) {
				partialKey(plugin, usage.raw, locationOf(where, usage));
			}
		}
	}

	/** Asks for the partials of plugins in `program`, the others are left as they are. */
	collect(program: Program, where: string): void {
		for (const inline of findInlinePartials(program)) {
			const plugin = pluginOf(inline.name);
			if (this.owners.has(plugin)) {
				const loc = locationOf(where, inline);
				throw new CompileError(
					withLocation(
						`Inline partial '${inline.name}' uses the name of plugin '${plugin}', whose partials are '${plugin}' and '${plugin}.name'`,
						loc,
					),
					{ loc },
				);
			}
		}

		for (const usage of findPartialUsages(program)) {
			const plugin = pluginOf(usage.name);
			if (!this.owners.has(plugin)) {
				continue;
			}

			const loc = locationOf(where, usage);
			// the name as it is now, `preprocess` can have changed it
			const name = partialKey(plugin, usage.name, loc);
			const full = fullName(plugin, name);

			let request = this.requests.get(full);
			if (request === undefined) {
				request = { plugin, name, where, usages: [] };
				this.requests.set(full, request);
			}
			request.usages.push({ ...loc, hash: usage.hash });
		}
	}

	/** The requests not asked for before and not provided, by plugin, marked as asked. */
	newRequests(): Map<string, Request[]> {
		const batch = new Map<string, Request[]>();
		for (const [full, request] of this.requests) {
			if (this.asked.has(full)) {
				continue;
			}
			this.asked.add(full);
			if (!this.partials.has(full)) {
				batch.set(request.plugin, [
					...(batch.get(request.plugin) ?? []),
					request,
				]);
			}
		}
		return batch;
	}

	requestsOf(plugin: string): Request[] {
		return [...this.requests.values()].filter(
			(request) => request.plugin === plugin,
		);
	}

	has(plugin: string, name: string): boolean {
		return this.partials.has(fullName(plugin, name));
	}

	/** The full names of the partials provided. */
	names(): string[] {
		return [...this.partials.keys()];
	}

	provided(): PartialChunk[] {
		return [...this.partials.values()];
	}

	/** Adds what `hook` of `plugin` returned, partials by name. */
	add(plugin: string, hook: Hook, result: unknown): void {
		for (const [name, source] of Object.entries(
			assertRecord(plugin, hook, result),
		)) {
			this.addPartial(plugin, name, source);
		}
	}

	/**
	 * Throws for the first partial asked for and not provided. `available` is
	 * what was provided before `finalize`, to tell when only `finalize` could
	 * not use it.
	 */
	assertProvided(available: readonly string[]): void {
		for (const [full, request] of this.requests) {
			if (this.partials.has(full)) {
				continue;
			}
			const hint =
				available.includes(request.where) || !this.partials.has(request.where)
					? ''
					: ', partials provided by finalize can only use partials provided before';
			const partial =
				request.name === MAIN_PARTIAL
					? `its main partial '.' ({{> ${request.plugin}}})`
					: `the partial '${request.name}'`;
			const loc = toLocation(request.usages[0]);
			throw new PluginError(
				withLocation(
					`Plugin '${request.plugin}' did not provide ${partial}${hint}`,
					loc,
				),
				{ plugin: request.plugin, loc },
			);
		}
	}

	private addPartial(plugin: string, name: string, source: unknown): void {
		if (name === '') {
			pluginFailure(plugin, 'provided a partial without a name');
		}
		if (!isPartialKey(name)) {
			pluginFailure(
				plugin,
				`provided a partial with the invalid name '${name}'`,
			);
		}
		if (typeof source !== 'string') {
			pluginFailure(
				plugin,
				`provided the partial '${name}' that is not a string, got: ${describeValue(source)}`,
			);
		}

		const full = fullName(plugin, name);
		if (this.partials.has(full)) {
			return;
		}

		let parsed: Program;
		try {
			parsed = Handlebars.parse(source, { srcName: full }) as Program;
		} catch (error) {
			pluginFailure(
				plugin,
				`provided the partial '${name}' that can not be parsed`,
				{ cause: error },
			);
		}
		if (extractImports(parsed).length > 0) {
			pluginFailure(
				plugin,
				`provided the partial '${name}' that uses 'import', which partials can not`,
			);
		}

		this.partials.set(full, { name: full, plugin, source, parsed });
		this.checkWritten(parsed, full, source);
		this.collect(parsed, full);
	}
}

/** Adds the data `name` of `plugin`, a value serializable to JSON. */
function addData(
	data: PluginData,
	plugin: string,
	name: string,
	value: unknown,
): void {
	if (name === '') {
		pluginFailure(plugin, 'provided data without a name');
	}
	if (NAME_DENYLIST_REGEX.test(name) || FORBIDDEN_KEYS.has(name)) {
		pluginFailure(plugin, `provided data with the invalid name '${name}'`);
	}

	let serialized: string | undefined;
	try {
		serialized = JSON.stringify(value);
	} catch (error) {
		pluginFailure(
			plugin,
			`provided the data '${name}' that is not serializable to JSON`,
			{ cause: error },
		);
	}
	if (serialized === undefined) {
		pluginFailure(
			plugin,
			`provided the data '${name}' that is not serializable to JSON`,
		);
	}

	data[plugin] ??= Object.create(null);
	data[plugin][name] = value;
}

/** Throws an error of `plugin`, `Plugin 'p' provided ...`. */
function pluginFailure(
	plugin: string,
	message: string,
	options?: ErrorOptions,
): never {
	throw new PluginError(`Plugin '${plugin}' ${message}`, {
		...options,
		plugin,
	});
}

/**
 * Calls `buildEnd` of every plugin, with the error when the compilation
 * failed. An error of `buildEnd` replaces it.
 */
export async function endCompilePlugins(
	plugins: CompilePlugin[],
	contexts: Map<string, PluginContext>,
	error?: unknown,
): Promise<void> {
	for (const plugin of plugins) {
		const context = contexts.get(plugin.name);
		if (plugin.buildEnd && context) {
			await callHook(plugin.name, 'buildEnd', () =>
				plugin.buildEnd?.(context, error),
			);
		}
	}
}

/** The key of the main partial of a plugin, `{{> plugin-name}}`. */
const MAIN_PARTIAL = '.';

/** Where something is used, `line` and `column` are 0 when unknown. */
function locationOf(
	path: string,
	{ line, column }: { line?: number; column?: number },
): Location {
	return { path, line: line ?? 0, column: column ?? 0 };
}

/** The first part of a name, before a `.` or a `/`. */
function pluginOf(name: string): string {
	return /^[^./]*/.exec(name)?.[0] ?? '';
}

/** The name a partial is registered with: `p` for `.`, `p.a.b` for `a.b`. */
function fullName(plugin: string, key: string): string {
	return key === MAIN_PARTIAL ? plugin : `${plugin}.${key}`;
}

/** `.`, or names separated by single dots: `a`, `a.b`, `a-b.c_d`. */
function isPartialKey(key: string): boolean {
	return (
		key === MAIN_PARTIAL ||
		key
			.split('.')
			.every(
				(part) =>
					part !== '' &&
					!NAME_DENYLIST_REGEX.test(part) &&
					!FORBIDDEN_KEYS.has(part),
			)
	);
}

/**
 * The key of a partial of `plugin` as it is written, `raw`, throws unless it
 * is `p` or `p.name`. Handlebars reads `p.` and `p..a` as `p`, so it is
 * checked as written.
 */
function partialKey(plugin: string, raw: string, loc: Location): string {
	if (raw === plugin) {
		return MAIN_PARTIAL;
	}
	const key = raw.slice(plugin.length + 1);
	if (raw[plugin.length] === '.' && key !== MAIN_PARTIAL && isPartialKey(key)) {
		return key;
	}

	const fixed = raw.replaceAll('/', '.');
	const rule = `partial of plugin '${plugin}' is '${plugin}' or '${plugin}.name', with names separated by single dots`;
	const message =
		fixed !== raw && isPartialKey(fixed.slice(plugin.length + 1))
			? `Invalid partial '${raw}', did you mean '${fixed}'? A ${rule}`
			: `Invalid partial '${raw}': a ${rule}`;
	throw new CompileError(withLocation(message, loc), { loc });
}

/** Keys of the partials of `plugin` among full names: `.` for `p`, `a` for `p.a`. */
function ownPartials(names: readonly string[], plugin: string): string[] {
	const prefix = `${plugin}.`;
	return names.flatMap((name) =>
		name === plugin
			? [MAIN_PARTIAL]
			: name.startsWith(prefix)
				? [name.slice(prefix.length)]
				: [],
	);
}

type Hook =
	| 'buildStart'
	| 'preprocess'
	| 'provide'
	| 'finalize'
	| 'data'
	| 'buildEnd';

/** What `provide`, `finalize` and `data` return, an object by name or nothing. */
const hookResult = z.optional(z.record(z.string(), z.unknown()));

function assertRecord(
	plugin: string,
	hook: Hook,
	result: unknown,
): Record<string, unknown> {
	const parsed = hookResult.safeParse(result);
	if (!parsed.success) {
		throw new PluginError(
			`Plugin '${plugin}' must return an object or nothing from '${hook}', got: ${describeValue(result)}`,
			{ plugin },
		);
	}
	// the result itself, the values are kept as they are
	return (result ?? {}) as Record<string, unknown>;
}
