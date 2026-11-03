/** Registers the WebMCP tools if the browser supports it. Spec: https://webmachinelearning.github.io/webmcp/ */
import { type ModelContext, webMcpToolNames } from '../../lib/agents/webmcp';
import { tools } from './tools';

// The spec uses `document.modelContext`; early Chrome previews used `navigator.modelContext`
const modelContext =
	(document as Document & { modelContext?: ModelContext }).modelContext ??
	(navigator as Navigator & { modelContext?: ModelContext }).modelContext;

// Runs once: the client router keeps this document and never re-runs module scripts
if (modelContext) {
	for (const name of webMcpToolNames) {
		Promise.resolve(modelContext.registerTool({ name, ...tools[name] })).catch(
			(error: unknown) =>
				console.warn(`WebMCP: could not register ${name}`, error),
		);
	}
}
