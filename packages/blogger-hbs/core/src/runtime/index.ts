/**
 * `blogger-hbs/runtime`: renders compiled templates in any JavaScript runtime,
 * Node.js, Deno, Bun, Cloudflare Workers or a browser. Nothing here may depend
 * on Node.js or on the compiler.
 */

export {
	defineRuntimePlugin,
	PluginError,
	type RuntimeApi,
	type RuntimePlugin,
	type RuntimePluginHooks,
	type RuntimePluginSetup,
} from '../plugins';
export {
	type ProcessXmlOptions,
	processXml,
	type SkinGroup,
	type SkinVariable,
	XmlError,
	type XmlInfo,
	type XmlIssue,
	type XmlResult,
} from '../xml';
export type {
	BundledPlugin,
	MinimalChunk,
	MinimalChunks,
	PluginData,
	PluginPartials,
} from './chunks';
export { HelperError } from './helpers';
export * from './render';
