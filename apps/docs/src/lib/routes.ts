/**
 * A slug is a page's path in `src/content/docs` without the extension or a final `index`, e.g.
 * `blogger-xml/tags/loops`. Safe to import in the browser.
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

/** `blogger-xml/tags/loops.mdx` → `blogger-xml/tags/loops`, `blogger-xml/index.mdx` → `blogger-xml`. */
export function fileToSlug(file: string): string {
	return file.replace(/\.mdx?$/, '').replace(/(?:^|\/)index$/, '');
}

/** `docs/blogger-xml/tags/loops` (a collection entry id) → `blogger-xml/tags/loops`. */
export function getPageSlug(id: string): string {
	return id.replace(/^docs\/?/, '');
}

const join = (route: string, slug: string) =>
	slug ? `${route}/${slug}` : route;

/** `/docs/blogger-xml/tags/loops`, or `/docs` for an empty slug. */
export function getPageUrl(slug: string): string {
	return join(docsRoute, slug);
}

/** `/llms.mdx/docs/blogger-xml/tags/loops/content.md` */
export function getPageMarkdownUrl(slug: string): string {
	return `${join(docsContentRoute, slug)}/content.md`;
}

/** `/og/docs/blogger-xml/tags/loops/image.png` */
export function getPageImageUrl(slug: string): string {
	return `${join(`${imageRoute}/docs`, slug)}/image.png`;
}

/** Built file path → URL path: `/docs/.../loops.html` → `/docs/.../loops`, `/index.html` → `/`. */
export function normalizePath(pathname: string): string {
	return pathname.replace(/(\/index)?\.html$/, '') || '/';
}
