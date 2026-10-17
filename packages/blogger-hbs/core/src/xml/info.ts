import type { Location } from '../plugins';
import type { ScannedStartTag } from './scanner';

/** What a theme is made of. */
export interface XmlInfo {
	/** The `b:` attributes of `<html>`, `{ 'b:layoutsVersion': '3' }`. */
	root: Record<string, string>;
	sections: { id: string; loc: Location }[];
	/** Every widget, with the id of the section it is in. */
	widgets: { id: string; type: string; section: string; loc: Location }[];
}

/**
 * Collects what a document is made of while it is scanned, fed in one piece.
 * `info` places it once the document it is placed in is known, the formatted
 * one too.
 */
export function createInfoCollector(): {
	onStartTag(tag: ScannedStartTag): void;
	info(locOf: (offset: number) => Location): XmlInfo;
} {
	let root: Record<string, string> = {};
	const sections: { id: string; offset: number }[] = [];
	const widgets: {
		id: string;
		type: string;
		section: string;
		offset: number;
	}[] = [];
	/** The id of every section, by the offset of its start tag. */
	const ids = new Map<number, string>();

	return {
		onStartTag({ name, start, attributes, parent }) {
			const value = (attribute: string) =>
				attributes.find((item) => item.name === attribute)?.value ?? '';

			if (parent === undefined) {
				root = Object.fromEntries(
					attributes
						.filter((attribute) => attribute.name.startsWith('b:'))
						.map((attribute) => [attribute.name, attribute.value]),
				);
			} else if (name === 'b:section') {
				ids.set(start, value('id'));
				sections.push({ id: value('id'), offset: start });
			} else if (name === 'b:widget') {
				widgets.push({
					id: value('id'),
					type: value('type'),
					section: ids.get(parent.start) ?? '',
					offset: start,
				});
			}
		},

		info: (locOf) => ({
			root,
			sections: sections.map(({ offset, ...section }) => ({
				...section,
				loc: locOf(offset),
			})),
			widgets: widgets.map(({ offset, ...widget }) => ({
				...widget,
				loc: locOf(offset),
			})),
		}),
	};
}
