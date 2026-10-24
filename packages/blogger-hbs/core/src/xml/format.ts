import { parse, print } from 'blogger-expr';
import {
	characterReference,
	decodeEntities,
	entityAt,
	escapeValue,
	formatValue,
	inText,
	xmlValue,
} from './characters';
import { ELEMENTS, SKINS, WIDGETS } from './elements';
import type { ParsedExpression } from './expressions';
import {
	keepsChild,
	keepsSetting,
	keepsWidgetAttribute,
	savedSetting,
	savedWidgetValue,
} from './saving';
import type {
	OpenElement,
	ScannedAttribute,
	ScannedDeclaration,
	ScannedStartTag,
} from './scanner';
import { inCdata, type SkinText } from './skin';
import type { SkinTag } from './variables';

/** The XML declaration Blogger writes, the first line of a theme. */
export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" ?>';
/** The doctype Blogger writes, the second line of a theme, when it has one. */
export const DOCTYPE = '<!DOCTYPE html>';

/** A range of the document replaced by `text`. */
interface Edit {
	start: number;
	end: number;
	text: string;
	/** Where the value of each attribute, and places in it, are in `text`, by their offset in the document, in pairs. */
	values?: number[];
	/** Whether the edits inside its range are dropped, as it replaces what is there. */
	replaces?: boolean;
	/** Whether it is in the edits made, for a start tag. */
	applied?: boolean;
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
	/** At the end of an element, `contentEnd` the offset of its end tag, undefined when self-closed. */
	onEndTag(element: OpenElement, contentEnd?: number): void;
	/** A comment or a processing instruction, from its `<` to right after its `>`. */
	onMarkup(
		kind: 'comment' | 'pi',
		start: number,
		end: number,
		parent: OpenElement | undefined,
	): void;
	/**
	 * Formats what is in a skin, read once, with its `<Group>` and
	 * `<Variable>` tags, of `<b:skin>`, when they are read.
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

/** A child of an indented parent, an element. */
interface Child {
	name: string;
	start: number;
	/** Right after its end tag, once it ends. */
	end: number;
	/** Where the whitespace before it starts. */
	spaceStart: number;
	/** The edit putting it on its own line. */
	indent: Edit;
	/** Whether Blogger keeps it. */
	keep: boolean;
	/** The `id` of an includable, for its order. */
	id?: string;
}

/** An indented parent open, with its children. */
interface Parent {
	children: Child[];
	/** The edit of its start tag, to self-close it when it is left empty. */
	startEdit: Edit;
}

/**
 * Formats a valid document as Blogger saves it, while it is scanned, fed in
 * one piece, so only the formatted tags are kept:
 *
 * - the XML declaration on the first line and the doctype, when there is
 *   one, `<!DOCTYPE html>`, on the second, nothing between the nodes around
 *   the root element
 * - start tags on a single line, the attributes sorted by name, their values
 *   in single quotes with their entities decoded, tabs and line breaks as
 *   spaces, and `&`, `<`, `>`, `"` and `'` escaped; expressions are written as
 *   they are
 * - in text, `&apos;` as `&#39;` and hexadecimal references as decimal ones
 * - elements with nothing in them self-closed, skins aside, which have an
 *   empty CDATA section
 * - processing instructions removed
 * - in sections only the widgets, in widgets only their settings and
 *   includables, in settings only the settings with something in them, each on
 *   a line, the end tag of the parent on its own line, a parent left empty
 *   self-closed; the settings of a widget first, then `main`, then its other
 *   includables by id; `locked`, `title` and `visible` added to a widget and
 *   the attributes Blogger does not keep removed; widgets Blogger removes,
 *   `FollowByEmail`, removed
 * - a setting with `<`, `>` or `&` in it in a CDATA section
 * - what is in a skin in a single CDATA section, the entities of its text
 *   decoded, `value` added to the `<Variable>`s that have none
 *
 * Everything else is left as it is.
 */
export function createFormatter(xml: string): Formatter {
	const edits: Edit[] = [];
	/** The indentation of the children of indented parents, by the offset of their start tag. */
	const moved = new Map<number, string>();
	/** The indented parents open, by the offset of their start tag. */
	const parents = new Map<number, Parent>();
	/** The children to order in each widget, by where they are in the document. */
	const orders: { children: Child[]; end: Edit }[] = [];
	/** The nodes out of the root element, and the root element, from their start to their end. */
	const topLevel: [number, number][] = [];

	/** What is not text but comments: tags, declarations and what skins and settings have, written as Blogger does apart. */
	const markup: [number, number][] = [];
	/** The comments, from their `<` to right after their `>`. */
	const comments: [number, number][] = [];
	/** The type of the widget open. */
	let widgetType: string | undefined;

	const replace = (start: number, end: number, text = '') =>
		edits.push({ start, end, text, replaces: true });

	return {
		onStartTag(tag, expressions) {
			const { parent } = tag;
			markup.push([tag.start, tag.end]);
			if (tag.name === 'b:widget') {
				widgetType = tag.attributes.find(
					(attribute) => attribute.name === 'type',
				)?.value;
			}
			const container = parent && parents.get(parent.start);
			if (parent !== undefined && container !== undefined) {
				const indent = indentChild(xml, tag.start, parent, moved);
				edits.push(indent);
				container.children.push({
					name: tag.name,
					start: tag.start,
					end: tag.end,
					spaceStart: indent.start,
					indent,
					keep: keepsChild(
						parent.name,
						tag.name,
						tag.attributes.find((attribute) => attribute.name === 'type')
							?.value,
					),
					id: savedId(
						tag.attributes.find((attribute) => attribute.name === 'id')?.value,
					),
				});
			}

			let end = emptyElementEnd(xml, tag);
			const empty = tag.selfClosing || end !== undefined;
			let formatted = formatStartTag(tag, empty, expressions);
			// a skin is not self-closed, it has an empty CDATA section
			if (SKINS.has(tag.name) && empty) {
				formatted = formatStartTag(
					{ ...tag, selfClosing: false },
					false,
					expressions,
				);
				formatted.text += `<![CDATA[]]></${tag.name}>`;
				end ??= tag.end;
			}
			const edit: Edit = {
				start: tag.start,
				end: end ?? tag.end,
				...formatted,
			};
			// a start tag already as Blogger writes it is left as it is
			if (
				end !== undefined ||
				formatted.text !== xml.slice(tag.start, tag.end)
			) {
				edits.push(edit);
				edit.applied = true;
			}
			if (ELEMENTS.get(tag.name)?.indented) {
				parents.set(tag.start, { children: [], startEdit: edit });
			}
			if (parent === undefined) {
				topLevel.push([tag.start, Number.POSITIVE_INFINITY]);
			}
		},

		onEndTag(element, contentEnd) {
			const end =
				contentEnd === undefined
					? element.contentStart
					: xml.indexOf('>', contentEnd) + 1;
			if (contentEnd !== undefined) {
				markup.push([contentEnd, end]);
			}
			const top = topLevel.at(-1);
			if (top?.[0] === element.start) {
				top[1] = end;
			}
			const setting =
				element.name === 'b:widget-setting'
					? xml.slice(element.contentStart, contentEnd ?? element.contentStart)
					: undefined;
			for (const parent of parents.values()) {
				const child = parent.children.find(
					(item) => item.start === element.start,
				);
				if (child !== undefined) {
					child.end = end;
					// an empty setting of an HTML widget is removed, the others are kept
					if (setting !== undefined) {
						child.keep = keepsSetting(widgetType, settingValue(setting));
					}
				}
			}
			if (setting !== undefined && contentEnd !== undefined) {
				markup.push([element.contentStart, contentEnd]);
				const formatted = formatSetting(setting);
				if (formatted !== undefined) {
					replace(element.contentStart, contentEnd, formatted);
				}
			}
			if (element.name === 'b:widget') {
				widgetType = undefined;
			}

			const parent = parents.get(element.start);
			if (parent === undefined || contentEnd === undefined) {
				return;
			}
			parents.delete(element.start);
			const kept = finishParent(xml, element, contentEnd, parent, replace);
			if (kept.length === 0) {
				// left empty, self-closed, and removed from its own parent's settings
				if (!parent.startEdit.text.endsWith('/>')) {
					parent.startEdit.text = `${parent.startEdit.text.slice(0, -1)}/>`;
					if (!parent.startEdit.applied) {
						edits.push(parent.startEdit);
						parent.startEdit.applied = true;
					}
				}
				if (parent.startEdit.end < end) {
					replace(element.contentStart, end);
				}
				if (element.name === 'b:widget-settings') {
					for (const other of parents.values()) {
						const child = other.children.find(
							(item) => item.start === element.start,
						);
						if (child !== undefined) {
							child.keep = false;
						}
					}
				}
				return;
			}
			const endEdit = endTagOnItsLine(xml, element, contentEnd, moved);
			edits.push(endEdit);
			if (element.name === 'b:widget' && !inOrder(kept)) {
				orders.push({ children: kept, end: endEdit });
			}
		},

		onMarkup(kind, start, end, parent) {
			if (kind === 'comment') {
				comments.push([start, end]);
			} else {
				markup.push([start, end]);
			}
			if (kind === 'pi') {
				replace(start, end);
			} else if (parent === undefined) {
				topLevel.push([start, end]);
			}
		},

		onSkin({ contentStart }, contentEnd, skin, tags) {
			markup.push([contentStart, contentEnd]);
			// an empty skin has an empty CDATA section, written with its start tag
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
					replaces: true,
				});
			}
		},

		finish(declarations) {
			// the declarations are taken out, they are written at the top
			for (const item of declarations) {
				edits.push({ ...lineOf(xml, item.start, item.end), text: '' });
				markup.push([item.start, item.end]);
			}
			edits.push(...characterEdits(xml, markup, comments));
			// nothing between the nodes around the root element
			topLevel.sort((a, b) => a[0] - b[0]);
			for (let i = 1; i < topLevel.length; i++) {
				const gap = xml.slice(topLevel[i - 1][1], topLevel[i][0]);
				// the declarations in it are removed with it
				if (gap !== '' && gap.replace(DECLARATIONS, '').trim() === '') {
					replace(topLevel[i - 1][1], topLevel[i][0]);
				}
			}
			const document = applyEdits(xml, withoutReplaced(edits), declarations);
			return orderChildren(document, orders);
		},
	};
}

/** The XML declaration and the doctype, in what is around the root element. */
const DECLARATIONS = /<\?xml[\s\S]*?\?>|<!DOCTYPE[^>]*>/gi;

/**
 * Removes what Blogger does not keep in an indented parent: the children it
 * does not keep, and text, comments and processing instructions between
 * them. Gives the children kept.
 */
function finishParent(
	xml: string,
	element: OpenElement,
	contentEnd: number,
	{ children }: Parent,
	replace: (start: number, end: number) => void,
): Child[] {
	let last = element.contentStart;
	const kept: Child[] = [];
	for (const child of [...children, undefined]) {
		const next = child?.spaceStart ?? spaceBefore(xml, contentEnd);
		if (xml.slice(last, next).trim() !== '') {
			replace(last, next);
		}
		if (child === undefined) {
			break;
		}
		if (child.keep) {
			kept.push(child);
		} else {
			child.indent.text = '';
			replace(child.spaceStart, child.end);
		}
		last = child.end;
	}
	return kept;
}

/** Where the whitespace right before `offset` starts. */
function spaceBefore(xml: string, offset: number): number {
	let start = offset;
	while (start > 0 && /\s/.test(xml[start - 1])) {
		start--;
	}
	return start;
}

/** The order Blogger writes the children of a widget in: its settings, then `main`, then the other includables by id. */
function orderKey(child: Child): string {
	if (child.name === 'b:widget-settings') {
		return '0';
	}
	return child.id === 'main' ? '1' : `2${child.id ?? ''}`;
}

function byOrder(a: Child, b: Child): number {
	const keyA = orderKey(a);
	const keyB = orderKey(b);
	return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
}

/** Whether the children are in the order Blogger writes them in. */
function inOrder(children: readonly Child[]): boolean {
	return children.every(
		(child, i) => i === 0 || byOrder(children[i - 1], child) <= 0,
	);
}

/**
 * The document with the children of widgets put in the order Blogger writes
 * them in, each moved with what is in it, and offsets in them moved with them.
 * A child is from the end of the line break before it to the line break
 * before the next one, or the end tag of its widget.
 */
function orderChildren(
	{
		xml,
		mapOffset,
		positionOf,
	}: FormattedDocument & {
		positionOf(edit: Edit): number;
	},
	orders: readonly { children: Child[]; end: Edit }[],
): FormattedDocument {
	if (orders.length === 0) {
		return { xml, mapOffset };
	}
	/** Every child moved: where it was, how long it is, where it is. */
	const moves: { from: number; length: number; to: number }[] = [];
	let output = xml;
	for (const { children, end } of orders) {
		const ranges = children.map((child, i) => ({
			child,
			start: positionOf(child.indent) + child.indent.text.length,
			end: positionOf(children[i + 1]?.indent ?? end),
		}));
		const sorted = [...ranges].sort((a, b) => byOrder(a.child, b.child));
		// the same separators, in place, the children in their order
		let text = '';
		const first = ranges[0].start;
		for (let i = 0; i < ranges.length; i++) {
			if (i > 0) {
				text += output.slice(ranges[i - 1].end, ranges[i].start);
			}
			const { start, end: stop } = sorted[i];
			moves.push({
				from: start,
				length: stop - start,
				to: first + text.length,
			});
			text += output.slice(start, stop);
		}
		// as long as what it replaces, the offsets after it do not move
		output = output.slice(0, first) + text + output.slice(ranges.at(-1)?.end);
	}
	return {
		xml: output,
		mapOffset(offset) {
			const mapped = mapOffset(offset);
			const move = moves.find(
				({ from, length }) => mapped >= from && mapped < from + length,
			);
			return move ? move.to + mapped - move.from : mapped;
		},
	};
}

/**
 * The edits without those inside an edit that replaces what it covers, an
 * empty edit at either end of its range kept, in one pass over them sorted.
 */
function withoutReplaced(edits: Edit[]): Edit[] {
	const sorted = [...edits].sort(
		(a, b) =>
			a.start - b.start ||
			Number(b.replaces ?? false) - Number(a.replaces ?? false) ||
			b.end - a.end,
	);
	const kept: Edit[] = [];
	/** The furthest end of the replacing edits from where the current ones start, or before. */
	let reach = -1;
	/** The same, of those that start before. */
	let reachBefore = -1;
	let start = -1;
	for (const edit of sorted) {
		if (edit.start !== start) {
			reachBefore = reach;
			start = edit.start;
		}
		const inside =
			edit.start === edit.end ? reachBefore > edit.start : reach >= edit.end;
		if (!inside) {
			kept.push(edit);
			if (edit.replaces) {
				reach = Math.max(reach, edit.end);
			}
		}
	}
	return kept.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** The document with the sorted edits made, the declarations written at the top. */
function applyEdits(
	xml: string,
	edits: readonly Edit[],
	declarations: readonly ScannedDeclaration[],
): FormattedDocument & { positionOf(edit: Edit): number } {
	// the parts joined once, as adding each to a string makes it slower to read
	const parts: string[] = [];
	let length = 0;
	let last = 0;
	/** Where every edit is in the body. */
	const starts: number[] = [];
	for (const { start, end, text } of edits) {
		const before = xml.slice(last, Math.max(last, start));
		parts.push(before, text);
		starts.push(length + before.length);
		length += before.length + text.length;
		last = Math.max(last, end);
	}
	parts.push(xml.slice(last));
	const body = parts.join('');

	const doctype = declarations.some((item) => item.kind === 'doctype');
	const head = `${XML_DECLARATION}\n${doctype ? `${DOCTYPE}\n` : ''}`;
	let leading = 0;
	while (leading < body.length && /\s/.test(body[leading])) {
		leading++;
	}
	// how far what is in the body moves in the output
	const shift = head.length - leading;

	const indexes = new Map(edits.map((edit, i) => [edit, i]));
	return {
		xml: head + body.slice(leading),
		positionOf: (edit) => shift + starts[indexes.get(edit) ?? 0],
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

/** Where the value of the attribute at `offset`, or a place in it, is in the text of an edit, 0 for none. */
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

/**
 * The indentation of the line of an indented parent, `moved` having the one
 * of a parent moved, and the one of its children: two spaces more, unless the
 * parent is after something else on its line, as Blogger writes it.
 */
function indentationsOf(
	xml: string,
	parent: OpenElement,
	moved: ReadonlyMap<number, string>,
): { own: string; children: string } {
	const own = moved.get(parent.start) ?? indentationOf(xml, parent.start);
	const first =
		moved.has(parent.start) ||
		xml
			.slice(xml.lastIndexOf('\n', parent.start - 1) + 1, parent.start)
			.trim() === '';
	return { own, children: first ? `${own}  ` : own };
}

/**
 * Puts the start tag of a child of an indented parent on its own line,
 * indented as Blogger does, by replacing the whitespace before it. What is in
 * the child is left as it is. `moved` has the indentation of the children
 * before it, parents first.
 */
function indentChild(
	xml: string,
	tagStart: number,
	parent: OpenElement,
	moved: Map<number, string>,
): Edit {
	const indent = indentationsOf(xml, parent, moved).children;
	moved.set(tagStart, indent);
	return {
		start: spaceBefore(xml, tagStart),
		end: tagStart,
		text: `\n${indent}`,
	};
}

/** Puts the end tag of an indented parent on its own line, at the indentation of its start tag. */
function endTagOnItsLine(
	xml: string,
	element: OpenElement,
	contentEnd: number,
	moved: ReadonlyMap<number, string>,
): Edit {
	return {
		start: spaceBefore(xml, contentEnd),
		end: contentEnd,
		text: `\n${indentationsOf(xml, element, moved).own}`,
	};
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

const CDATA_SECTION = /<!\[CDATA\[([\s\S]*?)\]\]>/g;

/** What a widget setting has, its CDATA sections and entities read, trimmed as Blogger trims it. */
function settingValue(content: string): string {
	const value = content
		.split(CDATA_SECTION)
		.map((part, i) => (i % 2 === 1 ? part : decodeEntities(part)))
		.join('');
	return savedSetting(value);
}

/**
 * What is in a widget setting as Blogger saves it, undefined when it is as
 * it is written: trimmed, in a CDATA section when it has `&`, `<`, `>`, `"`
 * or `'` in it, otherwise as text with its characters written as in text.
 */
function formatSetting(content: string): string | undefined {
	const value = settingValue(content);
	const formatted = /[&<>"']/.test(value)
		? inCdata(value)
		: [...value].map((char) => characterReference(char) ?? char).join('');
	return formatted === content ? undefined : formatted;
}

/**
 * The edits writing text and comments as Blogger does, in one pass over the
 * document: in text, its entities read and `&`, `<`, `>`, `"`, `'` and the
 * characters of `numericReference` escaped, CDATA sections left as they are;
 * in comments, the characters of `numericReference` as references.
 * `markup` is what is not text, but comments.
 */
function characterEdits(
	xml: string,
	markup: readonly [number, number][],
	comments: readonly [number, number][],
): Edit[] {
	const edits: Edit[] = [];
	const skipped = merged(markup);
	const inComments = merged(comments);
	let r = 0;
	let c = 0;
	// only what may be written otherwise is looked at, ASCII text is skipped
	const special = new RegExp(TEXT_SPECIAL.source, 'g');
	for (
		let match = special.exec(xml);
		match !== null;
		match = special.exec(xml)
	) {
		const i = match.index;
		while (r < skipped.length && skipped[r][1] <= i) {
			r++;
		}
		while (c < inComments.length && inComments[c][1] <= i) {
			c++;
		}
		if (c < inComments.length && inComments[c][0] <= i) {
			const char = String.fromCodePoint(xml.codePointAt(i) ?? 0);
			const reference = characterReference(char);
			if (reference !== undefined) {
				edits.push({ start: i, end: i + char.length, text: reference });
			}
			special.lastIndex = i + char.length;
			continue;
		}
		if (r < skipped.length && skipped[r][0] <= i) {
			special.lastIndex = skipped[r][1];
			continue;
		}
		// in text, `<` only starts a CDATA section, left as it is
		if (xml[i] === '<') {
			special.lastIndex = xml.indexOf(']]>', i) + ']]>'.length;
			continue;
		}
		const entity = xml[i] === '&' ? entityAt(xml, i) : undefined;
		const source = entity
			? xml.slice(i, i + entity.length)
			: String.fromCodePoint(xml.codePointAt(i) ?? 0);
		let written = '';
		for (const char of entity?.decoded ?? source) {
			written += inText(char);
		}
		if (written !== source) {
			edits.push({ start: i, end: i + source.length, text: written });
		}
		special.lastIndex = i + source.length;
	}
	return edits;
}

/** The ranges sorted, those that overlap or touch joined. */
function merged(ranges: readonly [number, number][]): [number, number][] {
	const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
	const joined: [number, number][] = [];
	for (const [start, end] of sorted) {
		const last = joined.at(-1);
		if (last !== undefined && start <= last[1]) {
			last[1] = Math.max(last[1], end);
		} else {
			joined.push([start, end]);
		}
	}
	return joined;
}

/** What Blogger may write otherwise in text: `&`, `<`, `>`, quotes, and past ASCII; past ASCII in comments. */
const TEXT_SPECIAL = /[&<>"'\u007f-\uffff]/;

/** Where the text of a skin starts in its CDATA section. */
const CDATA_START_LENGTH = '<![CDATA['.length;

/**
 * The text of `<b:skin>` with a `value` added to each `<Variable>` that has
 * none, a copy of its `default`, as Blogger saves it, and where each tag and
 * attribute is in its CDATA section, by its offset in the document. The tags
 * are left as they are.
 */
function formatSkinTags(
	{ text, sourceOf }: SkinText,
	tags: readonly SkinTag[],
): Pick<Edit, 'text' | 'values'> {
	const parts: string[] = [];
	const values: number[] = [];
	let added = 0;
	let last = 0;
	for (const tag of tags) {
		values.push(sourceOf(tag.start), CDATA_START_LENGTH + tag.start + added);
		for (const attribute of [...tag.attributes, ...tag.unread]) {
			values.push(
				sourceOf(attribute.index),
				CDATA_START_LENGTH + attribute.index + added,
			);
		}
		const value = valueToAdd(tag);
		if (value !== undefined) {
			parts.push(text.slice(last, tag.attributesEnd), value);
			added += value.length;
			last = tag.attributesEnd;
		}
	}
	parts.push(text.slice(last));
	return { text: parts.join(''), values };
}

/** The `value` Blogger adds to a `<Variable>`, a copy of its `default`, undefined when it has one or is `automatic`. */
function valueToAdd(tag: SkinTag): string | undefined {
	if (tag.name !== 'Variable' || tag.closing) {
		return;
	}
	const read = new Map(tag.attributes.map(({ name, value }) => [name, value]));
	const fallback = read.get('default');
	if (
		read.has('value') ||
		fallback === undefined ||
		read.get('type')?.toLowerCase() === 'automatic'
	) {
		return;
	}
	return ` value="${fallback}"`;
}

/** An id of an includable as Blogger saves it and sorts by it: as XML reads it, trimmed, tabs and line breaks as spaces. */
function savedId(id: string | undefined): string | undefined {
	return id === undefined
		? undefined
		: xmlValue(id)
				.replace(/[\t\n\r]/g, ' ')
				.trim();
}

/** The start tag formatted, self-closed with `selfClose`, and where the value of each attribute is in it. */
function formatStartTag(
	{ name, attributes, selfClosing, parent }: ScannedStartTag,
	selfClose: boolean,
	expressions: ReadonlyMap<ScannedAttribute, ParsedExpression>,
): Pick<Edit, 'text' | 'values'> {
	const formatted = attributes
		.filter(
			(attribute) =>
				name !== 'b:widget' || keepsWidgetAttribute(attribute.name),
		)
		.map((attribute) => {
			const parsed = expressions.get(attribute);
			const { text, within } = parsed
				? printedValue(attribute, parsed)
				: { text: formatValue(attribute.value).text, within: undefined };
			return {
				name: attribute.name,
				offset: attribute.offset,
				value:
					name === 'b:widget'
						? widgetValue(attribute.name, attribute.value, text)
						: // Blogger saves the id of an includable of a widget trimmed
							name === 'b:includable' &&
								attribute.name === 'id' &&
								parent?.name === 'b:widget'
							? text.trim()
							: text,
				within,
			};
		});
	if (name === 'b:widget') {
		const names = new Set(formatted.map((attribute) => attribute.name));
		for (const [key, value] of WIDGETS.defaults) {
			if (!names.has(key)) {
				formatted.push({ name: key, offset: -1, value, within: undefined });
			}
		}
	}
	return formatTag(name, formatted, selfClosing || selfClose);
}

/**
 * An expression attribute printed by `blogger-expr` on one line and escaped,
 * `data:a&amp;&amp;data:b` written `data:a &amp;&amp; data:b`, with where
 * its warnings are in it, in pairs of their offset and index.
 */
function printedValue(
	attribute: ScannedAttribute,
	{ root, context, warnings }: ParsedExpression,
): { text: string; within: number[] | undefined } {
	const printed = print(root, { printWidth: Number.POSITIVE_INFINITY });
	const { text, indexOf } = escapeValue(printed);
	if (warnings.length === 0) {
		return { text, within: undefined };
	}
	// a warning is where the same one is in the expression printed, in order
	const places =
		printed === decodeEntities(attribute.value)
			? warnings.map(({ index }) => index)
			: parse(printed, { context }).warnings.map(({ span }) => span.start);
	return {
		text,
		within: warnings.flatMap(({ offset }, i) => [
			offset,
			indexOf(places[i] ?? 0),
		]),
	};
}

/** A value of a widget, written, as Blogger saves it, see `savedWidgetValue`. */
function widgetValue(name: string, value: string, formatted: string): string {
	const decoded = decodeEntities(value);
	const saved = savedWidgetValue(name, decoded);
	return saved === decoded ? formatted : formatValue(saved).text;
}

/**
 * A start tag with its attributes sorted by name, their values formatted and
 * in single quotes, and where each value is in it, by its offset in the
 * document.
 */
function formatTag(
	name: string,
	attributes: readonly {
		name: string;
		offset: number;
		value: string;
		/** Places within the value, by their offset in the document and index in the value, in pairs. */
		within?: number[];
	}[],
	selfClosed: boolean,
): { text: string; values: number[] } {
	let text = `<${name}`;
	const values: number[] = [];
	for (const attribute of sortedByName(attributes)) {
		text += ` ${attribute.name}='`;
		values.push(attribute.offset, text.length);
		const within = attribute.within ?? [];
		for (let i = 0; i < within.length; i += 2) {
			values.push(within[i], text.length + within[i + 1]);
		}
		text += `${attribute.value}'`;
	}
	return { text: `${text}${selfClosed ? '/>' : '>'}`, values };
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
