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
	type AutomaticVariable,
	type BackgroundVariable,
	type CheckResult,
	type CheckXmlOptions,
	type ColorVariable,
	checkXml,
	type ExpressionCache,
	type FontVariable,
	type FormatResult,
	formatXml,
	inspectXml,
	type LengthVariable,
	type ParseXmlOptions,
	parseXml,
	type SkinGroup,
	type SkinVariable,
	type StringVariable,
	type UrlVariable,
	type XmlDiagnostic,
	type XmlDocument,
	XmlError,
	type XmlInfo,
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
