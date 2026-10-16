export interface MinimalTemplateChunk {
	type: 'template';
	spec?: object;
}

export interface MinimalScriptChunk {
	type: 'script';
	code?: string;
	css?: string;
	/** Id of the runtime chunk shared with the scripts it depends on. */
	runtime?: string;
}

/** Runtime shared by a group of scripts, inlined once before the first of them. */
export interface MinimalRuntimeChunk {
	type: 'runtime';
	code?: string;
}

export interface MinimalStyleChunk {
	type: 'style';
	code?: string;
}

export interface MinimalDataChunk {
	type: 'data';
	data: unknown;
}

/** Compiled templates provided by plugins, by partial name (`plugin.template`). */
export type PluginPartials = Map<string, object>;

/** Data provided by plugins, by plugin name and data name. */
export type PluginData = Record<string, Record<string, unknown>>;

export type MinimalChunk =
	| MinimalTemplateChunk
	| MinimalScriptChunk
	| MinimalStyleChunk
	| MinimalRuntimeChunk
	| MinimalDataChunk;

export type MinimalChunks = Map<string, MinimalChunk>;
