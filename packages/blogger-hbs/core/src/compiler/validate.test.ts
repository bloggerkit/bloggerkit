import Handlebars from 'handlebars';
import { assert, describe, test } from 'vitest';
import type { Program } from './ast';
import { validateTemplateXml } from './validate';

function validate(source: string): void {
	validateTemplateXml(Handlebars.parse(source) as Program, 'index.hbs');
}

describe('validateTemplateXml', () => {
	test.each([
		[
			'expressions in text and attribute values',
			`<div class='a {{cls}}' id='{{id}}'>{{text}}</div>`,
		],
		[
			'a block between attributes',
			`<div {{#if hidden}}hidden='hidden'{{/if}} class='x'/>`,
		],
		['part of an attribute name', `<div data-{{name}}='1'/>`],
		[
			'branches of if opening the same tag',
			`{{#if a}}<div class='a'>{{else}}<div>{{/if}}<p/></div>`,
		],
		['an unless with balanced content', '{{#unless a}}<p/>{{/unless}}'],
		['else if chains', '{{#if a}}<a>{{else if b}}<a>{{else}}<a>{{/if}}</a>'],
		[
			'each with balanced content',
			'<ul>{{#each items}}<li>{{this}}</li>{{/each}}</ul>',
		],
		[
			'comments, CDATA, processing instructions and the doctype',
			`<?xml version="1.0"?>\n<!DOCTYPE html>\n<!-- c -->\n<b:skin><![CDATA[ a < b && c ]]></b:skin>`,
		],
		['entities', `<p title='a &amp; b'>&lt; &#160; &#x27;</p>`],
		['inline partials', `{{#*inline "x"}}<i>{{y}}</i>{{/inline}}{{> x}}`],
		['partial blocks', '{{#> layout}}<main/>{{/layout}}'],
		['import blocks', `{{#import "./layout.hbs"}}<main/>{{/import}}`],
		[
			'standalone blocks inside a tag',
			`<div\n  {{#if a}}\n  hidden='hidden'\n  {{/if}}\n  class='x'>\n</div>`,
		],
		['handlebars comments', '<p>{{!-- <unclosed --}}</p>'],
		['a fragment with several roots and text', 'text <a/> <b/> more'],
		[
			'valid Blogger expressions',
			`<b:if cond='data:a &amp;&amp; data:b'><a expr:href='data:url path "x"'/></b:if>`,
		],
		['a range in b:loop values', `<b:loop values='1..20' var='i'/>`],
		[
			'b:include data, as an expression or a bare name',
			`<b:include data='data:post' name='a'/><b:include data='post' name='b'/>`,
		],
		[
			'Blogger expressions with Handlebars in them',
			`<b:if cond='data:{{name}} and'/><a expr:href='{{#if a}}data:a{{/if}} +'/>`,
		],
		[
			'a Blogger expression attribute with a dynamic name',
			`<a expr:{{n}}='+'/>`,
		],
		[
			'a Blogger expression split by a Handlebars comment',
			`<b:if cond='data:a {{! c }}and data:b'/>`,
		],
	])('accepts %s', (_, source) => {
		validate(source);
	});

	test.each([
		[
			'an unclosed tag',
			'<div>\n  <p>text\n</div>',
			/^Invalid XML: expected <\/p> to close <p> \(opened at 2:3\), found <\/div> \(index\.hbs:3:1\)$/,
		],
		[
			'a tag left open at the end',
			'<div>',
			/<div> \(opened at 1:1\) is not closed/,
		],
		[
			'an unquoted expression value',
			'<div class={{cls}}/>',
			/'\{\{cls\}\}' is the value of the attribute 'class', which has to be quoted/,
		],
		[
			'an expression as a tag name',
			'<{{tag}}/>',
			/can not be \(part of\) the name of a tag/,
		],
		[
			'an if opening a tag without an else',
			'{{#if a}}<div>{{/if}}</div>',
			/'\{\{#if\}\}' block opens <div>.*add an '\{\{else\}\}'/,
		],
		[
			'branches opening different tags',
			'{{#if a}}<div>{{else}}<span>{{/if}}',
			/its '\{\{else\}\}' content has to do the same/,
		],
		[
			'each opening a tag',
			'{{#each items}}<li>{{/each}}',
			/'\{\{#each\}\}' block has to keep the XML as it is, but it opens <li>/,
		],
		[
			'a block closing an outer tag',
			'<ul>{{#each items}}</ul>{{/each}}',
			/'\{\{#each\}\}' block has to keep the XML as it is, but it closes <ul>/,
		],
		['an undefined entity', '<p>a&nbsp;b</p>', /undefined entity '&nbsp;'/],
		['a bare ampersand', '<p>a & b</p>', /'&' has to be escaped/],
		['< in an attribute', `<p title='a < b'/>`, /'<' is not allowed/],
		[
			'a duplicate attribute',
			`<p class='a' class='b'/>`,
			/duplicate attribute 'class'/,
		],
		['an attribute without a value', '<input disabled/>', /has no value/],
		[
			'missing whitespace between attributes',
			`<p a='1'b='2'/>`,
			/missing whitespace between the attributes/,
		],
		[
			'-- in a comment',
			'<!-- a -- b -->',
			/'--' is not allowed inside a comment/,
		],
		[
			'an unbalanced inline partial',
			`{{#*inline "x"}}<i>{{/inline}}`,
			/<i> \(opened at 1:17\) is not closed/,
		],
		[
			'an unbalanced import block',
			`{{#import "./layout.hbs"}}<main>{{/import}}`,
			/<main> .* is not closed/,
		],
		[
			'an invalid Blogger expression',
			`<p>\n  <b:if cond='data:a and'/></p>`,
			/^Invalid XML: invalid expression in the attribute 'cond' of <b:if>: .* \(index\.hbs:2:25\)$/,
		],
		[
			'an invalid Blogger expression after a Handlebars comment',
			`<a expr:href='data:a {{! c }}+'/>`,
			/^Invalid XML: invalid expression in the attribute 'expr:href' of <a>: .* \(index\.hbs:1:31\)$/,
		],
		[
			'an invalid b:include data',
			`<b:include data='data:posts[' name='x'/>`,
			/invalid expression in the attribute 'data' of <b:include>/,
		],
		[
			'an invalid Blogger expression in a block',
			`{{#each items}}<b:eval expr='data:a +'/>{{/each}}`,
			/invalid expression in the attribute 'expr' of <b:eval>/,
		],
	])('rejects %s', (_, source, message) => {
		assert.throws(() => validate(source), message);
	});

	test('names the template in errors', () => {
		assert.throws(
			() => validateTemplateXml(Handlebars.parse('<a>') as Program, 'p.x', 'p'),
			/^Plugin 'p': Invalid XML: <a> \(opened at 1:1\) is not closed \(p\.x:1:1\)$/,
		);
	});
});
