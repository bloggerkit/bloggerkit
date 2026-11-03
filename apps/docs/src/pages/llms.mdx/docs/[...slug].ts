import type { APIRoute, GetStaticPaths } from 'astro';
import { renderPage } from '@/lib/agents/llms';
import { getPages, type Page } from '@/lib/content/pages';
import { docsContentRoute, getPageMarkdownUrl } from '@/lib/routes';

/** `/llms.mdx/docs/blogger-xml/tags/loops/content.md` */
export const getStaticPaths = (async () => {
	const pages = await getPages();
	return [...pages].map(([slug, page]) => ({
		params: {
			slug: getPageMarkdownUrl(slug).slice(docsContentRoute.length + 1),
		},
		props: { page },
	}));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ page: Page }> = ({ props }) =>
	new Response(renderPage(props.page), {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
	});
