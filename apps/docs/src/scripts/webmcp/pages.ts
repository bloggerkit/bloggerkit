import { docsRoute, getPageMarkdownUrl } from '../../lib/routes';
import { base, cleanUrl } from '../pagefind';

/** Includes the site base path. */
const docs = `${base}${docsRoute}`;

/**
 * Normalizes a path or same-origin URL to a docs path without hash or query: `/docs/theme-xml/tags/loops`.
 * Defaults to the current page; throws for anything outside `/docs`.
 */
export function docsPath(value: unknown): string {
	const url = new URL(
		typeof value === 'string' && value ? value : location.href,
		location.origin,
	);
	const path = cleanUrl(url.pathname);
	if (
		url.origin !== location.origin ||
		(path !== docs && !path.startsWith(`${docs}/`))
	) {
		throw new Error(
			`Not a page of the docs: ${String(value)}. Pages are under ${docs}.`,
		);
	}
	return path;
}

export const text = (html: string) =>
	new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';

/** Uses the live `document` for the current page, otherwise fetches the built HTML. */
export async function pageDocument(path: string): Promise<Document> {
	if (path === cleanUrl(location.pathname)) {
		return document;
	}
	const response = await fetch(path);
	if (!response.ok) {
		throw new Error(`No page at ${path}: ${response.status}.`);
	}
	return new DOMParser().parseFromString(await response.text(), 'text/html');
}

/** `undefined` for a folder overview, which has no Markdown. */
export async function pageMarkdown(path: string): Promise<string | undefined> {
	const slug = path.slice(docs.length).replace(/^\//, '');
	const response = await fetch(`${base}${getPageMarkdownUrl(slug)}`);
	return response.ok ? await response.text() : undefined;
}

/** Extracts a page's title, breadcrumbs, headings and previous/next links from its HTML. */
export function describe(doc: Document, path: string) {
	const link = (selector: string) => {
		const anchor = doc.querySelector<HTMLAnchorElement>(selector);
		return anchor
			? {
					title:
						anchor
							.querySelector('[data-pagination-title]')
							?.textContent?.trim() ?? anchor.textContent?.trim(),
					url: cleanUrl(anchor.getAttribute('href') ?? ''),
				}
			: undefined;
	};
	return {
		title: doc.querySelector('[data-page-title]')?.textContent?.trim(),
		url: path,
		description: doc
			.querySelector('meta[name="description"]')
			?.getAttribute('content'),
		breadcrumbs: [
			...doc.querySelectorAll<HTMLAnchorElement>('[data-breadcrumbs] a'),
		].map((a) => ({
			name: a.textContent?.trim(),
			url: cleanUrl(a.getAttribute('href') ?? ''),
		})),
		headings: [
			...doc.querySelectorAll<HTMLElement>('main article :is(h2, h3)[id]'),
		].map((heading) => ({
			level: Number(heading.tagName[1]),
			text: heading.textContent?.trim(),
			url: `${path}#${heading.id}`,
		})),
		previous: link('a[rel="prev"]'),
		next: link('a[rel="next"]'),
	};
}
