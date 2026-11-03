/** Implemented in `src/scripts/webmcp/tools.ts`. */
export const webMcpToolNames = [
	'search_docs',
	'list_topics',
	'get_docs_index',
	'get_page_info',
	'read_page',
	'get_code_examples',
	'open_page',
	'open_adjacent_page',
	'scroll_to_heading',
	'set_theme',
	'get_site_info',
] as const;

export type WebMcpToolName = (typeof webMcpToolNames)[number];

/**
 * See https://webmachinelearning.github.io/webmcp/. This file holds only names and types, since the build imports
 * it too.
 */
export interface ModelContextTool {
	name: WebMcpToolName;
	title?: string;
	description: string;
	inputSchema?: object;
	execute: (input: Record<string, unknown>) => Promise<unknown>;
	annotations?: { readOnlyHint?: boolean };
}

/** `document.modelContext` */
export interface ModelContext {
	registerTool(tool: ModelContextTool): Promise<void> | void;
}
