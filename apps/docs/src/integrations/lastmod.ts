import { readdir, readFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { docsRoute, fileToSlug, getPageUrl } from '../lib/routes';
import { contentRoot } from './content-root';

// Matches `2026-10-26`, `2026-10-26T14:30:00+05:30` or `2026-10-26 14:30:00`, optionally quoted
const DATE =
	'[\'"]?(\\d{4}-\\d{2}-\\d{2}(?:[Tt ]\\d{1,2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?\\s*(?:Z|[+-]\\d{1,2}(?::?\\d{2})?)?)?)';
const UPDATED = new RegExp(`^updated:\\s*${DATE}`, 'm');
const PUBLISHED = new RegExp(`^published:\\s*${DATE}`, 'm');

const PAGE = /\.mdx?$/;
// The `---` block at the very top of the file, so code examples in the page are never read as frontmatter
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** Like the frontmatter parser, a time without a zone is UTC. */
function parseDate(value: string): Date {
	const [, day, time] = /^(\S+?)(?:[Tt ](.*))?$/.exec(value.trim()) ?? [];
	if (!time) {
		return new Date(`${day}T00:00:00Z`);
	}
	const clock = time.replace(/\s+/g, '');
	const zoned = /(?:Z|[+-]\d{1,2}(?::?\d{2})?)$/.test(clock);
	return new Date(`${day}T${clock}${zoned ? '' : 'Z'}`);
}

/**
 * Sitemap `lastmod` per URL. A page uses its `updated` (else `published`) date; folders, `/docs` and `/` use the
 * latest date below them. Reads the files directly, since `astro.config.ts` can't use the content collection.
 */
export async function getLastModified(): Promise<Map<string, Date>> {
	const dates = new Map<string, Date>();
	const keep = (url: string, date: Date) => {
		const known = dates.get(url);
		if (!known || known < date) {
			dates.set(url, date);
		}
	};
	// Skip `_`-prefixed files and folders, as the content collection does
	const files = (await readdir(contentRoot, { recursive: true })).filter(
		(file) =>
			PAGE.test(file) && !file.split(sep).some((part) => part.startsWith('_')),
	);
	for (const file of files) {
		const text = await readFile(join(contentRoot, file), 'utf8');
		const frontmatter = FRONTMATTER.exec(text)?.[1] ?? '';
		const value = (UPDATED.exec(frontmatter) ??
			PUBLISHED.exec(frontmatter))?.[1];
		if (!value) {
			continue;
		}
		const date = parseDate(value);
		const slug = fileToSlug(file.split(sep).join('/'));
		// The page, every folder above it, `/docs` and `/`
		const parts = slug ? slug.split('/') : [];
		for (let i = parts.length; i >= 0; i--) {
			keep(getPageUrl(parts.slice(0, i).join('/')), date);
		}
		keep('/', date);
	}
	if (!dates.has(docsRoute)) {
		throw new Error('lastmod: no page with a `published` or `updated` date');
	}
	return dates;
}
