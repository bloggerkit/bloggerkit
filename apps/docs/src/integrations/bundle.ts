import { build, type Plugin } from 'rolldown';

const query = '?bundle';

/**
 * `import code from './script.ts?bundle'` gives the script and its imports as one minified string, to inline with
 * `<script is:inline set:html={code} />`.
 */
export function bundle(): Plugin {
	return {
		name: 'bundle',
		async load(id) {
			if (!id.endsWith(query)) {
				return null;
			}
			const {
				output: [chunk],
			} = await build({
				input: id.slice(0, -query.length),
				platform: 'browser',
				write: false,
				output: { format: 'iife', minify: true },
			});
			// Rebuild in `astro dev` when the script or any of its imports changes
			for (const file of chunk.moduleIds) {
				this.addWatchFile(file);
			}
			return `export default ${JSON.stringify(chunk.code.trim())};`;
		},
	};
}
