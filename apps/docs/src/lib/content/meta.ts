import type { IconName } from '../ui/lucide';

/** Settings of a docs folder, exported by its `meta.ts`. */
export interface Meta {
	/** Defaults to the folder name. */
	title?: string;
	/** One sentence, shown on the folder's cards. */
	description?: string;
	icon?: IconName;
	/** Makes a top-level folder a section, with its own sidebar and home page card. */
	section?: boolean;
	/** Keep it expanded in the sidebar on every page. */
	defaultOpen?: boolean;
	/**
	 * Sidebar order, e.g. `['index', 'getting-started', '---Guides---', '...']`. An item is a page or folder name,
	 * `---Title---` (starts a group), `...` (everything not listed) or `[Text](url)` (a link). Unknown names fail
	 * the build.
	 */
	pages?: string[];
}

/**
 * Type-checks a folder's `meta.ts`:
 *
 * ```ts
 * import { defineMeta } from '@/lib/content/meta';
 *
 * export default defineMeta({ title: 'Tags', icon: 'Tags', pages: ['conditionals', 'loops', '...'] });
 * ```
 */
export function defineMeta(meta: Meta): Meta {
	return meta;
}
