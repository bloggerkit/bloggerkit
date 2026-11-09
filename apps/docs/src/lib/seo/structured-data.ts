import {
	appDescription,
	appName,
	author,
	copyrightNotice,
	license,
	publisher,
} from '../site';
import type { Author, NavLink, PageLink } from '../types';
import { LEVELS, type Level } from '../ui/levels';

interface Options {
	/** Relative URLs are resolved against it. */
	site: URL;
	canonical: URL;
	title: string;
	description: string;
	/** Absolute URL of the Open Graph image. */
	image: string;
	/** `article` for doc pages, `website` for the home page and listings. */
	type: 'website' | 'article';
	section?: string;
	/** Folders above the page, section first. */
	breadcrumbs: Pick<NavLink, 'name' | 'url'>[];
	/** False for the home page and noindex pages, which describe only the site. */
	describePage: boolean;
	updated?: Date;
	published?: Date;
	level?: Level;
	prerequisites?: PageLink[];
	/** Pages a listing shows (`/docs`, folder overviews). */
	items?: Pick<NavLink, 'name' | 'url'>[];
	/** Resolved with `getPageAuthors`; the site author must be the `author` object itself. */
	authors?: Author[];
}

/**
 * A plain `Thing` on purpose. As a `WebApplication`, search engines treat it as an app sold by this site and expect
 * a price and rating.
 */
const blogger = {
	'@type': 'Thing',
	name: 'Blogger',
	url: 'https://www.blogger.com/',
	sameAs: ['https://en.wikipedia.org/wiki/Blogger_(service)'],
};

/** Search engines expect a time and zone. A plain day becomes midnight UTC: `2026-10-26T00:00:00Z`. */
const day = (date: Date) => date.toISOString().replace('.000Z', 'Z');

/**
 * JSON-LD for the site, author and publisher, plus the page and its breadcrumbs when `describePage` is set.
 * Safe to put inside a `<script>`.
 */
export function buildStructuredData({
	site,
	canonical,
	title,
	description,
	image,
	type,
	section,
	breadcrumbs,
	describePage,
	updated,
	published,
	level,
	prerequisites = [],
	items = [],
	authors,
}: Options): string {
	const home = new URL('/', site).href;
	const person = {
		'@type': 'Person',
		'@id': `${home}#author`,
		name: author.name,
		url: author.url,
	};
	const organization = {
		'@type': 'Organization',
		'@id': `${home}#publisher`,
		name: publisher.name,
		url: publisher.url,
		logo: {
			'@type': 'ImageObject',
			url: publisher.logo,
			width: 512,
			height: 512,
		},
	};
	const website = {
		'@type': 'WebSite',
		'@id': `${home}#website`,
		name: appName,
		url: home,
		description: appDescription,
		inLanguage: 'en',
		about: blogger,
		author: { '@id': person['@id'] },
		publisher: { '@id': organization['@id'] },
		copyrightHolder: { '@id': person['@id'] },
		copyrightNotice,
		license: license.text.url,
	};
	const graph: Record<string, unknown>[] = [website, person, organization];
	if (describePage) {
		const isArticle = type === 'article';
		const modified = updated ?? published;
		const levelLabel = level && LEVELS.get(level)?.label;
		graph.push({
			'@type': isArticle
				? ['TechArticle', 'LearningResource']
				: 'CollectionPage',
			'@id': `${canonical.href}#page`,
			...(isArticle ? { headline: title } : { name: title }),
			description,
			url: canonical.href,
			image,
			inLanguage: 'en',
			isPartOf: { '@id': website['@id'] },
			about: blogger,
			isAccessibleForFree: true,
			license: license.text.url,
			// The site author is referenced by `@id`; others are inlined
			author: (authors ?? [author]).map((who) =>
				who === author
					? { '@id': person['@id'] }
					: {
							'@type': 'Person',
							name: who.name,
							...(who.url && { url: who.url }),
						},
			),
			publisher: { '@id': organization['@id'] },
			...(published && { datePublished: day(published) }),
			// Falls back to `published` until the page is updated
			...(modified && { dateModified: day(modified) }),
			...(isArticle && section && { articleSection: section }),
			...(isArticle && levelLabel && { educationalLevel: levelLabel }),
			...(isArticle &&
				prerequisites.length > 0 && {
					competencyRequired: prerequisites.map(
						(page) => new URL(page.url, site).href,
					),
				}),
			...(!isArticle &&
				items.length > 0 && {
					mainEntity: {
						'@type': 'ItemList',
						numberOfItems: items.length,
						itemListElement: items.map((item, i) => ({
							'@type': 'ListItem',
							position: i + 1,
							name: item.name,
							url: new URL(item.url, site).href,
						})),
					},
				}),
		});
		if (breadcrumbs.length > 0) {
			graph.push({
				'@type': 'BreadcrumbList',
				itemListElement: [
					...breadcrumbs,
					{ name: title, url: canonical.pathname },
				].map((crumb, i) => ({
					'@type': 'ListItem',
					position: i + 1,
					name: crumb.name,
					item: new URL(crumb.url, site).href,
				})),
			});
		}
	}
	// Escape `<` so a `</script>` in the data can't end the tag early
	return JSON.stringify({
		'@context': 'https://schema.org',
		'@graph': graph,
	}).replaceAll('<', '\\u003c');
}
