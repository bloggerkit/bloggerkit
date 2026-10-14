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
	])('accepts %s', (_, source) => {
		validate(source);
	});

	test.each([
		[
			'an unclosed tag',
			'<div>\n  <p>text\n</div>',
			/index\.hbs:3:1, expected <\/p> to close <p> \(opened at 2:3\), found <\/div>/,
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
	])('rejects %s', (_, source, message) => {
		assert.throws(() => validate(source), message);
	});

	test('names the template in errors', () => {
		assert.throws(
			() =>
				validateTemplateXml(
					Handlebars.parse('<a>') as Program,
					"partial 'p.x'",
				),
			/^Invalid XML in partial 'p\.x':1:1,/,
		);
	});
});
