/**
 * WebMCP tools for in-browser AI agents, one per name in `src/lib/agents/webmcp.ts`.
 * The `satisfies` below makes a missing or unknown tool a type error.
 */
import { navigate } from 'astro:transitions/client';
import type { ModelContextTool, WebMcpToolName } from '../../lib/agents/webmcp';
import type { SectionTopics } from '../../lib/content/sections';
import { resources } from '../../lib/routes';
import { prefersReducedMotion } from '../page';
import { base, cleanUrl, loadPagefind, pagefindFilters } from '../pagefind';
import { chooseTheme, isThemeChoice, themeChoices } from '../theme/state';
import { describe, docsPath, pageDocument, pageMarkdown, text } from './pages';

/** Input schema shared by tools that take an optional page URL. */
const pathInput = {
	type: 'object',
	properties: {
		url: {
			type: 'string',
			description:
				'The path or URL of the page, for example /docs/theme-xml/tags/loops. The open page by default.',
		},
	},
};

export const tools = {
	search_docs: {
		title: 'Search the docs',
		description:
			'Search the Blogger Kit docs: Blogger theme XML (tags, expressions, data, widgets, the skin), Blogger tools and the Blogger Kit packages. Returns the matching pages with their URL and an excerpt. list_topics gives the names of the sections and topics to narrow it down.',
		inputSchema: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description: 'The words to search for, for example "b:loop index".',
				},
				section: {
					type: 'string',
					description:
						'Only the pages of this section, for example "Blogger Theme XML".',
				},
				topic: {
					type: 'string',
					description:
						'Only the pages of this topic, by its id from list_topics, for example "theme-xml/tags".',
				},
				limit: {
					type: 'integer',
					minimum: 1,
					maximum: 20,
					default: 8,
					description: 'The most results to return.',
				},
			},
			required: ['query'],
		},
		annotations: { readOnlyHint: true },
		async execute({ query, section, topic, limit }) {
			const filters: Record<string, string> = {};
			if (typeof section === 'string' && section) {
				filters[pagefindFilters.section] = section;
			}
			if (typeof topic === 'string' && topic) {
				filters[pagefindFilters.topic] = topic;
			}
			const { results } = await (await loadPagefind()).search(
				String(query ?? ''),
				{ filters },
			);
			const count =
				typeof limit === 'number' ? Math.min(Math.max(limit, 1), 20) : 8;
			const pages = await Promise.all(
				results.slice(0, count).map((result) => result.data()),
			);
			return pages.map((page) => ({
				title: page.meta.title,
				url: cleanUrl(page.url),
				section: page.filters[pagefindFilters.section]?.[0],
				topic: page.filters[pagefindFilters.topic]?.[0],
				excerpt: text(page.excerpt),
			}));
		},
	},
	list_topics: {
		title: 'List the sections and topics',
		description:
			'The sections of the Blogger Kit docs and the topics in each, with their page counts. Pass a section name or a topic id to search_docs to narrow a search.',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true },
		async execute() {
			const filters = await (await loadPagefind()).filters();
			const sectionPages = filters[pagefindFilters.section] ?? {};
			const topicPages = filters[pagefindFilters.topic] ?? {};
			// Embedded by `WebMcp.astro`. Topic ids are slugs, so same-named topics in two sections stay apart
			const catalog: SectionTopics[] = JSON.parse(
				document.querySelector('[data-webmcp-topics]')?.textContent ?? '[]',
			);
			return catalog.map((section) => ({
				section: section.name,
				pages: sectionPages[section.name] ?? 0,
				topics: section.topics.map((topic) => ({
					id: topic.id,
					name: topic.name,
					pages: topicPages[topic.id] ?? 0,
				})),
			}));
		},
	},
	get_docs_index: {
		title: 'List the docs',
		description:
			'The index of the Blogger Kit docs, as Markdown: every section, folder and page, with its URL and a one-line description.',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true },
		async execute() {
			const response = await fetch(`${base}${resources.llms}`);
			return response.ok
				? await response.text()
				: `Could not load the index: ${response.status}`;
		},
	},
	get_page_info: {
		title: 'Describe a page',
		description:
			'The title, description, breadcrumbs, headings (with the URL of each) and the previous and next pages of a page of the docs, without its content.',
		inputSchema: pathInput,
		annotations: { readOnlyHint: true },
		async execute({ url }) {
			const path = docsPath(url);
			return describe(await pageDocument(path), path);
		},
	},
	read_page: {
		title: 'Read a page',
		description:
			'The content of a page of the docs, as Markdown. A folder, such as /docs/theme-xml/tags, has no content of its own: get_docs_index lists its pages.',
		inputSchema: pathInput,
		annotations: { readOnlyHint: true },
		async execute({ url }) {
			const path = docsPath(url);
			return (
				(await pageMarkdown(path)) ??
				`No Markdown for ${path}: it is a folder or not a page. Use get_docs_index to find its pages.`
			);
		},
	},
	get_code_examples: {
		title: 'Get the code examples of a page',
		description:
			'The code blocks of a page of the docs, each with its language and its title when it has one: the theme XML, CSS and JavaScript examples, ready to copy.',
		inputSchema: {
			type: 'object',
			properties: {
				...pathInput.properties,
				language: {
					type: 'string',
					description:
						'Only the blocks of this language, for example "xml" or "css".',
				},
			},
		},
		annotations: { readOnlyHint: true },
		async execute({ url, language }) {
			const path = docsPath(url);
			const markdown = await pageMarkdown(path);
			if (markdown === undefined) {
				return `No content for ${path}: it is a folder or not a page.`;
			}
			// Matches fences like: ```xml title="A flat list of comments"
			const blocks = [
				...markdown.matchAll(/^```(\w*)([^\n]*)\n([\s\S]*?)^```$/gm),
			].map(([, lang, info, code]) => ({
				language: lang || undefined,
				title: info.match(/title="([^"]*)"/)?.[1],
				code: code.replace(/\n$/, ''),
			}));
			return typeof language === 'string' && language
				? blocks.filter((block) => block.language === language.toLowerCase())
				: blocks;
		},
	},
	open_page: {
		title: 'Open a page',
		description:
			'Show a page of the docs in the browser, optionally at a heading: /docs/theme-xml/tags/loops#attributes.',
		inputSchema: {
			type: 'object',
			properties: {
				url: {
					type: 'string',
					description:
						'The path or URL of the page, with an optional #heading.',
				},
			},
			required: ['url'],
		},
		async execute({ url }) {
			const path = docsPath(url);
			const hash = new URL(String(url), location.origin).hash;
			await navigate(`${path}${hash}`);
			return `Opened ${path}${hash}.`;
		},
	},
	open_adjacent_page: {
		title: 'Open the next or previous page',
		description:
			'Show the next or the previous page of the section, in the order of the sidebar.',
		inputSchema: {
			type: 'object',
			properties: { direction: { type: 'string', enum: ['next', 'previous'] } },
			required: ['direction'],
		},
		async execute({ direction }) {
			const rel = direction === 'previous' ? 'prev' : 'next';
			const href = document
				.querySelector<HTMLAnchorElement>(`a[rel="${rel}"]`)
				?.getAttribute('href');
			if (!href) {
				return `This page has no ${direction} page.`;
			}
			await navigate(href);
			return `Opened ${cleanUrl(href)}.`;
		},
	},
	scroll_to_heading: {
		title: 'Scroll to a heading',
		description:
			'Scroll the open page to one of its headings, by its id or its text: "attributes" or "Var and index". get_page_info lists them.',
		inputSchema: {
			type: 'object',
			properties: {
				heading: {
					type: 'string',
					description: 'The id or the text of the heading.',
				},
			},
			required: ['heading'],
		},
		async execute({ heading }) {
			const wanted = String(heading ?? '')
				.replace(/^#/, '')
				.trim()
				.toLowerCase();
			const headings = [
				...document.querySelectorAll<HTMLElement>(
					'main article :is(h2, h3, h4)[id]',
				),
			];
			const target =
				headings.find((element) => element.id === wanted) ??
				headings.find(
					(element) => element.textContent?.trim().toLowerCase() === wanted,
				) ??
				headings.find((element) =>
					element.textContent?.toLowerCase().includes(wanted),
				);
			if (!target) {
				return `No heading "${String(heading)}" on this page.`;
			}
			history.replaceState(history.state, '', `#${target.id}`);
			target.scrollIntoView({
				behavior: prefersReducedMotion() ? 'auto' : 'smooth',
			});
			return `Scrolled to "${target.textContent?.trim()}".`;
		},
	},
	set_theme: {
		title: 'Set the color theme',
		description:
			'Show the site in light or dark colors, or follow the system ("auto"). Remembered on this device.',
		inputSchema: {
			type: 'object',
			properties: { theme: { type: 'string', enum: themeChoices } },
			required: ['theme'],
		},
		async execute({ theme }) {
			if (!isThemeChoice(theme)) {
				return `No theme "${String(theme)}": ${themeChoices.join(', ')}.`;
			}
			// Persists the choice; the header's theme menu listens and applies it
			chooseTheme(theme);
			return `The theme is ${theme}.`;
		},
	},
	get_site_info: {
		title: 'About the site',
		description:
			'What Blogger Kit is, who makes it, where its source is, and the files for tools: the index (llms.txt), all the content in one file (llms-full.txt) and the sitemap.',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true },
		async execute() {
			// Embedded by `WebMcp.astro` at build time, since site settings aren't available in the browser
			return JSON.parse(
				document.querySelector('[data-webmcp-site]')?.textContent ?? '{}',
			);
		},
	},
} satisfies Record<WebMcpToolName, Omit<ModelContextTool, 'name'>>;
