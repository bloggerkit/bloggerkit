import { type CollectionEntry, getCollection } from 'astro:content';
import { getPageSlug } from '../routes';
import { getTree, walk } from './sections';

export type Page = CollectionEntry<'docs'>;

let pages: Promise<Map<string, Page>> | undefined;

/**
 * Pages by slug, loaded once per build. Throws if a page is in no sidebar (its `meta.ts` neither lists it nor has
 * `...`), since nothing would link to it.
 */
export function getPages(): Promise<Map<string, Page>> {
	pages ??= getCollection('docs').then((entries) => {
		const bySlug = new Map(entries.map((page) => [getPageSlug(page.id), page]));
		const listed = new Set(walk(getTree()));
		const missing = [...bySlug.keys()].filter((slug) => !listed.has(slug));
		if (missing.length > 0) {
			throw new Error(
				`Pages in no sidebar, add them to the \`pages\` of their meta.ts: ${missing.join(', ')}`,
			);
		}
		return bySlug;
	});
	return pages;
}

let titleCounts: Promise<Map<string, number>> | undefined;

/** True when several pages share a title (e.g. `Comments`), so callers can add the folder name. */
export async function isTitleShared(title: string): Promise<boolean> {
	titleCounts ??= getPages().then((all) => {
		const counts = new Map<string, number>();
		for (const page of all.values()) {
			counts.set(page.data.title, (counts.get(page.data.title) ?? 0) + 1);
		}
		return counts;
	});
	return ((await titleCounts).get(title) ?? 0) > 1;
}

/** Latest `updated` (else `published`) date among these pages. */
export async function getLatestUpdate(
	slugs: Iterable<string>,
): Promise<Date | undefined> {
	const all = await getPages();
	let latest: Date | undefined;
	for (const slug of slugs) {
		const data = all.get(slug)?.data;
		const updated = data && (data.updated ?? data.published);
		if (updated && (!latest || updated > latest)) {
			latest = updated;
		}
	}
	return latest;
}
