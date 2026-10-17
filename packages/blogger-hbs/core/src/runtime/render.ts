import Handlebars, { type TemplateDelegate } from 'handlebars/runtime';
import {
	FORBIDDEN_KEYS,
	NAME_DENYLIST_REGEX,
	TEMPLATE_FORMAT,
} from '../constants';
import {
	assertPlugins,
	callHook,
	hookError,
	PluginError,
	type RuntimeApi,
	type RuntimePlugin,
} from '../plugins';
import { describeValue } from '../utils/suggest';
import type {
	BundledPlugin,
	MinimalChunks,
	PluginData,
	PluginPartials,
} from './chunks';
import { HelperError } from './helpers';
import { optionsOf } from './helpers/args';
import * as helpers from './helpers/functions';
import { createImportHelper, RUNTIMES_DATA_KEY } from './import';
import { restoreLinebreaks } from './linebreaks';

/** What the compiled module exports, or what `compileTemplate` returns. */
export interface CompiledModule {
	/** Version of the compiled output, see `TEMPLATE_FORMAT`. */
	format: number;
	chunks: MinimalChunks;
	entry: string;
	/** Templates provided by compile plugins. */
	pluginPartials?: PluginPartials;
	/** Data provided by compile plugins. */
	pluginData?: PluginData;
	/** Runtime halves of the compile plugins. */
	bundledPlugins?: readonly BundledPlugin[];
}

export interface RendererOptions {
	/** More plugins, after the bundled ones, for example with app specific helpers. */
	plugins?: RuntimePlugin[];
}

export interface Renderer {
	/** Renders the entry template, running the `prepare` and `transform` of plugins. */
	render(context?: unknown): Promise<string>;
}

/**
 * Sets up the template once (Handlebars, its templates, partials, helpers and
 * plugins) to render it as many times as needed, each render on its own. It
 * runs in any JavaScript runtime.
 *
 * ```ts
 * import * as theme from './dist/compiled.js';
 * const renderer = createRenderer(theme);
 * const xml = await renderer.render(context);
 * ```
 */
export function createRenderer(
	compiled: CompiledModule,
	options: RendererOptions = {},
): Renderer {
	const { draw, plugins } = setup(compiled, options);

	return {
		async render(context = {}) {
			const data = await prepareData(compiled.pluginData, plugins, context);
			let output = draw(context, data);
			for (const plugin of plugins) {
				const { transform } = plugin;
				if (transform) {
					output = await callHook(plugin.name, 'transform', () =>
						transform(output, context),
					);
					if (typeof output !== 'string') {
						throw new PluginError(
							`Plugin '${plugin.name}' must return a string from 'transform', got: ${describeValue(output)}`,
							{ plugin: plugin.name },
						);
					}
				}
			}
			return output;
		},
	};
}

export interface RenderTemplateOptions extends Omit<CompiledModule, 'format'> {
	format?: number;
	context?: unknown;
	plugins?: RuntimePlugin[];
}

/**
 * Renders the entry template once, synchronously. Plugins with `prepare` or
 * `transform` need `createRenderer`.
 */
export function renderTemplate(options: RenderTemplateOptions): string {
	const { context = {}, plugins: extra, ...compiled } = options;
	const { draw, plugins } = setup(
		{ ...compiled, format: compiled.format ?? TEMPLATE_FORMAT },
		{ plugins: extra },
	);

	for (const plugin of plugins) {
		for (const hook of ['prepare', 'transform'] as const) {
			if (plugin[hook]) {
				throw new PluginError(
					`Plugin '${plugin.name}' has '${hook}', render with createRenderer`,
					{ plugin: plugin.name },
				);
			}
		}
	}

	return draw(context, dataOf(compiled.pluginData));
}

function setup(
	compiled: CompiledModule,
	options: RendererOptions,
): {
	draw: (context: unknown, data: PluginData) => string;
	plugins: RuntimePlugin[];
} {
	const {
		format,
		chunks,
		entry,
		pluginPartials,
		bundledPlugins = [],
	} = compiled;

	if (format !== TEMPLATE_FORMAT) {
		throw new Error(
			typeof format === 'number'
				? `The template is compiled for format ${format} but this version of blogger-hbs renders format ${TEMPLATE_FORMAT}, compile it with the same version`
				: 'Expected a compiled template, the module emitted by blogger-hbs or what compileTemplate returns',
		);
	}

	// Everything created here belongs to this renderer only, the chunks can be
	// shared between renderers and must not be bound to a Handlebars instance.
	const hbs = Handlebars.noConflict().create();
	const api: RuntimeApi = {
		SafeString: hbs.SafeString,
		escapeExpression: hbs.escapeExpression,
		createFrame: hbs.createFrame,
		HelperError,
	};

	const plugins: RuntimePlugin[] = [
		...bundledPlugins.map(({ name, options, setup }) => {
			let hooks: unknown;
			try {
				hooks = setup(api, options as never);
			} catch (error) {
				throw hookError(error, name, 'setup');
			}
			if (typeof hooks !== 'object' || hooks === null) {
				throw new PluginError(
					`Plugin '${name}' must return an object from the setup of its runtime, got: ${describeValue(hooks)}`,
					{ plugin: name },
				);
			}
			return { ...hooks, name };
		}),
		...(options.plugins ?? []),
	];
	assertPlugins(plugins, 'runtime');

	const templates = new Map<string, TemplateDelegate>();
	for (const [id, chunk] of chunks) {
		switch (chunk.type) {
			case 'template':
				if (!chunk.spec) {
					throw new Error(`Missing template specification for '${id}'`);
				}
				templates.set(id, hbs.template(chunk.spec));
				break;
			case 'data':
				break;
			default:
				// the code of an asset may be empty, but it has to be there
				if (typeof chunk.code !== 'string') {
					throw new Error(`Missing asset code for '${id}'`);
				}
		}
	}

	for (const [name, spec] of pluginPartials ?? []) {
		if (!spec) {
			throw new Error(`Missing template specification for partial '${name}'`);
		}
		hbs.registerPartial(name, hbs.template(spec));
	}

	const owners = new Map<string, string>();
	const register = (name: string, helper: unknown, owner: string): void => {
		if (typeof helper !== 'function') {
			throw new PluginError(`Helper '${name}' of ${owner} must be a function`);
		}
		if (NAME_DENYLIST_REGEX.test(name) || FORBIDDEN_KEYS.has(name)) {
			throw new PluginError(`Helper name '${name}' of ${owner} is not valid`);
		}
		const existing = owners.get(name);
		if (existing) {
			throw new PluginError(
				`Helper '${name}' of ${owner} is already registered by ${existing}`,
			);
		}
		owners.set(name, owner);
		hbs.registerHelper(name, withPlace(helper as Handlebars.HelperDelegate));
	};

	register('import', createImportHelper(chunks, templates), 'built-in');
	for (const [name, fn] of Object.entries(helpers)) {
		register(name, fn, 'built-in');
	}
	for (const plugin of plugins) {
		for (const [name, fn] of Object.entries(plugin.helpers ?? {})) {
			register(name, fn, `plugin '${plugin.name}'`);
		}
	}

	const main = templates.get(entry);
	if (!main) {
		throw new Error(`Failed to find entry template '${entry}'`);
	}

	return {
		plugins,
		draw(context, data) {
			// what one render keeps track of, read by the `import` helper
			const frame = { ...data, [RUNTIMES_DATA_KEY]: new Set<string>() };
			return restoreLinebreaks(main(context, { data: frame }));
		},
	};
}

/**
 * The helper with its errors as `HelperError`s, which say which helper it is
 * and where it is used: the options Handlebars gives a helper tell both.
 */
function withPlace(
	helper: Handlebars.HelperDelegate,
): Handlebars.HelperDelegate {
	return function (this: unknown, ...args: unknown[]) {
		const options = optionsOf(args);
		try {
			return (helper as (...args: unknown[]) => unknown).apply(this, args);
		} catch (error) {
			// by name too, a helper can get `HelperError` from another copy of the package
			const known = error as Partial<HelperError> | null;
			if (known?.name !== 'HelperError') {
				// `throw new TypeError('...')` reads as the helper's own message
				throw new HelperError(messageOf(error), { options, cause: error });
			}
			// made without the options, it does not know where it is
			if (known.loc === undefined && known.helper === undefined) {
				throw new HelperError(known.message, { options, cause: known.cause });
			}
			throw error;
		}
	};
}

/** The message of something thrown, undefined when it has none. */
function messageOf(error: unknown): string | undefined {
	const message =
		typeof error === 'string'
			? error
			: (error as { message?: unknown } | null)?.message;
	return typeof message === 'string' && message !== '' ? message : undefined;
}

/** The data of the compile plugins, read as `@plugin.name`. */
function dataOf(pluginData: PluginData | undefined): PluginData {
	const data: PluginData = Object.create(null);
	for (const [plugin, values] of Object.entries(pluginData ?? {})) {
		data[plugin] = values;
	}
	return data;
}

/** The data of the compile plugins, with what `prepare` returns over it. */
async function prepareData(
	pluginData: PluginData | undefined,
	plugins: RuntimePlugin[],
	context: unknown,
): Promise<PluginData> {
	const data = dataOf(pluginData);

	for (const plugin of plugins) {
		if (!plugin.prepare) {
			continue;
		}
		const values = await callHook(plugin.name, 'prepare', () =>
			plugin.prepare?.(context),
		);
		if (values === undefined) {
			continue;
		}
		if (
			typeof values !== 'object' ||
			values === null ||
			Array.isArray(values)
		) {
			throw new PluginError(
				`Plugin '${plugin.name}' must return an object or nothing from 'prepare', got: ${describeValue(values)}`,
				{ plugin: plugin.name },
			);
		}
		data[plugin.name] = Object.assign(
			Object.create(null),
			data[plugin.name],
			values,
		);
	}

	return data;
}
