import type {
	MinimalDataChunk,
	MinimalRuntimeChunk,
	MinimalScriptChunk,
	MinimalStyleChunk,
	MinimalTemplateChunk,
} from '../runtime/chunks';
import type { Program } from './ast';

export interface TemplateChunk extends MinimalTemplateChunk {
	path: string;
	source: string;
	parsed: Program;
	compiled?: string;
}

export interface ScriptChunk extends MinimalScriptChunk {
	path: string;
	/** Id of the script file, which is the chunk id when there are no dependencies. */
	fileId: string;
	/** Sorted ids of the script and style files this entry depends on (`depends-on`). */
	dependsOn: string[];
}

export interface StyleChunk extends MinimalStyleChunk {
	path: string;
}

export interface DataChunk extends MinimalDataChunk {
	path: string;
}

export interface RuntimeChunk extends MinimalRuntimeChunk {}

/** Template provided by a plugin, kept out of the chunks. */
export interface PartialChunk {
	/** Full name, `plugin-name` or `plugin-name.a.b`. */
	name: string;
	/** The plugin that provided it. */
	plugin: string;
	source: string;
	parsed: Program;
	compiled?: string;
	spec?: object;
}

export type AssetChunk = ScriptChunk | StyleChunk;

export type Chunk = TemplateChunk | AssetChunk | RuntimeChunk | DataChunk;

export type Chunks = Map<string, Chunk>;
