import type { Location } from '../plugins';
import { didYouMean } from '../utils/suggest';
import { decodeEntities } from './characters';
import { listOf, type Report } from './layout';
import type { SkinText } from './skin';

/** An attribute of a tag in a skin, `value` as it is written. */
export interface SkinAttribute {
	name: string;
	value: string;
	/** Where its value starts in the text of the skin. */
	index: number;
	/** Whether it is written with no value, `hideEditor`. */
	bare?: boolean;
}

/**
 * A `<Group>` or `<Variable>` tag in the text of a skin, the settings of the
 * Theme Designer: Blogger reads only these, the other tags are text to it.
 */
export interface SkinTag {
	name: 'Group' | 'Variable';
	closing: boolean;
	selfClosing: boolean;
	/** Where it starts in the text of the skin. */
	start: number;
	/** Where it ends, right after `>`. */
	end: number;
	/** The attributes Blogger reads, those in double quotes. */
	attributes: SkinAttribute[];
	/** The attributes it does not read: in single quotes, unquoted or with no value. */
	unread: SkinAttribute[];
	/** Right after its last attribute, or its name. */
	attributesEnd: number;
}

/** A `<Group>` or `<Variable>` tag, in comments too. */
const TAG = /<(\/?)(Group|Variable)(?![\w.:-])/g;
/** An attribute, its value in double quotes, single quotes, unquoted or none. */
const ATTRIBUTE =
	/\s+([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>"']+)))?/y;
const START_TAG_END = /\s*(\/?)>/y;
const END_TAG_END = /\s*>/y;

/** The `<Group>` and `<Variable>` tags in the text of a skin, in order, but those not ended by `>`. */
export function readSkinTags(text: string): SkinTag[] {
	const tags: SkinTag[] = [];
	for (const match of text.matchAll(TAG)) {
		const [whole, slash, name] = match;
		const start = match.index;
		let index = start + whole.length;
		const attributes: SkinAttribute[] = [];
		const unread: SkinAttribute[] = [];

		if (slash === '') {
			ATTRIBUTE.lastIndex = index;
			for (
				let attribute = ATTRIBUTE.exec(text);
				attribute !== null;
				attribute = ATTRIBUTE.exec(text)
			) {
				const [all, key, doubled, single, unquoted] = attribute;
				const value = doubled ?? single ?? unquoted ?? '';
				const read: SkinAttribute = {
					name: key,
					value,
					index:
						doubled === undefined
							? ATTRIBUTE.lastIndex - all.length + all.indexOf(key)
							: ATTRIBUTE.lastIndex - value.length - 1,
				};
				if (
					doubled === undefined &&
					single === undefined &&
					unquoted === undefined
				) {
					read.bare = true;
				}
				(doubled === undefined ? unread : attributes).push(read);
				index = ATTRIBUTE.lastIndex;
			}
		}
		const close = slash === '' ? START_TAG_END : END_TAG_END;
		close.lastIndex = index;
		const end = close.exec(text);
		if (end === null) {
			continue;
		}
		tags.push({
			name: name as SkinTag['name'],
			closing: slash === '/',
			selfClosing: end[1] === '/',
			start,
			end: close.lastIndex,
			attributes,
			unread,
			attributesEnd: index,
		});
	}
	return tags;
}

/** The attributes Blogger reads on a `<Variable>`, the type it has, it refuses others. */
const VARIABLE_TYPES = new Map<string, readonly string[]>(
	(
		[
			['automatic', []],
			['background', ['color']],
			['color', ['red', 'green', 'blue', 'alpha']],
			['font', []],
			['length', ['min', 'max']],
			['string', []],
			['url', []],
		] as const
	).map(([type, extra]) => [
		type,
		['name', 'description', 'type', 'default', 'value', 'hideEditor', ...extra],
	]),
);

const REQUIRED = ['type', 'name', 'description', 'default'];

/** The defaults Blogger accepts, by type, with what they have to be; the other types take anything. */
const DEFAULTS = new Map<
	string,
	{ test: (value: string) => boolean; what: string }
>([
	[
		'color',
		{
			test: (value) =>
				/^(?:#[\da-fA-F]{3,6}|transparent|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(?:[01]|[01]?\.\d+)\s*\))$/.test(
					value,
				) && !/^rgba\(.*,\s*1\.\d*[1-9]/.test(value),
			what: "a color, '#rgb' to '#rrggbb', 'transparent', 'rgb(r, g, b)' or 'rgba(r, g, b, a)'",
		},
	],
	[
		'length',
		{
			test: (value) =>
				/^(?:0|[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:px|em))$/.test(value),
			what: "0 or a length in px or em, '10px'",
		},
	],
	[
		'background',
		{
			test: (value) => value.trim().split(/\s+/).length === 6,
			what: "six parts, '#ffffff url(image.png) repeat scroll top left'",
		},
	],
]);

/** The name of a `<Variable>`: letters, digits, dots and underscores. */
const VARIABLE_NAME = /^[A-Za-z0-9._]+$/;

/** A `<Group>` of the Theme Designer, in `XmlInfo`. */
export interface SkinGroup {
	description: string;
	selector?: string;
	loc: Location;
}

/**
 * What every `<Variable>` of the Theme Designer has, in `XmlInfo`: its
 * attributes, their entities decoded, `name` and `description` trimmed.
 */
interface SkinVariableBase {
	name: string;
	description: string;
	/** The description of its `<Group>`. */
	group?: string;
	default: string;
	/** What Blogger adds from `default` when saving, when it is written. */
	value?: string;
	hideEditor?: string;
	loc: Location;
}

export interface ColorVariable extends SkinVariableBase {
	type: 'color';
	red?: string;
	green?: string;
	blue?: string;
	alpha?: string;
}

export interface BackgroundVariable extends SkinVariableBase {
	type: 'background';
	color?: string;
}

export interface LengthVariable extends SkinVariableBase {
	type: 'length';
	min?: string;
	max?: string;
}

export interface FontVariable extends SkinVariableBase {
	type: 'font';
}

export interface StringVariable extends SkinVariableBase {
	type: 'string';
}

export interface UrlVariable extends SkinVariableBase {
	type: 'url';
}

export interface AutomaticVariable extends SkinVariableBase {
	type: 'automatic';
}

/** A `<Variable>` of the Theme Designer, by its type, written in any case. */
export type SkinVariable =
	| ColorVariable
	| BackgroundVariable
	| LengthVariable
	| FontVariable
	| StringVariable
	| UrlVariable
	| AutomaticVariable;

/** A variable of each type before it is placed. */
type Unplaced<T> = T extends unknown
	? Omit<T, 'loc'> & { offset: number }
	: never;
type Collected = Unplaced<SkinVariable>;

/**
 * Checks the `<Group>`s and `<Variable>`s of the Theme Designer in the text of
 * `<b:skin>` as Blogger reads them, and collects these. Blogger reads them as
 * an XML document of their own, from the first one: the other tags and the
 * text between them are not read.
 */
export function createVariableCheck(report: Report): {
	/** Checks the text of a skin, and gives its tags when they are read. */
	check(skin: SkinText): SkinTag[] | undefined;
	info(locOf: (offset: number) => Location): {
		groups: SkinGroup[];
		variables: SkinVariable[];
	};
} {
	const groups: (Omit<SkinGroup, 'loc'> & { offset: number })[] = [];
	const variables: Collected[] = [];

	const check = ({ text, sourceOf: at }: SkinText) => {
		const all = readSkinTags(text);
		// what is before the first start tag is not read, `</Group>` too
		const first = all.findIndex((tag) => !tag.closing);
		const tags = first < 0 ? [] : all.slice(first);
		const groupDescriptions = new Set<string>();
		const names = new Set<string>();
		/** The descriptions of the variables of every group, by its offset. */
		const descriptions = new Map<number, Set<string>>();
		const stack: { tag: SkinTag; description?: string }[] = [];

		/**
		 * The values of the attributes Blogger reads, a duplicate reported.
		 * One it requires written but not in double quotes is an error, the
		 * others it does not read are warned about.
		 */
		const valuesOf = (tag: SkinTag) => {
			const values = new Map<string, string>();
			const required = tag.name === 'Group' ? ['description'] : REQUIRED;
			for (const { name, value, index } of tag.attributes) {
				if (values.has(name)) {
					report.error(
						'variable-duplicate-attribute',
						`Duplicate attribute '${name}' in <${tag.name}>`,
						at(index),
					);
				}
				values.set(name, decodeEntities(value));
			}
			/** The required attributes written but not in double quotes, reported once. */
			const misquoted = new Set<string>();
			for (const { name, value, index, bare } of tag.unread) {
				if (required.includes(name) && !values.has(name)) {
					misquoted.add(name);
					report.error(
						'variable-quotes',
						`Blogger only reads the attributes of <${tag.name}> in <b:skin> in double quotes, write ${name}="${bare ? '...' : value}"`,
						at(index),
					);
				} else {
					report.warn(
						'variable-unread-attribute',
						`Blogger does not read the attribute '${name}' of <${tag.name}> in <b:skin>, only values in double quotes: ${name}="..."`,
						at(index),
					);
				}
			}
			return { values, misquoted };
		};

		/** Reports a description missing or blank, but one not in double quotes, and gives it trimmed. */
		const descriptionOf = (
			tag: SkinTag,
			values: Map<string, string>,
			misquoted: Set<string>,
		) => {
			const description = values.get('description')?.trim();
			if (!description && !misquoted.has('description')) {
				report.error(
					'variable-description',
					`<${tag.name}> has to have a description, not blank`,
					at(tag.start),
				);
			}
			return description || undefined;
		};

		const checkGroup = (
			tag: SkinTag,
			values: Map<string, string>,
			misquoted: Set<string>,
		) => {
			const description = descriptionOf(tag, values, misquoted);
			if (description !== undefined) {
				if (groupDescriptions.has(description)) {
					report.error(
						'variable-duplicate-description',
						`There can only be one <Group> with the description '${description}'`,
						at(tag.start),
					);
				}
				groupDescriptions.add(description);
			}
			for (const { name, index } of tag.attributes) {
				if (name !== 'description' && name !== 'selector') {
					report.warn(
						'variable-unread-attribute',
						`<Group> has the attribute '${name}', Blogger only reads 'description' and 'selector'`,
						at(index),
					);
				}
			}
			const selector = values.get('selector');
			groups.push({
				description: description ?? '',
				...(selector === undefined ? {} : { selector }),
				offset: at(tag.start),
			});
			return description;
		};

		const checkVariable = (
			tag: SkinTag,
			values: Map<string, string>,
			misquoted: Set<string>,
			group: { tag: SkinTag; description?: string } | undefined,
		) => {
			// a description missing is reported by `descriptionOf`
			for (const key of REQUIRED) {
				if (key !== 'description' && !values.has(key) && !misquoted.has(key)) {
					report.error(
						'variable-missing-attribute',
						`<Variable> has to have the attribute '${key}'`,
						at(tag.start),
					);
				}
			}
			const type = values.get('type');
			const known =
				type === undefined ? undefined : VARIABLE_TYPES.get(type.toLowerCase());
			const attributeAt = (key: string) =>
				at(
					tag.attributes.find((item) => item.name === key)?.index ?? tag.start,
				);
			if (type !== undefined && known === undefined) {
				report.error(
					'variable-type',
					`Unknown <Variable> type '${type}'${didYouMean(type, VARIABLE_TYPES.keys())}`,
					attributeAt('type'),
				);
			}
			const fallback = values.get('default');
			const accepted = type && DEFAULTS.get(type.toLowerCase());
			// a default referring to another variable, `$(color)`, is read with it
			if (
				accepted &&
				fallback !== undefined &&
				!fallback.includes('$(') &&
				!accepted.test(fallback)
			) {
				report.error(
					'variable-default',
					`The default of a <Variable type='${type}'> has to be ${accepted.what}, got: '${fallback}'`,
					attributeAt('default'),
				);
			}
			for (const { name, index } of tag.attributes) {
				if (known !== undefined && !known.includes(name)) {
					report.error(
						'variable-attribute',
						`<Variable type='${type}'> can not have the attribute '${name}', only ${listOf(known)}`,
						at(index),
					);
				}
			}

			const written = values.get('name');
			const name = written?.trim();
			if (written !== undefined && name === '') {
				report.error(
					'variable-name',
					"The attribute 'name' of <Variable> can not be blank",
					attributeAt('name'),
				);
			} else if (written !== undefined && name !== undefined) {
				if (written !== name) {
					report.error(
						'variable-name',
						`The attribute 'name' of <Variable> can not start or end with spaces, got: '${written}'`,
						attributeAt('name'),
					);
				}
				if (!VARIABLE_NAME.test(name)) {
					report.error(
						'variable-name',
						`The attribute 'name' of <Variable> can only have letters, digits, dots and underscores, got: '${name}'`,
						attributeAt('name'),
					);
				}
				if (names.has(name)) {
					report.error(
						'variable-duplicate-name',
						`There can only be one <Variable> named '${name}'`,
						at(tag.start),
					);
				}
				names.add(name);
			}

			const description = descriptionOf(tag, values, misquoted);
			// in a group, descriptions are unique; out of one, they need not be
			if (group !== undefined && description !== undefined) {
				const seen = descriptions.get(group.tag.start) ?? new Set<string>();
				descriptions.set(group.tag.start, seen);
				if (seen.has(description)) {
					report.error(
						'variable-duplicate-description',
						`There can only be one <Variable> with the description '${description}' in the <Group> '${group.description}'`,
						at(tag.start),
					);
				}
				seen.add(description);
			}
			// one of an unknown type is an error, and not in the info
			if (type === undefined || known === undefined) {
				return;
			}
			const variable: Record<string, unknown> = {
				name: name ?? '',
				type: type.toLowerCase(),
				description: description ?? '',
				...(group?.description === undefined
					? {}
					: { group: group.description }),
				default: fallback ?? '',
			};
			for (const key of known) {
				const value = values.get(key);
				if (value !== undefined && !(key in variable)) {
					variable[key] = value;
				}
			}
			variable.offset = at(tag.start);
			variables.push(variable as Collected);
		};

		for (const tag of tags) {
			const parent = stack.at(-1);
			if (tag.closing) {
				if (parent === undefined || parent.tag.name !== tag.name) {
					report.error(
						'variable-structure',
						parent === undefined
							? `</${tag.name}> has no <${tag.name}> to close`
							: `Expected </${parent.tag.name}> to close <${parent.tag.name}>, found </${tag.name}>`,
						at(tag.start),
					);
					return undefined;
				}
				stack.pop();
				if (tag.name === 'Variable' && tag.start > parent.tag.end) {
					report.warn(
						'variable-content',
						'Blogger does not read what is in a <Variable>, write it <Variable/>',
						at(parent.tag.start),
					);
				}
				continue;
			}

			const { values, misquoted } = valuesOf(tag);
			const group = stack.findLast((open) => open.tag.name === 'Group');
			let description: string | undefined;
			if (tag.name === 'Group') {
				if (group !== undefined) {
					report.error(
						'variable-structure',
						'<Group> can not be in a <Group>',
						at(tag.start),
					);
				}
				description = checkGroup(tag, values, misquoted);
			} else {
				checkVariable(tag, values, misquoted, group);
			}
			if (!tag.selfClosing) {
				stack.push({ tag, description });
			}
		}

		const open = stack.at(-1);
		if (open !== undefined) {
			report.error(
				'variable-structure',
				`<${open.tag.name}> is not closed`,
				at(open.tag.start),
			);
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
			variables: variables.map(
				({ offset, ...variable }) =>
					({ ...variable, loc: locOf(offset) }) as SkinVariable,
			),
		}),
	};
}
