import { author } from '../site';
import type { Author, PageAuthor } from '../types';

/**
 * Falls back to the site author. An entry with the site author's GitHub username or URL becomes the `author` object
 * itself, so callers can compare by reference. Names are not compared: someone else can have the same name.
 */
export function getPageAuthors(authors: PageAuthor[] | undefined): Author[] {
	return (authors ?? [author]).map((who): Author => {
		if (
			who.github?.toLowerCase() === author.github.toLowerCase() ||
			(who.url !== undefined && who.url === author.url)
		) {
			return author;
		}
		const { github } = who;
		const url =
			who.url ?? (github ? `https://github.com/${github}` : undefined);
		return {
			// The schema requires a name or a username
			name: who.name ?? (github as string),
			...(url && { url }),
			...(github && { github }),
		};
	});
}
