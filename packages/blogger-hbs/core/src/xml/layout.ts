import { suggest } from '../utils/suggest';
import {
	type OpenElement,
	type Position,
	type ScannedAttribute,
	type ScannedStartTag,
	XmlSyntaxError,
} from './scanner';

/** The only elements Blogger accepts in these, whitespace and comments aside. */
const CHILDREN = new Map([
	['b:section', ['b:widget']],
	['b:widget', ['b:widget-settings', 'b:includable']],
	['b:widget-settings', ['b:widget-setting']],
]);

/** The only element Blogger accepts these in. */
const PARENTS = new Map([
	['b:widget', 'b:section'],
	['b:widget-settings', 'b:widget'],
	['b:widget-setting', 'b:widget-settings'],
]);

interface Attributes {
	required?: string[];
	optional?: string[];
	/** Any other attribute too, as `<b:tag>` renders a tag with them. */
	any?: true;
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
	['b:includable', { required: ['id'], optional: ['var'] }],
	['b:loop', { required: ['values', 'var'], optional: ['index'] }],
	['b:message', { required: ['name'] }],
	['b:param', { required: ['name', 'value'] }],
	// other attributes too, for now
	['b:section', { required: ['id'], any: true }],
	['b:skin', { optional: ['version'] }],
	['b:switch', { required: ['var'] }],
	['b:tag', { required: ['name'], any: true }],
	['b:template-skin', {}],
	[
		'b:widget',
		{
			required: ['id', 'type'],
			optional: ['locked', 'title', 'version', 'visible', 'cond'],
		},
	],
	['b:widget-setting', { required: ['name'] }],
	['b:widget-settings', {}],
	['b:with', { required: ['var', 'value'] }],
]);

/** `'a'`, `'a' and 'b'`, `'a', 'b' and 'c'`, or with `or` */
function listOf(names: readonly string[], last: 'and' | 'or' = 'and'): string {
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

/** Throws unless the `b:` attributes of the root element are those Blogger accepts. */
function checkRootAttributes(attributes: readonly ScannedAttribute[]): void {
	for (const attribute of attributes) {
		if (!attribute.name.startsWith('b:')) {
			continue;
		}
		const accepted = ROOT_ATTRIBUTES.get(attribute.name);
		if (accepted === undefined) {
			throw new XmlSyntaxError(
				`<html> can not have the attribute '${attribute.name}', only ${listOf([...ROOT_ATTRIBUTES.keys()])}`,
				attribute.positionOf(0),
			);
		}
		if (!accepted.test(attribute.value)) {
			throw new XmlSyntaxError(
				`The attribute '${attribute.name}' of <html> has to be ${accepted.accepts}, got: '${attribute.value}'`,
				attribute.positionOf(0),
			);
		}
	}
}

/** Throws unless the attributes are those Blogger accepts on `name`. */
function checkAttributes(
	name: string,
	{ required = [], optional = [], any }: Attributes,
	attributes: readonly ScannedAttribute[],
	fail: (message: string) => never,
): void {
	const known = [...required, ...optional];
	const names = new Set(attributes.map((attribute) => attribute.name));

	for (const attribute of attributes) {
		const base = attribute.name.replace(/^expr:/, '');
		if (!any && !known.includes(base)) {
			throw new XmlSyntaxError(
				known.length === 0
					? `<${name}> can not have attributes, found '${attribute.name}'`
					: `<${name}> can not have the attribute '${attribute.name}', only ${listOf(known)}`,
				attribute.positionOf(0),
			);
		}
	}

	for (const key of required) {
		if (!names.has(key) && !names.has(`expr:${key}`)) {
			fail(`<${name}> has to have the attribute '${key}'`);
		}
	}
}

export interface LayoutCheck {
	onStartTag(tag: ScannedStartTag): void;
	onEndTag(element: OpenElement): void;
	onText(position: Position, parent: OpenElement | undefined): void;
}

/**
 * Checks the layout elements of a theme as Blogger does when saving it:
 * widgets are in sections, settings and includables in widgets.
 */
/**
 * Warns about an attribute written both as `x` and `expr:x`, on any element:
 * Blogger uses `expr:x`, `x` never reaches the page.
 */
function warnOverridden(
	name: string,
	attributes: readonly ScannedAttribute[],
	warn: (message: string, position: Position) => void,
): void {
	const names = new Set(attributes.map((attribute) => attribute.name));
	for (const attribute of attributes) {
		if (
			!attribute.name.startsWith('expr:') &&
			names.has(`expr:${attribute.name}`)
		) {
			warn(
				`<${name}> has both '${attribute.name}' and 'expr:${attribute.name}', Blogger uses 'expr:${attribute.name}'`,
				attribute.positionOf(0),
			);
		}
	}
}

export function createLayoutCheck(
	locate: (offset: number) => Position,
	warn: (message: string, position: Position) => void,
): LayoutCheck {
	/** The `<b:widget-settings>` of every widget open, by the offset of its start tag. */
	const settings = new Map<number, number>();

	const describe = (name: string): string | undefined =>
		CHILDREN.get(name)
			?.map((child) => `<${child}>`)
			.join(' and ');

	return {
		onStartTag({ name, start, parent, attributes }) {
			warnOverridden(name, attributes, warn);

			const fail = (message: string): never => {
				throw new XmlSyntaxError(message, locate(start));
			};

			if (parent === undefined && name !== 'html') {
				fail(`The root element has to be <html>, found <${name}>`);
			}
			if (parent === undefined) {
				checkRootAttributes(attributes);
			}

			if (name.startsWith('b:')) {
				const accepted = ELEMENTS.get(name);
				if (accepted === undefined) {
					const match = suggest(name, ELEMENTS.keys());
					fail(
						`Unknown element <${name}>${match ? `, did you mean <${match}>?` : ''}`,
					);
				} else {
					checkAttributes(name, accepted, attributes, fail);
				}
			}

			const required = PARENTS.get(name);
			if (required !== undefined && parent?.name !== required) {
				fail(
					`<${name}> can only be in a <${required}>, it is ${parent ? `in <${parent.name}>` : 'at the top'}`,
				);
			}
			const allowed = parent && CHILDREN.get(parent.name);
			if (parent && allowed && !allowed.includes(name)) {
				fail(
					`<${parent.name}> can only have ${describe(parent.name)} in it, found <${name}>`,
				);
			}

			if (name === 'b:widget') {
				settings.set(start, 0);
			}
			if (name === 'b:widget-settings' && parent?.name === 'b:widget') {
				const count = (settings.get(parent.start) ?? 0) + 1;
				settings.set(parent.start, count);
				if (count > 1) {
					fail('<b:widget> can only have one <b:widget-settings>');
				}
			}
		},

		onEndTag({ name, start }) {
			if (name === 'b:widget') {
				settings.delete(start);
			}
		},

		onText(position, parent) {
			if (parent && CHILDREN.has(parent.name)) {
				throw new XmlSyntaxError(
					`<${parent.name}> can only have ${describe(parent.name)} in it, found text`,
					position,
				);
			}
		},
	};
}
