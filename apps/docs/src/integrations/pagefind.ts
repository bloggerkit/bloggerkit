import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { close, createIndex } from 'pagefind';

/** Indexes each page's `data-pagefind-body` into `dist/pagefind` after the build. */
export function pagefind(): AstroIntegration {
	return {
		name: 'pagefind',
		hooks: {
			'astro:build:done': async ({ dir, logger }) => {
				try {
					const { index, errors } = await createIndex();
					if (!index) {
						throw new Error(errors.join('\n'));
					}
					const added = await index.addDirectory({ path: fileURLToPath(dir) });
					if (added.errors.length > 0) {
						throw new Error(added.errors.join('\n'));
					}
					const written = await index.writeFiles({
						outputPath: fileURLToPath(new URL('./pagefind/', dir)),
					});
					if (written.errors.length > 0) {
						throw new Error(written.errors.join('\n'));
					}
					logger.info(`Indexed ${added.page_count} pages.`);
				} finally {
					await close();
				}
			},
		},
	};
}
