import type { ExpressionContext } from 'blogger-expr';

/** An attribute of a `b:` element, as Blogger reads it. */
export interface AttributeRule {
	/** Whether Blogger refuses the theme, or fails, without it. */
	required?: boolean;
	/** What it holds when it is an expression: `loop-values` takes ranges too. Text otherwise. */
	expression?: ExpressionContext;
	/** Whether Blogger does not read its `expr:` form. */
	literal?: boolean;
}

/** A `b:` element, as Blogger saves and renders it. */
export interface ElementRule {
	attributes: Readonly<Record<string, AttributeRule>>;
	/**
	 * What another attribute is: `'warn'`, by default, as Blogger keeps it but
	 * does not read it, `'removed'`, as Blogger removes it when saving,
	 * `'unrendered'`, as Blogger keeps it but does not render it, or
	 * `'allow'`, as `<b:tag>` renders a tag with them.
	 */
	others?: 'allow' | 'warn' | 'removed' | 'unrendered';
	/**
	 * The only elements Blogger accepts in it, but whitespace, and what it
	 * does with anything else: `'error'`, it refuses the theme or fails when
	 * rendering, `'removed'`, it removes it when saving, `'unread'`, it keeps
	 * it but does not render it.
	 */
	children?: { elements: string[]; others: 'error' | 'removed' | 'unread' };
	/** The only elements Blogger reads it in, and what it does with it elsewhere. */
	parents?: { elements: string[]; otherwise: 'error' | 'unread' };
	/** Whether Blogger has it empty, `<b:else/>`: what is in it is not rendered, `'unread'`, or fails, `'error'`. */
	empty?: 'error' | 'unread';
	/** Whether it is a branch, its content after it, `<b:else/>else`. */
	branch?: boolean;
	/** Whether Blogger writes each of its children on a line, indented, and its end tag on its own line. */
	indented?: boolean;
}

const expression: AttributeRule = { expression: 'expression' };
const required: AttributeRule = { required: true };
const requiredExpression: AttributeRule = {
	required: true,
	expression: 'expression',
};

/** The `b:` elements Blogger knows. */
export const ELEMENTS: ReadonlyMap<string, ElementRule> = new Map<
	string,
	ElementRule
>([
	[
		'b:attr',
		{
			attributes: { name: required, value: {}, cond: expression },
			empty: 'unread',
		},
	],
	[
		'b:case',
		{
			attributes: { value: required },
			parents: { elements: ['b:switch'], otherwise: 'error' },
			empty: 'unread',
			branch: true,
		},
	],
	[
		'b:class',
		{
			attributes: { name: required, cond: expression },
			empty: 'unread',
		},
	],
	['b:comment', { attributes: { render: {} } }],
	[
		'b:default',
		{
			attributes: {},
			parents: { elements: ['b:switch'], otherwise: 'error' },
			empty: 'unread',
			branch: true,
		},
	],
	[
		'b:defaultmarkup',
		{
			attributes: { type: required },
			children: { elements: ['b:includable'], others: 'error' },
			parents: { elements: ['b:defaultmarkups'], otherwise: 'error' },
		},
	],
	[
		'b:defaultmarkups',
		{
			attributes: {},
			children: { elements: ['b:defaultmarkup'], others: 'unread' },
		},
	],
	[
		'b:else',
		{
			attributes: {},
			parents: { elements: ['b:if'], otherwise: 'error' },
			empty: 'unread',
			branch: true,
		},
	],
	[
		'b:elseif',
		{
			attributes: { cond: requiredExpression },
			parents: { elements: ['b:if'], otherwise: 'error' },
			empty: 'unread',
			branch: true,
		},
	],
	[
		'b:eval',
		{
			attributes: { expr: { ...requiredExpression, literal: true } },
			empty: 'unread',
		},
	],
	['b:if', { attributes: { cond: requiredExpression } }],
	[
		'b:include',
		{
			attributes: { name: required, data: expression, cond: expression },
			empty: 'error',
		},
	],
	[
		'b:includable',
		{
			attributes: { id: { required: true, literal: true }, var: {} },
			parents: {
				elements: ['b:defaultmarkup', 'b:widget'],
				otherwise: 'error',
			},
		},
	],
	[
		'b:loop',
		{
			attributes: {
				values: { required: true, expression: 'loop-values' },
				var: required,
				index: {},
				reverse: expression,
			},
		},
	],
	[
		'b:message',
		{
			attributes: { name: required },
			children: { elements: ['b:param'], others: 'error' },
		},
	],
	[
		'b:param',
		{
			attributes: { value: required, name: {} },
			parents: { elements: ['b:message'], otherwise: 'error' },
			empty: 'unread',
		},
	],
	[
		'b:section',
		{
			attributes: {
				id: { required: true, literal: true },
				// read by the Layout editor or rendered
				class: {},
				cond: expression,
				growth: {},
				maxwidgets: {},
				name: {},
				preferred: {},
				showaddelement: {},
				tag: {},
			},
			others: 'unrendered',
			children: { elements: ['b:widget'], others: 'removed' },
			indented: true,
		},
	],
	['b:skin', { attributes: { version: {} } }],
	[
		'b:switch',
		{ attributes: { var: { ...requiredExpression, literal: true } } },
	],
	[
		'b:tag',
		{ attributes: { name: required, cond: expression }, others: 'allow' },
	],
	[
		'b:template-script',
		{ attributes: { name: required, async: {}, inline: {}, version: {} } },
	],
	['b:template-skin', { attributes: {} }],
	[
		'b:widget',
		{
			attributes: {
				id: { required: true, literal: true },
				type: { required: true, literal: true },
				cond: expression,
				locked: {},
				mobile: {},
				title: {},
				version: {},
				visible: {},
			},
			others: 'removed',
			children: {
				elements: ['b:widget-settings', 'b:includable'],
				others: 'error',
			},
			parents: { elements: ['b:section'], otherwise: 'error' },
			indented: true,
		},
	],
	[
		'b:widget-setting',
		{
			attributes: { name: required },
			parents: { elements: ['b:widget-settings'], otherwise: 'unread' },
		},
	],
	[
		'b:widget-settings',
		{
			attributes: {},
			children: { elements: ['b:widget-setting'], others: 'removed' },
			parents: { elements: ['b:widget'], otherwise: 'error' },
			indented: true,
		},
	],
	['b:with', { attributes: { var: required, value: requiredExpression } }],
]);

/** What Blogger reads `name` of `<tag>` as: an expression, of which context, or text. */
export function expressionContext(
	tag: string,
	name: string,
): ExpressionContext | undefined {
	return name.startsWith('expr:')
		? 'expression'
		: ELEMENTS.get(tag)?.attributes[name]?.expression;
}

/**
 * A bare name or path of `b:include data`, read as `data:` it, not an
 * expression. Blogger fails on `_post` and `post.title-x`.
 */
export const DATA_SHORTHAND = /^\s*[A-Za-z]\w*(?:\.[A-Za-z]\w*)*\s*$/;

/** The most `<b:with>`, `<b:loop>` and includes with data Blogger renders one in another. */
export const SCOPE_DEPTH_MAX = 40;

/** The widgets, as Blogger has them. */
export const WIDGETS = {
	/** Its types, for `<b:widget type>` and `<b:defaultmarkup type>`. */
	types: [
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
		'FollowByEmail',
		'Followers',
		'Header',
		'HTML',
		'Image',
		'Label',
		'LinkList',
		'Navbar',
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
	],
	/** The types a blog has one widget of at most. */
	single: new Set([
		'Attribution',
		'FeaturedPost',
		'Header',
		'Profile',
		'ReportAbuse',
		'Stats',
		'Translate',
		'Wikipedia',
	]),
	/** The types Blogger removes from a theme when saving it. */
	removed: new Set(['FollowByEmail']),
	/** The settings Blogger accepts in a widget of these types. */
	settings: new Map([['HTML', ['content']]]),
	/** The attributes Blogger adds to a widget that does not have them, with their value. */
	defaults: [
		['locked', 'false'],
		['title', ''],
		['visible', 'true'],
	] as const,
	/** The longest title Blogger keeps, it empties a longer one. */
	titleLength: 100,
	/** The largest number in the id of a new widget, `HTML1000`. */
	numberMax: 1000,
};

/** The `b:` attributes of the root element Blogger reads, and the values it reads in them. */
export const ROOT_ATTRIBUTES: ReadonlyMap<string, RegExp | undefined> = new Map(
	[
		['b:css', /^(true|false)$/i],
		['b:defaultwidgetversion', /^\d+$/],
		['b:js', /^(true|false)$/i],
		['b:layoutsVersion', /^\d+$/],
		['b:responsive', /^(true|false)$/i],
		['b:templateUrl', undefined],
		['b:templateVersion', undefined],
		['b:version', /^\d+$/],
	],
);

/** The elements Blogger reads as CSS, with only text and CDATA sections in them. */
export const SKINS = new Set(['b:skin', 'b:template-skin']);
