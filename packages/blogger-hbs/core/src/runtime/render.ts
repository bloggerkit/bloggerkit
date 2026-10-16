import Handlebars, { type TemplateDelegate } from 'handlebars/runtime';
import { FORBIDDEN_KEYS, NAME_DENYLIST_REGEX } from '../constants';
import { assertPlugins, PluginError, type RuntimePlugin } from '../plugins';
import type { MinimalChunks, PluginData, PluginPartials } from './chunks';
import * as helpers from './helpers/functions';
import { createImportHelper } from './import';
import { restoreLinebreaks } from './linebreaks';

export interface RenderTemplateOptions {
	chunks: MinimalChunks;
	entry: string;
	context?: unknown;
	/** Templates provided by compile plugins, as exported by the compiled module. */
	pluginPartials?: PluginPartials;
	/** Data provided by compile plugins, as exported by the compiled module. */
	pluginData?: PluginData;
	plugins?: RuntimePlugin[];
}

export function renderTemplate(options: RenderTemplateOptions): string {
	const {
		chunks,
		entry,
		context = {},
		pluginPartials,
		pluginData,
		plugins = [],
	} = options;

	assertPlugins(plugins, 'runtime');

	// Everything created here belongs to this render only, the chunks are shared
	// between renders and must not be bound to a Handlebars instance.
	const hbs = Handlebars.noConflict().create();
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

	// read as `@plugin.name`
	const data: PluginData = Object.create(null);
	for (const [plugin, values] of Object.entries(pluginData ?? {})) {
		data[plugin] = values;
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
		hbs.registerHelper(name, helper as Handlebars.HelperDelegate);
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

	return restoreLinebreaks(main(context, { data }));
}
