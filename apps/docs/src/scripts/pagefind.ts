/**
 * Browser client for the Pagefind index, shared by the search dialog, the 404 page and WebMCP.
 * The index only exists after a build, not in `astro dev`.
 */

/** Filter names, set with `data-pagefind-filter` in `DocsLayout`. */
export const pagefindFilters = { section: 'section', topic: 'topic' } as const;

export interface PagefindResult {
	url: string;
	excerpt: string;
	meta: { title?: string; section?: string; folder?: string };
	filters: Record<string, string[]>;
	sub_results: { title: string; url: string; excerpt: string }[];
}

/** Page counts per filter value: `{ section: { 'Blogger Theme XML': 81 } }`. */
type PagefindFilters = Record<string, Record<string, number>>;

interface SearchOptions {
	filters?: Record<string, string>;
}

interface Search {
	results: { data(): Promise<PagefindResult> }[];
}

interface Pagefind {
	options(options: Record<string, unknown>): Promise<void>;
	init(): Promise<void>;
	filters(): Promise<PagefindFilters>;
	search(term: string | null, options?: SearchOptions): Promise<Search>;
	/** Resolves to `null` when superseded by a later call. */
	debouncedSearch(
		term: string | null,
		options?: SearchOptions,
		timeout?: number,
	): Promise<Search | null>;
}

/** Site base path without a trailing slash, `''` at the domain root. */
export const base = import.meta.env.BASE_URL.replace(/\/$/, '');

let pagefind: Promise<Pagefind> | undefined;

/** Loads the index on first use. A failed load isn't cached, so the next call retries. */
export function loadPagefind(): Promise<Pagefind> {
	pagefind ??= (async () => {
		const module: Pagefind = await import(
			/* @vite-ignore */ `${base}/pagefind/pagefind.js`
		);
		await module.options({ baseUrl: `${base}/` });
		await module.init();
		return module;
	})().catch((error: unknown) => {
		pagefind = undefined;
		throw error;
	});
	return pagefind;
}

/** `/docs/x/loops.html#ranges` → `/docs/x/loops#ranges`, the URL the page is served at. */
export function cleanUrl(url: string): string {
	return url.replace(/\.html(?=#|$)/, '').replace(/(.)\/$/, '$1');
}
