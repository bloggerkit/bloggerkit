import type { IconName } from './ui/lucide';

export interface PageLink {
	title: string;
	url: string;
	/** Set only when it differs from the current page's topic. */
	topic?: string;
}

/** An author as written in the frontmatter. */
export interface PageAuthor {
	name?: string;
	url?: string;
	github?: string;
}

/** An author from `getPageAuthors`. `name` falls back to the GitHub username, `url` to the GitHub profile. */
export interface Author {
	name: string;
	url?: string;
	/** For the photo. */
	github?: string;
}

export interface NavLink {
	name: string;
	url: string;
	icon?: IconName;
}
