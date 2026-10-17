import { assert, describe, test } from 'vitest';
import { DOCTYPE, XML_DECLARATION } from './format';
import { checkAttributes } from './layout';
import { processXml, XmlError } from './process';
import { createLocate, type ScannedAttribute, XmlScanner } from './scanner';

const HEAD = `${XML_DECLARATION}\n${DOCTYPE}\n`;

const format = (xml: string): string => processXml(xml, { format: true }).xml;

describe('processXml with format', () => {
	test('self-closes the elements with nothing in them', () => {
		const cases: [string, string][] = [
			['<html><a></a><b:skin/></html>', '<html><a/><b:skin/></html>'],
			[
				"<html><b:include name='x' data='y'></b:include><b:skin/></html>",
				"<html><b:include data='y' name='x'/><b:skin/></html>",
			],
			['<html><a></a ><b:skin/></html>', '<html><a/><b:skin/></html>'],
			[
				'<html><a><b></b></a><b:skin/></html>',
				'<html><a><b/></a><b:skin/></html>',
			],
			['<html><b:skin></b:skin></html>', '<html><b:skin/></html>'],
			// a space, a line break or a comment is something
			['<html><a> </a><b:skin/></html>', '<html><a> </a><b:skin/></html>'],
			['<html><a>\n</a><b:skin/></html>', '<html><a>\n</a><b:skin/></html>'],
			[
				'<html><a><!-- c --></a><b:skin/></html>',
				'<html><a><!-- c --></a><b:skin/></html>',
			],
		];
		for (const [input, output] of cases) {
			assert.strictEqual(format(HEAD + input), HEAD + output);
		}
	});

	test('puts start tags on a single line with sorted attributes', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html\n  xmlns='x'\n  b:layoutsVersion='3'\n  expr:lang='data:l'>\n<b:skin/></html>`,
			),
			`${HEAD}<html b:layoutsVersion='3' expr:lang='data:l' xmlns='x'>\n<b:skin/></html>`,
		);
	});

	test('self-closing tags lose the space before />', () => {
		assert.strictEqual(
			format(`${HEAD}<html><a><br /></a><b:skin/></html>`),
			`${HEAD}<html><a><br/></a><b:skin/></html>`,
		);
	});

	test('only line breaks in attribute values become spaces', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><a class='x\n    y' title='  two  spaces  '/><b:skin/></html>`,
			),
			`${HEAD}<html><a class='x     y' title='  two  spaces  '/><b:skin/></html>`,
		);
	});

	test('quotes values with single quotes, keeping their entities', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><a b="x &amp; y" a='&#39;' c="it's &quot;q&quot;" d='&quot;'/><b:skin/></html>`,
			),
			`${HEAD}<html><a a='&#39;' b='x &amp; y' c='it&apos;s "q"' d='&quot;'/><b:skin/></html>`,
		);
	});

	test('prints expressions on a single line, in single quotes', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><b:if cond='data:a&amp;&amp;(data:b eq "x")\n  || data:c &lt;2'><a expr:href="data:url  path &quot;y&quot;" expr:title='"it&apos;s"'/></b:if><b:skin/></html>`,
			),
			`${HEAD}<html><b:if cond='data:a and data:b == "x" or data:c &lt; 2'><a expr:href='data:url path "y"' expr:title='"it&apos;s"'/></b:if><b:skin/></html>`,
		);
	});

	test('leaves other attributes as they are', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><b:include cond='data:a&amp;&amp;data:b' data='post' name='a  and'/><b:skin/></html>`,
			),
			`${HEAD}<html><b:include cond='data:a and data:b' data='post' name='a  and'/><b:skin/></html>`,
		);
	});

	test('formats ranges in b:loop values', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><b:loop values='1..20' var='i'/><b:loop values='-2..3' var='j'/><b:skin/></html>`,
			).split('\n')[2],
			`<html><b:loop values='1..20' var='i'/><b:loop values='-2..3' var='j'/><b:skin/></html>`,
		);
	});

	test('formats b:include data, leaving bare names as they are', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><b:include data='data:posts  filter (p =&gt; p.id)' name='x'/><b:include data='post.labels' name='y'/><b:skin/></html>`,
			),
			`${HEAD}<html><b:include data='data:posts filter (p => p.id)' name='x'/><b:include data='post.labels' name='y'/><b:skin/></html>`,
		);
	});

	test('leaves text, comments, CDATA and end tags as they are', () => {
		const body = `<html>
  text   stays
  <!-- <b   z='1' a='2'> -->
  <script>/*<![CDATA[*/ if (a < b) {} /*]]>*/</script>
  <b:skin/>
</html   >`;
		assert.strictEqual(format(HEAD + body), HEAD + body);
	});

	test('adds the missing declarations', () => {
		assert.strictEqual(
			format('<html><b:skin/></html>'),
			`${HEAD}<html><b:skin/></html>`,
		);
		assert.strictEqual(
			format(`${DOCTYPE}\n<html><b:skin/></html>`),
			`${HEAD}<html><b:skin/></html>`,
		);
		assert.strictEqual(
			format(`${XML_DECLARATION}\n<html><b:skin/></html>`),
			`${HEAD}<html><b:skin/></html>`,
		);
	});

	test('moves the declarations to the first two lines', () => {
		assert.strictEqual(
			format(`${XML_DECLARATION}${DOCTYPE}\n<html><b:skin/></html>`),
			`${HEAD}<html><b:skin/></html>`,
		);
		assert.strictEqual(
			format(`${DOCTYPE}\n${XML_DECLARATION}\n<html><b:skin/></html>`),
			`${HEAD}<html><b:skin/></html>`,
		);
		assert.strictEqual(
			format(
				`${XML_DECLARATION}\n<!-- c -->\n${DOCTYPE}\n<html><b:skin/></html>`,
			),
			`${HEAD}<!-- c -->\n<html><b:skin/></html>`,
		);
	});

	test('normalizes the declarations', () => {
		assert.strictEqual(
			format(
				`<?xml version='1.0'?>\n<!doctype   HTML>\n<html><b:skin/></html>`,
			),
			`${HEAD}<html><b:skin/></html>`,
		);
		assert.strictEqual(
			format(
				`<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN"\n  "x.dtd">\n<html><b:skin/></html>`,
			),
			`${XML_DECLARATION}\n<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "x.dtd">\n<html><b:skin/></html>`,
		);
	});

	test('rejects declarations Blogger does not accept', () => {
		assert.throws(
			() => format('<?xml version="1.1"?><html><b:skin/></html>'),
			/version="1.0"/,
		);
		assert.throws(
			() =>
				format(
					'<?xml version="1.0" encoding="ISO-8859-1"?><html><b:skin/></html>',
				),
			/UTF-8/,
		);
		assert.throws(
			() => format('<!DOCTYPE svg><html><b:skin/></html>'),
			/<!DOCTYPE html>/,
		);
		assert.throws(
			() => format(`${DOCTYPE}${DOCTYPE}<html><b:skin/></html>`),
			/only be one doctype/,
		);
		assert.throws(
			() => format(`<html><b:skin/></html>${DOCTYPE}`),
			/before the root element/,
		);
	});

	test('indents the children of widgets and widget settings', () => {
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
<b:skin/></html>`;
		const output = `<html>
  <b:section id='s'>
    <b:widget id='Blog1' type='Blog' version='2'>
      <b:widget-settings>
        <b:widget-setting name='a'>1</b:widget-setting>
        <b:widget-setting name='b'>
              two
        </b:widget-setting></b:widget-settings>
      <b:includable id='main'>
          <div>
                <p>keep</p>
          </div>
        </b:includable></b:widget>
  </b:section>
<b:skin/></html>`;
		assert.strictEqual(format(HEAD + input), HEAD + output);
	});

	test('indents the widgets of a section', () => {
		const input = `<html>
  <b:section id='main'><b:widget id='Blog1' type='Blog' version='2'><b:includable id='main'/></b:widget>    <b:widget id='HTML2' type='HTML' version='2'><b:includable id='main'/></b:widget>
  </b:section>
<b:skin/></html>`;
		const output = `<html>
  <b:section id='main'>
    <b:widget id='Blog1' type='Blog' version='2'>
      <b:includable id='main'/></b:widget>
    <b:widget id='HTML2' type='HTML' version='2'>
      <b:includable id='main'/></b:widget>
  </b:section>
<b:skin/></html>`;
		assert.strictEqual(format(HEAD + input), HEAD + output);
	});
});

describe('Blogger layout', () => {
	test('the root element is <html>', () => {
		try {
			processXml(`${HEAD}<div/>`);
			assert.fail('expected an error');
		} catch (error) {
			assert.strictEqual(
				(error as XmlError).message,
				'The root element has to be <html>, found <div> (3:1)',
			);
			assert.deepEqual((error as XmlError).loc, {
				path: '',
				line: 3,
				column: 1,
			});
		}
	});

	const document = (body: string) => `${HEAD}<html>${body}<b:skin/></html>`;
	const errorOf = (body: string): XmlError => {
		try {
			processXml(document(body));
		} catch (error) {
			return error as XmlError;
		}
		assert.fail(`expected an error for ${body}`);
	};

	test('accepts the b: attributes Blogger knows on the root element', () => {
		processXml(`${HEAD}<html
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
			"b:version='2'",
			"<html> can not have the attribute 'b:version', only 'b:css', 'b:defaultwidgetversion', 'b:js', 'b:layoutsVersion', 'b:responsive', 'b:templateUrl' and 'b:templateVersion'",
			18,
		],
		[
			"b:css='yes'",
			"The attribute 'b:css' of <html> has to be 'true' or 'false', got: 'yes'",
			14,
		],
		[
			"b:responsive='1'",
			"The attribute 'b:responsive' of <html> has to be 'true' or 'false', got: '1'",
			21,
		],
		[
			"b:defaultwidgetversion='3'",
			"The attribute 'b:defaultwidgetversion' of <html> has to be '1' or '2', got: '3'",
			31,
		],
		[
			"b:layoutsVersion='4'",
			"The attribute 'b:layoutsVersion' of <html> has to be '2' or '3', got: '4'",
			25,
		],
	])('rejects <html %s/>', (attribute, message, column) => {
		try {
			processXml(`${HEAD}<html ${attribute}><b:skin/></html>`);
			assert.fail('expected an error');
		} catch (error) {
			assert.strictEqual(
				(error as XmlError).message,
				`${message} (3:${column})`,
			);
			assert.deepEqual((error as XmlError).loc, { path: '', line: 3, column });
		}
	});

	test('accepts sections, widgets, settings and includables', () => {
		processXml(
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
		processXml(
			`${HEAD}<html>
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

		const { warnings } = processXml(xml, { path: 'theme.xml' });
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
		const formatted = processXml(xml, { format: true });
		assert.include(formatted.xml, "<a expr:href='data:blog.url' href='#'/>");
		assert.lengthOf(formatted.warnings, 2);
	});

	test('warns about expr:x of an attribute Blogger reads when saving, it uses x', () => {
		const { warnings } = processXml(
			document(
				`<b:section id='s'><b:widget expr:type='""' id='Blog1' type='Blog'/></b:section>
  <b:loop expr:index='data:i' values='data:a' var='x'/>
  <b:section id='t'><b:widget expr:id='data:x' id='HTML1' type='HTML'/></b:section>`,
			),
		);
		assert.deepEqual(
			warnings.map(({ message, loc }) => [message, loc.line, loc.column]),
			[
				[
					"<b:widget> has both 'type' and 'expr:type', Blogger uses 'type'",
					3,
					67,
				],
				[
					"Blogger ignores 'expr:index' on <b:loop>, 'index' can not be an expression",
					4,
					23,
				],
				["<b:widget> has both 'id' and 'expr:id', Blogger uses 'id'", 5, 52],
			],
		);
	});

	test('warns about the formatted output, where the places are in what is written', () => {
		const { xml, warnings } = processXml(
			`<html><a\n  href='#'\n  expr:href='data:a'/><b:skin/></html>`,
			{ format: true },
		);
		assert.strictEqual(
			xml,
			`${HEAD}<html><a expr:href='data:a' href='#'/><b:skin/></html>`,
		);
		assert.deepEqual(warnings[0].loc, { path: '', line: 3, column: 35 });
	});

	test.each([
		[
			"<b:if cond='true' rel='x'/>",
			"<b:if> has the attribute 'rel', Blogger only reads 'cond'",
			[3, 30],
		],
		[
			"<b:loop value='data:a' values='data:a' var='x'/>",
			"<b:loop> has the attribute 'value', Blogger only reads 'values', 'var' and 'index'",
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
			const { warnings } = processXml(document(body));
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
		const { warnings } = processXml(
			document(
				"<b:section class='a' id='s' maxwidgets='1'/><b:tag class='b' name='div'/>",
			),
		);
		assert.isEmpty(warnings);
	});

	test('accepts <b:elseif>s before one <b:else>, in each <b:if>', () => {
		processXml(
			document(
				"<b:if cond='data:a'>a<b:elseif cond='data:b'/>b<b:elseif cond='data:c'/>c<b:else/>d<b:if cond='data:e'>e<b:else/>f</b:if></b:if><b:if cond='data:g'>g<b:else/>h</b:if>",
			),
		);
	});

	test('accepts <b:case>s before one <b:default>, in each <b:switch>', () => {
		processXml(
			document(
				"<b:switch var='data:a'><b:case value='1'/>a<b:case value='2'/>b<b:default/>c<b:switch var='data:b'><b:case value='3'/>d<b:default/>e</b:switch></b:switch><b:switch var='data:c'><b:default/>f</b:switch>",
			),
		);
	});

	test('accepts the params of a message, and a message without any', () => {
		processXml(
			document(
				"<b:message name='m'>\n  <b:param name='a' value='1'/>\n  <b:param name='b' value='2'/>\n</b:message><b:message name='n'/>",
			),
		);
	});

	test('accepts the elements Blogger has empty, with nothing between their tags', () => {
		const { warnings } = processXml(
			document(
				"<b:if cond='true'>a<b:elseif cond='false'></b:elseif>b<b:else></b:else>c</b:if><b:switch var='data:a'><b:case value='1'></b:case>a<b:default></b:default>b</b:switch><b:message name='m'><b:param name='a' value='1'></b:param></b:message><b:include name='x'></b:include><div><b:attr name='a' value='b'></b:attr><b:class name='c'></b:class></div><b:eval expr='1'></b:eval>",
			),
		);
		assert.isEmpty(warnings);
	});

	test('accepts the id of a widget as its type and any number', () => {
		processXml(
			document(
				"<b:section id='s'><b:widget id='Blog000' type='Blog'/><b:widget id='LinkList010' type='LinkList'/><b:widget id='HTML12' type='HTML'/></b:section>",
			),
		);
	});

	test('a section and a widget can have the same id', () => {
		processXml(
			document(
				"<b:section id='HTML1'><b:widget id='HTML1' type='HTML'/></b:section>",
			),
		);
	});

	test('accepts whitespace in them, tabs and blank lines too', () => {
		processXml(
			document(
				"<b:section id='s'>\n\t\n\t<b:widget id='HTML1' type='HTML'>\r\n\t\t<b:widget-settings>\n\n\t\t\t<b:widget-setting name='a'/>\n\t\t</b:widget-settings>\n\t\t<b:includable id='main'/>\n\t</b:widget>\n\n</b:section>",
			),
		);
	});

	test.each([
		[
			"<b:section id='s'><div/></b:section>",
			'<b:section> can only have <b:widget> in it, found <div>',
			[3, 25],
		],
		[
			"<b:section id='s'>text</b:section>",
			'<b:section> can only have <b:widget> in it, found text',
			[3, 25],
		],
		[
			"<b:section id='s'>&#160;</b:section>",
			'<b:section> can only have <b:widget> in it, found text',
			[3, 25],
		],
		[
			"<b:section id='s'><![CDATA[x]]></b:section>",
			'<b:section> can only have <b:widget> in it, found text',
			[3, 25],
		],
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
			"<b:section id='s'><b:widget id='HTML1' type='HTML'><b:widget-settings><b:widget-setting name='a'/>x</b:widget-settings><b:includable id='main'/></b:widget></b:section>",
			'<b:widget-settings> can only have <b:widget-setting> in it, found text',
			[3, 105],
		],
		[
			"<b:widget-setting name='a'/>",
			'<b:widget-setting> can only be in a <b:widget-settings>, it is in <html>',
			[3, 7],
		],
		[
			'<b:includeable/>',
			'Unknown element <b:includeable>, did you mean <b:includable>?',
			[3, 7],
		],
		['<b:foo/>', 'Unknown element <b:foo>', [3, 7]],
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
			"<b:loop expr:var='data:v' values='data:a'/>",
			"<b:loop> has to have the attribute 'var', 'expr:var' is not used",
			[3, 7],
		],
		[
			'<b:defaultmarkups><p/></b:defaultmarkups>',
			'<b:defaultmarkups> can only have <b:defaultmarkup> in it, found <p>',
			[3, 25],
		],
		[
			'<b:defaultmarkups>text</b:defaultmarkups>',
			'<b:defaultmarkups> can only have <b:defaultmarkup> in it, found text',
			[3, 25],
		],
		[
			"<b:defaultmarkups><b:includable id='main'/></b:defaultmarkups>",
			'<b:includable> can only be in a <b:defaultmarkup> or a <b:widget>, it is in <b:defaultmarkups>',
			[3, 25],
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
			"<b:section expr:id='data:x'/>",
			"<b:section> has to have the attribute 'id', 'expr:id' is not used",
			[3, 7],
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
			"<b:if cond='true'>a<b:else>b</b:else></b:if>",
			'<b:else> has to be empty, as <b:else/>',
			[3, 26],
		],
		[
			"<b:if cond='true'>a<b:else> </b:else>b</b:if>",
			'<b:else> has to be empty, as <b:else/>',
			[3, 26],
		],
		[
			"<b:if cond='true'>a<b:elseif cond='false'><!-- x --></b:elseif></b:if>",
			'<b:elseif> has to be empty, as <b:elseif/>',
			[3, 26],
		],
		[
			"<b:switch var='data:a'><b:case value='1'>a</b:case></b:switch>",
			'<b:case> has to be empty, as <b:case/>',
			[3, 30],
		],
		[
			"<b:switch var='data:a'><b:default>\n</b:default></b:switch>",
			'<b:default> has to be empty, as <b:default/>',
			[3, 30],
		],
		[
			"<div><b:attr name='a' value='b'>x</b:attr></div>",
			'<b:attr> has to be empty, as <b:attr/>',
			[3, 12],
		],
		[
			"<div><b:class name='a'> </b:class></div>",
			'<b:class> has to be empty, as <b:class/>',
			[3, 12],
		],
		[
			"<b:eval expr='1'><!-- x --></b:eval>",
			'<b:eval> has to be empty, as <b:eval/>',
			[3, 7],
		],
		[
			"<b:include name='x'>\n</b:include>",
			'<b:include> has to be empty, as <b:include/>',
			[3, 7],
		],
		[
			"<b:message name='m'><b:param name='a' value='1'>\n</b:param></b:message>",
			'<b:param> has to be empty, as <b:param/>',
			[3, 27],
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
			"<b:if cond='true'>a<b:else/>b<b:elseif cond='false'/>c</b:if>",
			'<b:elseif> can not come after the <b:else> of its <b:if>',
			[3, 36],
		],
		[
			"<b:if cond='true'>a<b:else/>b<b:else/>c</b:if>",
			'<b:if> can only have one <b:else>',
			[3, 36],
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
		[
			"<b:switch var='data:a'><b:default/>a<b:default/>b</b:switch>",
			'<b:switch> can only have one <b:default>',
			[3, 43],
		],
		...['A', 'HTML', 'html1', 'HTML1a', 'Blog1'].map(
			(id) =>
				[
					`<b:section id='s'><b:widget id='${id}' type='HTML'/></b:section>`,
					`The attribute 'id' of <b:widget> has to be 'HTML' and a number, 'HTML1', got: '${id}'`,
					[3, 39],
				] as const,
		),
	] as const)('rejects %s', (body, message, [line, column]) => {
		const error = errorOf(body);
		assert.instanceOf(error, XmlError);
		assert.strictEqual(error.message, `${message} (${line}:${column})`);
		assert.deepEqual(error.loc, { path: '', line, column });
	});
});

describe('skins', () => {
	const errorMessage = (xml: string): string => {
		try {
			processXml(xml);
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
			`${HEAD}<html><b:skin/><b:template-skin/><b:template-skin/></html>`,
			'There can only be one <b:template-skin> (3:34)',
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
			`${HEAD}<html><b:skin/><b:template-skin><![CDATA[a]]><div/></b:template-skin></html>`,
			'<b:template-skin> can only have text and CDATA in it, found <div> (3:46)',
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
			processXml(
				`${HEAD}<html>${skin}<b:template-skin>a</b:template-skin></html>`,
			);
		}
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
		['<b:skin></b:skin>', '<b:skin/>'],
		// a ']]>' the text makes ends a section and starts another
		[
			'<b:skin><![CDATA[a]]]]>&gt;b</b:skin>',
			'<b:skin><![CDATA[a]]]]><![CDATA[>b]]></b:skin>',
		],
		[
			'<b:skin/><b:template-skin>\n  a &amp; b\n</b:template-skin>',
			'<b:skin/><b:template-skin><![CDATA[\n  a & b\n]]></b:template-skin>',
		],
	])('formats %s in a single CDATA section', (input, output) => {
		assert.strictEqual(
			format(`${HEAD}<html>${input}</html>`),
			`${HEAD}<html>${output}</html>`,
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
		const { warnings } = processXml(
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
			processXml(xml);
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
		`<Variable name='${name}' description='${description}' type='color' default='#000'/>`;

	test('reads the tags of the text and of the CDATA sections, as Blogger does', () => {
		assert.deepEqual(
			placesOf(
				raw(
					"&lt;Group description=&apos;hi&apos;&gt;&lt;/Group&gt;\n<![CDATA[<Group description='hi'></Group>]]>",
				),
			),
			[["There can only be one <Group> with the description 'hi'", 5, 10]],
		);
	});

	test.each([
		[
			`<Group description='g'>\n  b ${variable('b')}\n</Group>`,
			[['<Group> can only have <Variable> in it, found text', 5, 3]],
		],
		[
			"<Group description='  '/>",
			[["The attribute 'description' of <Group> can not be empty", 4, 21]],
		],
		[
			"<Variable name='a' description='' type='color' default='#000'/>",
			[["The attribute 'description' of <Variable> can not be empty", 4, 33]],
		],
		[
			"<Variable name=' ' description='a' type='color' default='#000'/>",
			[["The attribute 'name' of <Variable> can not be empty", 4, 17]],
		],
		...['a-b', 'a b', 'é'].map((name): [string, (string | number)[][]] => [
			`<Variable name='${name}' description='a' type='color' default='#000'/>`,
			[
				[
					`The attribute 'name' of <Variable> can only have letters, digits and dots, got: '${name}'`,
					4,
					17,
				],
			],
		]),
		[
			`${variable(' a ', 'x')}\n${variable('a', 'y')}`,
			[["There can only be one <Variable> named 'a'", 5, 1]],
		],
		[
			`<Group description=' g '/><Group description='g'/>`,
			[["There can only be one <Group> with the description 'g'", 4, 27]],
		],
		[
			'<!-- <a -->',
			[
				[
					"Expected '>' to end the tag <a> in <b:skin>, found '-': Blogger reads '<' and a name as a tag, '< a' is text",
					4,
					6,
				],
			],
		],
		[
			`<Group description='g'><Group description='h'/></Group>`,
			[['<Group> can not be in a <Group>', 4, 24]],
		],
		[`<Group description='g'>`, [['<Group> is not closed', 4, 1]]],
		['</Group>', [['</Group> has no <Group> to close', 4, 1]]],
		[
			`<Group>${variable('a')}</Group>`,
			[["<Group> has to have the attribute 'description'", 4, 1]],
		],
		[
			"<Variable name='a'/>",
			[
				["<Variable> has to have the attribute 'description'", 4, 1],
				["<Variable> has to have the attribute 'type'", 4, 1],
				["<Variable> has to have the attribute 'default'", 4, 1],
			],
		],
		[
			"<Variable name='a' description='a' type='colour' default='#000'/>",
			[["Unknown <Variable> type 'colour', did you mean 'color'?", 4, 42]],
		],
		[
			`${variable('a', 'x')}\n${variable('a', 'y')}`,
			[["There can only be one <Variable> named 'a'", 5, 1]],
		],
		[
			`${variable('a', 'x')}\n${variable('b', 'x')}`,
			[
				[
					"There can only be one <Variable> with the description 'x' out of a <Group>",
					5,
					1,
				],
			],
		],
		[
			`<Group description='g'>${variable('a', 'x')}${variable('b', 'x')}</Group>`,
			[
				[
					"There can only be one <Variable> with the description 'x' in the <Group> 'g'",
					4,
					88,
				],
			],
		],
		[
			"<Variable name='a' description='a' type='color' default='#000'>",
			[['<Variable> is not closed', 4, 1]],
		],
		[
			"<Variable name='a' name='b' description='a' type='color' default='#000'/>",
			[["Duplicate attribute 'name' in <Variable>", 4, 26]],
		],
		[
			'<Variable name=a/>',
			[
				[
					"The attribute 'name' of <Variable> in <b:skin> has to be quoted: name='...'",
					4,
					11,
				],
			],
		],
		[
			'<Variable hidden/>',
			[
				[
					"The attribute 'hidden' of <Variable> in <b:skin> has no value: hidden='...'",
					4,
					11,
				],
			],
		],
		[
			"<Group description='hi'>\n  <V\n</Group>",
			[
				[
					"Expected '>' to end the tag <V> in <b:skin>, found '<': Blogger reads '<' and a name as a tag, '< V' is text",
					5,
					3,
				],
			],
		],
		[
			'<V',
			[
				[
					"Expected '>' to end the tag <V> in <b:skin>, found the end of the skin: Blogger reads '<' and a name as a tag, '< V' is text",
					4,
					1,
				],
			],
		],
		[
			'a { b: c<d }',
			[
				[
					"Expected '>' to end the tag <d> in <b:skin>, found '}': Blogger reads '<' and a name as a tag, '< d' is text",
					4,
					9,
				],
			],
		],
		[
			'</a',
			[
				[
					"Expected '>' to end the tag </a> in <b:skin>, found the end of the skin",
					4,
					1,
				],
			],
		],
		['<a><b></a>', [['Expected </b> to close <b>, found </a>', 4, 7]]],
		['<a>', [['<a> is not closed', 4, 1]]],
		['</a>', [['</a> has no <a> to close', 4, 1]]],
		[
			`<Group description='g'><a/>${variable('a')}</Group>`,
			[['<Group> can only have <Variable> in it, found <a>', 4, 24]],
		],
	])('rejects %s', (skin, places) => {
		assert.deepEqual(placesOf(theme(skin)), places);
	});

	test('reads < and a name as a tag, anything else as text', () => {
		const { info } = processXml(
			theme(
				`a < b, c > d, e<f/>g<h class='i'>j</h>\n<k>${variable('a')}</k><!-- <l/> -->`,
			),
		);
		assert.deepEqual(
			info.variables.map(({ name, group }) => [name, group]),
			[['a', undefined]],
		);
	});

	test('a group can have comments in it, and the tags in them are read', () => {
		const { warnings, info } = processXml(
			theme(`<Group description='g'>\n  <!-- ${variable('a')} -->\n</Group>`),
		);
		assert.isEmpty(warnings);
		assert.deepEqual(
			info.variables.map(({ name, group }) => [name, group]),
			[['a', 'g']],
		);
	});

	test('a description can be in each group once, and out of them', () => {
		processXml(
			theme(
				`${variable('a', 'x')}<Group description='g'>${variable('b', 'x')}</Group><Group description='h'><!-- c -->${variable('c', 'x')}</Group>`,
			),
		);
	});

	test('warns about an attribute the type does not have, and a variable with something in it', () => {
		const { warnings } = processXml(
			theme(
				"<Variable name='a' description='a' type='color' default='#000' min='1px'/>\n<Variable name='b' description='b' type='string' default=''> </Variable>",
			),
		);
		assert.deepEqual(
			warnings.map(({ message, loc }) => [message, loc.line, loc.column]),
			[
				[
					"<Variable type='color'> has the attribute 'min', Blogger only reads 'name', 'description', 'type', 'default', 'value' and 'hideEditor'",
					4,
					69,
				],
				['<Variable> should be empty, as <Variable/>', 5, 1],
			],
		);
	});

	test('are in the info, with the description of their group', () => {
		const { info } = processXml(
			theme(
				`<Group description='Colors' selector='body'>\n  <Variable name="text" description="Text &amp;amp; links" type="color" default="#000" value="#111"/>\n</Group>\n${variable('b')}`,
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
				attributes: {
					name: 'text',
					description: 'Text &amp; links',
					type: 'color',
					default: '#000',
					value: '#111',
				},
				loc: { path: '', line: 5, column: 3 },
			},
			{
				name: 'b',
				type: 'color',
				description: 'b',
				attributes: {
					name: 'b',
					description: 'b',
					type: 'color',
					default: '#000',
				},
				loc: { path: '', line: 7, column: 1 },
			},
		]);
	});

	test('their name and description are trimmed, in the info too', () => {
		const { info } = processXml(
			theme(
				"<Group description=' g '><Variable name=' a.b1 ' description=' x ' type='string' default=' '/></Group>",
			),
		);
		assert.deepEqual(
			info.groups.map(({ description }) => description),
			['g'],
		);
		assert.deepEqual(
			info.variables.map(({ name, description, group, attributes }) => [
				name,
				description,
				group,
				attributes.default,
			]),
			[['a.b1', 'x', 'g', ' ']],
		);
	});

	test('are formatted as the other tags, in the CDATA section', () => {
		const { xml } = processXml(
			raw(
				`&lt;Group description=" a "&gt;\n  <![CDATA[<Variable name=" x.1 " type="string"\n    description="  it's  " default=' ' value=' y '></Variable>]]>\n&lt;/Group  &gt;&lt;Group description='b'&gt;&lt;/Group&gt;`,
			),
			{ format: true },
		);
		assert.strictEqual(
			xml,
			`${HEAD}<html><b:skin><![CDATA[\n<Group description='a'>\n  <Variable default=' ' description='it&apos;s' name='x.1' type='string' value=' y '/>\n</Group><Group description='b'/>\n]]></b:skin></html>`,
		);
		assert.strictEqual(format(xml), xml);
	});

	test('are placed in the formatted output', () => {
		const { warnings, info } = processXml(
			theme(
				"<Variable\n  type='color' name='a' description='a' default='#000' min='1px'/>",
			),
			{ format: true },
		);
		assert.deepEqual(warnings[0].loc, { path: '', line: 4, column: 47 });
		assert.deepEqual(info.variables[0].loc, { path: '', line: 4, column: 1 });
	});

	test('are read from <b:skin> only', () => {
		const { xml, info } = processXml(
			`${HEAD}<html><b:skin/><b:template-skin>&lt;Variable  name="a"/&gt;</b:template-skin></html>`,
			{ format: true },
		);
		assert.include(xml, '<![CDATA[<Variable  name="a"/>]]>');
		assert.isEmpty(info.variables);
	});
});

describe('processXml', () => {
	test('accepts a formatted document', () => {
		processXml(format('<html><p/><b:skin/></html>'));
	});

	test('checks the contents of the declarations', () => {
		const cases: [string, RegExp][] = [
			[
				`<?xml version="1.1"?>\n${DOCTYPE}\n<html><b:skin/></html>`,
				/version="1.0"/,
			],
			[
				`<?xml version="1.0" encoding="ISO-8859-1"?>\n${DOCTYPE}\n<html><b:skin/></html>`,
				/encoding 'ISO-8859-1'/,
			],
			[
				`${XML_DECLARATION}\n<!DOCTYPE svg>\n<html><b:skin/></html>`,
				/doctype has to be/,
			],
		];
		for (const [xml, message] of cases) {
			assert.throws(() => processXml(xml), XmlError);
			assert.throws(() => processXml(xml), message);
		}
		processXml(`<?xml version='1.0'?>\n${DOCTYPE}\n<html><b:skin/></html>`);
	});

	test('requires the declarations on the first two lines', () => {
		assert.throws(
			() => processXml('<html><b:skin/></html>'),
			/first line has to be/,
		);
		assert.throws(
			() => processXml(`${XML_DECLARATION}${DOCTYPE}\n<html><b:skin/></html>`),
			/alone on the first line/,
		);
		assert.throws(
			() => processXml(`${XML_DECLARATION}\n<html><b:skin/></html>`),
			/second line has to be the doctype/,
		);
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
			assert.throws(() => processXml(HEAD + body), XmlError);
			assert.throws(() => processXml(HEAD + body), message);
		}
	});

	test('accepts valid expressions, with their entities decoded', () => {
		processXml(
			`${HEAD}<html expr:lang='data:blog.locale'>
  <b:if cond='data:a &amp;&amp; data:b &lt; 2'><b:elseif cond="data:c == &quot;x&quot;"/></b:if>
  <b:loop values='data:posts' var='post'><b:eval expr='data:post.title'/></b:loop>
  <b:with value='[1, 2]' var='list'><b:switch var='data:blog.pageType'/></b:with>
  <b:include data='post' name='x' cond='data:post'/>
  <b:section id='s' cond='data:view.isHomepage'/>
<b:skin/></html>`,
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
			assert.throws(() => processXml(HEAD + body), XmlError);
			assert.throws(() => processXml(HEAD + body), message);
			assert.throws(() => format(HEAD + body), message);
		}
	});

	test('leaves other attributes alone', () => {
		processXml(
			`${HEAD}<html><b:include data='post' name='a and'/><b:skin/></html>`,
		);
	});

	test('XmlError has the position', () => {
		try {
			processXml(`${HEAD}<html>\n  <b></html>`);
			assert.fail('expected an error');
		} catch (error) {
			assert.instanceOf(error, XmlError);
			assert.deepEqual(error.loc, { path: '', line: 4, column: 6 });
			assert.match(error.message, / \(4:6\)$/);
		}
	});

	test('XmlError has the path of the document when it is given', () => {
		try {
			processXml(`${HEAD}<html>\n  <b></html>`, {
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
			processXml(xml, { path: 'theme.xml' });
		} catch (error) {
			assert.instanceOf(error, XmlError);
			return error;
		}
		assert.fail('expected an error');
	};
	const placesOf = (error: XmlError) =>
		error.errors.map(({ message, loc }) => [message, loc.line, loc.column]);

	test('are reported together, in the order of the document', () => {
		const error = errorsOf(`${HEAD}<html b:css='yes'>
  <b:loop var='x'/>
  <b:section id='s'><div/>text</b:section>
<b:skin/></html>`);
		assert.deepEqual(placesOf(error), [
			[
				"The attribute 'b:css' of <html> has to be 'true' or 'false', got: 'yes'",
				3,
				14,
			],
			["<b:loop> has to have the attribute 'values'", 4, 3],
			['<b:section> can only have <b:widget> in it, found <div>', 5, 21],
			['<b:section> can only have <b:widget> in it, found text', 5, 27],
		]);
		assert.deepEqual(error.loc, error.errors[0].loc);
		assert.strictEqual(
			error.message,
			`4 errors:\n${error.errors.map(({ message, loc }) => `  ${message} (theme.xml:${loc.line}:${loc.column})`).join('\n')}`,
		);
	});

	test('are reported with the syntax error that stops the scan', () => {
		const error = errorsOf(`${HEAD}<html><b:foo/><b></html>`);
		assert.deepEqual(placesOf(error), [
			['Unknown element <b:foo>', 3, 7],
			['Expected </b> to close <b> (opened at 3:15), found </html>', 3, 18],
		]);
	});

	test('of the declarations are reported together', () => {
		const error = errorsOf('<?xml version="1.1"?><html><b:skin/></html>');
		assert.deepEqual(placesOf(error), [
			['The XML declaration has to have version="1.0", got: \'1.1\'', 1, 1],
			['The XML declaration has to be alone on the first line', 1, 22],
			['The second line has to be the doctype, <!DOCTYPE html>', 2, 1],
		]);
	});

	test('one error has its message alone', () => {
		const error = errorsOf(`${HEAD}<html><b:foo/><b:skin/></html>`);
		assert.strictEqual(
			error.message,
			'Unknown element <b:foo> (theme.xml:3:7)',
		);
	});
});

describe('info', () => {
	test('tells what the theme is made of', () => {
		const { info } = processXml(
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
		const { xml, warnings, info } = processXml(
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
			[placeOf(xml, "T' type="), placeOf(xml, "#'/>")],
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
		const { xml, warnings } = processXml(
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
	const check = (others: 'allow' | 'warn' | 'error') => {
		const reported: string[] = [];
		checkAttributes(
			'b:x',
			{ required: ['a'], others, known: new Set(['a']) },
			[attribute('a', 1), attribute('b', 2)],
			{
				error: (message, offset) =>
					reported.push(`error ${offset}: ${message}`),
				warn: (message, offset) => reported.push(`warn ${offset}: ${message}`),
			},
			0,
		);
		return reported;
	};

	test('another attribute is allowed, a warning or an error, as others says', () => {
		assert.deepEqual(check('allow'), []);
		assert.deepEqual(check('warn'), [
			"warn 2: <b:x> has the attribute 'b', Blogger only reads 'a'",
		]);
		assert.deepEqual(check('error'), [
			"error 2: <b:x> can not have the attribute 'b', only 'a'",
		]);
	});
});
