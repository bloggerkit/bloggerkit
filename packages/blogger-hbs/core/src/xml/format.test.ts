import { assert, describe, test } from 'vitest';
import {
	DOCTYPE,
	formatXml,
	validateXml,
	XML_DECLARATION,
	XmlError,
} from './format';

const HEAD = `${XML_DECLARATION}\n${DOCTYPE}\n`;

describe('formatXml', () => {
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
			assert.strictEqual(formatXml(HEAD + input), HEAD + output);
		}
	});

	test('puts start tags on a single line with sorted attributes', () => {
		assert.strictEqual(
			formatXml(
				`${HEAD}<html\n  xmlns='x'\n  b:layoutsVersion='3'\n  expr:lang='data:l'>\n</html>`,
			),
			`${HEAD}<html b:layoutsVersion='3' expr:lang='data:l' xmlns='x'>\n</html>`,
		);
	});

	test('self-closing tags lose the space before />', () => {
		assert.strictEqual(
			formatXml(`${HEAD}<html><a><br /></a></html>`),
			`${HEAD}<html><a><br/></a></html>`,
		);
	});

	test('only line breaks in attribute values become spaces', () => {
		assert.strictEqual(
			formatXml(
				`${HEAD}<html><a class='x\n    y' title='  two  spaces  '/></html>`,
			),
			`${HEAD}<html><a class='x     y' title='  two  spaces  '/></html>`,
		);
	});

	test('quotes values with single quotes, keeping their entities', () => {
		assert.strictEqual(
			formatXml(
				`${HEAD}<html><a b="x &amp; y" a='&#39;' c="it's &quot;q&quot;" d='&quot;'/></html>`,
			),
			`${HEAD}<html><a a='&#39;' b='x &amp; y' c='it&apos;s "q"' d='&quot;'/></html>`,
		);
	});

	test('prints expressions on a single line, in single quotes', () => {
		assert.strictEqual(
			formatXml(
				`${HEAD}<html><b:if cond='data:a&amp;&amp;(data:b eq "x")\n  || data:c &lt;2'><a expr:href="data:url  path &quot;y&quot;" expr:title='"it&apos;s"'/></b:if></html>`,
			),
			`${HEAD}<html><b:if cond='data:a and data:b == "x" or data:c &lt; 2'><a expr:href='data:url path "y"' expr:title='"it&apos;s"'/></b:if></html>`,
		);
	});

	test('leaves other attributes as they are', () => {
		assert.strictEqual(
			formatXml(
				`${HEAD}<html><b:include cond='data:a&amp;&amp;data:b' data='post' name='a  and'/></html>`,
			),
			`${HEAD}<html><b:include cond='data:a and data:b' data='post' name='a  and'/></html>`,
		);
	});

	test('formats ranges in b:loop values', () => {
		assert.strictEqual(
			formatXml(
				`${HEAD}<html><b:loop values='1..20' var='i'/><b:loop values='-2..3' var='j'/></html>`,
			).split('\n')[2],
			`<html><b:loop values='1..20' var='i'/><b:loop values='-2..3' var='j'/></html>`,
		);
	});

	test('formats b:include data, leaving bare names as they are', () => {
		assert.strictEqual(
			formatXml(
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
		assert.strictEqual(formatXml(HEAD + body), HEAD + body);
	});

	test('adds the missing declarations', () => {
		assert.strictEqual(formatXml('<html/>'), `${HEAD}<html/>`);
		assert.strictEqual(formatXml(`${DOCTYPE}\n<html/>`), `${HEAD}<html/>`);
		assert.strictEqual(
			formatXml(`${XML_DECLARATION}\n<html/>`),
			`${HEAD}<html/>`,
		);
	});

	test('moves the declarations to the first two lines', () => {
		assert.strictEqual(
			formatXml(`${XML_DECLARATION}${DOCTYPE}\n<html/>`),
			`${HEAD}<html/>`,
		);
		assert.strictEqual(
			formatXml(`${DOCTYPE}\n${XML_DECLARATION}\n<html/>`),
			`${HEAD}<html/>`,
		);
		assert.strictEqual(
			formatXml(`${XML_DECLARATION}\n<!-- c -->\n${DOCTYPE}\n<html/>`),
			`${HEAD}<!-- c -->\n<html/>`,
		);
	});

	test('normalizes the declarations', () => {
		assert.strictEqual(
			formatXml(`<?xml version='1.0'?>\n<!doctype   HTML>\n<html/>`),
			`${HEAD}<html/>`,
		);
		assert.strictEqual(
			formatXml(
				`<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN"\n  "x.dtd">\n<html/>`,
			),
			`${XML_DECLARATION}\n<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "x.dtd">\n<html/>`,
		);
	});

	test('rejects declarations Blogger does not accept', () => {
		assert.throws(
			() => formatXml('<?xml version="1.1"?><html/>'),
			/version="1.0"/,
		);
		assert.throws(
			() => formatXml('<?xml version="1.0" encoding="ISO-8859-1"?><html/>'),
			/UTF-8/,
		);
		assert.throws(() => formatXml('<!DOCTYPE svg><html/>'), /<!DOCTYPE html>/);
		assert.throws(
			() => formatXml(`${DOCTYPE}${DOCTYPE}<html/>`),
			/only be one doctype/,
		);
		assert.throws(
			() => formatXml(`<html/>${DOCTYPE}`),
			/before the root element/,
		);
	});

	test('indents the children of widgets and widget settings', () => {
		const input = `<html>
  <b:section id='s'>
    <b:widget id='A' type='Blog' version='2'><b:widget-settings>
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
    <b:widget id='A' type='Blog' version='2'>
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
		assert.strictEqual(formatXml(HEAD + input), HEAD + output);
	});

	test('indents the widgets of a section', () => {
		const input = `<html>
  <b:section id='main'><b:widget id='A' type='Blog' version='2'><b:includable id='main'/></b:widget>    <b:widget id='B' type='HTML' version='2'><b:includable id='main'/></b:widget>
  </b:section>
</html>`;
		const output = `<html>
  <b:section id='main'>
    <b:widget id='A' type='Blog' version='2'>
      <b:includable id='main'/></b:widget>
    <b:widget id='B' type='HTML' version='2'>
      <b:includable id='main'/></b:widget>
  </b:section>
</html>`;
		assert.strictEqual(formatXml(HEAD + input), HEAD + output);
	});
});

describe('Blogger layout', () => {
	test('the root element is <html>', () => {
		try {
			validateXml(`${HEAD}<div/>`);
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
			validateXml(document(body));
		} catch (error) {
			return error as XmlError;
		}
		assert.fail(`expected an error for ${body}`);
	};

	test('accepts the b: attributes Blogger knows on the root element', () => {
		validateXml(`${HEAD}<html
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
			validateXml(`${HEAD}<html ${attribute}/>`);
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
		validateXml(
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
		validateXml(
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
		const warnings: string[] = [];
		const onWarn = (message: string) => warnings.push(message);
		const xml = document(
			"<a expr:href='data:blog.url' href='#'/><b:class expr:name='data:a' name='b'/><img src='a.png'/>",
		);

		validateXml(xml, { onWarn, path: 'theme.xml' });
		assert.deepEqual(warnings, [
			"<a> has both 'href' and 'expr:href', Blogger uses 'expr:href' (theme.xml:3:42)",
			"<b:class> has both 'name' and 'expr:name', Blogger uses 'expr:name' (theme.xml:3:80)",
		]);

		// formatting keeps both, and warns the same
		warnings.length = 0;
		assert.include(
			formatXml(xml, { onWarn }),
			"<a expr:href='data:blog.url' href='#'/>",
		);
		assert.lengthOf(warnings, 2);
	});

	test('accepts whitespace in them, tabs and blank lines too', () => {
		validateXml(
			document(
				"<b:section id='s'>\n\t\n\t<b:widget id='A' type='HTML'>\r\n\t\t<b:widget-settings>\n\n\t\t\t<b:widget-setting name='a'/>\n\t\t</b:widget-settings>\n\t\t<b:includable id='main'/>\n\t</b:widget>\n\n</b:section>",
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
			"<div><b:widget id='A' type='HTML'><b:includable id='main'/></b:widget></div>",
			'<b:widget> can only be in a <b:section>, it is in <div>',
			[3, 12],
		],
		[
			"<b:section id='s'><b:widget id='A' type='HTML'><b:widget-settings/><b:widget-settings/><b:includable id='main'/></b:widget></b:section>",
			'<b:widget> can only have one <b:widget-settings>',
			[3, 74],
		],
		[
			"<b:section id='s'><b:widget id='A' type='HTML'><p/><b:includable id='main'/></b:widget></b:section>",
			'<b:widget> can only have <b:widget-settings> and <b:includable> in it, found <p>',
			[3, 54],
		],
		[
			'<b:widget-settings/>',
			'<b:widget-settings> can only be in a <b:widget>, it is in <html>',
			[3, 7],
		],
		[
			"<b:section id='s'><b:widget id='A' type='HTML'><b:widget-settings><b:widget-setting name='a'/>x</b:widget-settings><b:includable id='main'/></b:widget></b:section>",
			'<b:widget-settings> can only have <b:widget-setting> in it, found text',
			[3, 101],
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
			"<b:if cond='true' rel='x'/>",
			"<b:if> can not have the attribute 'rel', only 'cond'",
			[3, 30],
		],
		[
			"<b:loop value='data:a' var='x'/>",
			"<b:loop> can not have the attribute 'value', only 'values', 'var' and 'index'",
			[3, 22],
		],
		[
			"<b:loop var='x'/>",
			"<b:loop> has to have the attribute 'values'",
			[3, 7],
		],
		[
			"<b:if cond='true'><b:else cond='x'/></b:if>",
			"<b:else> can not have attributes, found 'cond'",
			[3, 39],
		],
		[
			"<b:section id='s'><b:widget id='A'/></b:section>",
			"<b:widget> has to have the attribute 'type'",
			[3, 25],
		],
		[
			"<b:section id='s'><b:widget id='A' type='HTML'><b:includable var='x'/></b:widget></b:section>",
			"<b:includable> has to have the attribute 'id'",
			[3, 54],
		],
		[
			"<b:section id='s'><b:widget id='A' type='HTML'><b:includable id='main' mode='x'/></b:widget></b:section>",
			"<b:includable> can not have the attribute 'mode', only 'id' and 'var'",
			[3, 84],
		],
	] as const)('rejects %s', (body, message, [line, column]) => {
		const error = errorOf(body);
		assert.instanceOf(error, XmlError);
		assert.strictEqual(error.message, `${message} (${line}:${column})`);
		assert.deepEqual(error.loc, { path: '', line, column });
	});
});

describe('validateXml', () => {
	test('accepts a formatted document', () => {
		validateXml(formatXml('<html><p/></html>'));
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
			assert.throws(() => validateXml(xml), XmlError);
			assert.throws(() => validateXml(xml), message);
		}
		validateXml(`<?xml version='1.0'?>\n${DOCTYPE}\n<html/>`);
	});

	test('requires the declarations on the first two lines', () => {
		assert.throws(() => validateXml('<html/>'), /first line has to be/);
		assert.throws(
			() => validateXml(`${XML_DECLARATION}${DOCTYPE}\n<html/>`),
			/alone on the first line/,
		);
		assert.throws(
			() => validateXml(`${XML_DECLARATION}\n<html/>`),
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
			assert.throws(() => validateXml(HEAD + body), XmlError);
			assert.throws(() => validateXml(HEAD + body), message);
		}
	});

	test('accepts valid expressions, with their entities decoded', () => {
		validateXml(
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
		];
		for (const [body, message] of cases) {
			assert.throws(() => validateXml(HEAD + body), XmlError);
			assert.throws(() => validateXml(HEAD + body), message);
			assert.throws(() => formatXml(HEAD + body), message);
		}
	});

	test('leaves other attributes alone', () => {
		validateXml(`${HEAD}<html><b:include data='post' name='a and'/></html>`);
	});

	test('XmlError has the position', () => {
		try {
			validateXml(`${HEAD}<html>\n  <b></html>`);
			assert.fail('expected an error');
		} catch (error) {
			assert.instanceOf(error, XmlError);
			assert.deepEqual(error.loc, { path: '', line: 4, column: 6 });
			assert.match(error.message, / \(4:6\)$/);
		}
	});

	test('XmlError has the path of the document when it is given', () => {
		try {
			validateXml(`${HEAD}<html>\n  <b></html>`, { path: 'dist/theme.xml' });
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
