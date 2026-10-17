import type { Location } from '../plugins';
import { didYouMean } from '../utils/suggest';
import { decodeEntities } from './expressions';
import {
	type Attributes,
	checkAttributes,
	type Report,
	withKnown,
} from './layout';
import type { SkinText } from './skin';

/** An attribute of a tag in a skin, `value` as it is written. */
export interface SkinAttribute {
	name: string;
	value: string;
	quote: '"' | "'";
	/** Where its value starts in the text of the skin. */
	index: number;
}

/**
 * A tag in the text of a skin: Blogger reads `<` and a name as a tag, of
 * which `<Group>` and `<Variable>` are the settings of the Theme Designer.
 */
export interface SkinTag {
	name: string;
	closing: boolean;
	selfClosing: boolean;
	/** Where it starts in the text of the skin. */
	start: number;
	/** Where it ends, right after `>`. */
	end: number;
	attributes: SkinAttribute[];
}

/** A tag, `<` and a name, in comments too, which Blogger reads as text. */
const TAG = /<(\/?)([A-Za-z_:][\w.:-]*)/g;
const COMMENT = /<!--[\s\S]*?-->/g;
const ATTRIBUTE = /\s+([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;
const START_TAG_END = /\s*(\/?)>/y;
const END_TAG_END = /\s*>/y;

/**
 * The tags in the text of a skin, in order, until one that is not
 * well-formed, `<x`, which is `invalid`. `< x` and `x>` are text.
 */
export function readSkinTags(text: string): {
	tags: SkinTag[];
	/** The first tag that is not well-formed, what is wrong and where. */
	invalid?: { index: number; message: string };
} {
	const tags: SkinTag[] = [];
	for (const match of text.matchAll(TAG)) {
		const [whole, slash, name] = match;
		const start = match.index;
		let index = start + whole.length;
		const attributes: SkinAttribute[] = [];

		if (slash === '') {
			ATTRIBUTE.lastIndex = index;
			for (
				let attribute = ATTRIBUTE.exec(text);
				attribute !== null;
				attribute = ATTRIBUTE.exec(text)
			) {
				const quote = attribute[2] === undefined ? "'" : '"';
				const value = attribute[2] ?? attribute[3];
				attributes.push({
					name: attribute[1],
					value,
					quote,
					index: ATTRIBUTE.lastIndex - value.length - 1,
				});
				index = ATTRIBUTE.lastIndex;
			}
		}
		const close = slash === '' ? START_TAG_END : END_TAG_END;
		close.lastIndex = index;
		const end = close.exec(text);
		if (end === null) {
			return {
				tags,
				invalid: notWellFormed(text, index, start, `<${slash}${name}>`, name),
			};
		}
		tags.push({
			name,
			closing: slash === '/',
			selfClosing: end[1] === '/',
			start,
			end: close.lastIndex,
			attributes,
		});
	}
	return { tags };
}

/** What is wrong with the tag `tag` at `start`, its attributes read until `index`. */
function notWellFormed(
	text: string,
	index: number,
	start: number,
	tag: string,
	name: string,
): { index: number; message: string } {
	WHITESPACE.lastIndex = index;
	WHITESPACE.exec(text);
	const at = WHITESPACE.lastIndex;
	const attribute = tag[1] === '/' ? null : ATTRIBUTE_NAME.exec(text.slice(at));
	if (attribute !== null) {
		const [, key, equals] = attribute;
		return {
			index: at,
			message: equals
				? `The attribute '${key}' of ${tag} in <b:skin> has to be quoted: ${key}='...'`
				: `The attribute '${key}' of ${tag} in <b:skin> has no value: ${key}='...'`,
		};
	}
	const found = at < text.length ? `'${text[at]}'` : 'the end of the skin';
	return {
		index: start,
		message: `Expected '>' to end the tag ${tag} in <b:skin>, found ${found}${
			tag[1] === '/'
				? ''
				: `: Blogger reads '<' and a name as a tag, '< ${name}' is text`
		}`,
	};
}

const WHITESPACE = /\s*/y;
/** An attribute name, and `=` after it when there is one. */
const ATTRIBUTE_NAME = /^([A-Za-z_:][\w.:-]*)\s*(=)?/;

/** The attributes of a `<Variable>` of each type, the type a variable has. */
const VARIABLE_TYPES = new Map(
	(
		[
			['automatic', []],
			['background', ['color']],
			['color', []],
			['font', []],
			['length', ['min', 'max']],
			['string', []],
			['url', []],
		] as const
	).map(([type, extra]) => [
		type as string,
		withKnown({
			required: ['name', 'description', 'type', 'default'],
			optional: ['value', 'hideEditor', ...extra],
		}),
	]),
);

/** The attributes of a `<Variable>` of no type Blogger has, the others are not known. */
const ANY_VARIABLE: Attributes = {
	required: ['name', 'description', 'type', 'default'],
	others: 'allow',
};

const GROUP = withKnown({ required: ['description'], optional: ['selector'] });

/** The name of a `<Variable>`: letters, digits and dots. */
const VARIABLE_NAME = /^[A-Za-z0-9.]+$/;

/** Whether Blogger reads the attribute of a skin tag trimmed: `description`, and `name` of a `<Variable>`. */
export function isTrimmed(tag: string, attribute: string): boolean {
	return (
		attribute === 'description' || (tag === 'Variable' && attribute === 'name')
	);
}

/** A `<Group>` of the Theme Designer, in `XmlInfo`. */
export interface SkinGroup {
	description: string;
	selector?: string;
	loc: Location;
}

/** A `<Variable>` of the Theme Designer, in `XmlInfo`, with the description of its group. */
export interface SkinVariable {
	name: string;
	type: string;
	description: string;
	group?: string;
	/** Every attribute, its entities decoded, `name` and `description` trimmed. */
	attributes: Record<string, string>;
	loc: Location;
}

/** An element open in the text of a skin, with where its last child ends, to find text after it. */
interface OpenTag {
	tag: SkinTag;
	last: number;
	/** The description of a `<Group>`. */
	description?: string;
	/** Whether the text in it is reported, once. */
	withText?: boolean;
}

/**
 * Checks the tags in the text of `<b:skin>` as Blogger reads them, the
 * `<Group>`s and `<Variable>`s of the Theme Designer, and collects these.
 */
export function createVariableCheck(report: Report): {
	/** Checks the text of a skin, and gives its tags when they are well-formed. */
	check(skin: SkinText): SkinTag[] | undefined;
	info(locOf: (offset: number) => Location): {
		groups: SkinGroup[];
		variables: SkinVariable[];
	};
} {
	const groups: (Omit<SkinGroup, 'loc'> & { offset: number })[] = [];
	const variables: (Omit<SkinVariable, 'loc'> & { offset: number })[] = [];

	const check = ({ text, sourceOf: at }: SkinText) => {
		const { tags, invalid } = readSkinTags(text);
		/** The text with its comments blanked out, they can be in a `<Group>`. */
		const uncommented = text.includes('<!--')
			? text.replace(COMMENT, (comment) => ' '.repeat(comment.length))
			: text;
		const groupDescriptions = new Set<string>();
		const names = new Set<string>();
		/** The descriptions of the variables of every group, by its description, `undefined` for none. */
		const descriptions = new Map<string | undefined, Set<string>>();
		const stack: OpenTag[] = [];

		/** Reports `value` when it is in `seen` already, and adds it. */
		const unique = (
			seen: Set<string>,
			value: string | undefined,
			message: string,
			tag: SkinTag,
		) => {
			if (value === undefined) {
				return;
			}
			if (seen.has(value)) {
				report.error(message, at(tag.start));
			}
			seen.add(value);
		};

		/** The values of the attributes of a tag, as Blogger reads them, a duplicate reported. */
		const valuesOf = (tag: SkinTag) => {
			const values = new Map<string, string>();
			for (const { name, value, index } of tag.attributes) {
				if (values.has(name)) {
					report.error(
						`Duplicate attribute '${name}' in <${tag.name}>`,
						at(index),
					);
				}
				const decoded = decodeEntities(value);
				values.set(name, isTrimmed(tag.name, name) ? decoded.trim() : decoded);
			}
			return values;
		};

		/** Reports the attributes of a tag Blogger does not read or misses, and an empty description or name. */
		const checkTag = (
			tag: SkinTag,
			values: Map<string, string>,
			accepted: Attributes,
			what = tag.name,
		) => {
			checkAttributes(
				what,
				accepted,
				tag.attributes.map(({ name, index }) => ({ name, offset: at(index) })),
				report,
				at(tag.start),
			);
			for (const { name, index } of tag.attributes) {
				const value = values.get(name);
				if (!isTrimmed(tag.name, name) || value === undefined) {
					continue;
				}
				if (value === '') {
					report.error(
						`The attribute '${name}' of <${tag.name}> can not be empty`,
						at(index),
					);
				} else if (name === 'name' && !VARIABLE_NAME.test(value)) {
					report.error(
						`The attribute 'name' of <Variable> can only have letters, digits and dots, got: '${value}'`,
						at(index),
					);
				}
			}
		};

		/** Reports the text in a `<Group>` before `index`, once, comments aside. */
		const textBefore = (group: OpenTag, index: number) => {
			const gap = uncommented.slice(group.last, index);
			if (!group.withText && gap.trim() !== '') {
				group.withText = true;
				report.error(
					'<Group> can only have <Variable> in it, found text',
					at(index - gap.trimStart().length),
				);
			}
		};

		const checkGroup = (tag: SkinTag, values: Map<string, string>) => {
			checkTag(tag, values, GROUP);
			const description = values.get('description');
			unique(
				groupDescriptions,
				description,
				`There can only be one <Group> with the description '${description}'`,
				tag,
			);
			const selector = values.get('selector');
			groups.push({
				description: description ?? '',
				...(selector === undefined ? {} : { selector }),
				offset: at(tag.start),
			});
		};

		const checkVariable = (
			tag: SkinTag,
			values: Map<string, string>,
			group: OpenTag | undefined,
		) => {
			const type = values.get('type');
			const accepted =
				type === undefined ? undefined : VARIABLE_TYPES.get(type);
			if (type !== undefined && accepted === undefined) {
				report.error(
					`Unknown <Variable> type '${type}'${didYouMean(type, VARIABLE_TYPES.keys())}`,
					at(
						tag.attributes.find((item) => item.name === 'type')?.index ??
							tag.start,
					),
				);
			}
			checkTag(
				tag,
				values,
				accepted ?? ANY_VARIABLE,
				accepted ? `Variable type='${type}'` : 'Variable',
			);

			const name = values.get('name');
			unique(
				names,
				name,
				`There can only be one <Variable> named '${name}'`,
				tag,
			);
			const description = values.get('description');
			const seen = descriptions.get(group?.description) ?? new Set<string>();
			descriptions.set(group?.description, seen);
			unique(
				seen,
				description,
				`There can only be one <Variable> with the description '${description}' ${group ? `in the <Group> '${group.description}'` : 'out of a <Group>'}`,
				tag,
			);
			variables.push({
				name: name ?? '',
				type: type ?? '',
				description: description ?? '',
				...(group?.description === undefined
					? {}
					: { group: group.description }),
				attributes: Object.fromEntries(values),
				offset: at(tag.start),
			});
		};

		for (const tag of tags) {
			const parent = stack.at(-1);
			// what is in a variable is not read
			const inVariable = stack.some((open) => open.tag.name === 'Variable');

			if (tag.closing) {
				if (parent === undefined) {
					report.error(
						`</${tag.name}> has no <${tag.name}> to close`,
						at(tag.start),
					);
					return undefined;
				}
				if (parent.tag.name !== tag.name) {
					report.error(
						`Expected </${parent.tag.name}> to close <${parent.tag.name}>, found </${tag.name}>`,
						at(tag.start),
					);
					return undefined;
				}
				stack.pop();
				const inOtherVariable = stack.some(
					(open) => open.tag.name === 'Variable',
				);
				if (
					!inOtherVariable &&
					tag.name === 'Variable' &&
					tag.start > parent.tag.end
				) {
					report.warn(
						'<Variable> should be empty, as <Variable/>',
						at(parent.tag.start),
					);
				}
				if (!inOtherVariable && tag.name === 'Group') {
					textBefore(parent, tag.start);
				}
				const above = stack.at(-1);
				if (above !== undefined) {
					above.last = tag.end;
				}
				continue;
			}

			const values = valuesOf(tag);
			if (!inVariable) {
				const group = stack.findLast((open) => open.tag.name === 'Group');
				if (parent?.tag.name === 'Group') {
					textBefore(parent, tag.start);
				}
				if (tag.name === 'Group') {
					if (group === undefined) {
						checkGroup(tag, values);
					} else {
						report.error('<Group> can not be in a <Group>', at(tag.start));
					}
				} else if (tag.name === 'Variable') {
					checkVariable(tag, values, group);
				} else if (parent?.tag.name === 'Group') {
					report.error(
						`<Group> can only have <Variable> in it, found <${tag.name}>`,
						at(tag.start),
					);
				}
			}
			if (!tag.selfClosing) {
				stack.push({
					tag,
					last: tag.end,
					description: values.get('description'),
				});
			} else if (parent !== undefined) {
				parent.last = tag.end;
			}
		}

		if (invalid !== undefined) {
			report.error(invalid.message, at(invalid.index));
			return undefined;
		}
		const open = stack.at(-1);
		if (open !== undefined) {
			report.error(`<${open.tag.name}> is not closed`, at(open.tag.start));
			return undefined;
		}
		return tags;
	};

	return {
		check,
		info: (locOf) => ({
			groups: groups.map(({ offset, ...group }) => ({
				...group,
				loc: locOf(offset),
			})),
			variables: variables.map(({ offset, ...variable }) => ({
				...variable,
				loc: locOf(offset),
			})),
		}),
	};
}
