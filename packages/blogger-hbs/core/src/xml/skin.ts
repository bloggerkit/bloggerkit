import { entityAt } from './characters';

const CDATA_START = '<![CDATA[';
const CDATA_END = ']]>';

/** What is in a skin as Blogger reads it, and where each character of it is in the document. */
export interface SkinText {
	/** The entities of the text decoded, what is in the CDATA sections as it is. */
	text: string;
	/** The offset in the document of the character of `text` at `index`, of its `&` in an entity. */
	sourceOf(index: number): number;
}

/** The first thing in a skin that is not text or a CDATA section, `<div>` or `a comment`. */
export interface SkinOther {
	found: string;
	offset: number;
}

/**
 * What is in a skin, between `start` and `end`, as Blogger reads it, or the
 * first comment, element or processing instruction in it. The document is
 * well-formed.
 */
export function readSkin(
	xml: string,
	start: number,
	end: number,
): SkinText | SkinOther {
	const parts: string[] = [];
	let length = 0;
	/** Where each piece of the text starts in it and in the document, an entity a piece. */
	const textAt: number[] = [];
	const sourceAt: number[] = [];
	const isEntity: boolean[] = [];
	const piece = (text: string, source: number, entity: boolean) => {
		textAt.push(length);
		sourceAt.push(source);
		isEntity.push(entity);
		parts.push(text);
		length += text.length;
	};

	for (let i = start; i < end; ) {
		if (xml.startsWith(CDATA_START, i)) {
			const close = xml.indexOf(CDATA_END, i);
			piece(
				xml.slice(i + CDATA_START.length, close),
				i + CDATA_START.length,
				false,
			);
			i = close + CDATA_END.length;
			continue;
		}
		if (xml[i] === '<') {
			return { offset: i, found: describeMarkup(xml, i) };
		}
		const next = xml.indexOf('<', i);
		const textEnd = next < 0 || next > end ? end : next;
		for (
			let amp = xml.indexOf('&', i);
			i < textEnd;
			amp = xml.indexOf('&', i)
		) {
			const entityStart = amp < 0 || amp > textEnd ? textEnd : amp;
			if (entityStart > i) {
				piece(xml.slice(i, entityStart), i, false);
			}
			// the document is well-formed, every `&` starts an entity
			const entity = entityStart < textEnd && entityAt(xml, entityStart);
			if (!entity) {
				break;
			}
			piece(entity.decoded, entityStart, true);
			i = entityStart + entity.length;
		}
		i = textEnd;
	}

	return {
		text: parts.join(''),
		sourceOf(index) {
			let low = 0;
			let high = textAt.length - 1;
			while (low <= high) {
				const middle = (low + high) >> 1;
				if (textAt[middle] <= index) {
					low = middle + 1;
				} else {
					high = middle - 1;
				}
			}
			if (high < 0) {
				return start;
			}
			return isEntity[high]
				? sourceAt[high]
				: sourceAt[high] + index - textAt[high];
		},
	};
}

/** What the markup at `index` is, `<div>`, `a comment` or `a processing instruction`. */
function describeMarkup(xml: string, index: number): string {
	if (xml.startsWith('<!--', index)) {
		return 'a comment';
	}
	if (xml[index + 1] === '?') {
		return 'a processing instruction';
	}
	return `<${/^<([^\s/>]+)/.exec(xml.slice(index, index + 256))?.[1]}>`;
}

/** `text` in a single CDATA section, a `]]>` in it ending a section and starting another, `]]]]><![CDATA[>`. */
export function inCdata(text: string): string {
	return `${CDATA_START}${text.replaceAll(CDATA_END, `]]${CDATA_END}${CDATA_START}>`)}${CDATA_END}`;
}
