import { assert, describe, test } from 'vitest';
import { decodeEntities } from './characters';
import { parseXml } from './document';
import { XmlError } from './error';
import { DOCTYPE, XML_DECLARATION } from './format';
import { checkAttributes } from './layout';
import { checkXml, formatXml, inspectXml, type XmlDiagnostic } from './process';
import { createLocate, type ScannedAttribute, XmlScanner } from './scanner';

/** Warnings without their codes and severity, which `checkXml` tests. */
const messages = (warnings: readonly XmlDiagnostic[]) =>
	warnings.map(({ message, loc }) => ({ message, loc }));

/** The theme to write, as the CLI writes it: formatted, or checked as it is. Throws an `XmlError`. */
const written = (
	xml: string,
	{ path, format }: { path?: string; format?: boolean } = {},
) => {
	const document = parseXml(xml, { path });
	if (format) {
		const result = formatXml(document);
		if (!result.ok) {
			throw new XmlError(result.errors);
		}
		return {
			xml: result.xml,
			warnings: messages(result.warnings),
			info: inspectXml(document, result),
		};
	}
	const { errors, warnings } = checkXml(document);
	if (errors.length > 0) {
		throw new XmlError(errors);
	}
	return { xml, warnings: messages(warnings), info: inspectXml(document) };
};

const HEAD = `${XML_DECLARATION}\n${DOCTYPE}\n`;
const SKIN = '<b:skin><![CDATA[]]></b:skin>';

const format = (xml: string): string => written(xml, { format: true }).xml;

describe('format', () => {
	test('self-closes the elements with nothing in them, but skins', () => {
		const cases: [string, string][] = [
			[`<html><a></a>${SKIN}</html>`, `<html><a/>${SKIN}</html>`],
			[
				`<html><b:include name='x' data='y'></b:include>${SKIN}</html>`,
				`<html><b:include data='y' name='x'/>${SKIN}</html>`,
			],
			[`<html><a></a >${SKIN}</html>`, `<html><a/>${SKIN}</html>`],
			[`<html><a><b></b></a>${SKIN}</html>`, `<html><a><b/></a>${SKIN}</html>`],
			// an empty skin has an empty CDATA section
			['<html><b:skin></b:skin></html>', `<html>${SKIN}</html>`],
			['<html><b:skin/></html>', `<html>${SKIN}</html>`],
			// a space, a line break or a comment is something
			[`<html><a> </a>${SKIN}</html>`, `<html><a> </a>${SKIN}</html>`],
			[`<html><a>\n</a>${SKIN}</html>`, `<html><a>\n</a>${SKIN}</html>`],
			[
				`<html><a><!-- c --></a>${SKIN}</html>`,
				`<html><a><!-- c --></a>${SKIN}</html>`,
			],
		];
		for (const [input, output] of cases) {
			assert.strictEqual(format(HEAD + input), HEAD + output);
		}
	});

	test('puts start tags on a single line with sorted attributes', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html\n  xmlns='x'\n  b:layoutsVersion='3'\n  expr:lang='data:l'>\n${SKIN}</html>`,
			),
			`${HEAD}<html b:layoutsVersion='3' expr:lang='data:l' xmlns='x'>\n${SKIN}</html>`,
		);
	});

	test('self-closing tags lose the space before />', () => {
		assert.strictEqual(
			format(`${HEAD}<html><a><br /></a>${SKIN}</html>`),
			`${HEAD}<html><a><br/></a>${SKIN}</html>`,
		);
	});

	test('tabs and line breaks in attribute values become spaces', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><a class='x\n    y' title='  two\tspaces&#9;&#10;&#13;'/>${SKIN}</html>`,
			),
			`${HEAD}<html><a class='x     y' title='  two spaces   '/>${SKIN}</html>`,
		);
	});

	test('writes values in single quotes, decoded and escaped as Blogger does', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><a b="x &amp; y &gt; z" a='&#39;&#169;&#xA9;&#160;' c="it's &quot;q&quot;" d='&quot;&lt;'/>${SKIN}</html>`,
			),
			`${HEAD}<html><a a='&apos;©© ' b='x &amp; y &gt; z' c='it&apos;s &quot;q&quot;' d='&quot;&lt;'/>${SKIN}</html>`,
		);
	});

	test('prints expressions on one line, escaped as other values', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><b:if cond='data:a&amp;&amp;(data:b eq "x")\n  || data:c &lt;2'><a expr:href="data:url  path &quot;y&quot;" expr:title='"it&apos;s" + (1 > 0)'/></b:if>${SKIN}</html>`,
			),
			`${HEAD}<html><b:if cond='data:a &amp;&amp; (data:b eq &quot;x&quot;) || data:c &lt; 2'><a expr:href='data:url path &quot;y&quot;' expr:title='&quot;it&apos;s&quot; + (1 &gt; 0)'/></b:if>${SKIN}</html>`,
		);
	});

	test('prints an expression once, as printed again it is the same', () => {
		const once = format(
			`${HEAD}<html><b:if cond='[1,2] any (x=&gt;x&gt;1)'/><a expr:class='data:a  ?:  &quot;b&quot;'/>${SKIN}</html>`,
		);
		assert.include(once, "<b:if cond='[1, 2] any (x =&gt; x &gt; 1)'/>");
		assert.include(once, "<a expr:class='data:a ?: &quot;b&quot;'/>");
		assert.strictEqual(format(once), once);
	});

	test('writes what it does not parse as it is', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><b:include data='post.labels' name='y'/><a href='a  b'/>${SKIN}</html>`,
			).split('\n')[2],
			`<html><b:include data='post.labels' name='y'/><a href='a  b'/>${SKIN}</html>`,
		);
	});

	test('prints ranges in b:loop values and b:include data, but the data shorthand', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><b:loop values='1..20' var='i'/><b:include data='data:posts  filter (p =&gt; p.id)' name='x'/><b:include data='post.labels' name='y'/>${SKIN}</html>`,
			).split('\n')[2],
			`<html><b:loop values='1..20' var='i'/><b:include data='data:posts filter (p =&gt; p.id)' name='x'/><b:include data='post.labels' name='y'/>${SKIN}</html>`,
		);
	});

	test('leaves text, comments, CDATA and end tags as they are', () => {
		const body = `<html>
  text   stays
  <!-- <b   z='1' a='2'> -->
  <script>/*<![CDATA[*/ if (a < b) {} /*]]>*/</script>
  ${SKIN}
</html   >`;
		assert.strictEqual(format(HEAD + body), HEAD + body);
	});

	test('writes entities in text as Blogger does', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><p>&apos; &#xA9; &#169; &amp; &lt; &gt; &quot;</p>${SKIN}</html>`,
			),
			`${HEAD}<html><p>&#39; &#169; &#169; &amp; &lt; &gt; &quot;</p>${SKIN}</html>`,
		);
	});

	test('removes processing instructions', () => {
		assert.strictEqual(
			format(`${HEAD}<html><p><?a b?>x</p>${SKIN}</html>`),
			`${HEAD}<html><p>x</p>${SKIN}</html>`,
		);
	});

	test('adds the XML declaration, not the doctype', () => {
		assert.strictEqual(
			format(`<html>${SKIN}</html>`),
			`${XML_DECLARATION}\n<html>${SKIN}</html>`,
		);
		assert.strictEqual(
			format(`${DOCTYPE}\n<html>${SKIN}</html>`),
			`${HEAD}<html>${SKIN}</html>`,
		);
		assert.strictEqual(
			format(`${XML_DECLARATION}\n<html>${SKIN}</html>`),
			`${XML_DECLARATION}\n<html>${SKIN}</html>`,
		);
	});

	test('moves the declarations to the first two lines, nothing between the nodes around the root', () => {
		assert.strictEqual(
			format(`${XML_DECLARATION}${DOCTYPE}\n\n<html>${SKIN}</html>`),
			`${HEAD}<html>${SKIN}</html>`,
		);
		assert.strictEqual(
			format(`${DOCTYPE}\n${XML_DECLARATION}\n<html>${SKIN}</html>`),
			`${HEAD}<html>${SKIN}</html>`,
		);
		assert.strictEqual(
			format(
				`${XML_DECLARATION}\n<!-- c -->\n${DOCTYPE}\n<html>${SKIN}</html>\n<!-- d -->`,
			),
			`${HEAD}<!-- c --><html>${SKIN}</html><!-- d -->`,
		);
	});

	test('writes the declarations as Blogger does, with warnings', () => {
		const { xml, warnings } = written(
			`<?xml version='1.1' encoding='ISO-8859-1'?>\n<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN"\n  "x.dtd">\n<html>${SKIN}</html>`,
			{ format: true },
		);
		assert.strictEqual(xml, `${HEAD}<html>${SKIN}</html>`);
		assert.deepEqual(
			warnings.map((warning) => warning.message),
			[
				'Blogger writes the XML declaration with version="1.0", got: \'1.1\'',
				'Blogger themes are UTF-8, Blogger writes the XML declaration with encoding="UTF-8", got: \'ISO-8859-1\'',
				`Blogger writes the doctype as ${DOCTYPE}, got: '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN"\n  "x.dtd">'`,
			],
		);
	});

	test('rejects declarations Blogger does not accept', () => {
		assert.throws(
			() => format(`<?xml encoding="UTF-8"?><html>${SKIN}</html>`),
			/has to have a version/,
		);
		assert.throws(
			() => format(`<!doctype html><html>${SKIN}</html>`),
			/written in capitals/,
		);
		assert.throws(
			() => format(`${DOCTYPE}${DOCTYPE}<html>${SKIN}</html>`),
			/only be one doctype/,
		);
		assert.throws(
			() => format(`<html>${SKIN}</html>${DOCTYPE}`),
			/before the root element/,
		);
	});

	test('indents the children of widgets and widget settings, their end tags on a line', () => {
		const input = `<html>
  <b:section id='s'>
    <b:widget id='Blog1' type='Blog' version='2'><b:widget-settings>
        <b:widget-setting name='a'>1</b:widget-setting>    <b:widget-setting name='b'>
              two
        </b:widget-setting></b:widget-settings>
<b:includable id='main'>
          <div>
                <p>keep</p>
          </div>
        </b:includable></b:widget>
  </b:section>
${SKIN}</html>`;
		const output = `<html>
  <b:section id='s'>
    <b:widget id='Blog1' locked='false' title='' type='Blog' version='2' visible='true'>
      <b:widget-settings>
        <b:widget-setting name='a'>1</b:widget-setting>
        <b:widget-setting name='b'>two</b:widget-setting>
      </b:widget-settings>
      <b:includable id='main'>
          <div>
                <p>keep</p>
          </div>
        </b:includable>
    </b:widget>
  </b:section>
${SKIN}</html>`;
		assert.strictEqual(format(HEAD + input), HEAD + output);
	});

	test('indents the widgets of a section', () => {
		const input = `<html>
  <b:section id='main'><b:widget id='Blog1' type='Blog' version='2'><b:includable id='main'/></b:widget>    <b:widget id='HTML2' type='HTML' version='2'><b:includable id='main'/></b:widget>
  </b:section>
x <b:section id='other'><b:widget id='HTML3' type='HTML'><b:includable id='main'/></b:widget></b:section>
${SKIN}</html>`;
		const output = `<html>
  <b:section id='main'>
    <b:widget id='Blog1' locked='false' title='' type='Blog' version='2' visible='true'>
      <b:includable id='main'/>
    </b:widget>
    <b:widget id='HTML2' locked='false' title='' type='HTML' version='2' visible='true'>
      <b:includable id='main'/>
    </b:widget>
  </b:section>
x <b:section id='other'>
<b:widget id='HTML3' locked='false' title='' type='HTML' visible='true'>
  <b:includable id='main'/>
</b:widget>
</b:section>
${SKIN}</html>`;
		assert.strictEqual(format(HEAD + input), HEAD + output);
	});

	test('orders the children of a widget, settings first, then main, then the others by id', () => {
		const output = format(
			`${HEAD}<html><b:section id='s'><b:widget id='HTML1' type='HTML'><b:includable id='z'>z</b:includable><b:includable id='main'>m</b:includable><b:widget-settings><b:widget-setting name='content'>c</b:widget-setting></b:widget-settings><b:includable id='a'>a</b:includable></b:widget></b:section>${SKIN}</html>`,
		);
		assert.strictEqual(
			output,
			// a section after something on its line has its children at the same indentation
			`${HEAD}<html><b:section id='s'>
<b:widget id='HTML1' locked='false' title='' type='HTML' visible='true'>
  <b:widget-settings>
    <b:widget-setting name='content'>c</b:widget-setting>
  </b:widget-settings>
  <b:includable id='main'>m</b:includable>
  <b:includable id='a'>a</b:includable>
  <b:includable id='z'>z</b:includable>
</b:widget>
</b:section>${SKIN}</html>`,
		);
	});

	test('removes what Blogger removes from sections, widgets and settings', () => {
		const { xml, warnings } = written(
			`${HEAD}<html><b:section id='a'>x<div/><!-- c --></b:section><b:section id='b'><!-- c --><b:widget id='HTML1' type='HTML'><!-- d --><b:widget-settings>t<b:widget-setting name='content'/></b:widget-settings><b:includable id='main'>m</b:includable></b:widget><b:widget id='FollowByEmail1' type='FollowByEmail'/></b:section>${SKIN}</html>`,
			{ format: true },
		);
		assert.strictEqual(
			xml,
			`${HEAD}<html><b:section id='a'/><b:section id='b'>
<b:widget id='HTML1' locked='false' title='' type='HTML' visible='true'>
  <b:includable id='main'>m</b:includable>
</b:widget>
</b:section>${SKIN}</html>`,
		);
		assert.deepEqual(
			warnings.map((warning) => warning.message),
			[
				'Blogger removes what is not <b:widget> from <b:section>, found text',
				'Blogger removes comments in <b:section>',
				'Blogger removes comments in <b:section>',
				'Blogger removes comments in <b:widget>',
				'Blogger removes what is not <b:widget-setting> from <b:widget-settings>, found text',
				"Blogger removes widgets of the type 'FollowByEmail' when saving the theme",
			],
		);
	});

	test('writes a widget as Blogger saves it', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><b:section id='s'><b:widget expr:id='"HTML2"' id='HTML1' locked='TRUE' pageType='item' title='${'t'.repeat(101)}' type='HTML' visible='no'><b:widget-settings><b:widget-setting name='content'>&lt;p&gt;a&lt;/p&gt;</b:widget-setting></b:widget-settings></b:widget></b:section>${SKIN}</html>`,
			).split('\n')[3],
			"<b:widget id='HTML1' locked='true' title='' type='HTML' visible='true'>",
		);
		assert.include(
			format(
				`${HEAD}<html><b:section id='s'><b:widget id='HTML1' type='HTML'><b:widget-settings><b:widget-setting name='content'>&lt;p&gt;a&lt;/p&gt;</b:widget-setting></b:widget-settings></b:widget></b:section>${SKIN}</html>`,
			),
			"<b:widget-setting name='content'><![CDATA[<p>a</p>]]></b:widget-setting>",
		);
	});
});

describe('Blogger layout', () => {
	test('warns about a root element other than <html>, Blogger keeps it', () => {
		const { warnings } = written(`${HEAD}<div>${SKIN}</div>`);
		assert.deepEqual(warnings, [
			{
				message:
					'The root element of a theme is <html>, Blogger keeps <div> as it is',
				loc: { path: '', line: 3, column: 1 },
			},
		]);
	});

	const document = (body: string) => `${HEAD}<html>${body}<b:skin/></html>`;
	const errorOf = (body: string): XmlError => {
		try {
			written(document(body));
		} catch (error) {
			return error as XmlError;
		}
		assert.fail(`expected an error for ${body}`);
	};

	test('accepts the b: attributes Blogger knows on the root element', () => {
		written(`${HEAD}<html
  xmlns='http://www.w3.org/1999/xhtml'
  xmlns:b='http://www.google.com/2005/gml/b'
  xmlns:data='http://www.google.com/2005/gml/data'
  xmlns:expr='http://www.google.com/2005/gml/expr'
  b:defaultwidgetversion='2'
  b:layoutsVersion='3'
  b:css='false'
  b:js='false'
  b:responsive='true'
  b:templateUrl='fine-ui.xml'
  b:templateVersion='0.0.0'
><b:skin/></html>`);
	});

	test.each([
		[
			"b:foo='2'",
			"<html> has the attribute 'b:foo', Blogger only reads 'b:css', 'b:defaultwidgetversion', 'b:js', 'b:layoutsVersion', 'b:responsive', 'b:templateUrl', 'b:templateVersion' and 'b:version'",
			14,
		],
		[
			"b:css='yes'",
			"The attribute 'b:css' of <html> has to be 'true' or 'false', got: 'yes'",
			14,
		],
		[
			"b:layoutsVersion='x'",
			"The attribute 'b:layoutsVersion' of <html> has to be a number, got: 'x'",
			25,
		],
	])(
		'warns about <html %s/>, Blogger saves it',
		(attribute, message, column) => {
			const { warnings } = written(`${HEAD}<html ${attribute}>${SKIN}</html>`);
			assert.deepEqual(warnings, [
				{ message, loc: { path: '', line: 3, column } },
			]);
		},
	);

	test.each([
		"b:css='True'",
		"b:responsive='false'",
		"b:defaultwidgetversion='3'",
		"b:layoutsVersion='4'",
		"b:version='2'",
	])('accepts <html %s/>', (attribute) => {
		const { warnings } = written(`${HEAD}<html ${attribute}>${SKIN}</html>`);
		assert.deepEqual(warnings, []);
	});

	test('accepts sections, widgets, settings and includables', () => {
		written(
			document(`
  <b:section id='main'>
    <b:widget id='HTML1' type='HTML'>
      <b:widget-settings>
        <b:widget-setting name='content'/>
      </b:widget-settings>
      <b:includable id='main'/>
      <b:includable id='other'/>
    </b:widget>
    <b:widget id='HTML2' type='HTML'/>
    <b:widget id='HTML3' type='HTML'><b:widget-settings/></b:widget>
    <!-- a comment -->
  </b:section>
  <b:section id='empty'/>
`),
		);
	});

	test('accepts every element Blogger knows, with expr: forms', () => {
		written(
			`${HEAD}<html b:layoutsVersion='3'>
  <head>
    <b:skin version='1.0.0'><![CDATA[]]></b:skin>
    <b:template-skin><![CDATA[]]></b:template-skin>
  </head>
  <b:section aria-label='Main' class='main' hidden='hidden' id='main' maxwidgets='1' showaddelement='false'>
    <b:widget cond='data:view.isHomepage' id='HTML1' locked='false' title='T' type='HTML' version='2' visible='true'>
      <b:widget-settings>
        <b:widget-setting name='content'/>
      </b:widget-settings>
      <b:includable id='main' var='this'>
        <b:if cond='data:view.isPost'>
          <b:elseif cond='data:view.isPage'/>
          <b:else/>
        </b:if>
        <b:switch var='data:view.type'>
          <b:case value='"item"'/>
          <b:default/>
        </b:switch>
        <b:loop index='i' values='data:posts' var='post'/>
        <b:with value='data:blog.title' var='title'/>
        <b:with expr:value='data:blog.title' var='other'/>
        <b:eval expr='data:blog.title'/>
        <b:include cond='true' data='post' name='postMeta'/>
        <b:tag class='a' expr:name='data:tag' id='t'/>
        <p>
          <b:attr name='class' value='a'/>
          <b:attr cond='true' expr:value='data:blog.title' name='title'/>
          <b:class name='b'/>
          <b:class expr:name='data:view.type'/>
        </p>
        <b:comment>a comment</b:comment>
        <b:message name='messages.x'>
          <b:param expr:value='data:blog.title' name='p'/>
        </b:message>
      </b:includable>
    </b:widget>
  </b:section>
  <b:defaultmarkups>
    <b:defaultmarkup type='Common'>
      <b:includable id='common'/>
    </b:defaultmarkup>
  </b:defaultmarkups>
</html>`,
		);
	});

	test('warns about x and expr:x on an element, Blogger uses expr:x', () => {
		const xml = document(
			"<a expr:href='data:blog.url' href='#'/><b:class expr:name='data:a' name='b'/><img src='a.png'/>",
		);

		const { warnings } = written(xml, { path: 'theme.xml' });
		assert.deepEqual(warnings, [
			{
				message:
					"<a> has both 'href' and 'expr:href', Blogger uses 'expr:href'",
				loc: { path: 'theme.xml', line: 3, column: 42 },
			},
			{
				message:
					"<b:class> has both 'name' and 'expr:name', Blogger uses 'expr:name'",
				loc: { path: 'theme.xml', line: 3, column: 80 },
			},
		]);

		// formatting keeps both, and warns the same
		const formatted = written(xml, { format: true });
		assert.include(formatted.xml, "<a expr:href='data:blog.url' href='#'/>");
		assert.lengthOf(formatted.warnings, 2);
	});

	test('warns about expr:x of an attribute Blogger reads when saving, it uses x', () => {
		const { warnings } = written(
			document(
				`<b:section id='s'><b:widget expr:type='""' id='Blog1' type='Blog'/></b:section>
  <b:section id='u'><b:widget id='HTML2' type='HTML'><b:includable expr:id='data:i' id='x'/></b:widget></b:section>
  <b:section id='t'><b:widget expr:id='data:x' id='HTML1' type='HTML'/></b:section>`,
			),
		);
		assert.deepEqual(
			warnings.map(({ message, loc }) => [message, loc.line, loc.column]),
			[
				[
					"Blogger removes the attribute 'expr:type' of <b:widget>, its attributes can not be expressions",
					3,
					46,
				],
				[
					"<b:includable> has both 'id' and 'expr:id', Blogger uses 'id'",
					4,
					89,
				],
				[
					"Blogger removes the attribute 'expr:id' of <b:widget>, its attributes can not be expressions",
					5,
					40,
				],
			],
		);
	});

	test('warns about the formatted output, where the places are in what is written', () => {
		const { xml, warnings } = written(
			`<html><a\n  href='#'\n  expr:href='data:a'/>${SKIN}</html>`,
			{ format: true },
		);
		assert.strictEqual(
			xml,
			`${XML_DECLARATION}\n<html><a expr:href='data:a' href='#'/>${SKIN}</html>`,
		);
		assert.deepEqual(warnings[0].loc, { path: '', line: 2, column: 35 });
	});

	test.each([
		[
			"<b:if cond='true' rel='x'/>",
			"<b:if> has the attribute 'rel', Blogger only reads 'cond'",
			[3, 30],
		],
		[
			"<b:loop value='data:a' values='data:a' var='x'/>",
			"<b:loop> has the attribute 'value', Blogger only reads 'values', 'var', 'index' and 'reverse'",
			[3, 22],
		],
		[
			"<b:if cond='true'><b:else cond='x'/></b:if>",
			"<b:else> has the attribute 'cond', Blogger reads no attribute on it",
			[3, 39],
		],
		[
			"<b:section id='s'><b:widget id='HTML1' type='HTML'><b:includable id='main' mode='x'/></b:widget></b:section>",
			"<b:includable> has the attribute 'mode', Blogger only reads 'id' and 'var'",
			[3, 88],
		],
	] as const)(
		'warns about an attribute Blogger does not read: %s',
		(body, message, [line, column]) => {
			const { warnings } = written(document(body));
			assert.deepEqual(warnings, [
				{ message, loc: { path: '', line, column } },
			]);
		},
	);

	test('a missing attribute is still an error, next to the warning', () => {
		const error = errorOf("<b:loop value='data:a' var='x'/>");
		assert.deepEqual(
			error.errors.map(({ message }) => message),
			["<b:loop> has to have the attribute 'values'"],
		);
	});

	test('the attributes of <b:section> and <b:tag> are any', () => {
		const { warnings } = written(
			document(
				"<b:section class='a' id='s' maxwidgets='1'/><b:tag class='b' name='div'/>",
			),
		);
		assert.isEmpty(warnings);
	});

	test('accepts <b:elseif>s before one <b:else>, in each <b:if>', () => {
		written(
			document(
				"<b:if cond='data:a'>a<b:elseif cond='data:b'/>b<b:elseif cond='data:c'/>c<b:else/>d<b:if cond='data:e'>e<b:else/>f</b:if></b:if><b:if cond='data:g'>g<b:else/>h</b:if>",
			),
		);
	});

	test('accepts <b:case>s before one <b:default>, in each <b:switch>', () => {
		written(
			document(
				"<b:switch var='data:a'><b:case value='1'/>a<b:case value='2'/>b<b:default/>c<b:switch var='data:b'><b:case value='3'/>d<b:default/>e</b:switch></b:switch><b:switch var='data:c'><b:default/>f</b:switch>",
			),
		);
	});

	test('accepts the params of a message, and a message without any', () => {
		written(
			document(
				"<b:message name='m'>\n  <b:param name='a' value='1'/>\n  <b:param name='b' value='2'/>\n</b:message><b:message name='n'/>",
			),
		);
	});

	test('accepts the elements Blogger has empty, with nothing between their tags', () => {
		const { warnings } = written(
			document(
				"<b:if cond='true'>a<b:elseif cond='false'></b:elseif>b<b:else></b:else>c</b:if><b:switch var='data:a'><b:case value='1'></b:case>a<b:default></b:default>b</b:switch><b:message name='m'><b:param name='a' value='1'></b:param></b:message><b:include name='x'></b:include><div><b:attr name='a' value='b'></b:attr><b:class name='c'></b:class></div><b:eval expr='1'></b:eval>",
			),
		);
		assert.isEmpty(warnings);
	});

	test('accepts the id of a widget as its type and a number up to 1000, as Java reads it', () => {
		written(
			document(
				"<b:section id='s'><b:widget id='Blog000' type='Blog'/><b:widget id='LinkList010' type='LinkList'/><b:widget id='HTML1000' type='HTML'/><b:widget id='HTML-1' type='HTML'/><b:widget id='HTML+2' type='HTML'/><b:widget id='HTML\u0663' type='HTML'/><b:widget id='HTML\uff14' type='HTML'/></b:section>",
			),
		);
	});

	test('a section and a widget can have the same id', () => {
		written(
			document(
				"<b:section id='HTML1'><b:widget id='HTML1' type='HTML'/></b:section>",
			),
		);
	});

	test('accepts whitespace in them, tabs and blank lines too', () => {
		written(
			document(
				"<b:section id='s'>\n\t\n\t<b:widget id='HTML1' type='HTML'>\r\n\t\t<b:widget-settings>\n\n\t\t\t<b:widget-setting name='content'/>\n\t\t</b:widget-settings>\n\t\t<b:includable id='main'/>\n\t</b:widget>\n\n</b:section>",
			),
		);
	});

	test.each([
		[
			"<div><b:widget id='HTML1' type='HTML'><b:includable id='main'/></b:widget></div>",
			'<b:widget> can only be in a <b:section>, it is in <div>',
			[3, 12],
		],
		[
			"<b:section id='s'><b:widget id='HTML1' type='HTML'><b:widget-settings/><b:widget-settings/><b:includable id='main'/></b:widget></b:section>",
			'<b:widget> can only have one <b:widget-settings>',
			[3, 78],
		],
		[
			"<b:section id='s'><b:widget id='HTML1' type='HTML'><p/><b:includable id='main'/></b:widget></b:section>",
			'<b:widget> can only have <b:widget-settings> and <b:includable> in it, found <p>',
			[3, 58],
		],
		[
			'<b:widget-settings/>',
			'<b:widget-settings> can only be in a <b:widget>, it is in <html>',
			[3, 7],
		],
		[
			"<b:loop var='x'/>",
			"<b:loop> has to have the attribute 'values'",
			[3, 7],
		],
		[
			"<b:section id='s'><b:widget id='A'/></b:section>",
			"<b:widget> has to have the attribute 'type'",
			[3, 25],
		],
		[
			"<b:section id='s'><b:widget id='HTML1' type='HTML'><b:includable var='x'/></b:widget></b:section>",
			"<b:includable> has to have the attribute 'id'",
			[3, 58],
		],
		[
			"<b:section id='s'><b:widget id='A' type='Html'/></b:section>",
			"Unknown widget type 'Html', did you mean 'HTML'?",
			[3, 48],
		],
		[
			"<b:section id='s'><b:widget id='A' type='Gadget'/></b:section>",
			"Unknown widget type 'Gadget'",
			[3, 48],
		],
		[
			"<b:section id='s'><b:widget expr:type='data:t' id='A'/></b:section>",
			"<b:widget> has to have the attribute 'type', 'expr:type' is not used",
			[3, 25],
		],
		[
			"<b:section id='s'><b:widget id='HTML1' type='HTML'><b:includable expr:id='data:x'/></b:widget></b:section>",
			"<b:includable> has to have the attribute 'id', 'expr:id' is not used",
			[3, 58],
		],
		[
			"<b:defaultmarkups><b:defaultmarkup type='Common'><p/></b:defaultmarkup></b:defaultmarkups>",
			'<b:defaultmarkup> can only have <b:includable> in it, found <p>',
			[3, 56],
		],
		[
			"<b:defaultmarkups><b:defaultmarkup type='Common'>text</b:defaultmarkup></b:defaultmarkups>",
			'<b:defaultmarkup> can only have <b:includable> in it, found text',
			[3, 56],
		],
		[
			"<div><b:includable id='main'/></div>",
			'<b:includable> can only be in a <b:defaultmarkup> or a <b:widget>, it is in <div>',
			[3, 12],
		],
		[
			"<b:includable id='main'/>",
			'<b:includable> can only be in a <b:defaultmarkup> or a <b:widget>, it is in <html>',
			[3, 7],
		],
		[
			"<b:section id=''/>",
			"The attribute 'id' of <b:section> can not be blank",
			[3, 22],
		],
		[
			"<b:section id='  '/>",
			"The attribute 'id' of <b:section> can not be blank",
			[3, 22],
		],
		[
			"<b:section id='main'/><b:section id='main'/>",
			"There can only be one <b:section> with the id 'main'",
			[3, 44],
		],
		[
			"<b:section id='a'><b:widget id='HTML1' type='HTML'/></b:section><b:section id='b'><b:widget id='HTML1' type='HTML'/></b:section>",
			"There can only be one <b:widget> with the id 'HTML1'",
			[3, 103],
		],
		[
			"<b:section expr:id='data:x' id='s'/>",
			"<b:section> can not have 'expr:id': Blogger saves the section with 'id', and every page fails when it is rendered with another one",
			[3, 27],
		],
		[
			"<b:section id=' s'/>",
			"The attribute 'id' of <b:section> can not start or end with spaces, Blogger fails to save it, got: ' s'",
			[3, 22],
		],
		[
			"<b:section id='&#9;'/>",
			"The attribute 'id' of <b:section> can not be blank",
			[3, 22],
		],
		[
			"<b:section id='a b'/><b:section id='a&#9;b'/>",
			"There can only be one <b:section> with the id 'a b'",
			[3, 43],
		],
		[
			"<head><b:section id='s'/></head>",
			'<b:section> can not be in <head>',
			[3, 13],
		],
		[
			"<b:section id='s'><b:widget id='HTML1' type='HTML'><b:includable id='main'><b:section id='t'/></b:includable></b:widget></b:section>",
			"<b:section> can not be in a widget, Blogger fails with 'The tag 'section' is not a known Blogger tag'",
			[3, 82],
		],
		[
			"<b:section id='s'><b:widget id='HTML1' type='HTML'><b:includable id='main'><b:foo/></b:includable></b:widget></b:section>",
			"Unknown element <b:foo>, Blogger fails with 'The tag 'foo' is not a known Blogger tag'",
			[3, 82],
		],
		[
			"<b:section id='s'><b:widget id='HTML1' type='HTML'><b:includable id='main'/><b:includable id='main'/></b:widget></b:section>",
			"There can only be one <b:includable> with the id 'main' in a <b:widget>",
			[3, 101],
		],
		[
			"<b:section id='s'><b:widget id='HTML1' type='HTML'><b:includable id=' '/></b:widget></b:section>",
			"The attribute 'id' of <b:includable> can not be blank",
			[3, 76],
		],
		[
			"<b:section id='s'><b:widget id='HTML1' type='HTML'><b:widget-settings><b:widget-setting name='nope'/></b:widget-settings></b:widget></b:section>",
			"A widget of the type 'HTML' has no setting 'nope', only 'content'",
			[3, 101],
		],
		[
			"<b:section id='s'><b:widget id='Profile1' type='Profile'/><b:widget id='Profile2' type='Profile'/></b:section>",
			"A blog can only have one widget of the type 'Profile'",
			[3, 95],
		],
		[
			"<b:defaultmarkups><b:defaultmarkup type='common'/></b:defaultmarkups>",
			"Unknown widget type 'common' in <b:defaultmarkup>, did you mean 'Common'?",
			[3, 48],
		],
		[
			"<b:section id='s'><b:defaultmarkups/></b:section>",
			'<b:defaultmarkups> can not be in a section or a widget',
			[3, 25],
		],
		[
			"<b:include name='x'>y</b:include>",
			'<b:include> has to be empty, as <b:include/>',
			[3, 7],
		],
		[
			"<b:eval expr:expr='data:x'/>",
			"<b:eval> has to have the attribute 'expr', 'expr:expr' is not used",
			[3, 7],
		],
		[
			"<b:switch expr:var='data:x'/>",
			"<b:switch> has to have the attribute 'var', 'expr:var' is not used",
			[3, 7],
		],
		[
			"<i><b:attr name='a b' value='x'/></i>",
			"The attribute 'name' of <b:attr> has to be the name of an attribute, Blogger fails when rendering it, got: 'a b'",
			[3, 24],
		],
		[
			"<i><b:class name=''/></i>",
			"The attribute 'name' of <b:class> can not be empty, Blogger fails when rendering it",
			[3, 25],
		],
		[
			"<b:tag name='1a'/>",
			"The attribute 'name' of <b:tag> has to be the name of a tag, Blogger fails when rendering it, got: '1a'",
			[3, 20],
		],
		[
			`${"<b:with value='1' var='w'>".repeat(41)}${'</b:with>'.repeat(41)}`,
			'Blogger fails with more than 40 <b:with> and <b:loop> one in another',
			[3, 1047],
		],
		[
			"<div><b:defaultmarkup type='Common'/></div>",
			'<b:defaultmarkup> can only be in a <b:defaultmarkups>, it is in <div>',
			[3, 12],
		],
		[
			"<b:message name='m'><p/></b:message>",
			'<b:message> can only have <b:param> in it, found <p>',
			[3, 27],
		],
		[
			"<b:message name='m'>text</b:message>",
			'<b:message> can only have <b:param> in it, found text',
			[3, 27],
		],
		[
			"<div><b:param name='a' value='1'/></div>",
			'<b:param> can only be in a <b:message>, it is in <div>',
			[3, 12],
		],
		[
			'<div><b:else/></div>',
			'<b:else> can only be in a <b:if>, it is in <div>',
			[3, 12],
		],
		[
			"<b:elseif cond='true'/>",
			'<b:elseif> can only be in a <b:if>, it is in <html>',
			[3, 7],
		],
		[
			"<b:loop values='data:a' var='x'><b:else/></b:loop>",
			'<b:else> can only be in a <b:if>, it is in <b:loop>',
			[3, 39],
		],
		[
			"<div><b:case value='1'/></div>",
			'<b:case> can only be in a <b:switch>, it is in <div>',
			[3, 12],
		],
		[
			'<b:default/>',
			'<b:default> can only be in a <b:switch>, it is in <html>',
			[3, 7],
		],
		[
			"<b:switch var='data:a'><b:default/>a<b:case value='1'/>b</b:switch>",
			'<b:case> can not come after the <b:default> of its <b:switch>',
			[3, 43],
		],
		...['A', 'HTML', 'html1', 'HTML1a', 'Blog1', 'HTML1001', 'HTML_1'].map(
			(id) =>
				[
					`<b:section id='s'><b:widget id='${id}' type='HTML'/></b:section>`,
					`The attribute 'id' of <b:widget> has to be 'HTML' and a number up to 1000, 'HTML1', got: '${id}'`,
					[3, 39],
				] as const,
		),
	] as const)('rejects %s', (body, message, [line, column]) => {
		const error = errorOf(body);
		assert.instanceOf(error, XmlError);
		assert.strictEqual(error.message, `${message} (${line}:${column})`);
		assert.deepEqual(error.loc, { path: '', line, column });
	});

	test.each([
		[
			"<b:section id='s'><div/></b:section>",
			'Blogger removes what is not <b:widget> from <b:section>, found <div>',
			[3, 25],
		],
		[
			"<b:section id='s'>text</b:section>",
			'Blogger removes what is not <b:widget> from <b:section>, found text',
			[3, 25],
		],
		[
			"<b:section id='s'>&#160;</b:section>",
			'Blogger removes what is not <b:widget> from <b:section>, found text',
			[3, 25],
		],
		[
			"<b:section id='s'><![CDATA[x]]></b:section>",
			'Blogger removes what is not <b:widget> from <b:section>, found text',
			[3, 25],
		],
		[
			"<b:section id='s'><!-- c --></b:section>",
			'Blogger removes comments in <b:section>',
			[3, 25],
		],
		[
			"<b:section id='s'><b:widget id='HTML1' type='HTML'><b:widget-settings><b:widget-setting name='content'/>x</b:widget-settings><b:includable id='main'/></b:widget></b:section>",
			'Blogger removes what is not <b:widget-setting> from <b:widget-settings>, found text',
			[3, 111],
		],
		[
			"<b:widget-setting name='a'/>",
			'<b:widget-setting> can only be in a <b:widget-settings>, it is in <html>, Blogger does not read it',
			[3, 7],
		],
		[
			'<b:includeable/>',
			'Unknown element <b:includeable>, Blogger renders nothing for it, did you mean <b:includable>?',
			[3, 7],
		],
		[
			'<b:foo/>',
			'Unknown element <b:foo>, Blogger renders nothing for it',
			[3, 7],
		],
		[
			'<b:defaultmarkups><p/></b:defaultmarkups>',
			'Blogger does not render what is not <b:defaultmarkup> in <b:defaultmarkups>, found <p>',
			[3, 25],
		],
		[
			'<b:defaultmarkups>text</b:defaultmarkups>',
			'Blogger does not render what is not <b:defaultmarkup> in <b:defaultmarkups>, found text',
			[3, 25],
		],
		[
			"<b:defaultmarkups><b:includable id='main'/></b:defaultmarkups>",
			'Blogger does not render what is not <b:defaultmarkup> in <b:defaultmarkups>, found <b:includable>',
			[3, 25],
		],
		[
			"<b:if cond='true'>a<b:else>b</b:else></b:if>",
			'Blogger does not render what is in <b:else>, write it after <b:else/>',
			[3, 26],
		],
		[
			"<b:if cond='true'>a<b:elseif cond='false'><!-- x --></b:elseif></b:if>",
			'Blogger does not render what is in <b:elseif>, write it after <b:elseif/>',
			[3, 26],
		],
		[
			"<b:switch var='data:a'><b:case value='1'>a</b:case></b:switch>",
			'Blogger does not render what is in <b:case>, write it after <b:case/>',
			[3, 30],
		],
		[
			"<b:switch var='data:a'><b:default>d</b:default></b:switch>",
			'Blogger does not render what is in <b:default>, write it after <b:default/>',
			[3, 30],
		],
		[
			"<div><b:attr name='a' value='b'>x</b:attr></div>",
			'Blogger does not render what is in <b:attr>, write it <b:attr/>',
			[3, 12],
		],
		[
			"<b:eval expr='1'><!-- x --></b:eval>",
			'Blogger does not render what is in <b:eval>, write it <b:eval/>',
			[3, 7],
		],
		[
			"<b:message name='m'><b:param name='a' value='1'>p</b:param></b:message>",
			'Blogger does not render what is in <b:param>, write it <b:param/>',
			[3, 27],
		],
		[
			'<data:blog.title>t</data:blog.title>',
			'Blogger does not render what is in <data:blog.title>, write it <data:blog.title/>',
			[3, 7],
		],
		[
			"<b:if cond='true'>a<b:else/>b<b:elseif cond='false'/>c</b:if>",
			'Blogger never renders what comes after this <b:elseif>, the <b:else> before it ends the <b:if>',
			[3, 36],
		],
		[
			"<b:if cond='true'>a<b:else/>b<b:else/>c</b:if>",
			'Blogger never renders what comes after this <b:else>, the <b:else> before it ends the <b:if>',
			[3, 36],
		],
		[
			"<b:switch var='data:a'><b:case value='1'/>a<b:default/>a<b:default/>b</b:switch>",
			'Blogger never renders what comes after this <b:default>, the <b:default> before it ends the <b:switch>',
			[3, 63],
		],
	] as const)('warns about %s', (body, message, [line, column]) => {
		const { warnings } = written(document(body));
		assert.deepEqual(warnings, [{ message, loc: { path: '', line, column } }]);
	});

	test.each([
		"<b:if cond='true'>a<b:else> </b:else>b</b:if>",
		"<b:switch var='data:a'><b:default>\n</b:default></b:switch>",
		"<div><b:class name='a'> </b:class></div>",
		"<b:include name='x'>\n</b:include>",
		"<b:loop expr:var='data:v' values='data:a'/>",
		"<b:with expr:var='data:v' value='1'/>",
		"<b:loop reverse='true' values='data:a' var='x'/>",
		"<b:comment render='true'>c</b:comment>",
		"<b:message name='m'><b:param value='1'/></b:message>",
	])('accepts %s', (body) => {
		assert.deepEqual(written(document(body)).warnings, []);
	});
});

describe('skins', () => {
	const errorMessage = (xml: string): string => {
		try {
			written(xml);
		} catch (error) {
			return (error as XmlError).message;
		}
		return assert.fail('expected an error');
	};

	test.each([
		[`${HEAD}<html><head/></html>`, 'The theme has to have a <b:skin> (3:1)'],
		[
			`${HEAD}<html><b:skin/><b:skin/></html>`,
			'There can only be one <b:skin> (3:16)',
		],
		[
			`${HEAD}<html><b:template-skin/><b:skin/></html>`,
			'<b:template-skin> needs the attribute b:layoutsVersion on <html>, a theme of layouts version 2 or above (3:7)',
		],
		[
			`${HEAD}<html><body><b:skin/></body></html>`,
			'<b:skin> can not be in <body> (3:13)',
		],
		[
			`${HEAD}<html><b:skin>a<p/></b:skin></html>`,
			'<b:skin> can only have text and CDATA in it, found <p> (3:16)',
		],
		[
			`${HEAD}<html><b:skin><!-- c --></b:skin></html>`,
			'<b:skin> can only have text and CDATA in it, found a comment (3:15)',
		],
		[
			`${HEAD}<html b:layoutsVersion='3'><b:skin/><b:template-skin><![CDATA[a]]><div/></b:template-skin></html>`,
			'<b:template-skin> can only have text and CDATA in it, found <div> (3:67)',
		],
	])('rejects %s', (xml, message) => {
		assert.strictEqual(errorMessage(xml), message);
	});

	test('a skin can have text, CDATA sections or nothing in it', () => {
		for (const skin of [
			'<b:skin>body { color: red; } &amp;</b:skin>',
			'<b:skin>a<![CDATA[b]]>c<![CDATA[d]]></b:skin>',
			'<b:skin></b:skin>',
			'<b:skin/>',
		]) {
			written(
				`${HEAD}<html b:layoutsVersion='3'>${skin}<b:template-skin>a</b:template-skin></html>`,
			);
		}
	});

	test('a theme can have template skins, with comments in them', () => {
		const xml = `${HEAD}<html b:layoutsVersion='3'>${SKIN}<b:template-skin><!-- c --></b:template-skin><b:template-skin><![CDATA[a]]></b:template-skin></html>`;
		assert.strictEqual(format(xml), xml);
	});

	test('warns about a skin Blogger would save broken', () => {
		const { warnings } = written(
			`${HEAD}<html><b:skin>a{content:"]]&gt;"}</b:skin></html>`,
		);
		assert.deepEqual(warnings, [
			{
				message:
					"Blogger writes ']]>' in a skin as it is, which ends its CDATA section and breaks the theme it saves, write ']]\\>' in CSS",
				loc: { path: '', line: 3, column: 26 },
			},
		]);
	});

	test.each([
		[
			'<b:skin>\n\n&amp;\n\nsome text\n\n\n</b:skin>',
			'<b:skin><![CDATA[\n\n&\n\nsome text\n\n\n]]></b:skin>',
		],
		[
			'<b:skin>\n\n&amp;\n\n<![CDATA[\nsome text &amp;\n\n]]>\n\nx\n</b:skin>',
			'<b:skin><![CDATA[\n\n&\n\n\nsome text &amp;\n\n\n\nx\n]]></b:skin>',
		],
		[
			'<b:skin>&lt;a&gt;&lt;/a&gt; &lt; b</b:skin>',
			'<b:skin><![CDATA[<a></a> < b]]></b:skin>',
		],
		['<b:skin> </b:skin>', '<b:skin><![CDATA[ ]]></b:skin>'],
		['<b:skin><![CDATA[a]]></b:skin>', '<b:skin><![CDATA[a]]></b:skin>'],
		['<b:skin></b:skin>', SKIN],
		// a ']]>' the text makes ends a section and starts another
		[
			'<b:skin><![CDATA[a]]]]>&gt;b</b:skin>',
			'<b:skin><![CDATA[a]]]]><![CDATA[>b]]></b:skin>',
		],
		[
			'<b:skin/><b:template-skin>\n  a &amp; b\n</b:template-skin>',
			`${SKIN}<b:template-skin><![CDATA[\n  a & b\n]]></b:template-skin>`,
		],
	])('formats %s in a single CDATA section', (input, output) => {
		assert.strictEqual(
			format(`${HEAD}<html b:layoutsVersion='3'>${input}</html>`),
			`${HEAD}<html b:layoutsVersion='3'>${output}</html>`,
		);
	});

	test('formatting a skin with a comment or an element in it reports it', () => {
		for (const [skin, found] of [
			[
				'<b:skin>&amp;\n\n  <!-- -->\n  <![CDATA[\n  &lt;\n]]></b:skin>',
				'a comment',
			],
			['<b:skin>a<p/>b</b:skin>', '<p>'],
		]) {
			assert.throws(
				() => format(`${HEAD}<html>${skin}</html>`),
				`<b:skin> can only have text and CDATA in it, found ${found}`,
			);
		}
	});

	test('the warnings after a skin are placed in the output', () => {
		const { warnings } = written(
			`${HEAD}<html><b:skin>&amp;</b:skin><b:if cond='true' rel='x'/></html>`,
			{ format: true },
		);
		assert.deepEqual(warnings[0].loc, { path: '', line: 3, column: 60 });
	});
});

describe('skin variables', () => {
	/** A theme with `text` in its `<b:skin>`, from the start of line 4. */
	const raw = (text: string) =>
		`${HEAD}<html><b:skin>\n${text}\n</b:skin></html>`;
	/** The same, in a CDATA section. */
	const theme = (skin: string) =>
		`${HEAD}<html><b:skin><![CDATA[\n${skin}\n]]></b:skin></html>`;
	const placesOf = (xml: string) => {
		try {
			written(xml);
		} catch (error) {
			assert.instanceOf(error, XmlError);
			return error.errors.map(({ message, loc }) => [
				message,
				loc.line,
				loc.column,
			]);
		}
		return assert.fail('expected an error');
	};
	const variable = (name: string, description = name) =>
		`<Variable name="${name}" description="${description}" type="color" default="#000"/>`;

	test('reads the tags of the text and of the CDATA sections, as Blogger does', () => {
		assert.deepEqual(
			placesOf(
				raw(
					'&lt;Group description=&quot;hi&quot;&gt;&lt;/Group&gt;\n<![CDATA[<Group description="hi"></Group>]]>',
				),
			),
			[["There can only be one <Group> with the description 'hi'", 5, 10]],
		);
	});

	test.each([
		[
			'<Group description="  "/>',
			[['<Group> has to have a description, not blank', 4, 1]],
		],
		[
			'<Variable name="a" description="" type="color" default="#000"/>',
			[['<Variable> has to have a description, not blank', 4, 1]],
		],
		[
			'<Variable name=" " description="a" type="color" default="#000"/>',
			[["The attribute 'name' of <Variable> can not be blank", 4, 17]],
		],
		...['a-b', 'a b', 'é'].map((name): [string, (string | number)[][]] => [
			`<Variable name="${name}" description="a" type="color" default="#000"/>`,
			[
				[
					`The attribute 'name' of <Variable> can only have letters, digits, dots and underscores, got: '${name}'`,
					4,
					17,
				],
			],
		]),
		[
			'<Variable name="a " description="a" type="color" default="#000"/>',
			[
				[
					"The attribute 'name' of <Variable> can not start or end with spaces, got: 'a '",
					4,
					17,
				],
			],
		],
		[
			`<Group description=" g "/><Group description="g"/>`,
			[["There can only be one <Group> with the description 'g'", 4, 27]],
		],
		[
			`<Group description="g"><Group description="h"/></Group>`,
			[['<Group> can not be in a <Group>', 4, 24]],
		],
		[`<Group description="g">`, [['<Group> is not closed', 4, 1]]],
		[
			`<Group description="g"></Variable>`,
			[['Expected </Group> to close <Group>, found </Variable>', 4, 24]],
		],
		[
			`<Group>${variable('a')}</Group>`,
			[['<Group> has to have a description, not blank', 4, 1]],
		],
		[
			'<Variable name="a" description="a" type="string" default=\'\'/><Variable name="b" description="b" type="string" default/>',
			[
				[
					'Blogger only reads the attributes of <Variable> in <b:skin> in double quotes, write default=""',
					4,
					50,
				],
				[
					'Blogger only reads the attributes of <Variable> in <b:skin> in double quotes, write default="..."',
					4,
					111,
				],
			],
		],
		[
			'<Variable name="a"/>',
			[
				["<Variable> has to have the attribute 'type'", 4, 1],
				["<Variable> has to have the attribute 'default'", 4, 1],
				['<Variable> has to have a description, not blank', 4, 1],
			],
		],
		[
			'<Variable name="a" description="a" type="colour" default="#000"/>',
			[["Unknown <Variable> type 'colour', did you mean 'color'?", 4, 42]],
		],
		[
			'<Variable name="a" description="a" type="color" default="#000" min="1px"/>',
			[
				[
					"<Variable type='color'> can not have the attribute 'min', only 'name', 'description', 'type', 'default', 'value', 'hideEditor', 'red', 'green', 'blue' and 'alpha'",
					4,
					69,
				],
			],
		],
		[
			`${variable('a', 'x')}\n${variable(' a', 'y')}`,
			[
				["There can only be one <Variable> named 'a'", 5, 1],
				[
					"The attribute 'name' of <Variable> can not start or end with spaces, got: ' a'",
					5,
					17,
				],
			],
		],
		[
			`<Group description="g">${variable('a', 'x')}${variable('b', 'x')}</Group>`,
			[
				[
					"There can only be one <Variable> with the description 'x' in the <Group> 'g'",
					4,
					88,
				],
			],
		],
		[
			'<Variable name="a" description="a" type="color" default="#000">',
			[['<Variable> is not closed', 4, 1]],
		],
		[
			'<Variable name="a" name="b" description="a" type="color" default="#000"/>',
			[["Duplicate attribute 'name' in <Variable>", 4, 26]],
		],
		[
			"<Variable name='a' description='a' type='color' default='#000'/>",
			[
				[
					'Blogger only reads the attributes of <Variable> in <b:skin> in double quotes, write name="a"',
					4,
					11,
				],
				[
					'Blogger only reads the attributes of <Variable> in <b:skin> in double quotes, write description="a"',
					4,
					20,
				],
				[
					'Blogger only reads the attributes of <Variable> in <b:skin> in double quotes, write type="color"',
					4,
					36,
				],
				[
					'Blogger only reads the attributes of <Variable> in <b:skin> in double quotes, write default="#000"',
					4,
					49,
				],
			],
		],
		[
			"<Group description='g'>" +
				'<Variable name="a" description="a" type="color" default=#000/></Group>',
			[
				[
					'Blogger only reads the attributes of <Group> in <b:skin> in double quotes, write description="g"',
					4,
					8,
				],
				[
					'Blogger only reads the attributes of <Variable> in <b:skin> in double quotes, write default="#000"',
					4,
					72,
				],
			],
		],
	])('rejects %s', (skin, places) => {
		assert.deepEqual(placesOf(theme(skin)), places);
	});

	test.each([
		// the other tags are text to Blogger
		`a < b, c > d, e<f/>g<h class='i'>j</h>\n<k>${variable('a')}</k><!-- <l/> -->`,
		'<!-- <a --> a { b: c<d } </a <a><b></a> <V',
		// before the first one, a closing tag is not read
		`</Group>${variable('a')}`,
		// what is in a group but the variables is not read
		`<Group description="g">\n  b <a/> ${variable('b')}\n</Group>`,
		// out of a group, a description can be twice, and in two groups
		`${variable('a', 'x')}${variable('b', 'x')}<Group description="g">${variable('c', 'x')}</Group><Group description="h">${variable('d', 'x')}</Group>`,
		`${variable('a_b')}${variable('1a')}<Variable name="c" description="c" type="Color" default="#000"/>`,
		'<Variable name="x" description="x" type="length" default="20px" min="0" max="10px"/><Variable name="y" description="y" type="automatic" default="left"/>',
	])('accepts %s', (skin) => {
		assert.deepEqual(written(theme(skin)).warnings, []);
	});

	test('a group can have comments in it, and the tags in them are read', () => {
		const { warnings, info } = written(
			theme(`<Group description="g">\n  <!-- ${variable('a')} -->\n</Group>`),
		);
		assert.isEmpty(warnings);
		assert.deepEqual(
			info.variables.map(({ name, group }) => [name, group]),
			[['a', 'g']],
		);
	});

	test('warns about the attributes Blogger does not read, and a variable with something in it', () => {
		const { warnings } = written(
			theme(
				'<Variable name="a" description="a" type="color" default="#000" hideEditor/>\n<Variable name="b" description="b" type="string" default=""> </Variable>',
			),
		);
		assert.deepEqual(
			warnings.map(({ message, loc }) => [message, loc.line, loc.column]),
			[
				[
					'Blogger does not read the attribute \'hideEditor\' of <Variable> in <b:skin>, only values in double quotes: hideEditor="..."',
					4,
					64,
				],
				[
					'Blogger does not read what is in a <Variable>, write it <Variable/>',
					5,
					1,
				],
			],
		);
	});

	test('are in the info, with the description of their group', () => {
		const { info } = written(
			theme(
				`<Group description="Colors" selector="body">\n  <Variable name="text" description="Text &amp;amp; links" type="color" default="#000" value="#111"/>\n</Group>\n${variable('b')}`,
			),
		);
		assert.deepEqual(info.groups, [
			{
				description: 'Colors',
				selector: 'body',
				loc: { path: '', line: 4, column: 1 },
			},
		]);
		assert.deepEqual(info.variables, [
			{
				name: 'text',
				type: 'color',
				description: 'Text &amp; links',
				group: 'Colors',
				default: '#000',
				value: '#111',
				loc: { path: '', line: 5, column: 3 },
			},
			{
				name: 'b',
				type: 'color',
				description: 'b',
				default: '#000',
				loc: { path: '', line: 7, column: 1 },
			},
		]);
	});

	test('have the attributes of their type, the type in lowercase', () => {
		const { info } = written(
			theme(
				[
					'<Variable name="c" description="c" type="Color" default="#000" red="1" alpha="0.5"/>',
					'<Variable name="b" description="b" type="background" default="$(c) none repeat scroll top left" color="#fff"/>',
					'<Variable name="l" description="l" type="length" default="10px" min="0" max="20px" hideEditor="true"/>',
					'<Variable name="u" description="u" type="url" default="none"/>',
				].join(''),
			),
		);
		const fields = info.variables.map(({ loc, ...variable }) => variable);
		assert.deepEqual(fields, [
			{
				name: 'c',
				type: 'color',
				description: 'c',
				default: '#000',
				red: '1',
				alpha: '0.5',
			},
			{
				name: 'b',
				type: 'background',
				description: 'b',
				default: '$(c) none repeat scroll top left',
				color: '#fff',
			},
			{
				name: 'l',
				type: 'length',
				description: 'l',
				default: '10px',
				min: '0',
				max: '20px',
				hideEditor: 'true',
			},
			{ name: 'u', type: 'url', description: 'u', default: 'none' },
		]);
		const [color, , length] = info.variables;
		// narrowed by the type
		assert.strictEqual(color.type === 'color' && color.alpha, '0.5');
		assert.strictEqual(length.type === 'length' && length.max, '20px');
	});

	test('leave one of an unknown type out of the info', () => {
		const document = parseXml(
			theme(
				'<Variable name="a" description="a" type="colour" default="#000"/>',
			),
		);
		assert.deepEqual(
			checkXml(document).errors.map(({ code }) => code),
			['variable-type'],
		);
		assert.isEmpty(inspectXml(document).variables);
	});

	test('their description is trimmed, in the info too', () => {
		const { info } = written(
			theme(
				'<Group description=" g "><Variable name="a.b1" description=" x " type="string" default=" "/></Group>',
			),
		);
		assert.deepEqual(
			info.groups.map(({ description }) => description),
			['g'],
		);
		assert.deepEqual(
			info.variables.map(({ name, description, group, default: fallback }) => [
				name,
				description,
				group,
				fallback,
			]),
			[['a.b1', 'x', 'g', ' ']],
		);
	});

	test('are kept as they are, a value added to those without one', () => {
		const { xml } = written(
			raw(
				'&lt;Group description=" a "&gt;\n  <![CDATA[<Variable name="x.1" type="string"\n    description="  it\'s  " default=" "></Variable><Variable name="y" description="y" type="color" default="#000" value="#111"/><Variable name="z" description="z" type="automatic" default="left"/>]]>\n&lt;/Group  &gt;',
			),
			{ format: true },
		);
		assert.strictEqual(
			xml,
			`${HEAD}<html><b:skin><![CDATA[\n<Group description=" a ">\n  <Variable name="x.1" type="string"\n    description="  it's  " default=" " value=" "></Variable><Variable name="y" description="y" type="color" default="#000" value="#111"/><Variable name="z" description="z" type="automatic" default="left"/>\n</Group  >\n]]></b:skin></html>`,
		);
		assert.strictEqual(format(xml), xml);
	});

	test('are placed in the formatted output', () => {
		const { warnings, info } = written(
			theme(
				'<Variable\n  type="color" name="a" description="a" default="#000" hideEditor/>',
			),
			{ format: true },
		);
		assert.deepEqual(warnings[0].loc, { path: '', line: 5, column: 56 });
		assert.deepEqual(info.variables[0].loc, { path: '', line: 4, column: 1 });
	});

	test('are read from <b:skin> only', () => {
		const { xml, info } = written(
			`${HEAD}<html b:layoutsVersion='3'><b:skin/><b:template-skin>&lt;Variable  name="a"/&gt;</b:template-skin></html>`,
			{ format: true },
		);
		assert.include(xml, '<![CDATA[<Variable  name="a"/>]]>');
		assert.isEmpty(info.variables);
	});
});

describe('names of JavaScript objects', () => {
	test.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
		'<%s> and &%s; are read as any other name',
		(name) => {
			assert.doesNotThrow(() =>
				written(`${HEAD}<html><${name} cond='x'/><b:skin/></html>`),
			);
			assert.throws(
				() => written(`${HEAD}<html><a title='&${name};'/><b:skin/></html>`),
				XmlError,
			);
			assert.strictEqual(decodeEntities(`a&${name};b`), `a&${name};b`);
		},
	);
});

describe('checks', () => {
	test('accepts a formatted document', () => {
		written(format('<html><p/><b:skin/></html>'));
	});

	test('checks the contents of the declarations', () => {
		const cases: [string, RegExp][] = [
			[`<?xml encoding="UTF-8"?>\n${DOCTYPE}\n<html>${SKIN}</html>`, /version/],
			[
				`<?xml version="1.0" x="1"?>\n${DOCTYPE}\n<html>${SKIN}</html>`,
				/Unknown 'x'/,
			],
			[`${XML_DECLARATION}\n<!doctype html>\n<html>${SKIN}</html>`, /capitals/],
		];
		for (const [xml, message] of cases) {
			assert.throws(() => written(xml), XmlError);
			assert.throws(() => written(xml), message);
		}
		written(`<?xml version='1.0'?>\n${DOCTYPE}\n<html>${SKIN}</html>`);
		written(`${XML_DECLARATION}\n<!DOCTYPE svg>\n<html>${SKIN}</html>`);
	});

	test('requires the XML declaration first, when there is one, but not the doctype', () => {
		assert.throws(
			() => written(` ${XML_DECLARATION}\n<html>${SKIN}</html>`),
			/XML declaration has to be the first thing in the theme/,
		);
		assert.throws(
			() => written(`${DOCTYPE}\n${XML_DECLARATION}\n<html>${SKIN}</html>`),
			/XML declaration has to be the first thing in the theme/,
		);
		written(`<html>${SKIN}</html>`);
		written(`${XML_DECLARATION}${DOCTYPE}\n<html>${SKIN}</html>`);
		written(`${XML_DECLARATION}\n<html>${SKIN}</html>`);
		written(`${XML_DECLARATION}\n\n${DOCTYPE}\n<html>${SKIN}</html>`);
	});

	test('reports well-formedness errors with 1-based positions', () => {
		const cases: [string, RegExp][] = [
			[
				'<html><b></html>',
				/Expected <\/b> to close <b> \(opened at 3:7\), found <\/html> \(3:10\)/,
			],
			['<html/><b/>', /Only one root element/],
			['text<a/>', /Text out of the root element/],
			["<html x='1' x='2'/>", /Duplicate attribute 'x'/],
			['<html>&nbsp;</html>', /Undefined entity '&nbsp;'.*&#160;/],
			['<html>a & b</html>', /'&' has to be escaped as '&amp;'/],
			["<html title='a < b'/>", /'<' is not allowed in the value/],
			['<html disabled/>', /has no value/],
			['<html><!-- a -- b --></html>', /'--' is not allowed inside a comment/],
			['', /no root element/],
		];

		for (const [body, message] of cases) {
			assert.throws(() => written(HEAD + body), XmlError);
			assert.throws(() => written(HEAD + body), message);
		}
	});

	test('accepts valid expressions, with their entities decoded', () => {
		written(
			`${HEAD}<html expr:lang='data:blog.locale'>
  <b:if cond='data:a &amp;&amp; data:b &lt; 2'><b:elseif cond="data:c == &quot;x&quot;"/></b:if>
  <b:loop values='data:posts' var='post'><b:eval expr='data:post.title'/></b:loop>
  <b:with value='[1, 2]' var='list'><b:switch var='data:blog.pageType'/></b:with>
  <b:include data='post' name='x' cond='data:post'/>
  <b:section id='s' cond='data:view.isHomepage'/>
<b:skin/></html>`,
		);
	});

	test('warns about expressions that may not do what they look like, where and how to fix them', () => {
		const warnings = (body: string) =>
			written(HEAD + body).warnings.map(({ message, loc }) => [
				message,
				loc.line,
				loc.column,
			]);
		assert.deepEqual(
			warnings(
				`<html><b:if cond='data:x contains &quot;a&quot;'/><b:skin/></html>`,
			),
			[
				[
					`Expression in the attribute 'cond' of <b:if>: \`data:x\` may not be text. Fix: turn it into text where it is used: (data:x + "")`,
					3,
					19,
				],
			],
		);
		// placed after entities, as they are written
		assert.deepEqual(
			warnings(
				`<html><b:if cond='&quot;a&quot; in data:x'/><b:skin/></html>`,
			).map(([, line, column]) => [line, column]),
			[[3, 36]],
		);
		assert.deepEqual(
			warnings(
				`<html><b:loop values='true ? 1 : 2 to 3' var='i'/><b:skin/></html>`,
			).map(([message]) => message),
			[
				"Expression in the attribute 'values' of <b:loop>: The start of the range is all of `true ? 1 : 2`. Fix: put parentheses around it: (true ? 1 : 2)",
			],
		);
		assert.deepEqual(
			warnings(`<html><b:if cond='data:a and data:b'/><b:skin/></html>`),
			[],
		);
		// formatting warns the same
		assert.lengthOf(
			written(
				`${HEAD}<html><b:if cond='data:x contains &quot;a&quot;'/><b:skin/></html>`,
				{ format: true },
			).warnings,
			1,
		);
	});

	test('reports invalid expressions where they are', () => {
		const cases: [string, RegExp][] = [
			[
				`<html><b:if cond='data:a and'/><b:skin/></html>`,
				/Invalid expression in the attribute 'cond' of <b:if>: .* \(3:29\)/,
			],
			[`<html><a expr:href='data:a +'/><b:skin/></html>`, /'expr:href' of <a>/],
			[
				`<html><b:section id='s' cond='data:a and'/><b:skin/></html>`,
				/'cond' of <b:section>/,
			],
			[
				`<html><b:include data='data:a +' name='x'/><b:skin/></html>`,
				/'data' of <b:include>/,
			],
			[
				`<html><b:include data='post title' name='x'/><b:skin/></html>`,
				/'data' of <b:include>/,
			],
			[
				`<html><b:loop values='foo' var='x'/><b:skin/></html>`,
				/'values' of <b:loop>/,
			],
			[
				`<html><b:loop values='1..data:n' var='x'/><b:skin/></html>`,
				/'values' of <b:loop>/,
			],
			[
				`<html><b:loop values='1 .. 20' var='x'/><b:skin/></html>`,
				/range in the attribute 'values' of <b:loop>, it can not have spaces: '1\.\.20' \(3:23\)/,
			],
			[
				`<html><b:loop values=' 1..20' var='x'/><b:skin/></html>`,
				/can not have spaces/,
			],
			[
				`<html><b:eval expr='&quot;x'/><b:skin/></html>`,
				/'expr' of <b:eval>.*\(3:21\)/,
			],
			// places after entities, and after one decoded to two UTF-16 units
			[
				`<html><b:if cond='&quot;a&quot; and'/><b:skin/></html>`,
				/'cond' of <b:if>: .* \(3:36\)/,
			],
			[
				`<html><b:if cond='&quot;&#x1F600;&quot; +'/><b:skin/></html>`,
				/'cond' of <b:if>: .* \(3:42\)/,
			],
		];
		for (const [body, message] of cases) {
			assert.throws(() => written(HEAD + body), XmlError);
			assert.throws(() => written(HEAD + body), message);
			assert.throws(() => format(HEAD + body), message);
		}
	});

	test('leaves other attributes alone', () => {
		written(
			`${HEAD}<html><b:include data='post' name='a and'/><b:skin/></html>`,
		);
	});

	test('XmlError has the position', () => {
		try {
			written(`${HEAD}<html>\n  <b></html>`);
			assert.fail('expected an error');
		} catch (error) {
			assert.instanceOf(error, XmlError);
			assert.deepEqual(error.loc, { path: '', line: 4, column: 6 });
			assert.match(error.message, / \(4:6\)$/);
		}
	});

	test('XmlError has the path of the document when it is given', () => {
		try {
			written(`${HEAD}<html>\n  <b></html>`, {
				path: 'dist/theme.xml',
			});
			assert.fail('expected an error');
		} catch (error) {
			assert.deepEqual((error as XmlError).loc, {
				path: 'dist/theme.xml',
				line: 4,
				column: 6,
			});
			assert.match((error as Error).message, / \(dist\/theme\.xml:4:6\)$/);
		}
	});
});

describe('every error', () => {
	const errorsOf = (xml: string) => {
		try {
			written(xml, { path: 'theme.xml' });
		} catch (error) {
			assert.instanceOf(error, XmlError);
			return error;
		}
		assert.fail('expected an error');
	};
	const placesOf = (error: XmlError) =>
		error.errors.map(({ message, loc }) => [message, loc.line, loc.column]);

	test('are reported together, in the order of the document', () => {
		const error = errorsOf(`${HEAD}<html>
  <b:loop var='x'/>
  <b:section id=' s'/><b:widget-settings/>
<b:skin/></html>`);
		assert.deepEqual(placesOf(error), [
			["<b:loop> has to have the attribute 'values'", 4, 3],
			[
				"The attribute 'id' of <b:section> can not start or end with spaces, Blogger fails to save it, got: ' s'",
				5,
				18,
			],
			[
				'<b:widget-settings> can only be in a <b:widget>, it is in <html>',
				5,
				23,
			],
		]);
		assert.deepEqual(error.loc, error.errors[0].loc);
		assert.strictEqual(
			error.message,
			`3 errors:\n${error.errors.map(({ message, loc }) => `  ${message} (theme.xml:${loc.line}:${loc.column})`).join('\n')}`,
		);
	});

	test('are reported with the syntax error that stops the scan', () => {
		const error = errorsOf(`${HEAD}<html><b:loop var='x'/><b></html>`);
		assert.deepEqual(placesOf(error), [
			["<b:loop> has to have the attribute 'values'", 3, 7],
			['Expected </b> to close <b> (opened at 3:24), found </html>', 3, 27],
		]);
	});

	test('of the declarations are reported together', () => {
		const error = errorsOf(
			`<?xml encoding="UTF-8" x="1"?><html>${SKIN}</html>`,
		);
		assert.deepEqual(placesOf(error), [
			["Unknown 'x' in the XML declaration", 1, 1],
			['The XML declaration has to have a version, version="1.0"', 1, 1],
		]);
	});

	test('one error has its message alone', () => {
		const error = errorsOf(`${HEAD}<html><b:loop var='x'/><b:skin/></html>`);
		assert.strictEqual(
			error.message,
			"<b:loop> has to have the attribute 'values' (theme.xml:3:7)",
		);
	});
});

describe('info', () => {
	test('tells what the theme is made of', () => {
		const { info } = written(
			`${HEAD}<html b:layoutsVersion='3' b:responsive='true' xmlns='x'>
  <head>
    <b:skin><![CDATA[body{}]]></b:skin>
    <style>p::after{content:'é😀'}</style>
    <script src='a.js'/>
    <script>a()</script>
  </head>
  <b:section id='header'><b:widget id='Header1' type='Header'/></b:section>
  <b:section id='main'>
    <b:widget id='Blog1' type='Blog'/>
    <b:widget id='HTML1' type='HTML'/>
  </b:section>
</html>`,
			{ path: 'theme.xml' },
		);

		assert.deepEqual(info.root, {
			'b:layoutsVersion': '3',
			'b:responsive': 'true',
		});
		assert.deepEqual(info.sections, [
			{ id: 'header', loc: { path: 'theme.xml', line: 10, column: 3 } },
			{ id: 'main', loc: { path: 'theme.xml', line: 11, column: 3 } },
		]);
		assert.deepEqual(
			info.widgets.map(({ id, type, section }) => [id, type, section]),
			[
				['Header1', 'Header', 'header'],
				['Blog1', 'Blog', 'main'],
				['HTML1', 'HTML', 'main'],
			],
		);
		assert.deepEqual(info.widgets[1].loc, {
			path: 'theme.xml',
			line: 12,
			column: 5,
		});
	});
});

describe('with format, warnings and info', () => {
	/** `{ line, column }` of `search` in `xml`, 1-based. */
	const placeOf = (xml: string, search: string) => {
		const offset = xml.indexOf(search);
		assert.isAtLeast(offset, 0, `${search} is not in the output`);
		const before = xml.slice(0, offset).split('\n');
		return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
	};

	test('are placed in the output, its head added, tags moved and attributes sorted', () => {
		const { xml, warnings, info } = written(
			`<!-- a theme -->
<html xmlns='x'><b:section id='s'>   <b:widget
      version='2' type='HTML'
      title='T' expr:title='data:t'
      id='HTML1'/></b:section>
  <a
    href='#'
    expr:href='data:a'/>
<b:skin/></html>`,
			{ format: true },
		);

		assert.deepEqual(
			warnings.map(({ loc: { line, column } }) => ({ line, column })),
			// at the widget, its expr:title removed
			[placeOf(xml, '<b:widget'), placeOf(xml, "#'/>")],
		);
		assert.deepEqual(
			{ line: info.sections[0].loc.line, column: info.sections[0].loc.column },
			placeOf(xml, '<b:section'),
		);
		assert.deepEqual(
			{ line: info.widgets[0].loc.line, column: info.widgets[0].loc.column },
			placeOf(xml, '<b:widget'),
		);
	});

	test('are placed in the output of an empty element self-closed', () => {
		const { xml, warnings } = written(
			"<html><b:if cond='true'></b:if><a href='#' expr:href='data:a'></a><b:skin/></html>",
			{ format: true },
		);
		assert.include(xml, "<b:if cond='true'/><a expr:href='data:a' href='#'/>");
		assert.deepEqual(
			{ line: warnings[0].loc.line, column: warnings[0].loc.column },
			placeOf(xml, "#'/>"),
		);
	});
});

describe('XmlScanner', () => {
	const documents = [
		`${HEAD}<html a='1' b="x &amp; y"><!-- a - comment --><p>text &#160; more</p>
  <script>/*<![CDATA[*/ if (a < b && c) {} /*]]>*/</script>
  <?pi some ? content?><b:if cond='data:a'/>
<b:skin/></html>`,
		`${HEAD}<html><!-- a -- b --><b:skin/></html>`,
		`${HEAD}<html><![CDATA[a ] ]] ]]]><b:skin/></html>`,
		`${HEAD}<html title='a < b'/>`,
		`${HEAD}<html>a & b<b:skin/></html>`,
		`${HEAD}<html   lang = "en"  xmlns:b='x'><p   class='a&quot;b&#x41;c&#128512;'  >x</p   ><b:widget-settings
  /><b:skin/></html>`,
		`${HEAD}<html>&${'a'.repeat(40)};<b:skin/></html>`,
		`${HEAD}<html></ html>`,
		`${HEAD}<html a='1'b='2'/>`,
	];

	/** What scanning `xml` in pieces of `size` reports, every piece a call of `feed`. */
	const scan = (xml: string, size: number) => {
		const events: unknown[] = [];
		const locate = createLocate(xml);
		const scanner = new XmlScanner({
			document: true,
			onStartTag: ({ name, start, end, attributes }) =>
				events.push([
					name,
					start,
					end,
					attributes.map(({ name, value, offset }) => [name, value, offset]),
				]),
			onText: (offset) => events.push(['text', offset]),
			onDeclaration: ({ kind, content }) => events.push([kind, content]),
		});
		try {
			for (let start = 0; start < xml.length; start += size) {
				scanner.feed(
					xml.slice(start, start + size),
					(index) => locate(start + index),
					start,
				);
			}
			scanner.finish(locate(xml.length));
		} catch (error) {
			events.push((error as Error).message);
		}
		return events;
	};

	test.each(documents)('scans the same in pieces: %s', (xml) => {
		const whole = scan(xml, xml.length);
		for (const size of [1, 2, 3, 5, 8]) {
			assert.deepEqual(scan(xml, size), whole, `in pieces of ${size}`);
		}
	});
});

describe('checkAttributes', () => {
	const attribute = (name: string, offset: number) =>
		({ name, value: 'x', offset }) as unknown as ScannedAttribute;
	const check = (others: 'allow' | 'warn' | 'removed' | 'unrendered') => {
		const reported: string[] = [];
		checkAttributes(
			'b:x',
			{ required: ['a'], others, known: new Set(['a']) },
			[attribute('a', 1), attribute('b', 2)],
			{
				error: (code, message, offset) =>
					reported.push(`error ${code} ${offset}: ${message}`),
				warn: (code, message, offset) =>
					reported.push(`warn ${code} ${offset}: ${message}`),
			},
			0,
		);
		return reported;
	};

	test('another attribute is allowed or a warning, as others says', () => {
		assert.deepEqual(check('allow'), []);
		assert.deepEqual(check('warn'), [
			"warn unread-attribute 2: <b:x> has the attribute 'b', Blogger only reads 'a'",
		]);
		assert.deepEqual(check('removed'), [
			"warn removed-attribute 2: Blogger removes the attribute 'b' of <b:x>, it only keeps 'a'",
		]);
		assert.deepEqual(check('unrendered'), [
			"warn unrendered-attribute 2: Blogger does not render the attribute 'b' of <b:x>, only 'class', 'id', 'name' and 'tag'",
		]);
	});
});

describe('parseXml, checkXml, formatXml and inspectXml', () => {
	const misplaced = `\n${XML_DECLARATION}<html expr:class='data:a contains &quot;b&quot;'><b:skin/></html>`;

	test('checks as written, and formats what formatting fixes', () => {
		const document = parseXml(misplaced, { path: 'theme.xml' });
		const { errors, warnings } = checkXml(document);
		assert.deepEqual(
			errors.map(({ code, message, loc }) => [
				code,
				message,
				loc.line,
				loc.column,
			]),
			[
				[
					'declaration-not-first',
					`The XML declaration has to be the first thing in the theme, Blogger fails on anything before it, even a space, ${XML_DECLARATION}`,
					2,
					1,
				],
			],
		);
		const formatted = formatXml(document);
		assert.isTrue(formatted.ok);
		if (!formatted.ok) {
			return;
		}
		assert.isTrue(formatted.xml.startsWith(`${XML_DECLARATION}\n<html`));
		// warnings in the theme given, and in the formatted one
		assert.deepEqual(
			warnings.map(({ loc }) => [loc.line, loc.column]),
			[[2, 58]],
		);
		assert.deepEqual(
			formatted.warnings.map(({ loc }) => [loc.line, loc.column]),
			[[2, 19]],
		);
		assert.strictEqual(formatted.warnings[0].message, warnings[0].message);
		// formatted once for the document
		const again = formatXml(document);
		assert.strictEqual(again.ok && again.xml, formatted.xml);
	});

	test('places info in the source, or in the theme formatted', () => {
		const xml = `\n\n${XML_DECLARATION}<html><b:section id='s'/><b:skin/></html>`;
		const document = parseXml(xml);
		const formatted = formatXml(document);
		assert.deepEqual(
			inspectXml(document).sections.map(({ loc }) => loc.line),
			[3],
		);
		assert.deepEqual(
			inspectXml(document, formatted).sections.map(({ loc }) => loc.line),
			[2],
		);
		assert.throws(
			() => inspectXml(parseXml(xml), formatted),
			'not formatted from the document',
		);
	});

	test('never throws, and does not format with errors formatting does not fix', () => {
		for (const xml of [
			`${HEAD}<html><b:loop var='x'/><b:skin/></html>`,
			`${HEAD}<html><b></html>`,
			'',
		]) {
			const document = parseXml(xml);
			assert.isAbove(checkXml(document).errors.length, 0);
			assert.isFalse(formatXml(document).ok);
		}
		const broken = parseXml(`${HEAD}<html><b></html>`);
		assert.deepEqual(
			checkXml(broken).errors.map(({ code }) => code),
			['syntax'],
		);
		const result = formatXml(
			parseXml(`\n${XML_DECLARATION}<html><b:loop var='x'/><b:skin/></html>`),
		);
		assert.deepEqual(result.ok ? [] : result.errors.map(({ code }) => code), [
			'missing-attribute',
		]);
	});

	test('warnings have a code, to leave them out', () => {
		const document = parseXml(
			`${HEAD}<html><?x?><b:if cond='true'><b:else>x</b:else></b:if><b:if rel='x' cond='data:x'/><b:skin/></html>`,
		);
		assert.deepEqual(
			checkXml(document).warnings.map(({ code, severity }) => [code, severity]),
			[
				['processing-instruction', 'warning'],
				['unrendered-content', 'warning'],
				['unread-attribute', 'warning'],
			],
		);
		const ignore = ['processing-instruction', 'unread-attribute'];
		assert.deepEqual(
			checkXml(document, { ignore }).warnings.map(({ code }) => code),
			['unrendered-content'],
		);
		const formatted = formatXml(document, { ignore });
		assert.deepEqual(
			formatted.ok ? formatted.warnings.map(({ code }) => code) : [],
			['unrendered-content'],
		);
	});

	test('parses each expression once in the cache it is given', () => {
		const cache = new Map();
		const xml = `${HEAD}<html><b:if cond='data:a'/><b:if cond='data:a'/><b:if cond='data:b'/><b:skin/></html>`;
		checkXml(parseXml(xml, { cache }));
		assert.strictEqual(cache.size, 2);
		const [result] = cache.values();
		checkXml(parseXml(xml, { cache }));
		assert.strictEqual(cache.size, 2);
		assert.strictEqual([...cache.values()][0], result);
	});

	test('places warnings within an expression, after its escapes', () => {
		const places = (body: string) =>
			written(HEAD + body, { format: true }).warnings.map(({ loc }) => [
				loc.line,
				loc.column,
			]);
		// `<html><b:if cond='` is 18 characters: the value starts at column 19
		assert.deepEqual(
			places(`<html><b:if   cond='&quot;a&quot; in data:x'/>${SKIN}</html>`),
			[[3, 36]],
		);
		// `data:a &amp;&amp; ` before `data:x`, as the expression is printed
		assert.deepEqual(
			places(
				`<html><b:if cond='data:a&amp;&amp;data:x contains "b"'/>${SKIN}</html>`,
			),
			[[3, 37]],
		);
	});

	test('warnings are in the order of the document', () => {
		const warnings = written(
			`${HEAD}<html><b:if rel='x' cond='data:x contains &quot;a&quot;'/><b:skin/></html>`,
		).warnings;
		const columns = warnings.map(({ loc }) => loc.column);
		assert.isAbove(warnings.length, 1);
		assert.deepEqual(
			columns,
			[...columns].sort((a, b) => a - b),
		);
	});

	test('a document in place has nothing to fix', () => {
		assert.deepEqual(
			checkXml(parseXml(`${HEAD}<html><b:skin/></html>`)).errors,
			[],
		);
	});
});

describe('what Blogger removes or does not render', () => {
	const warningsOf = (body: string) =>
		written(`${HEAD}<html>${body}${SKIN}</html>`).warnings.map(
			({ message }) => message,
		);

	test.each([
		[
			"<b:section id='s' style='x' expr:class='data:c'/>",
			[
				"Blogger does not render the attribute 'style' of <b:section>, only 'class', 'id', 'name' and 'tag'",
				"Blogger does not render the attribute 'expr:class' of <b:section>, only 'class', 'id', 'name' and 'tag'",
			],
		],
		[
			"<b:section id='s'><b:widget id='HTML1' pageType='item' title='a &amp; b' type='HTML' visible='no'/></b:section>",
			[
				"Blogger removes the attribute 'pageType' of <b:widget>, it only keeps 'id', 'type', 'cond', 'locked', 'mobile', 'title', 'version' and 'visible'",
				"Blogger escapes '&' and '\"' in the title of a widget twice when saving it, '&' shows as '&amp;'",
				"The attribute 'visible' of <b:widget> has to be 'true' or 'false', Blogger saves 'true', got: 'no'",
			],
		],
		[
			"<b:section id='s'><b:widget expr:title='data:t' id='HTML1' title='a' type='HTML'/></b:section>",
			[
				"Blogger removes the attribute 'expr:title' of <b:widget>, its attributes can not be expressions",
			],
		],
		[
			`<b:section id='s'><b:widget id='HTML1' title='${'t'.repeat(101)}' type='HTML'/></b:section>`,
			['Blogger empties a title of a widget longer than 100 characters'],
		],
		[
			"<b:section id='s'><b:widget id='HTML1' type='HTML'><b:includable id='main'><p><!-- c --></p></b:includable></b:widget></b:section>",
			[],
		],
		['<p><?a b?></p>', ['Blogger removes processing instructions']],
		[
			"<b:defaultmarkups><b:defaultmarkup type='Common'><b:includable id='a'/></b:defaultmarkup><b:defaultmarkup type='HTML,Common'><b:includable id='a'/></b:defaultmarkup></b:defaultmarkups>",
			[
				"Another <b:defaultmarkup> of the type 'Common' has an includable 'a', Blogger uses the last one",
			],
		],
		[
			"<i><b:attr name='title'/></i>",
			["<b:attr> without a value removes the attribute, as value=''"],
		],
	])('warns about %s', (body, messages) => {
		assert.deepEqual(warningsOf(body), messages);
	});

	test.each([
		"<b:section class='c' growth='vertical' id='s' maxwidgets='2' preferred='yes' showaddelement='yes' tag='aside' expr:name='data:n'/>",
		"<b:section id='s'><b:widget id='Navbar1' locked='true' mobile='only' type='Navbar' version='1' visible='true'/></b:section>",
		"<b:template-script async='true' name='indie' version='1.0.0'/>",
		'<!-- a comment out of widgets -->',
	])('accepts %s', (body) => {
		assert.deepEqual(warningsOf(body), []);
	});
});

describe('characters, as Blogger writes them', () => {
	test('in text, escaped, and those not letters or digits past ASCII as references', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><p>a"b'c>d &#62;&#x22;&apos; ©–\u00a0é١😀 &#169;\u007f\tx</p>${SKIN}</html>`,
			),
			`${HEAD}<html><p>a&quot;b&#39;c&gt;d &gt;&quot;&#39; &#169;&#8211;&#160;é١😀 &#169;&#127;\tx</p>${SKIN}</html>`,
		);
	});

	test('in comments, only those past ASCII; CDATA, attributes and skins as they are', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><!-- a"'>& ©– --><p title='©–'><![CDATA[©– "' > ]]></p><b:skin><![CDATA[a{content:"©"}]]></b:skin></html>`,
			),
			`${HEAD}<html><!-- a"'>& &#169;&#8211; --><p title='©–'><![CDATA[©– "' > ]]></p><b:skin><![CDATA[a{content:"©"}]]></b:skin></html>`,
		);
	});

	test('in settings, trimmed, in CDATA with & < > " or \', otherwise as text', () => {
		const setting = (content: string) => {
			const xml = format(
				`${HEAD}<html><b:section id='s'><b:widget id='HTML1' type='HTML'><b:widget-settings><b:widget-setting name='content'>${content}</b:widget-setting></b:widget-settings></b:widget></b:section>${SKIN}</html>`,
			);
			return /name='content'>([\s\S]*?)<\/b:widget-setting>/.exec(xml)?.[1];
		};
		assert.strictEqual(setting('  plain  '), 'plain');
		assert.strictEqual(setting('<![CDATA[ plain ]]>'), 'plain');
		assert.strictEqual(setting('café ©'), 'café &#169;');
		assert.strictEqual(setting('a &amp; b'), '<![CDATA[a & b]]>');
		assert.strictEqual(setting("it's"), "<![CDATA[it's]]>");
		assert.strictEqual(setting('x]]&gt;y'), '<![CDATA[x]]]]><![CDATA[>y]]>');
		assert.strictEqual(setting('a\n\tb'), 'a\n\tb');
	});

	test('an empty setting is removed from an HTML widget, kept in others', () => {
		const xml = format(
			`${HEAD}<html><b:section id='s'><b:widget id='HTML1' type='HTML'><b:widget-settings><b:widget-setting name='content'> </b:widget-setting></b:widget-settings></b:widget><b:widget id='Label1' type='Label'><b:widget-settings><b:widget-setting name='selectedLabelsList'/></b:widget-settings></b:widget></b:section>${SKIN}</html>`,
		);
		assert.notInclude(xml, "name='content'");
		assert.include(xml, "<b:widget-setting name='selectedLabelsList'/>");
	});
});

describe('values of the Theme Designer, as Blogger reads them', () => {
	const errorsOf = (type: string, value: string, extra = '') => {
		try {
			written(
				`${HEAD}<html><b:skin><![CDATA[/* <Variable name="x" description="X" type="${type}" default="${value}"${extra}/> */]]></b:skin></html>`,
			);
			return [];
		} catch (error) {
			return (error as XmlError).errors.map(({ message }) => message);
		}
	};

	test.each([
		['color', '#fff'],
		['color', '#FFF'],
		['color', '#1234'],
		['color', '#12345'],
		['color', '#123456'],
		['color', 'transparent'],
		['color', 'rgb(1, 2, 300)'],
		['color', 'rgba(0,0,0,0.5)'],
		['length', '0'],
		['length', '1.5px'],
		['length', '-1px'],
		['length', '+1px'],
		['length', '.5em'],
		['length', '00px'],
		[
			'background',
			'#ffffff url(https://example.com/a.png) repeat scroll top left',
		],
		['url', ''],
		['font', 'Arial'],
		['string', ''],
		['automatic', 'x'],
		['color', '$(body.color)'],
		['background', '$(color) url(a.png) repeat scroll top left'],
	])('accepts a %s of %s', (type, value) => {
		assert.deepEqual(errorsOf(type, value), []);
	});

	test.each([
		['color', 'red'],
		['color', '#12'],
		['color', '#1234567'],
		['color', 'TRANSPARENT'],
		['color', 'hsl(0,0%,0%)'],
		['color', 'rgba(1,2,3)'],
		['color', 'rgba(0,0,0,2)'],
		['color', ' #fff '],
		['length', '10'],
		['length', 'auto'],
		['length', '10PX'],
		['length', '1rem'],
		['length', '1.px'],
		['length', '1 px'],
		['background', '#fff'],
		['background', 'none'],
	])('rejects a %s of %s', (type, value) => {
		assert.lengthOf(errorsOf(type, value), 1);
	});

	test('a color can have red, green, blue and alpha, a background a color', () => {
		assert.deepEqual(
			errorsOf('color', '#000', ' red="1" green="1" blue="1" alpha="1"'),
			[],
		);
		assert.deepEqual(
			errorsOf(
				'background',
				'#ffffff url(a.png) repeat scroll top left',
				' color="#000"',
			),
			[],
		);
		assert.lengthOf(errorsOf('color', '#000', ' max="1"'), 1);
		assert.lengthOf(errorsOf('string', 'a', ' red="1"'), 1);
	});
});

describe('includables with the same id in a widget', () => {
	/** A widget with includables `x` and `y`, and `main` when they are not it. */
	const widget = (x: string, y: string) =>
		`${HEAD}<html><b:section id='s'><b:widget id='HTML1' type='HTML'><b:widget-settings><b:widget-setting name='content'>c</b:widget-setting></b:widget-settings>${x === 'main' ? '' : "<b:includable id='main'>m</b:includable>"}<b:includable id='${x}'>X</b:includable><b:includable id='${y}'>Y</b:includable></b:widget></b:section>${SKIN}</html>`;

	// as Blogger was found to save them
	test.each([
		// the same as XML reads them: refused
		['main', 'm&#97;in', ['duplicate-id']],
		['a&amp;b', 'a&#38;b', ['duplicate-id']],
		['a b', 'a\tb', ['duplicate-id']],
		['a b', 'a\nb', ['duplicate-id']],
		['a b', 'a\rb', ['duplicate-id']],
		// the same once saved: one of them kept
		['a', 'a ', ['merged-includable']],
		['a', ' a', ['merged-includable']],
		[' a ', 'a', ['merged-includable']],
		['a', 'a\t', ['merged-includable']],
		['a b', 'a&#9;b', ['merged-includable']],
		['a b', 'a&#10;b', ['merged-includable']],
		['a\tb', 'a&#9;b', ['merged-includable']],
		// different: both kept
		['main', 'Main', []],
		['a b', 'a  b', []],
		['a b', 'a&#160;b', []],
	])('%j and %j', (x, y, codes) => {
		const { errors, warnings } = checkXml(parseXml(widget(x, y)));
		assert.deepEqual(
			[...errors, ...warnings].map(({ code }) => code),
			codes,
		);
	});

	test('the formatted ids are trimmed, and sorted as they are saved', () => {
		const xml = written(widget('  b ', ' a'), { format: true }).xml;
		assert.deepEqual(
			[...xml.matchAll(/<b:includable id='([^']*)'/g)].map(([, id]) => id),
			['main', 'a', 'b'],
		);
	});
});
