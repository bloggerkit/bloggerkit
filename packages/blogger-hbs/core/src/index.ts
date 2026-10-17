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
	type ProcessXmlOptions,
	processXml,
	type SkinGroup,
	type SkinVariable,
	XmlError,
	type XmlInfo,
	type XmlIssue,
	type XmlResult,
} from './xml';
