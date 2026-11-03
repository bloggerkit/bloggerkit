import { readLines, removeNotations } from '../content/markdown';
import { getPages, isTitleShared, type Page } from '../content/pages';
import {
	type Folder,
	getBreadcrumbs,
	getSections,
	type TreeNode,
} from '../content/sections';
import {
	contentDir,
	fileToSlug,
	getPageMarkdownUrl,
	getPageSlug,
	getPageUrl,
	resources,
} from '../routes';
import { appDescription, appName, site } from '../site';
import { BLOGGER_SOURCES } from '../ui/blogger-sources';

const absolute = (path: string) => new URL(path, site).href;

// The URL of `[text](./loops.mdx#ranges "title")` or `[label]: <../tags/loops.mdx>`, as written in the page sources.
// A title after the URL is kept as it is.
const PAGE_LINK =
	/(\]\(\s*|^\s*\[[^\]]+\]:\s*)(<?)(\.{1,2}\/[^\s<>()#?]*?\.mdx?)(#[^\s<>()]*)?(>?)/g;
// `[text](#heading)`, a link to a heading of the same page
const SELF_LINK = /(\]\(\s*|^\s*\[[^\]]+\]:\s*)(<?)(#[^\s<>()]+)(>?)/g;
// A run of backticks up to the next run of the same length, as in CommonMark
const CODE_SPAN = /(?<!`)(`+)(?!`).*?(?<!`)\1(?!`)/g;

/** Applies `edit` to the parts of a line outside inline code. */
function outsideCode(line: string, edit: (text: string) => string): string {
	let out = '';
	let last = 0;
	for (const span of line.matchAll(CODE_SPAN)) {
		out += edit(line.slice(last, span.index)) + span[0];
		last = span.index + span[0].length;
	}
	return out + edit(line.slice(last));
}

/**
 * Turns the links between page files into absolute URLs of their Markdown, so they work wherever the Markdown is read.
 * With `absoluteAnchors`, links to headings of the same page (`#heading`) too, for a file of many pages where they
 * would be ambiguous. Code blocks and inline code are left as they are. Throws if a link to a page file is left over.
 */
function resolveLinks(
	markdown: string,
	page: Page,
	absoluteAnchors: boolean,
): string {
	// `filePath` is relative to the project root: `src/content/docs/theme-xml/tags/loops.mdx`
	const file = page.filePath ?? `${contentDir}/${page.id}`;
	const base = new URL(`file:///${file}`);
	const root = `/${contentDir}/`;
	// `../expressions/index.mdx` → `theme-xml/expressions/index.mdx`, or `undefined` outside the docs
	const pageFile = (path: string) => {
		const resolved = decodeURI(new URL(path, base).pathname);
		return resolved.startsWith(root) ? resolved.slice(root.length) : undefined;
	};
	const self = absolute(getPageMarkdownUrl(getPageSlug(page.id)));
	const rewrite = (text: string) =>
		(absoluteAnchors
			? text.replace(
					SELF_LINK,
					(_, start: string, open: string, hash: string, close: string) =>
						`${start}${open}${self}${hash}${close}`,
				)
			: text
		).replace(
			PAGE_LINK,
			(
				link: string,
				start: string,
				open: string,
				path: string,
				hash: string | undefined,
				close: string,
			) => {
				const target = pageFile(path);
				// Left as it is outside the docs, so `check` reports it
				return target === undefined
					? link
					: `${start}${open}${absolute(getPageMarkdownUrl(fileToSlug(target)))}${hash ?? ''}${close}`;
			},
		);
	const check = (text: string) => {
		const left = /\.{1,2}\/[^\s<>()]*\.mdx?\b/.exec(text);
		if (left && /\]\(|\]:/.test(text)) {
			throw new Error(`${file}: the link ${left[0]} was not made absolute`);
		}
		return text;
	};
	const out: string[] = [];
	for (const { text, kind } of readLines(markdown)) {
		out.push(
			kind === 'text' ? outsideCode(outsideCode(text, rewrite), check) : text,
		);
	}
	return out.join('\n');
}

/** `Read first: [Title](url), …` for the page's `prerequisites`, as in its HTML header. Shared titles get their folder. */
async function renderPrerequisites(page: Page, pages: Map<string, Page>) {
	const links = await Promise.all(
		(page.data.prerequisites ?? []).map(async (slug) => {
			const target = pages.get(slug);
			if (!target) {
				throw new Error(`${page.id}: no page for the prerequisite "${slug}"`);
			}
			const folder = getBreadcrumbs(slug).at(-1)?.name;
			const title =
				folder && (await isTitleShared(target.data.title))
					? `${target.data.title} (${folder})`
					: target.data.title;
			return `[${title}](${absolute(getPageMarkdownUrl(slug))})`;
		}),
	);
	return links.length > 0 ? `\nRead first: ${links.join(', ')}\n` : '';
}

/**
 * A page as Markdown: its title, description, URL and the pages to read first, then its content with absolute links
 * and without code notations. `inFullFile` also makes `#heading` links absolute, for `llms-full.txt`.
 */
export async function renderPage(
	page: Page,
	pages: Map<string, Page>,
	{ inFullFile = false } = {},
): Promise<string> {
	const description = page.data.description
		? `\n> ${page.data.description}\n`
		: '';
	const url = absolute(getPageUrl(getPageSlug(page.id)));
	return `# ${page.data.title}
${description}
URL: ${url}
${await renderPrerequisites(page, pages)}
${resolveLinks(removeNotations(page.body ?? ''), page, inFullFile).trim()}
`;
}

/** `- [Title](markdown URL): description` for every page under a node, in sidebar order. */
function listPages(node: TreeNode, pages: Map<string, Page>): string[] {
	if (node.type === 'page') {
		const page = pages.get(node.slug);
		if (!page) {
			return [];
		}
		const description = page.data.description
			? `: ${page.data.description}`
			: '';
		return [
			`- [${page.data.title}](${absolute(getPageMarkdownUrl(node.slug))})${description}`,
		];
	}
	if (node.type === 'link') {
		return [`- [${node.name}](${absolute(node.url)})`];
	}
	if (node.type === 'folder') {
		return node.children.flatMap((child) => listPages(child, pages));
	}
	return [];
}

/** One `##` per topic of a section, and one for the pages directly in the section. */
function renderSection(name: string, folder: Folder, pages: Map<string, Page>) {
	const blocks: string[] = [];
	const own = folder.children
		.filter((node) => node.type !== 'folder')
		.flatMap((node) => listPages(node, pages));
	if (own.length > 0) {
		blocks.push(`## ${name}\n\n${own.join('\n')}`);
	}
	for (const node of folder.children) {
		if (node.type === 'folder') {
			const list = listPages(node, pages);
			if (list.length > 0) {
				blocks.push(`## ${name}: ${node.name}\n\n${list.join('\n')}`);
			}
		}
	}
	return blocks;
}

const sourceNote = [...BLOGGER_SOURCES.values()]
	.map((source) => `${source.label} (${source.title})`)
	.join('; ');

/** `/llms.txt`, in the format of https://llmstxt.org: one `##` list of pages per topic, linking their Markdown. */
export async function renderIndex(): Promise<string> {
	const pages = await getPages();
	const sections = getSections().flatMap((section) =>
		renderSection(section.name, section.folder, pages),
	);
	return `# ${appName}

> ${appDescription}

Every page is linked below as Markdown: a page's URL with \`.md\` added. A fact on a page can be marked with its source: ${sourceNote}.

${sections.join('\n\n')}

## Optional

- [All pages in one file](${absolute(resources.llmsFull)}): the Markdown of every page above, in the same order. Large, so prefer single pages.
`;
}

/** `/llms-full.txt`: a header, then the Markdown of every page in `llms.txt` order. */
export async function renderFull(): Promise<string> {
	const pages = await getPages();
	const slugs = getSections().flatMap((section) => listSlugs(section.folder));
	const body = await Promise.all(
		slugs.flatMap((slug) => {
			const page = pages.get(slug);
			return page ? [renderPage(page, pages, { inFullFile: true })] : [];
		}),
	);
	return `# ${appName}

> ${appDescription}

The index of these pages is [llms.txt](${absolute(resources.llms)}).

${body.join('\n')}`;
}

/** Page slugs of a section: its own pages first, then each topic, as `renderSection` lists them. */
function listSlugs(folder: Folder): string[] {
	const slugs = (node: TreeNode): string[] =>
		node.type === 'page'
			? [node.slug]
			: node.type === 'folder'
				? node.children.flatMap(slugs)
				: [];
	return [
		...folder.children.filter((node) => node.type !== 'folder').flatMap(slugs),
		...folder.children.filter((node) => node.type === 'folder').flatMap(slugs),
	];
}
