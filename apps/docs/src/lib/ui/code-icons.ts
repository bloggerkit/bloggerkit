import type { SimpleIcon } from 'simple-icons';
import * as simpleIcons from 'simple-icons';
import { type IconName, isIconName } from './lucide';

/** By slug (`blogger`, `html5`, …), see https://simpleicons.org. */
const brands = new Map<string, SimpleIcon>(
	Object.values(simpleIcons).map((icon) => [icon.slug, icon]),
);

const languages = new Map<string, string>([
	['html', 'html5'],
	['css', 'css'],
	['js', 'javascript'],
	['javascript', 'javascript'],
	['ts', 'typescript'],
	['typescript', 'typescript'],
	['json', 'json'],
	['md', 'markdown'],
	['markdown', 'markdown'],
	['mdx', 'mdx'],
]);

/** For languages without a brand logo that reads well at small sizes (XML's doesn't). */
const plainIcons = new Map<string, IconName>([
	['xml', 'CodeXml'],
	['plaintext', 'FileText'],
	['plain', 'FileText'],
	['txt', 'FileText'],
	['text', 'FileText'],
]);

type CodeIcon =
	| { kind: 'brand'; icon: SimpleIcon }
	| { kind: 'lucide'; name: IconName };

/**
 * An explicit `icon="…"` (Simple Icons slug or Lucide name) wins, else the language's icon, else `FileCode`.
 * Throws on an unknown explicit name.
 */
export function getCodeIcon(language: string, name?: string): CodeIcon {
	if (name) {
		const brand = brands.get(name);
		if (brand) {
			return { kind: 'brand', icon: brand };
		}
		if (isIconName(name)) {
			return { kind: 'lucide', name };
		}
		throw new Error(
			`Unknown icon "${name}" of a code block: neither a Simple Icons slug (https://simpleicons.org) nor a Lucide icon (https://lucide.dev/icons)`,
		);
	}
	const brand = brands.get(languages.get(language) ?? '');
	if (brand) {
		return { kind: 'brand', icon: brand };
	}
	return { kind: 'lucide', name: plainIcons.get(language) ?? 'FileCode' };
}
