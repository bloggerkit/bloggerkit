import type { PluginData } from '../runtime/chunks';
import type { Chunk, Chunks } from './chunks';

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
 */`;

/** Generates the ES module consumed by `renderTemplate`. */
export function emitSource({
	chunks,
	partials,
	pluginData,
	entry,
}: {
	chunks: Chunks;
	/** Compiled partials by name. */
	partials: Map<string, string>;
	pluginData: PluginData;
	entry: string;
}): string {
	const items = [...chunks].map(
		([id, chunk]) => `  [${JSON.stringify(id)}, ${serialize(chunk)}],`,
	);
	const pluginPartials = [...partials].map(
		([name, compiled]) => `  [${JSON.stringify(name)}, ${compiled}],`,
	);

	return `${HEADER}

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
