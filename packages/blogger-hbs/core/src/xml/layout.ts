import { didYouMean, suggest } from '../utils/suggest';
import type { OpenElement, ScannedAttribute, ScannedStartTag } from './scanner';
import { SKINS } from './skin';

/** The only elements Blogger accepts in these, whitespace and comments aside. */
const CHILDREN = new Map([
	['b:section', ['b:widget']],
	['b:widget', ['b:widget-settings', 'b:includable']],
	['b:widget-settings', ['b:widget-setting']],
	['b:defaultmarkups', ['b:defaultmarkup']],
	['b:defaultmarkup', ['b:includable']],
	['b:message', ['b:param']],
]);

/** The only elements Blogger accepts these in. */
const PARENTS = new Map([
	['b:widget', ['b:section']],
	['b:widget-settings', ['b:widget']],
	['b:widget-setting', ['b:widget-settings']],
	['b:includable', ['b:defaultmarkup', 'b:widget']],
	['b:defaultmarkup', ['b:defaultmarkups']],
	['b:elseif', ['b:if']],
	['b:else', ['b:if']],
	['b:case', ['b:switch']],
	['b:default', ['b:switch']],
	['b:param', ['b:message']],
]);

/** The elements Blogger has empty, `<b:else/>`, an error or a warning when they are not. */
const EMPTY = new Map<string, 'error' | 'warn'>([
	['b:attr', 'error'],
	['b:class', 'error'],
	['b:eval', 'error'],
	['b:elseif', 'error'],
	['b:else', 'error'],
	['b:case', 'error'],
	['b:default', 'error'],
	['b:include', 'error'],
	['b:param', 'error'],
]);

export interface Attributes {
	required?: string[];
	optional?: string[];
	/** Of those, the ones Blogger reads when saving, it ignores `expr:name` for them. */
	literal?: string[];
	/**
	 * What another attribute is: `'warn'`, by default, as Blogger keeps it but
	 * does not read it, `'error'`, or `'allow'`, as `<b:tag>` renders a tag
	 * with them.
	 */
	others?: 'allow' | 'warn' | 'error';
	/** `required` and `optional`, set once for every element. */
	known?: Set<string>;
}

/**
 * The `b:` elements Blogger knows and their attributes, each also as
 * `expr:name`, from the elements of themes made for it.
 */
const ELEMENTS = new Map<string, Attributes>([
	['b:attr', { required: ['name', 'value'], optional: ['cond'] }],
	['b:case', { required: ['value'] }],
	['b:class', { required: ['name'], optional: ['cond'] }],
	['b:comment', {}],
	['b:default', {}],
	['b:defaultmarkup', { required: ['type'] }],
	['b:defaultmarkups', {}],
	['b:else', {}],
	['b:elseif', { required: ['cond'] }],
	['b:eval', { required: ['expr'] }],
	['b:if', { required: ['cond'] }],
	['b:include', { required: ['name'], optional: ['data', 'cond'] }],
	['b:includable', { required: ['id'], optional: ['var'], literal: ['id'] }],
	[
		'b:loop',
		{
			required: ['values', 'var'],
			optional: ['index'],
			literal: ['var', 'index'],
		},
	],
	['b:message', { required: ['name'] }],
	['b:param', { required: ['name', 'value'] }],
	// other attributes too, for now
	['b:section', { required: ['id'], others: 'allow' }],
	['b:skin', { optional: ['version'] }],
	['b:switch', { required: ['var'] }],
	['b:tag', { required: ['name'], others: 'allow' }],
	['b:template-skin', {}],
	[
		'b:widget',
		{
			required: ['id', 'type'],
			optional: ['locked', 'title', 'version', 'visible', 'cond'],
			literal: ['id', 'type'],
		},
	],
	['b:widget-setting', { required: ['name'] }],
	['b:widget-settings', {}],
	['b:with', { required: ['var', 'value'] }],
]);

/** `attributes` with `known` set, once, for `checkAttributes`. */
export function withKnown(attributes: Attributes): Attributes {
	attributes.known = new Set([
		...(attributes.required ?? []),
		...(attributes.optional ?? []),
	]);
	return attributes;
}

for (const attributes of ELEMENTS.values()) {
	withKnown(attributes);
}

/** `name` without `expr:`. */
function baseOf(name: string): string {
	return name.startsWith('expr:') ? name.slice('expr:'.length) : name;
}

/** The widget types Blogger has, for `<b:widget type>`. */
const WIDGET_TYPES = [
	'AdSense',
	'Attribution',
	'Blog',
	'BlogArchive',
	'BloggerButton',
	'BlogList',
	'BlogSearch',
	'ContactForm',
	'FeaturedPost',
	'Feed',
	'Followers',
	'Header',
	'HTML',
	'Image',
	'Label',
	'LinkList',
	'PageList',
	'PopularPosts',
	'Profile',
	'ReportAbuse',
	'Stats',
	'Subscribe',
	'Text',
	'TextList',
	'Translate',
	'Wikipedia',
];

/** Reports an error or a warning at an offset in the document, placed only when reported. */
export interface Report {
	error(message: string, offset: number): void;
	warn(message: string, offset: number): void;
}

/** Reports unless the `type` of a widget is one Blogger has, and its `id` is the type and a number, `HTML1`. */
function checkWidget(
	attributes: readonly ScannedAttribute[],
	report: Report,
): void {
	const type = attributes.find((attribute) => attribute.name === 'type');
	if (type === undefined) {
		return;
	}
	if (!WIDGET_TYPES.includes(type.value)) {
		report.error(
			`Unknown widget type '${type.value}'${didYouMean(type.value, WIDGET_TYPES)}`,
			type.offset,
		);
		return;
	}
	const id = attributes.find((attribute) => attribute.name === 'id');
	if (
		id !== undefined &&
		!(
			id.value.startsWith(type.value) &&
			/^\d+$/.test(id.value.slice(type.value.length))
		)
	) {
		report.error(
			`The attribute 'id' of <b:widget> has to be '${type.value}' and a number, '${type.value}1', got: '${id.value}'`,
			id.offset,
		);
	}
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

interface RootAttribute {
	/** What the value can be, for errors: `'true' or 'false'`. */
	accepts?: string;
	test(value: string): boolean;
}

const anything: RootAttribute = { test: () => true };

/** One of `values`, `'true' or 'false'` for booleans. */
function oneOf(values: readonly string[]): RootAttribute {
	return {
		accepts: listOf(values, 'or'),
		test: (value) => values.includes(value),
	};
}

/** The `b:` attributes of the root element, and the values Blogger accepts in them. */
const ROOT_ATTRIBUTES = new Map<string, RootAttribute>([
	['b:css', oneOf(['true', 'false'])],
	['b:defaultwidgetversion', oneOf(['1', '2'])],
	['b:js', oneOf(['true', 'false'])],
	['b:layoutsVersion', oneOf(['2', '3'])],
	['b:responsive', oneOf(['true', 'false'])],
	// anything, for now
	['b:templateUrl', anything],
	['b:templateVersion', anything],
]);

/** Reports the `b:` attributes of the root element Blogger does not accept. */
function checkRootAttributes(
	attributes: readonly ScannedAttribute[],
	report: Report,
): void {
	for (const attribute of attributes) {
		if (!attribute.name.startsWith('b:')) {
			continue;
		}
		const accepted = ROOT_ATTRIBUTES.get(attribute.name);
		if (accepted === undefined) {
			report.error(
				`<html> can not have the attribute '${attribute.name}', only ${listOf([...ROOT_ATTRIBUTES.keys()])}`,
				attribute.offset,
			);
		} else if (!accepted.test(attribute.value)) {
			report.error(
				`The attribute '${attribute.name}' of <html> has to be ${accepted.accepts}, got: '${attribute.value}'`,
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
		if (others === 'allow' || known.has(baseOf(attribute.name))) {
			continue;
		}
		if (others === 'error') {
			report.error(
				known.size === 0
					? `<${name}> can not have attributes, found '${attribute.name}'`
					: `<${name}> can not have the attribute '${attribute.name}', only ${listOf([...known])}`,
				attribute.offset,
			);
		} else {
			report.warn(
				known.size === 0
					? `<${name}> has the attribute '${attribute.name}', Blogger reads no attribute on it`
					: `<${name}> has the attribute '${attribute.name}', Blogger only reads ${listOf([...known])}`,
				attribute.offset,
			);
		}
	}

	for (const key of required) {
		if (
			names.has(key) ||
			(!literal.includes(key) && names.has(`expr:${key}`))
		) {
			continue;
		}
		report.error(
			`<${name}> has to have the attribute '${key}'${names.has(`expr:${key}`) ? `, 'expr:${key}' is not used` : ''}`,
			start,
		);
	}
}

export interface LayoutCheck {
	onStartTag(tag: ScannedStartTag): void;
	onEndTag(element: OpenElement, contentEnd?: number): void;
	onText(offset: number, parent: OpenElement | undefined): void;
	/** Once the whole document is scanned. */
	finish(): void;
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
					`Blogger ignores '${attribute.name}' on <${name}>, '${base}' can not be an expression`,
					attribute.offset,
				);
			} else if (base === attribute.name && names.has(`expr:${base}`)) {
				warn(
					`<${name}> has both '${base}' and 'expr:${base}', Blogger uses '${base}'`,
					attribute.offset,
				);
			}
		} else if (base === attribute.name && names.has(`expr:${base}`)) {
			warn(
				`<${name}> has both '${attribute.name}' and 'expr:${attribute.name}', Blogger uses 'expr:${attribute.name}'`,
				attribute.offset,
			);
		}
	}
}

/**
 * Checks the layout elements of a theme as Blogger does when saving it:
 * widgets are in sections, settings and includables in widgets. Every error
 * is reported, the scan goes on.
 */
export function createLayoutCheck(report: Report): LayoutCheck {
	/** The `<b:widget-settings>` of every widget open, by the offset of its start tag. */
	const settings = new Map<number, number>();
	/** The `<b:if>`s open that have their `<b:else>`, by the offset of their start tag. */
	const withElse = new Set<number>();
	/** The `<b:switch>`es open that have their `<b:default>`, by the offset of their start tag. */
	const withDefault = new Set<number>();
	/** The elements text is reported in, once each, by the offset of their start tag. */
	const withText = new Set<number>();
	/** The skins of the theme, `<b:skin>` and `<b:template-skin>`, by name. */
	const skinCount = new Map<string, number>();
	/** The offset of the start tag of the root element, when it is `<html>`. */
	let root: number | undefined;

	const describe = (name: string): string | undefined =>
		CHILDREN.get(name)
			?.map((child) => `<${child}>`)
			.join(' and ');

	return {
		onStartTag({ name, start, parent, attributes }) {
			if (parent === undefined) {
				if (name !== 'html') {
					report.error(
						`The root element has to be <html>, found <${name}>`,
						start,
					);
				}
				checkRootAttributes(attributes, report);
				root = name === 'html' ? start : undefined;
			}

			if (name.startsWith('b:')) {
				const accepted = ELEMENTS.get(name);
				if (accepted === undefined) {
					const match = suggest(name, ELEMENTS.keys());
					report.error(
						`Unknown element <${name}>${match ? `, did you mean <${match}>?` : ''}`,
						start,
					);
				} else {
					checkAttributes(name, accepted, attributes, report, start);
					if (name === 'b:widget') {
						checkWidget(attributes, report);
					}
				}
			}

			// one error for an element in the wrong place, of the element or of its parent
			const parents = PARENTS.get(name);
			const allowed = parent && CHILDREN.get(parent.name);
			if (parents !== undefined && !parents.includes(parent?.name ?? '')) {
				report.error(
					`<${name}> can only be in ${parents.map((element) => `a <${element}>`).join(' or ')}, it is ${parent ? `in <${parent.name}>` : 'at the top'}`,
					start,
				);
			} else if (parent && allowed && !allowed.includes(name)) {
				report.error(
					`<${parent.name}> can only have ${describe(parent.name)} in it, found <${name}>`,
					start,
				);
			}

			if (name === 'b:widget') {
				settings.set(start, 0);
			}
			if (name === 'b:widget-settings' && parent?.name === 'b:widget') {
				const count = (settings.get(parent.start) ?? 0) + 1;
				settings.set(parent.start, count);
				if (count > 1) {
					report.error(
						'<b:widget> can only have one <b:widget-settings>',
						start,
					);
				}
			}

			// `<b:else>` comes last in its `<b:if>`, once
			if (
				(name === 'b:else' || name === 'b:elseif') &&
				parent?.name === 'b:if'
			) {
				if (withElse.has(parent.start)) {
					report.error(
						name === 'b:else'
							? '<b:if> can only have one <b:else>'
							: '<b:elseif> can not come after the <b:else> of its <b:if>',
						start,
					);
				} else if (name === 'b:else') {
					withElse.add(parent.start);
				}
			}

			// `<b:default>` comes last in its `<b:switch>`, once
			if (
				(name === 'b:default' || name === 'b:case') &&
				parent?.name === 'b:switch'
			) {
				if (withDefault.has(parent.start)) {
					report.error(
						name === 'b:default'
							? '<b:switch> can only have one <b:default>'
							: '<b:case> can not come after the <b:default> of its <b:switch>',
						start,
					);
				} else if (name === 'b:default') {
					withDefault.add(parent.start);
				}
			}

			if (SKINS.has(name)) {
				const count = (skinCount.get(name) ?? 0) + 1;
				skinCount.set(name, count);
				if (count > 1) {
					report.error(`There can only be one <${name}>`, start);
				}
			}

			warnOverridden(
				name,
				attributes,
				ELEMENTS.get(name)?.literal ?? [],
				report,
			);
		},

		onEndTag({ name, start, contentStart }, contentEnd) {
			if (name === 'b:widget') {
				settings.delete(start);
			}
			if (name === 'b:if') {
				withElse.delete(start);
			}
			if (name === 'b:switch') {
				withDefault.delete(start);
			}

			// nothing between the tags, as the formatter self-closes it
			const level = EMPTY.get(name);
			if (
				level !== undefined &&
				contentEnd !== undefined &&
				contentEnd !== contentStart
			) {
				report[level](
					`<${name}> ${level === 'error' ? 'has to' : 'should'} be empty, as <${name}/>`,
					start,
				);
			}
		},

		onText(offset, parent) {
			if (parent && CHILDREN.has(parent.name) && !withText.has(parent.start)) {
				withText.add(parent.start);
				report.error(
					`<${parent.name}> can only have ${describe(parent.name)} in it, found text`,
					offset,
				);
			}
		},

		finish() {
			// a theme, `<html>`, has a skin
			if (root !== undefined && !skinCount.has('b:skin')) {
				report.error('The theme has to have a <b:skin>', root);
			}
		},
	};
}
