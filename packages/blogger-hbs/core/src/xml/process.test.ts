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
			['<html><a></a></html>', '<html><a/></html>'],
			[
				"<html><b:include name='x' data='y'></b:include></html>",
				"<html><b:include data='y' name='x'/></html>",
			],
			['<html><a></a ></html>', '<html><a/></html>'],
			['<html><a><b></b></a></html>', '<html><a><b/></a></html>'],
			['<html></html>', '<html/>'],
			// a space, a line break or a comment is something
			['<html><a> </a></html>', '<html><a> </a></html>'],
			['<html><a>\n</a></html>', '<html><a>\n</a></html>'],
			['<html><a><!-- c --></a></html>', '<html><a><!-- c --></a></html>'],
		];
		for (const [input, output] of cases) {
			assert.strictEqual(format(HEAD + input), HEAD + output);
		}
	});

	test('puts start tags on a single line with sorted attributes', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html\n  xmlns='x'\n  b:layoutsVersion='3'\n  expr:lang='data:l'>\n</html>`,
			),
			`${HEAD}<html b:layoutsVersion='3' expr:lang='data:l' xmlns='x'>\n</html>`,
		);
	});

	test('self-closing tags lose the space before />', () => {
		assert.strictEqual(
			format(`${HEAD}<html><a><br /></a></html>`),
			`${HEAD}<html><a><br/></a></html>`,
		);
	});

	test('only line breaks in attribute values become spaces', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><a class='x\n    y' title='  two  spaces  '/></html>`,
			),
			`${HEAD}<html><a class='x     y' title='  two  spaces  '/></html>`,
		);
	});

	test('quotes values with single quotes, keeping their entities', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><a b="x &amp; y" a='&#39;' c="it's &quot;q&quot;" d='&quot;'/></html>`,
			),
			`${HEAD}<html><a a='&#39;' b='x &amp; y' c='it&apos;s "q"' d='&quot;'/></html>`,
		);
	});

	test('prints expressions on a single line, in single quotes', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><b:if cond='data:a&amp;&amp;(data:b eq "x")\n  || data:c &lt;2'><a expr:href="data:url  path &quot;y&quot;" expr:title='"it&apos;s"'/></b:if></html>`,
			),
			`${HEAD}<html><b:if cond='data:a and data:b == "x" or data:c &lt; 2'><a expr:href='data:url path "y"' expr:title='"it&apos;s"'/></b:if></html>`,
		);
	});

	test('leaves other attributes as they are', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><b:include cond='data:a&amp;&amp;data:b' data='post' name='a  and'/></html>`,
			),
			`${HEAD}<html><b:include cond='data:a and data:b' data='post' name='a  and'/></html>`,
		);
	});

	test('formats ranges in b:loop values', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><b:loop values='1..20' var='i'/><b:loop values='-2..3' var='j'/></html>`,
			).split('\n')[2],
			`<html><b:loop values='1..20' var='i'/><b:loop values='-2..3' var='j'/></html>`,
		);
	});

	test('formats b:include data, leaving bare names as they are', () => {
		assert.strictEqual(
			format(
				`${HEAD}<html><b:include data='data:posts  filter (p =&gt; p.id)' name='x'/><b:include data='post.labels' name='y'/></html>`,
			),
			`${HEAD}<html><b:include data='data:posts filter (p => p.id)' name='x'/><b:include data='post.labels' name='y'/></html>`,
		);
	});

	test('leaves text, comments, CDATA and end tags as they are', () => {
		const body = `<html>
  text   stays
  <!-- <b   z='1' a='2'> -->
  <script>/*<![CDATA[*/ if (a < b) {} /*]]>*/</script>
</html   >`;
		assert.strictEqual(format(HEAD + body), HEAD + body);
	});

	test('adds the missing declarations', () => {
		assert.strictEqual(format('<html/>'), `${HEAD}<html/>`);
		assert.strictEqual(format(`${DOCTYPE}\n<html/>`), `${HEAD}<html/>`);
		assert.strictEqual(format(`${XML_DECLARATION}\n<html/>`), `${HEAD}<html/>`);
	});

	test('moves the declarations to the first two lines', () => {
		assert.strictEqual(
			format(`${XML_DECLARATION}${DOCTYPE}\n<html/>`),
			`${HEAD}<html/>`,
		);
		assert.strictEqual(
			format(`${DOCTYPE}\n${XML_DECLARATION}\n<html/>`),
			`${HEAD}<html/>`,
		);
		assert.strictEqual(
			format(`${XML_DECLARATION}\n<!-- c -->\n${DOCTYPE}\n<html/>`),
			`${HEAD}<!-- c -->\n<html/>`,
		);
	});

	test('normalizes the declarations', () => {
		assert.strictEqual(
			format(`<?xml version='1.0'?>\n<!doctype   HTML>\n<html/>`),
			`${HEAD}<html/>`,
		);
		assert.strictEqual(
			format(
				`<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN"\n  "x.dtd">\n<html/>`,
			),
			`${XML_DECLARATION}\n<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "x.dtd">\n<html/>`,
		);
	});

	test('rejects declarations Blogger does not accept', () => {
		assert.throws(
			() => format('<?xml version="1.1"?><html/>'),
			/version="1.0"/,
		);
		assert.throws(
			() => format('<?xml version="1.0" encoding="ISO-8859-1"?><html/>'),
			/UTF-8/,
		);
		assert.throws(() => format('<!DOCTYPE svg><html/>'), /<!DOCTYPE html>/);
		assert.throws(
			() => format(`${DOCTYPE}${DOCTYPE}<html/>`),
			/only be one doctype/,
		);
		assert.throws(() => format(`<html/>${DOCTYPE}`), /before the root element/);
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
</html>`;
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
</html>`;
		assert.strictEqual(format(HEAD + input), HEAD + output);
	});

	test('indents the widgets of a section', () => {
		const input = `<html>
  <b:section id='main'><b:widget id='Blog1' type='Blog' version='2'><b:includable id='main'/></b:widget>    <b:widget id='HTML2' type='HTML' version='2'><b:includable id='main'/></b:widget>
  </b:section>
</html>`;
		const output = `<html>
  <b:section id='main'>
    <b:widget id='Blog1' type='Blog' version='2'>
      <b:includable id='main'/></b:widget>
    <b:widget id='HTML2' type='HTML' version='2'>
      <b:includable id='main'/></b:widget>
  </b:section>
</html>`;
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

	const document = (body: string) => `${HEAD}<html>${body}</html>`;
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
/>`);
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
			processXml(`${HEAD}<html ${attribute}/>`);
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
			document(`
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
`),
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
			`<html><a\n  href='#'\n  expr:href='data:a'/></html>`,
			{ format: true },
		);
		assert.strictEqual(
			xml,
			`${HEAD}<html><a expr:href='data:a' href='#'/></html>`,
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

	test('accepts the id of a widget as its type and any number', () => {
		processXml(
			document(
				"<b:section id='s'><b:widget id='Blog000' type='Blog'/><b:widget id='LinkList010' type='LinkList'/><b:widget id='HTML12' type='HTML'/></b:section>",
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
			"<div><b:defaultmarkup type='Common'/></div>",
			'<b:defaultmarkup> can only be in a <b:defaultmarkups>, it is in <div>',
			[3, 12],
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

describe('processXml', () => {
	test('accepts a formatted document', () => {
		processXml(format('<html><p/></html>'));
	});

	test('checks the contents of the declarations', () => {
		const cases: [string, RegExp][] = [
			[`<?xml version="1.1"?>\n${DOCTYPE}\n<html/>`, /version="1.0"/],
			[
				`<?xml version="1.0" encoding="ISO-8859-1"?>\n${DOCTYPE}\n<html/>`,
				/encoding 'ISO-8859-1'/,
			],
			[`${XML_DECLARATION}\n<!DOCTYPE svg>\n<html/>`, /doctype has to be/],
		];
		for (const [xml, message] of cases) {
			assert.throws(() => processXml(xml), XmlError);
			assert.throws(() => processXml(xml), message);
		}
		processXml(`<?xml version='1.0'?>\n${DOCTYPE}\n<html/>`);
	});

	test('requires the declarations on the first two lines', () => {
		assert.throws(() => processXml('<html/>'), /first line has to be/);
		assert.throws(
			() => processXml(`${XML_DECLARATION}${DOCTYPE}\n<html/>`),
			/alone on the first line/,
		);
		assert.throws(
			() => processXml(`${XML_DECLARATION}\n<html/>`),
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
</html>`,
		);
	});

	test('reports invalid expressions where they are', () => {
		const cases: [string, RegExp][] = [
			[
				`<html><b:if cond='data:a and'/></html>`,
				/Invalid expression in the attribute 'cond' of <b:if>: .* \(3:29\)/,
			],
			[`<html><a expr:href='data:a +'/></html>`, /'expr:href' of <a>/],
			[
				`<html><b:section id='s' cond='data:a and'/></html>`,
				/'cond' of <b:section>/,
			],
			[
				`<html><b:include data='data:a +' name='x'/></html>`,
				/'data' of <b:include>/,
			],
			[
				`<html><b:include data='post title' name='x'/></html>`,
				/'data' of <b:include>/,
			],
			[`<html><b:loop values='foo' var='x'/></html>`, /'values' of <b:loop>/],
			[
				`<html><b:loop values='1..data:n' var='x'/></html>`,
				/'values' of <b:loop>/,
			],
			[
				`<html><b:loop values='1 .. 20' var='x'/></html>`,
				/range in the attribute 'values' of <b:loop>, it can not have spaces: '1\.\.20' \(3:23\)/,
			],
			[`<html><b:loop values=' 1..20' var='x'/></html>`, /can not have spaces/],
			[`<html><b:eval expr='&quot;x'/></html>`, /'expr' of <b:eval>.*\(3:21\)/],
			// places after entities, and after one decoded to two UTF-16 units
			[
				`<html><b:if cond='&quot;a&quot; and'/></html>`,
				/'cond' of <b:if>: .* \(3:36\)/,
			],
			[
				`<html><b:if cond='&quot;&#x1F600;&quot; +'/></html>`,
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
		processXml(`${HEAD}<html><b:include data='post' name='a and'/></html>`);
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
			processXml(`${HEAD}<html>\n  <b></html>`, { path: 'dist/theme.xml' });
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
</html>`);
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
		const error = errorsOf('<?xml version="1.1"?><html/>');
		assert.deepEqual(placesOf(error), [
			['The XML declaration has to have version="1.0", got: \'1.1\'', 1, 1],
			['The XML declaration has to be alone on the first line', 1, 22],
			['The second line has to be the doctype, <!DOCTYPE html>', 2, 1],
		]);
	});

	test('one error has its message alone', () => {
		const error = errorsOf(`${HEAD}<html><b:foo/></html>`);
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
</html>`,
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
			"<html><b:if cond='true'></b:if><a href='#' expr:href='data:a'></a></html>",
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
</html>`,
		`${HEAD}<html><!-- a -- b --></html>`,
		`${HEAD}<html><![CDATA[a ] ]] ]]]></html>`,
		`${HEAD}<html title='a < b'/>`,
		`${HEAD}<html>a & b</html>`,
		`${HEAD}<html   lang = "en"  xmlns:b='x'><p   class='a&quot;b&#x41;c&#128512;'  >x</p   ><b:widget-settings
  /></html>`,
		`${HEAD}<html>&${'a'.repeat(40)};</html>`,
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
