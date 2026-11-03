import { access } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
	MdastPluginDefinition,
	MdastTarget,
	MdastVisitorContext,
} from 'satteri';
import { fileToSlug, getPageUrl } from '../lib/routes';
import { contentRoot } from './content-root';

const RELATIVE_PAGE = /^(\.{1,2}\/[^#?]*?\.mdx?)(#.*)?$/;

/**
 * `./loops.mdx#ranges` → `/docs/blogger-xml/tags/loops#ranges`. Returns `undefined` for other links and throws if
 * the target file doesn't exist.
 */
async function resolveUrl(
	url: string,
	file: string,
): Promise<string | undefined> {
	const match = RELATIVE_PAGE.exec(url);
	if (!match) {
		return undefined;
	}
	const target = resolve(dirname(file), match[1]);
	const path = relative(contentRoot, target);
	if (path.startsWith('..')) {
		return undefined;
	}
	try {
		await access(target);
	} catch {
		throw new Error(
			`${relative(contentRoot, file)}: no page for the link ${url}`,
		);
	}
	return getPageUrl(fileToSlug(path.split(sep).join('/'))) + (match[2] ?? '');
}

/** Links `[text](url)` and definitions `[label]: url`. */
type UrlNode = Extract<MdastTarget, { type: 'link' | 'definition' }>;

async function rewrite(node: Readonly<UrlNode>, ctx: MdastVisitorContext) {
	const url = ctx.fileURL
		? await resolveUrl(node.url, fileURLToPath(ctx.fileURL))
		: undefined;
	if (url !== undefined) {
		ctx.setProperty(node, 'url', url);
	}
}

/** Turns links to page files, like `[b:loop](../tags/loops.mdx)`, into site URLs. */
export const relativeLinks: MdastPluginDefinition = {
	name: 'relative-links',
	link: rewrite,
	definition: rewrite,
};
