import { appName } from '@/lib/site';

interface PageTitleParts {
	title: string;
	/** Inserted between title and section when several pages share a title. */
	titleFolder?: string;
	/** Appended to the title, unless it is the title. */
	section?: string;
}

/** `b:loop – Blogger Theme XML`, or `Comments – Guides – …` for a shared title: the Open Graph title. */
export function getPageHeading({
	title,
	titleFolder,
	section,
}: PageTitleParts): string {
	return [
		title,
		titleFolder,
		section && section !== title ? section : undefined,
	]
		.filter(Boolean)
		.join(' – ');
}

/** `b:loop – Blogger Theme XML | Blogger Kit`: the `<title>` of a page other than the home page. */
export function getPageTitle(parts: PageTitleParts): string {
	return `${getPageHeading(parts)} | ${appName}`;
}
