import { TEMPLATE_FORMAT } from '../constants';
import type { PluginData } from '../runtime/chunks';
import type { Chunk, Chunks } from './chunks';
import type { RuntimeBundle } from './runtimes';

const HEADER = `/**
 * @typedef {{ type: "template", spec?: object }} TemplateChunk
 * @typedef {{ type: "script", code?: string; css?: string; runtime?: string }} ScriptChunk
 * @typedef {{ type: "style", code?: string }} StyleChunk
 * @typedef {{ type: "runtime", code?: string }} RuntimeChunk
 * @typedef {{ type: "data", data: unknown }} DataChunk
 * @typedef {TemplateChunk | ScriptChunk | StyleChunk | RuntimeChunk | DataChunk} Chunk
 *
 * @typedef {Map<string, Chunk>} Chunks
 * @typedef {Map<string, object>} PluginPartials
 * @typedef {Record<string, Record<string, unknown>>} PluginData
 * @typedef {{ name: string; options?: unknown; setup: (api: object, options: any) => object }} BundledPlugin
 */`;

/**
 * Generates the ES module consumed by `createRenderer` and `renderTemplate`. It
 * imports nothing, the runtimes of the plugins are bundled into it.
 */
export function emitSource({
	chunks,
	partials,
	pluginData,
	bundle,
	entry,
}: {
	chunks: Chunks;
	/** Compiled partials by name. */
	partials: Map<string, string>;
	pluginData: PluginData;
	/** The runtimes of the plugins, bundled together. */
	bundle: RuntimeBundle | undefined;
	entry: string;
}): string {
	const items = [...chunks].map(
		([id, chunk]) => `  [${JSON.stringify(id)}, ${serialize(chunk)}],`,
	);
	const pluginPartials = [...partials].map(
		([name, compiled]) => `  [${JSON.stringify(name)}, ${compiled}],`,
	);

	const plugins = (bundle?.plugins ?? []).map(
		({ name, options, key }) =>
			`  {\n    name: ${JSON.stringify(name)},\n${options === undefined ? '' : `    options: ${JSON.stringify(options)},\n`}    setup: runtimes.${key},\n  },`,
	);
	// once for all the plugins, with the modules they share
	const runtimes = bundle
		? `\n/** The runtimes of the plugins, bundled together. */\nconst runtimes = ${bundle.code};\n`
		: '';

	return `${HEADER}

/**
 * Version of the compiled output, checked by the runtime.
 * @type {number}
 */
export const format = ${TEMPLATE_FORMAT};

/** @type {Chunks} */
export const chunks = new Map([
${items.join('\n')}
]);

/**
 * Templates provided by plugins, by partial name (\`plugin.template\`).
 * @type {PluginPartials}
 */
export const pluginPartials = new Map([
${pluginPartials.join('\n')}
]);

/**
 * Data provided by plugins, read as \`@plugin.name\`.
 * @type {PluginData}
 */
export const pluginData = ${JSON.stringify(pluginData, null, 2)};

${runtimes}
/**
 * Runtime halves of the plugins, set up by the renderer.
 * @type {BundledPlugin[]}
 */
export const bundledPlugins = [
${plugins.join('\n')}
];

/** @type {string} */
export const entry = ${JSON.stringify(entry)};
`;
}

function serialize(chunk: Chunk): string {
	const fields: [string, string | undefined][] = [['type', json(chunk.type)]];

	switch (chunk.type) {
		case 'template':
			fields.push(['spec', chunk.compiled]);
			break;
		case 'script':
			fields.push(
				['code', json(chunk.code)],
				['css', json(chunk.css)],
				['runtime', json(chunk.runtime)],
			);
			break;
		case 'style':
		case 'runtime':
			fields.push(['code', json(chunk.code)]);
			break;
		case 'data':
			fields.push(['data', json(chunk.data)]);
			break;
	}

	const body = fields
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => `    ${key}: ${value},`)
		.join('\n');

	return `{\n${body}\n  }`;
}

function json(value: unknown): string | undefined {
	return value === undefined ? undefined : JSON.stringify(value);
}
