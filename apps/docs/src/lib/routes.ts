/**
 * A slug is a page's path in `src/content/docs` without the extension or a final `index`, e.g.
 * `theme-xml/tags/loops`. Safe to import in the browser.
 */
/** The pages, relative to the project root. */
export const contentDir = 'src/content/docs';
export const docsRoute = '/docs';
export const imageRoute = '/og';
export const docsContentRoute = '/llms.mdx/docs';
export const resources = {
	llms: '/llms.txt',
	llmsFull: '/llms-full.txt',
	sitemap: '/sitemap-index.xml',
};
/** Open Graph image for pages that aren't docs: home, `/docs` and 404. */
export const siteImageUrl = `${imageRoute}/site/image.png`;

/** `theme-xml/tags/loops.mdx` → `theme-xml/tags/loops`, `theme-xml/index.mdx` → `theme-xml`. */
export function fileToSlug(file: string): string {
	return file.replace(/\.mdx?$/, '').replace(/(?:^|\/)index$/, '');
}

/** `docs/theme-xml/tags/loops` (a collection entry id) → `theme-xml/tags/loops`. */
export function getPageSlug(id: string): string {
	return id.replace(/^docs\/?/, '');
}

const join = (route: string, slug: string) =>
	slug ? `${route}/${slug}` : route;

/** `/docs/theme-xml/tags/loops`, or `/docs` for an empty slug. */
export function getPageUrl(slug: string): string {
	return join(docsRoute, slug);
}

/** `/llms.mdx/docs/theme-xml/tags/loops/content.md` */
export function getPageMarkdownUrl(slug: string): string {
	return `${join(docsContentRoute, slug)}/content.md`;
}

/** `/og/docs/theme-xml/tags/loops/image.png` */
export function getPageImageUrl(slug: string): string {
	return `${join(`${imageRoute}/docs`, slug)}/image.png`;
}

/** Built file path → URL path: `/docs/.../loops.html` → `/docs/.../loops`, `/index.html` → `/`. */
export function normalizePath(pathname: string): string {
	return pathname.replace(/(\/index)?\.html$/, '') || '/';
}
