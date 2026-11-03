import type { APIRoute, GetStaticPaths } from 'astro';
import { getPages } from '@/lib/content/pages';
import { getBreadcrumbs, getOverviewFolders } from '@/lib/content/sections';
import {
	getPageImageUrl,
	getPageUrl,
	imageRoute,
	siteImageUrl,
} from '@/lib/routes';
import { type ImageData, renderImage } from '@/lib/seo/og';
import { appDescription, appTagline, site } from '@/lib/site';

function place(slug: string): Pick<ImageData, 'section' | 'folder' | 'url'> {
	const crumbs = getBreadcrumbs(slug);
	return {
		section: crumbs[0]?.name,
		folder: crumbs.length > 1 ? crumbs[crumbs.length - 1].name : undefined,
		url: `${site.host}${getPageUrl(slug)}`,
	};
}

/** `/og/docs/x/image.png` → `docs/x/image.png`, the `slug` param. */
const param = (url: string) => url.slice(imageRoute.length + 1);

/** One image per page and folder overview, plus `/og/site/image.png` for the home, `/docs` and 404 pages. */
export const getStaticPaths = (async () => {
	const pages = await getPages();
	const images: [string, ImageData][] = [
		[
			param(siteImageUrl),
			{ title: appTagline, description: appDescription, url: site.host },
		],
		...[...pages].map(([slug, page]): [string, ImageData] => [
			param(getPageImageUrl(slug)),
			{
				title: page.data.title,
				description: page.data.description,
				...place(slug),
			},
		]),
		...getOverviewFolders().map((folder): [string, ImageData] => [
			param(getPageImageUrl(folder.slug)),
			{
				title: folder.name,
				description: folder.description,
				...place(folder.slug),
			},
		]),
	];
	return images.map(([slug, data]) => ({ params: { slug }, props: data }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<ImageData> = async ({ props }) =>
	new Response(await renderImage(props), {
		headers: { 'Content-Type': 'image/png' },
	});
