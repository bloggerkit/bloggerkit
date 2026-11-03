import { removeNotations } from '../content/markdown';
import { getPages, type Page } from '../content/pages';
import { getTree, type TreeNode, walk } from '../content/sections';
import { getPageSlug, getPageUrl } from '../routes';

function url(page: Page) {
	return getPageUrl(getPageSlug(page.id));
}

/** The page source with a title line, without code block notations. */
export function renderPage(page: Page) {
	return `# ${page.data.title} (${url(page)})

${removeNotations(page.body ?? '')}`;
}

/** `/llms.txt`: every page with its description, nested like the sidebar. */
export async function renderIndex() {
	const pages = await getPages();
	const lines = ['# Docs', ''];
	const visit = (node: TreeNode, indent: string) => {
		if (node.type === 'page') {
			const page = pages.get(node.slug);
			if (page) {
				const description = page.data.description
					? `: ${page.data.description}`
					: '';
				lines.push(
					`${indent}- [${page.data.title}](${url(page)})${description}`,
				);
			}
		} else if (node.type === 'separator') {
			lines.push('', `${indent}- **${node.name}**`);
		} else if (node.type === 'link') {
			lines.push(`${indent}- [${node.name}](${node.url})`);
		} else {
			const description = node.description ? `: ${node.description}` : '';
			lines.push(`${indent}- ${node.name}${description}`);
			for (const child of node.children) {
				visit(child, `${indent}  `);
			}
		}
	};
	for (const node of getTree().children) {
		visit(node, '');
	}
	return lines.join('\n');
}

/** `/llms-full.txt`: the Markdown of every page, in sidebar order. */
export async function renderFull() {
	const pages = await getPages();
	return [...walk(getTree())]
		.flatMap((slug) => {
			const page = pages.get(slug);
			return page ? [renderPage(page)] : [];
		})
		.join('\n\n');
}
