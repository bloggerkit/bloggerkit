import { didYouMean, suggest } from '../utils/suggest';
import { readValue, xmlValue } from './characters';
import {
	ELEMENTS,
	ROOT_ATTRIBUTES,
	SCOPE_DEPTH_MAX,
	SKINS,
	WIDGETS,
} from './elements';
import type { OpenElement, ScannedAttribute, ScannedStartTag } from './scanner';

export interface Attributes {
	required?: string[];
	optional?: string[];
	/** Of those, the ones whose `expr:name` Blogger does not read. */
	literal?: string[];
	/** What another attribute is, see `ElementRule.others`. */
	others?: 'allow' | 'warn' | 'removed' | 'unrendered';
	/** `required` and `optional`. */
	known?: Set<string>;
}

/** The attributes of each `b:` element, as `checkAttributes` takes them, from its rule. */
const ATTRIBUTES = new Map(
	[...ELEMENTS].map(([name, rule]): [string, Attributes] => {
		const names = Object.keys(rule.attributes);
		const required = names.filter((key) => rule.attributes[key].required);
		return [
			name,
			{
				required,
				optional: names.filter((key) => !rule.attributes[key].required),
				literal: names.filter((key) => rule.attributes[key].literal),
				others: rule.others,
				known: new Set(names),
			},
		];
	}),
);

/** `name` without `expr:`. */
function baseOf(name: string): string {
	return name.startsWith('expr:') ? name.slice('expr:'.length) : name;
}

/** Reports an error or a warning at an offset in the document, placed only when reported. */
export interface Report {
	error(code: string, message: string, offset: number): void;
	warn(code: string, message: string, offset: number): void;
}

/**
 * The number after the type in the id of a widget, as Blogger reads it, an
 * integer with a sign or not and digits of any script, undefined when it is
 * not one.
 */
function widgetNumber(rest: string): number | undefined {
	const match = /^([+-]?)(\p{Nd}+)$/u.exec(rest);
	if (match === null) {
		return undefined;
	}
	let number = 0;
	for (const digit of match[2]) {
		// the digits of a script are ten code points in a row, from its zero
		const code = digit.codePointAt(0) ?? 0;
		let zero = code;
		while (/\p{Nd}/u.test(String.fromCodePoint(zero - 1)) && code - zero < 9) {
			zero--;
		}
		number = number * 10 + (code - zero);
	}
	return match[1] === '-' ? -number : number;
}

/** `'a'`, `'a' and 'b'`, `'a', 'b' and 'c'`, or with `or` */
export function listOf(
	names: readonly string[],
	last: 'and' | 'or' = 'and',
): string {
	const quoted = names.map((name) => `'${name}'`);
	return quoted.length > 1
		? `${quoted.slice(0, -1).join(', ')} ${last} ${quoted.at(-1)}`
		: (quoted[0] ?? '');
}

/** Warns about the `b:` attributes of the root element Blogger does not read, or with a value it does not read. */
function checkRootAttributes(
	attributes: readonly ScannedAttribute[],
	report: Report,
): void {
	for (const attribute of attributes) {
		if (!attribute.name.startsWith('b:')) {
			continue;
		}
		if (!ROOT_ATTRIBUTES.has(attribute.name)) {
			report.warn(
				'root-attribute',
				`<html> has the attribute '${attribute.name}', Blogger only reads ${listOf([...ROOT_ATTRIBUTES.keys()])}`,
				attribute.offset,
			);
			continue;
		}
		const accepted = ROOT_ATTRIBUTES.get(attribute.name);
		if (accepted && !accepted.test(attribute.value)) {
			report.warn(
				'root-attribute',
				`The attribute '${attribute.name}' of <html> has to be ${accepted.source.includes('true') ? "'true' or 'false'" : 'a number'}, got: '${attribute.value}'`,
				attribute.offset,
			);
		}
	}
}

/**
 * Reports the attributes of `<name>` it does not know, as `others` says,
 * and the required ones it misses, at `start`.
 */
export function checkAttributes(
	name: string,
	{
		required = [],
		literal = [],
		others = 'warn',
		known = new Set(),
	}: Attributes,
	attributes: readonly Pick<ScannedAttribute, 'name' | 'offset'>[],
	report: Report,
	start: number,
): void {
	const names = new Set(attributes.map((attribute) => attribute.name));

	for (const attribute of attributes) {
		const base = baseOf(attribute.name);
		if (others === 'allow' || (known.has(base) && !literal.includes(base))) {
			continue;
		}
		// `expr:` of a literal one is reported with the others written both ways
		if (known.has(base) && literal.includes(base)) {
			continue;
		}
		const message =
			others === 'removed'
				? `Blogger removes the attribute '${attribute.name}' of <${name}>, it only keeps ${listOf([...known])}`
				: others === 'unrendered'
					? `Blogger does not render the attribute '${attribute.name}' of <${name}>, only ${listOf(['class', 'id', 'name', 'tag'])}`
					: known.size === 0
						? `<${name}> has the attribute '${attribute.name}', Blogger reads no attribute on it`
						: `<${name}> has the attribute '${attribute.name}', Blogger only reads ${listOf([...known])}`;
		report.warn(
			others === 'removed'
				? 'removed-attribute'
				: others === 'unrendered'
					? 'unrendered-attribute'
					: 'unread-attribute',
			message,
			attribute.offset,
		);
	}

	for (const key of required) {
		if (
			names.has(key) ||
			(!literal.includes(key) && names.has(`expr:${key}`))
		) {
			continue;
		}
		report.error(
			'missing-attribute',
			`<${name}> has to have the attribute '${key}'${names.has(`expr:${key}`) ? `, 'expr:${key}' is not used` : ''}`,
			start,
		);
	}
}

/**
 * Warns about an attribute written both as `x` and `expr:x`, on any element:
 * Blogger uses `expr:x`, or `x` when it is `literal`, and ignores `expr:x`
 * of a literal alone.
 */
function warnOverridden(
	name: string,
	attributes: readonly ScannedAttribute[],
	literal: readonly string[],
	{ warn }: Report,
): void {
	// both forms, or `expr:` of a literal, need an `expr:` attribute
	if (!attributes.some((attribute) => attribute.name.startsWith('expr:'))) {
		return;
	}
	const names = new Set(attributes.map((attribute) => attribute.name));
	for (const attribute of attributes) {
		const base = baseOf(attribute.name);
		if (literal.includes(base)) {
			if (base !== attribute.name && !names.has(base)) {
				warn(
					'overridden-attribute',
					`Blogger ignores '${attribute.name}' on <${name}>, '${base}' can not be an expression`,
					attribute.offset,
				);
			} else if (base === attribute.name && names.has(`expr:${base}`)) {
				warn(
					'overridden-attribute',
					`<${name}> has both '${base}' and 'expr:${base}', Blogger uses '${base}'`,
					attribute.offset,
				);
			}
		} else if (base === attribute.name && names.has(`expr:${base}`)) {
			warn(
				'overridden-attribute',
				`<${name}> has both '${attribute.name}' and 'expr:${attribute.name}', Blogger uses 'expr:${attribute.name}'`,
				attribute.offset,
			);
		}
	}
}

export interface LayoutCheck {
	onStartTag(tag: ScannedStartTag): void;
	onEndTag(element: OpenElement, contentEnd?: number): void;
	onText(offset: number, parent: OpenElement | undefined): void;
	onMarkup(
		kind: 'comment' | 'pi',
		start: number,
		end: number,
		parent: OpenElement | undefined,
	): void;
	/** Once the whole document is scanned. */
	finish(): void;
}

/** An element open, with what is known of it for the checks. */
interface Open {
	name: string;
	start: number;
	/** The type of a widget. */
	type?: string;
}

/**
 * Checks the layout and the tags of a theme as Blogger does when saving and
 * rendering it: what it refuses or fails on is an error, what it removes or
 * does not render a warning. Every one is reported, the scan goes on.
 */
export function createLayoutCheck(xml: string, report: Report): LayoutCheck {
	/** The elements open, innermost last. */
	const stack: Open[] = [];
	/** The `<b:widget-settings>` of every widget open, by the offset of its start tag. */
	const settings = new Map<number, number>();
	/** The ids of the sections, as Blogger reads them, and of the widgets, each unique in the theme. */
	const ids = new Map([
		['b:section', new Set<string>()],
		['b:widget', new Set<string>()],
	]);
	/** The widgets of the types a blog has one of. */
	const singles = new Set<string>();
	/**
	 * The ids of the includables of every widget and default markup open, by
	 * the offset of its start tag: each as Blogger saves it, with the ids as
	 * XML reads them that it is saved from.
	 */
	const includables = new Map<number, Map<string, Set<string>>>();
	/** The includables of the default markups, by type and id, with the offset of their `<b:defaultmarkup>`. */
	const defaults = new Map<string, number>();
	/** The `<b:if>`s open that have their `<b:else>`, by the offset of their start tag. */
	const withElse = new Set<number>();
	/** The `<b:switch>`es open that have their `<b:default>`, by the offset of their start tag. */
	const withDefault = new Set<number>();
	/** The elements whose other content is reported, once each, by the offset of their start tag. */
	const reported = new Set<number>();
	/** The number of `<b:skin>`s. */
	let skins = 0;
	/** The root element, when it is `<html>`, and whether it has `b:layoutsVersion`. */
	let root: { start: number; layouts: boolean } | undefined;

	const inside = (name: string) => stack.some((open) => open.name === name);
	const widget = () => stack.findLast((open) => open.name === 'b:widget');

	/** Reports what else is in a parent, once, as Blogger does with it. */
	const reportOther = (parent: OpenElement, found: string, offset: number) => {
		const children = ELEMENTS.get(parent.name)?.children;
		if (children === undefined || reported.has(parent.start)) {
			return;
		}
		reported.add(parent.start);
		const only = children.elements.map((child) => `<${child}>`).join(' and ');
		const message = {
			error: `<${parent.name}> can only have ${only} in it, found ${found}`,
			removed: `Blogger removes what is not ${only} from <${parent.name}>, found ${found}`,
			unread: `Blogger does not render what is not ${only} in <${parent.name}>, found ${found}`,
		}[children.others];
		if (children.others === 'error') {
			report.error('wrong-child', message, offset);
		} else {
			report.warn(
				children.others === 'removed'
					? 'removed-content'
					: 'unrendered-content',
				message,
				offset,
			);
		}
	};

	const checkSection = (tag: ScannedStartTag) => {
		const { attributes, start } = tag;
		if (inside('head')) {
			report.error('misplaced', '<b:section> can not be in <head>', start);
		}
		if (widget() !== undefined) {
			report.error(
				'misplaced',
				"<b:section> can not be in a widget, Blogger fails with 'The tag 'section' is not a known Blogger tag'",
				start,
			);
		}
		for (const attribute of attributes) {
			if (attribute.name === 'expr:id') {
				report.error(
					'section-expr-id',
					"<b:section> can not have 'expr:id': Blogger saves the section with 'id', and every page fails when it is rendered with another one",
					attribute.offset,
				);
			} else if (
				attribute.name.startsWith('expr:') &&
				!['expr:cond', 'expr:name', 'expr:tag'].includes(attribute.name)
			) {
				report.warn(
					'unrendered-attribute',
					`Blogger does not render the attribute '${attribute.name}' of <b:section>, only ${listOf(['class', 'id', 'name', 'tag'])}`,
					attribute.offset,
				);
			}
		}
		const id = attributes.find((attribute) => attribute.name === 'id');
		if (id === undefined || id.dynamic) {
			return;
		}
		const value = readValue(id.value);
		if (value.trim() === '') {
			report.error(
				'section-id',
				"The attribute 'id' of <b:section> can not be blank",
				id.offset,
			);
			return;
		}
		if (value.startsWith(' ') || value.endsWith(' ')) {
			report.error(
				'section-id',
				`The attribute 'id' of <b:section> can not start or end with spaces, Blogger fails to save it, got: '${id.value}'`,
				id.offset,
			);
		}
		const seen = ids.get('b:section') as Set<string>;
		if (seen.has(value)) {
			report.error(
				'duplicate-id',
				`There can only be one <b:section> with the id '${value}'`,
				id.offset,
			);
		}
		seen.add(value);
	};

	const checkWidget = (tag: ScannedStartTag) => {
		const { attributes } = tag;
		const attributeNamed = (name: string) =>
			attributes.find((attribute) => attribute.name === name);
		for (const attribute of attributes) {
			if (attribute.name.startsWith('expr:')) {
				report.warn(
					'removed-attribute',
					`Blogger removes the attribute '${attribute.name}' of <b:widget>, its attributes can not be expressions`,
					attribute.offset,
				);
			}
		}
		const title = attributeNamed('title');
		if (title && readValue(title.value).length > WIDGETS.titleLength) {
			report.warn(
				'widget-title',
				`Blogger empties a title of a widget longer than ${WIDGETS.titleLength} characters`,
				title.offset,
			);
		} else if (title && /[&"]/.test(readValue(title.value))) {
			report.warn(
				'widget-title',
				"Blogger escapes '&' and '\"' in the title of a widget twice when saving it, '&' shows as '&amp;'",
				title.offset,
			);
		}
		for (const key of ['locked', 'visible']) {
			const flag = attributeNamed(key);
			if (flag && !/^(true|false)$/i.test(flag.value)) {
				report.warn(
					'widget-flag',
					`The attribute '${key}' of <b:widget> has to be 'true' or 'false', Blogger saves '${key === 'locked' ? 'false' : 'true'}', got: '${flag.value}'`,
					flag.offset,
				);
			}
		}

		const type = attributeNamed('type');
		const id = attributeNamed('id');
		if (id && !id.dynamic) {
			const seen = ids.get('b:widget') as Set<string>;
			const value = readValue(id.value);
			if (seen.has(value)) {
				report.error(
					'duplicate-id',
					`There can only be one <b:widget> with the id '${value}'`,
					id.offset,
				);
			}
			seen.add(value);
		}
		if (type === undefined || type.dynamic) {
			return;
		}
		if (!WIDGETS.types.includes(type.value)) {
			report.error(
				'widget-type',
				`Unknown widget type '${type.value}'${didYouMean(type.value, WIDGETS.types)}`,
				type.offset,
			);
			return;
		}
		if (WIDGETS.removed.has(type.value)) {
			report.warn(
				'removed-widget',
				`Blogger removes widgets of the type '${type.value}' when saving the theme`,
				type.offset,
			);
		}
		if (WIDGETS.single.has(type.value)) {
			if (singles.has(type.value)) {
				report.error(
					'widget-limit',
					`A blog can only have one widget of the type '${type.value}'`,
					type.offset,
				);
			}
			singles.add(type.value);
		}
		if (id && !id.dynamic) {
			const value = readValue(id.value);
			const number = value.startsWith(type.value)
				? widgetNumber(value.slice(type.value.length))
				: undefined;
			if (number === undefined || number > WIDGETS.numberMax) {
				report.error(
					'widget-id',
					`The attribute 'id' of <b:widget> has to be '${type.value}' and a number up to ${WIDGETS.numberMax}, '${type.value}1', got: '${value}'`,
					id.offset,
				);
			}
		}
	};

	/** Reports an includable with no id, or the id of another includable of its widget or default markup. */
	const checkIncludable = (tag: ScannedStartTag, parent: OpenElement) => {
		const id = tag.attributes.find((attribute) => attribute.name === 'id');
		if (id === undefined || id.dynamic) {
			return;
		}
		const value = readValue(id.value);
		if (value.trim() === '') {
			report.error(
				'includable-id',
				"The attribute 'id' of <b:includable> can not be blank",
				id.offset,
			);
			return;
		}
		// Blogger refuses an id the same as XML reads it, and saves an id
		// trimmed with tabs and line breaks as spaces, one includable of those
		// the same once saved
		const read = xmlValue(id.value);
		const saved = read.replace(/[\t\n\r]/g, ' ').trim();
		const seen = includables.get(parent.start);
		const others = seen?.get(saved);
		if (others?.has(read)) {
			report.error(
				'duplicate-id',
				`There can only be one <b:includable> with the id '${read}' in a <${parent.name}>`,
				id.offset,
			);
		} else if (others !== undefined && parent.name === 'b:widget') {
			report.warn(
				'merged-includable',
				`Blogger keeps only one of the includables '${[...others][0]}' and '${read}', it saves their ids trimmed, with tabs and line breaks as spaces`,
				id.offset,
			);
		}
		if (seen !== undefined && others === undefined) {
			seen.set(saved, new Set([read]));
		} else {
			others?.add(read);
		}
		if (parent.name !== 'b:defaultmarkup') {
			return;
		}
		const types = stack.findLast(
			(open) => open.name === 'b:defaultmarkup',
		)?.type;
		for (const type of types?.split(',') ?? []) {
			const key = `${type.trim()}\u0000${value}`;
			const other = defaults.get(key);
			if (other !== undefined && other !== parent.start) {
				report.warn(
					'overridden-includable',
					`Another <b:defaultmarkup> of the type '${type.trim()}' has an includable '${value}', Blogger uses the last one`,
					id.offset,
				);
			}
			defaults.set(key, parent.start);
		}
	};

	const checkDefaultMarkup = (tag: ScannedStartTag) => {
		const type = tag.attributes.find((attribute) => attribute.name === 'type');
		if (type === undefined || type.dynamic) {
			return;
		}
		for (const part of type.value.split(',')) {
			const name = part.trim();
			if (name !== 'Common' && !WIDGETS.types.includes(name)) {
				report.error(
					'widget-type',
					`Unknown widget type '${name}' in <b:defaultmarkup>${didYouMean(name, ['Common', ...WIDGETS.types])}`,
					type.offset,
				);
			}
		}
	};

	/** Reports the literal attributes Blogger does not render with. */
	const checkNames = (tag: ScannedStartTag) => {
		const name = tag.attributes.find((attribute) => attribute.name === 'name');
		if (name === undefined || name.dynamic) {
			return;
		}
		const value = readValue(name.value);
		if (tag.name === 'b:class' && value.trim() === '') {
			report.error(
				'invalid-name',
				"The attribute 'name' of <b:class> can not be empty, Blogger fails when rendering it",
				name.offset,
			);
		}
		if (tag.name === 'b:attr' && !/^[^\s"'<>/=]+$/.test(value)) {
			report.error(
				'invalid-name',
				`The attribute 'name' of <b:attr> has to be the name of an attribute, Blogger fails when rendering it, got: '${value}'`,
				name.offset,
			);
		}
		if (tag.name === 'b:tag' && !/^[A-Za-z_:][\w:.-]*$/.test(value)) {
			report.error(
				'invalid-name',
				`The attribute 'name' of <b:tag> has to be the name of a tag, Blogger fails when rendering it, got: '${value}'`,
				name.offset,
			);
		}
	};

	return {
		onStartTag(tag) {
			const { name, start, parent, attributes, selfClosing } = tag;
			if (parent === undefined) {
				if (name !== 'html') {
					report.warn(
						'root-element',
						`The root element of a theme is <html>, Blogger keeps <${name}> as it is`,
						start,
					);
				}
				checkRootAttributes(attributes, report);
				root = {
					start,
					layouts: attributes.some(
						(attribute) => attribute.name === 'b:layoutsVersion',
					),
				};
			}

			if (name.startsWith('b:')) {
				const accepted = ATTRIBUTES.get(name);
				if (accepted === undefined) {
					const match = suggest(name, ELEMENTS.keys());
					const meant = match ? `, did you mean <${match}>?` : '';
					if (widget() !== undefined) {
						report.error(
							'unknown-element',
							`Unknown element <${name}>, Blogger fails with 'The tag '${name.slice(2)}' is not a known Blogger tag'${meant}`,
							start,
						);
					} else {
						report.warn(
							'unknown-element',
							`Unknown element <${name}>, Blogger renders nothing for it${meant}`,
							start,
						);
					}
				} else {
					checkAttributes(name, accepted, attributes, report, start);
				}
				if (
					name === 'b:attr' &&
					!attributes.some((a) => baseOf(a.name) === 'value')
				) {
					report.warn(
						'attr-without-value',
						"<b:attr> without a value removes the attribute, as value=''",
						start,
					);
				}
			}

			// a widget has its own, Blogger removes or ignores `expr:` on it
			if (name !== 'b:widget') {
				warnOverridden(
					name,
					attributes,
					ATTRIBUTES.get(name)?.literal ?? [],
					report,
				);
			}

			switch (name) {
				case 'b:section':
					checkSection(tag);
					break;
				case 'b:widget':
					checkWidget(tag);
					break;
				case 'b:includable':
					if (parent !== undefined) {
						checkIncludable(tag, parent);
					}
					break;
				case 'b:defaultmarkup':
					checkDefaultMarkup(tag);
					break;
				case 'b:defaultmarkups':
					if (inside('b:section') || widget() !== undefined) {
						report.error(
							'misplaced',
							'<b:defaultmarkups> can not be in a section or a widget',
							start,
						);
					}
					break;
				case 'b:widget-setting': {
					const settingName = attributes.find((a) => a.name === 'name');
					const known = WIDGETS.settings.get(widget()?.type ?? '');
					if (
						settingName &&
						!settingName.dynamic &&
						known &&
						!known.includes(settingName.value)
					) {
						report.error(
							'widget-setting',
							`A widget of the type '${widget()?.type}' has no setting '${settingName.value}', only ${listOf(known)}`,
							settingName.offset,
						);
					}
					break;
				}
				case 'b:attr':
				case 'b:class':
				case 'b:tag':
					checkNames(tag);
					break;
				case 'b:template-skin':
					if (root && !root.layouts) {
						report.error(
							'template-skin-version',
							'<b:template-skin> needs the attribute b:layoutsVersion on <html>, a theme of layouts version 2 or above',
							start,
						);
					}
					break;
			}
			if (SKINS.has(name) && inside('body')) {
				report.error('misplaced', `<${name}> can not be in <body>`, start);
			}
			if (name === 'b:skin') {
				skins++;
				if (skins > 1) {
					report.error('skin-count', 'There can only be one <b:skin>', start);
				}
			}

			// one report for an element in the wrong place, of the element or of its parent
			const parents = ELEMENTS.get(name)?.parents;
			if (
				parents !== undefined &&
				!parents.elements.includes(parent?.name ?? '') &&
				// in `<b:defaultmarkups>`, it is what else is in it
				!(parent && ELEMENTS.get(parent.name)?.children?.others === 'unread')
			) {
				const message = `<${name}> can only be in ${parents.elements.map((element) => `a <${element}>`).join(' or ')}, it is ${parent ? `in <${parent.name}>` : 'at the top'}`;
				if (parents.otherwise === 'error') {
					report.error('misplaced', message, start);
				} else {
					report.warn(
						'misplaced',
						`${message}, Blogger does not read it`,
						start,
					);
				}
			} else if (parent && ELEMENTS.get(parent.name)?.children) {
				if (!ELEMENTS.get(parent.name)?.children?.elements.includes(name)) {
					reportOther(parent, `<${name}>`, start);
				}
			}

			if (name === 'b:widget') {
				settings.set(start, 0);
			}
			if (name === 'b:widget-settings' && parent?.name === 'b:widget') {
				const count = (settings.get(parent.start) ?? 0) + 1;
				settings.set(parent.start, count);
				if (count > 1) {
					report.error(
						'widget-settings-count',
						'<b:widget> can only have one <b:widget-settings>',
						start,
					);
				}
			}

			// what comes after a second `<b:else>`, or a `<b:elseif>` after it, is never rendered
			if (
				(name === 'b:else' || name === 'b:elseif') &&
				parent?.name === 'b:if'
			) {
				if (withElse.has(parent.start)) {
					report.warn(
						'unreachable',
						`Blogger never renders what comes after this <${name}>, the <b:else> before it ends the <b:if>`,
						start,
					);
				} else if (name === 'b:else') {
					withElse.add(parent.start);
				}
			}

			if (
				(name === 'b:default' || name === 'b:case') &&
				parent?.name === 'b:switch'
			) {
				if (withDefault.has(parent.start)) {
					if (name === 'b:default') {
						report.warn(
							'unreachable',
							'Blogger never renders what comes after this <b:default>, the <b:default> before it ends the <b:switch>',
							start,
						);
					} else {
						report.error(
							'case-after-default',
							'<b:case> can not come after the <b:default> of its <b:switch>',
							start,
						);
					}
				} else if (name === 'b:default') {
					withDefault.add(parent.start);
				}
			}

			if (name === 'b:with' || name === 'b:loop') {
				const depth =
					stack.filter(
						(open) => open.name === 'b:with' || open.name === 'b:loop',
					).length + 1;
				if (depth === SCOPE_DEPTH_MAX + 1) {
					report.error(
						'scope-depth',
						`Blogger fails with more than ${SCOPE_DEPTH_MAX} <b:with> and <b:loop> one in another`,
						start,
					);
				}
			}

			if (!selfClosing) {
				stack.push({
					name,
					start,
					type:
						name === 'b:widget' || name === 'b:defaultmarkup'
							? attributes.find((attribute) => attribute.name === 'type')?.value
							: undefined,
				});
				if (name === 'b:widget' || name === 'b:defaultmarkup') {
					includables.set(start, new Map());
				}
			}
		},

		onEndTag({ name, start, contentStart }, contentEnd) {
			if (stack.at(-1)?.start === start) {
				stack.pop();
			}
			settings.delete(start);
			includables.delete(start);
			withElse.delete(start);
			withDefault.delete(start);

			if (contentEnd === undefined) {
				return;
			}
			const content = xml.slice(contentStart, contentEnd);
			if (content.trim() === '') {
				return;
			}
			const level = ELEMENTS.get(name)?.empty;
			if (level === 'error') {
				report.error(
					'not-empty',
					`<${name}> has to be empty, as <${name}/>`,
					start,
				);
			} else if (level !== undefined) {
				report.warn(
					'unrendered-content',
					ELEMENTS.get(name)?.branch
						? `Blogger does not render what is in <${name}>, write it after <${name}/>`
						: `Blogger does not render what is in <${name}>, write it <${name}/>`,
					start,
				);
			} else if (name.startsWith('data:')) {
				report.warn(
					'unrendered-content',
					`Blogger does not render what is in <${name}>, write it <${name}/>`,
					start,
				);
			}
		},

		onText(offset, parent) {
			if (parent) {
				reportOther(parent, 'text', offset);
			}
		},

		onMarkup(kind, start, _end, parent) {
			if (kind === 'pi') {
				report.warn(
					'processing-instruction',
					'Blogger removes processing instructions',
					start,
				);
				return;
			}
			if (parent && ELEMENTS.get(parent.name)?.children?.others === 'removed') {
				report.warn(
					'removed-content',
					`Blogger removes comments in <${parent.name}>`,
					start,
				);
			} else if (parent?.name === 'b:widget') {
				report.warn(
					'removed-content',
					'Blogger removes comments in <b:widget>',
					start,
				);
			}
		},

		finish() {
			// a theme, `<html>`, has a skin
			if (root !== undefined && skins === 0) {
				report.error(
					'missing-skin',
					'The theme has to have a <b:skin>',
					root.start,
				);
			}
		},
	};
}
