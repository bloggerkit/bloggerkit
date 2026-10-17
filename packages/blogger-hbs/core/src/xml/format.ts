import { formatExpression, type ParsedExpression } from './expressions';
import type {
	OpenElement,
	ScannedAttribute,
	ScannedDeclaration,
	ScannedStartTag,
} from './scanner';
import { inCdata, type SkinText } from './skin';
import { isTrimmed, type SkinTag } from './variables';

/** The XML declaration Blogger writes, the first line of a theme. */
export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" ?>';
/** The doctype Blogger writes, the second line of a theme. */
export const DOCTYPE = '<!DOCTYPE html>';

/** The root of a doctype and the identifiers after it, `html` and `''` for `<!DOCTYPE html>`. */
export function parseDoctype(content: string): {
	root?: string;
	identifiers: string;
} {
	const [, root, rest = ''] =
		/^DOCTYPE\s+([^\s[>]+)([\s\S]*)$/i.exec(content) ?? [];
	return { root, identifiers: rest.trim().replace(/\s+/g, ' ') };
}

/** A range of the document replaced by `text`. */
interface Edit {
	start: number;
	end: number;
	text: string;
	/** Where the value of each attribute is in `text`, by its offset in the document, in pairs. */
	values?: number[];
}

export interface FormattedDocument {
	xml: string;
	/** The offset in `xml` of what is at `offset` in the document formatted. */
	mapOffset(offset: number): number;
}

export interface Formatter {
	/** Formats a start tag while the document is scanned, with its expressions parsed. */
	onStartTag(
		tag: ScannedStartTag,
		expressions: ReadonlyMap<ScannedAttribute, ParsedExpression>,
	): void;
	/**
	 * Formats what is in a skin, read once, with its `<Group>` and
	 * `<Variable>` tags, of `<b:skin>`, when they are well-formed.
	 */
	onSkin(
		element: OpenElement,
		contentEnd: number,
		skin: SkinText,
		tags?: readonly SkinTag[],
	): void;
	/** The document formatted, once it is scanned. */
	finish(declarations: readonly ScannedDeclaration[]): FormattedDocument;
}

/**
 * Formats a valid document as Blogger saves it, while it is scanned, fed in
 * one piece, so only the formatted tags are kept:
 *
 * - the XML declaration on the first line and the doctype on the second, added
 *   when missing and moved there when elsewhere
 * - start tags on a single line, line breaks in attribute values collapsed to
 *   a space, the attributes sorted by name and quoted with single quotes
 * - elements with nothing in them self-closed
 * - expressions (`b:if cond`, `expr:*`, ...) printed by `blogger-expr` on a
 *   single line, `data:a&amp;&amp;data:b` as `data:a and data:b`
 * - the children of sections, widgets and their settings each on a line
 * - what is in a skin in a single CDATA section, the entities of its text
 *   decoded
 *
 * Everything else is left as it is.
 */
export function createFormatter(xml: string): Formatter {
	const edits: Edit[] = [];
	/** The indentation of the children of indented parents, by the offset of their start tag. */
	const moved = new Map<number, string>();

	return {
		onStartTag(tag, expressions) {
			const { parent } = tag;
			if (parent !== undefined && INDENTED_PARENTS.has(parent.name)) {
				edits.push(indentChild(xml, tag.start, parent, moved));
			}
			const end = emptyElementEnd(xml, tag);
			edits.push({
				start: tag.start,
				end: end ?? tag.end,
				...formatStartTag(tag, end !== undefined, expressions),
			});
		},

		onSkin({ contentStart }, contentEnd, skin, tags) {
			// an empty skin is self-closed
			if (contentEnd === contentStart) {
				return;
			}
			const { text, values } = tags
				? formatSkinTags(skin, tags)
				: { text: skin.text, values: [] };
			const wrapped = inCdata(text);
			if (wrapped !== xml.slice(contentStart, contentEnd)) {
				edits.push({
					start: contentStart,
					end: contentEnd,
					text: wrapped,
					values,
				});
			}
		},

		finish(declarations) {
			// the declarations are taken out, they are written at the top
			for (const item of declarations) {
				edits.push({ ...lineOf(xml, item.start, item.end), text: '' });
			}
			edits.sort((a, b) => a.start - b.start || a.end - b.end);
			return applyEdits(xml, edits, declarations);
		},
	};
}

/** The document with the sorted edits made, the declarations written at the top. */
function applyEdits(
	xml: string,
	edits: readonly Edit[],
	declarations: readonly ScannedDeclaration[],
): FormattedDocument {
	// the parts joined once, as adding each to a string makes it slower to read
	const parts: string[] = [];
	let length = 0;
	let last = 0;
	/** Where every edit is in the body. */
	const starts: number[] = [];
	for (const { start, end, text } of edits) {
		const before = xml.slice(last, start);
		parts.push(before, text);
		starts.push(length + before.length);
		length += before.length + text.length;
		last = end;
	}
	parts.push(xml.slice(last));
	const body = parts.join('');

	const doctype = declarations.find((item) => item.kind === 'doctype');
	const identifiers = doctype && parseDoctype(doctype.content).identifiers;
	const head = `${XML_DECLARATION}\n${identifiers ? `<!DOCTYPE html ${identifiers}>` : DOCTYPE}\n`;
	let leading = 0;
	while (leading < body.length && /\s/.test(body[leading])) {
		leading++;
	}
	// how far what is in the body moves in the output
	const shift = head.length - leading;

	return {
		xml: head + body.slice(leading),
		mapOffset(offset) {
			const index = lastEditAt(edits, offset);
			if (index < 0) {
				return offset + shift;
			}
			const { end, text, values } = edits[index];
			return (
				shift +
				starts[index] +
				(offset < end ? valueAt(values, offset) : text.length + offset - end)
			);
		},
	};
}

/** Where the value of the attribute at `offset` is in the text of an edit, 0 for none. */
function valueAt(
	values: readonly number[] | undefined,
	offset: number,
): number {
	for (let i = 0; values !== undefined && i < values.length; i += 2) {
		if (values[i] === offset) {
			return values[i + 1];
		}
	}
	return 0;
}

/** The index of the last of the sorted edits starting at or before `offset`, -1 for none. */
function lastEditAt(edits: readonly Edit[], offset: number): number {
	let low = 0;
	let high = edits.length - 1;
	while (low <= high) {
		const middle = (low + high) >> 1;
		if (edits[middle].start <= offset) {
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}
	return high;
}

/** Elements whose children Blogger writes each on a line, indented. */
const INDENTED_PARENTS = new Set([
	'b:section',
	'b:widget',
	'b:widget-settings',
]);

/**
 * Puts the start tag of a child of an indented parent on its own line,
 * indented two spaces more than the line of the parent, by replacing the
 * whitespace before it. What is in the child is left as it is. `moved` has
 * the indentation of the children before it, parents first.
 */
function indentChild(
	xml: string,
	tagStart: number,
	parent: OpenElement,
	moved: Map<number, string>,
): Edit {
	const indent = `${moved.get(parent.start) ?? indentationOf(xml, parent.start)}  `;
	let start = tagStart;
	while (start > 0 && /\s/.test(xml[start - 1])) {
		start--;
	}
	moved.set(tagStart, indent);
	return { start, end: tagStart, text: `\n${indent}` };
}

/** The whitespace at the start of the line `offset` is on. */
function indentationOf(xml: string, offset: number): string {
	const lineStart = xml.lastIndexOf('\n', offset - 1) + 1;
	return /^[ \t]*/.exec(xml.slice(lineStart, offset))?.[0] ?? '';
}

/**
 * The range to remove for a declaration: its whole line when nothing else is
 * on it, so no empty line is left, otherwise only the declaration.
 */
function lineOf(
	xml: string,
	start: number,
	end: number,
): { start: number; end: number } {
	let lineStart = start;
	while (lineStart > 0 && /[ \t]/.test(xml[lineStart - 1])) {
		lineStart--;
	}
	let lineEnd = end;
	while (lineEnd < xml.length && /[ \t\r]/.test(xml[lineEnd])) {
		lineEnd++;
	}

	const alone =
		(lineStart === 0 || xml[lineStart - 1] === '\n') &&
		(lineEnd === xml.length || xml[lineEnd] === '\n');

	return alone
		? { start: lineStart, end: Math.min(lineEnd + 1, xml.length) }
		: { start, end };
}

/**
 * Where the end tag right after a start tag ends, with nothing between them,
 * not a space either: Blogger writes such an element `<a/>`. The document is
 * well-formed, an end tag right after a start tag is the one of its element.
 */
function emptyElementEnd(
	xml: string,
	{ name, end, selfClosing }: ScannedStartTag,
): number | undefined {
	if (selfClosing || !xml.startsWith(`</${name}`, end)) {
		return;
	}
	END_TAG_CLOSE.lastIndex = end + name.length + 2;
	return END_TAG_CLOSE.test(xml) ? END_TAG_CLOSE.lastIndex : undefined;
}

/** The rest of an end tag after its name, matched where `lastIndex` is. */
const END_TAG_CLOSE = /\s*>/y;

/** Where the text of a skin starts in its CDATA section. */
const CDATA_START_LENGTH = '<![CDATA['.length;

/**
 * The text of `<b:skin>` with its `<Group>` and `<Variable>` tags formatted
 * as the other tags are, `name` and `description` trimmed, and where each
 * tag and value is in its CDATA section, by its offset in the document. The
 * other tags are left as they are.
 */
function formatSkinTags(
	{ text, sourceOf }: SkinText,
	tags: readonly SkinTag[],
): Pick<Edit, 'text' | 'values'> {
	const parts: string[] = [];
	const values: number[] = [];
	let length = CDATA_START_LENGTH;
	let last = 0;
	const push = (part: string) => {
		parts.push(part);
		length += part.length;
	};

	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (tag.name !== 'Group' && tag.name !== 'Variable') {
			continue;
		}
		push(text.slice(last, tag.start));
		last = tag.end;
		if (tag.closing) {
			push(`</${tag.name}>`);
			continue;
		}
		// an end tag right after it, nothing in it
		const next = tags[i + 1];
		const empty =
			!tag.selfClosing &&
			next?.closing === true &&
			next.name === tag.name &&
			next.start === tag.end;
		if (empty) {
			last = next.end;
			i++;
		}
		const formatted = formatTag(
			tag.name,
			tag.attributes.map((attribute) => {
				const value = collapseLineBreaks(attribute.value);
				return {
					name: attribute.name,
					offset: sourceOf(attribute.index),
					value: singleQuoted(
						attribute,
						isTrimmed(tag.name, attribute.name) ? value.trim() : value,
					),
				};
			}),
			tag.selfClosing || empty,
		);
		values.push(sourceOf(tag.start), length);
		for (let j = 0; j < formatted.values.length; j += 2) {
			values.push(formatted.values[j], length + formatted.values[j + 1]);
		}
		push(formatted.text);
	}
	parts.push(text.slice(last));
	return { text: parts.join(''), values };
}

/** The start tag formatted, self-closed with `selfClose`, and where the value of each attribute is in it. */
function formatStartTag(
	{ name, attributes, selfClosing }: ScannedStartTag,
	selfClose: boolean,
	expressions: ReadonlyMap<ScannedAttribute, ParsedExpression>,
): Pick<Edit, 'text' | 'values'> {
	return formatTag(
		name,
		attributes.map((attribute) => {
			const parsed = expressions.get(attribute);
			return {
				name: attribute.name,
				offset: attribute.offset,
				value:
					(parsed && formatExpression(parsed)) ??
					singleQuoted(attribute, collapseLineBreaks(attribute.value)),
			};
		}),
		selfClosing || selfClose,
	);
}

/**
 * A start tag with its attributes sorted by name, their values formatted and
 * in single quotes, and where each value is in it, by its offset in the
 * document.
 */
function formatTag(
	name: string,
	attributes: readonly { name: string; offset: number; value: string }[],
	selfClosed: boolean,
): { text: string; values: number[] } {
	let text = `<${name}`;
	const values: number[] = [];
	for (const attribute of sortedByName(attributes)) {
		text += ` ${attribute.name}='`;
		values.push(attribute.offset, text.length);
		text += `${attribute.value}'`;
	}
	return { text: `${text}${selfClosed ? '/>' : '>'}`, values };
}

/**
 * A value written in double quotes, rewritten for single quotes: `'` escaped
 * as `&apos;` and `&quot;` unescaped. Other entities are left as they are.
 */
function singleQuoted({ quote }: { quote: '"' | "'" }, value: string): string {
	return quote === "'"
		? value
		: value.replace(/'/g, '&apos;').replace(/&quot;/g, '"');
}

/** Every line break becomes a space, the spaces around it stay as they are. */
function collapseLineBreaks(value: string): string {
	return value.includes('\n') ? value.replace(/\r?\n/g, ' ') : value;
}

/** The attributes sorted by name, as they are when they already are, as is most often. */
function sortedByName<T extends { name: string }>(
	attributes: readonly T[],
): readonly T[] {
	for (let i = 1; i < attributes.length; i++) {
		if (attributes[i - 1].name > attributes[i].name) {
			return [...attributes].sort((a, b) =>
				a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
			);
		}
	}
	return attributes;
}
