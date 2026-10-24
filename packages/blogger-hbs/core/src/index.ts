export type {
	CompiledTemplate,
	CompileTemplateOptions,
	RsbuildOptions,
	TemplateWatcher,
	WatchTemplateOptions,
} from './compiler';
export { CompileError, compileTemplate, watchTemplate } from './compiler';
export type {
	ConfigEnv,
	OutputConfig,
	UserConfig,
	UserConfigExport,
} from './config';
export { defineConfig } from './config';
export type {
	CompilePlugin,
	DataContext,
	DataResult,
	FinalizeContext,
	HashValue,
	JsonValue,
	Location,
	PartialRequest,
	PartialUsage,
	PluginContext,
	ProvideContext,
	ProvideResult,
	RuntimeApi,
	RuntimeEntry,
	RuntimePlugin,
	RuntimePluginHooks,
	RuntimePluginSetup,
	TemplateContext,
} from './plugins';
export { defineRuntimePlugin, PluginError } from './plugins';
export type {
	BundledPlugin,
	CompiledModule,
	PluginData,
	PluginPartials,
	Renderer,
	RendererOptions,
	RenderTemplateOptions,
} from './runtime';
export { createRenderer, HelperError, renderTemplate } from './runtime';
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
} from './xml';
