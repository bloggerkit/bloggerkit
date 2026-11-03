import { getCollection } from 'astro:content';
import { contentDir, fileToSlug, getPageUrl } from '../routes';
import type { IconName } from '../ui/lucide';
import type { Meta } from './meta';

/** Ordered by each folder's `meta.ts` `pages` (see `Meta.pages`). */
export type TreeNode =
	| { type: 'page'; slug: string }
	| { type: 'separator'; name: string }
	| { type: 'link'; name: string; url: string; icon?: IconName }
	| Folder;

export interface Folder {
	type: 'folder';
	slug: string;
	name: string;
	description?: string;
	icon?: IconName;
	root: boolean;
	defaultOpen: boolean;
	children: TreeNode[];
}

/** A top-level folder with `section: true` in its `meta.ts`. It gets its own sidebar and home page card. */
export interface Section {
	/** Folder name, e.g. `blogger-xml`. */
	id: string;
	name: string;
	description?: string;
	icon?: IconName;
	url: string;
	folder: Folder;
}

// Vite globs must be literals, so this repeats `contentDir` from `routes.ts`
const metas = import.meta.glob<{ default: Meta }>(
	'/src/content/docs/**/meta.ts',
	{ eager: true },
);
const PAGE_EXTENSION = /\.mdx?$/;

/**
 * Paths under the content folder that make the tree: each page of the docs collection and each folder's `meta.ts`.
 * Paths under a `_`-prefixed folder are left out.
 */
const contentFiles = [
	...(await getCollection('docs')).map((entry) => entry.filePath),
	...Object.keys(metas),
]
	.flatMap((file) => {
		const path = file?.replace(/^\//, '');
		return path?.startsWith(`${contentDir}/`)
			? [path.slice(contentDir.length + 1)]
			: [];
	})
	.filter((path) => !path.split('/').some((part) => part.startsWith('_')));

/** Direct children of the folder at `slug`, sorted by name. */
function listFolder(slug: string): [name: string, folder: boolean][] {
	const prefix = slug ? `${slug}/` : '';
	const entries = new Map<string, boolean>();
	for (const file of contentFiles) {
		if (!file.startsWith(prefix)) {
			continue;
		}
		const rest = file.slice(prefix.length);
		const slash = rest.indexOf('/');
		if (slash >= 0) {
			entries.set(rest.slice(0, slash), true);
		} else if (PAGE_EXTENSION.test(rest)) {
			entries.set(rest, false);
		}
	}
	return [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

const SEPARATOR = /^---(.*)---$/;
const LINK = /^\[(.+)\]\((.+)\)$/;

async function readFolder(slug: string, name: string): Promise<Folder> {
	const where = `${contentDir}/${slug ? `${slug}/` : ''}meta.ts`;
	const meta = metas[`/${where}`]?.default ?? {};
	const entries = new Map<string, () => TreeNode | Promise<TreeNode>>();
	for (const [entry, folder] of listFolder(slug)) {
		const path = slug ? `${slug}/${entry}` : entry;
		if (folder) {
			entries.set(entry, () => readFolder(path, entry));
		} else {
			const page = entry.replace(PAGE_EXTENSION, '');
			entries.set(page, () => ({ type: 'page', slug: fileToSlug(path) }));
		}
	}

	const items = meta.pages ?? ['...'];
	const listed = new Set(items);
	if (items.filter((item) => item === '...').length > 1) {
		throw new Error(`${where}: \`...\` is listed twice`);
	}
	// `index` comes first unless `pages` places it explicitly
	const index = listed.has('index') ? undefined : entries.get('index');
	// Subfolders are read in parallel; `Promise.all` keeps the order
	const children: (TreeNode | Promise<TreeNode>)[] = index ? [index()] : [];
	for (const item of items) {
		const separator = SEPARATOR.exec(item);
		const link = LINK.exec(item);
		if (separator) {
			children.push({ type: 'separator', name: separator[1] });
		} else if (link) {
			children.push({ type: 'link', name: link[1], url: link[2] });
		} else if (item === '...') {
			for (const [key, make] of entries) {
				if (key !== 'index' && !listed.has(key)) {
					children.push(make());
				}
			}
		} else {
			const make = entries.get(item);
			if (!make) {
				throw new Error(`${where}: no page or folder "${item}" in \`pages\``);
			}
			children.push(make());
		}
	}

	return {
		type: 'folder',
		slug,
		name: meta.title ?? name,
		description: meta.description,
		icon: meta.icon,
		root: meta.section === true,
		defaultOpen: meta.defaultOpen === true,
		children: await Promise.all(children),
	};
}

// Read once when this module loads (top-level `await`), so `getTree()` and its callers stay synchronous
const tree = await readFolder('', 'Docs');

export function getTree(): Folder {
	return tree;
}

const sections: Section[] = tree.children.flatMap((node) => {
	if (node.type !== 'folder' || !node.root) {
		return [];
	}
	// A section links to its first page in sidebar order
	const [first] = walk(node);
	if (first === undefined) {
		return [];
	}
	return [
		{
			id: node.slug,
			name: node.name,
			description: node.description,
			icon: node.icon,
			url: getPageUrl(first),
			folder: node,
		},
	];
});

/** In root `meta.ts` order. Sections without pages are skipped. */
export function getSections(): Section[] {
	return sections;
}

export function getSection(slug: string): Section | undefined {
	const id = slug.split('/')[0];
	return getSections().find((section) => section.id === id);
}

/** A section's direct subfolders (Tags, Expressions, …). */
export function getTopics(section: Section): Folder[] {
	return section.folder.children.filter(
		(node): node is Folder => node.type === 'folder',
	);
}

/** A section and its topics, for the search filters. */
export interface SectionTopics {
	name: string;
	/** `id` is the topic's slug, e.g. `blogger-xml/tags`, so it stays unique when sections share topic names. */
	topics: { id: string; name: string }[];
}

export function getTopicCatalog(): SectionTopics[] {
	return getSections().map((section) => ({
		name: section.name,
		topics: getTopics(section).map((folder) => ({
			id: folder.slug,
			name: folder.name,
		})),
	}));
}

/** The section subfolder that holds a slug. A topic's own `index` page counts as inside it. */
export function getTopic(slug: string): Folder | undefined {
	return getBreadcrumbs(`${slug}/`)[1];
}

/** Page slugs in sidebar order, recursively. */
export function* walk(folder: Folder): Generator<string> {
	for (const node of folder.children) {
		if (node.type === 'page') {
			yield node.slug;
		}
		if (node.type === 'folder') {
			yield* walk(node);
		}
	}
}

/** Excludes the folder's own `index` page, matching the count on folder cards. */
export function countPages(folder: Folder): number {
	return [...walk(folder)].filter((slug) => slug !== folder.slug).length;
}

function hasIndex(folder: Folder): boolean {
	return folder.children.some(
		(node) => node.type === 'page' && node.slug === folder.slug,
	);
}

function* folders(folder: Folder): Generator<Folder> {
	yield folder;
	for (const node of folder.children) {
		if (node.type === 'folder') {
			yield* folders(node);
		}
	}
}

/** Folders without an `index` page. Each gets a generated overview page. */
export function getOverviewFolders(): Folder[] {
	return [...folders(getTree())].filter(
		(folder) => folder.slug !== '' && !hasIndex(folder),
	);
}

/**
 * Folders above a slug, from the section down: `blogger-xml/tags/loops` → [Blogger Theme XML, Tags]. Never
 * includes the slug's own folder, even for an `index` page.
 */
export function getBreadcrumbs(slug: string): Folder[] {
	const path: Folder[] = [];
	let folder = getTree();
	for (;;) {
		const next = folder.children.find(
			(node): node is Folder =>
				node.type === 'folder' && slug.startsWith(`${node.slug}/`),
		);
		if (next === undefined) {
			return path;
		}
		path.push(next);
		folder = next;
	}
}
