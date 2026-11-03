import type { APIRoute, GetStaticPaths } from 'astro';
import { renderPage } from '@/lib/agents/llms';
import { getPages, type Page } from '@/lib/content/pages';

/** `/docs/theme-xml/tags/loops.md`: the Markdown of a page. */
export const getStaticPaths = (async () => {
	const pages = await getPages();
	return [...pages].map(([slug, page]) => ({
		params: { slug },
		props: { page },
	}));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ page: Page }> = async ({ props }) =>
	new Response(await renderPage(props.page, await getPages()), {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
	});
