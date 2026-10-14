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
	test('puts start tags on a single line with sorted attributes', () => {
		assert.strictEqual(
			formatXml(
				`${HEAD}<html\n  xmlns='x'\n  b:version='2'\n  expr:lang='data:l'>\n</html>`,
			),
			`${HEAD}<html b:version='2' expr:lang='data:l' xmlns='x'>\n</html>`,
		);
	});

	test('self-closing tags lose the space before />', () => {
		assert.strictEqual(
			formatXml(`${HEAD}<a><br /></a>`),
			`${HEAD}<a><br/></a>`,
		);
	});

	test('only line breaks in attribute values become spaces', () => {
		assert.strictEqual(
			formatXml(`${HEAD}<a class='x\n    y' title='  two  spaces  '/>`),
			`${HEAD}<a class='x     y' title='  two  spaces  '/>`,
		);
	});

	test('quotes values with single quotes, keeping their entities', () => {
		assert.strictEqual(
			formatXml(
				`${HEAD}<a b="x &amp; y" a='&#39;' c="it's &quot;q&quot;" d='&quot;'/>`,
			),
			`${HEAD}<a a='&#39;' b='x &amp; y' c='it&apos;s "q"' d='&quot;'/>`,
		);
	});

	test('prints expressions on a single line, in single quotes', () => {
		assert.strictEqual(
			formatXml(
				`${HEAD}<b:if cond='data:a&amp;&amp;(data:b eq "x")\n  || data:c &lt;2'><a expr:href="data:url  path &quot;y&quot;" expr:title='"it&apos;s"'/></b:if>`,
			),
			`${HEAD}<b:if cond='data:a and data:b == "x" or data:c &lt; 2'><a expr:href='data:url path "y"' expr:title='"it&apos;s"'/></b:if>`,
		);
	});

	test('leaves other attributes as they are', () => {
		assert.strictEqual(
			formatXml(
				`${HEAD}<b:include cond='data:a&amp;&amp;data:b' data='post' name='a  and'/>`,
			),
			`${HEAD}<b:include cond='data:a and data:b' data='post' name='a  and'/>`,
		);
	});

	test('formats ranges in b:loop values', () => {
		assert.strictEqual(
			formatXml(
				`${HEAD}<a><b:loop values='1..20' var='i'/><b:loop values='-2..3' var='j'/></a>`,
			).split('\n')[2],
			`<a><b:loop values='1..20' var='i'/><b:loop values='-2..3' var='j'/></a>`,
		);
	});

	test('formats b:include data, leaving bare names as they are', () => {
		assert.strictEqual(
			formatXml(
				`${HEAD}<a><b:include data='data:posts  filter (p =&gt; p.id)' name='x'/><b:include data='post.labels' name='y'/></a>`,
			),
			`${HEAD}<a><b:include data='data:posts filter (p => p.id)' name='x'/><b:include data='post.labels' name='y'/></a>`,
		);
	});

	test('leaves text, comments, CDATA and end tags as they are', () => {
		const body = `<a>
  text   stays
  <!-- <b   z='1' a='2'> -->
  <script>/*<![CDATA[*/ if (a < b) {} /*]]>*/</script>
</a   >`;
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
    <b:widget id='A' type='Blog' version='2'><b:widget-settings>
        <b:widget-setting name='a'>1</b:widget-setting>    <b:widget-setting name='b'>
              two
        </b:widget-setting></b:widget-settings>
<b:includable id='main'>
          <div>
                <p>keep</p>
          </div>
        </b:includable></b:widget>
</html>`;
		const output = `<html>
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
</html>`;
		assert.strictEqual(formatXml(HEAD + input), HEAD + output);
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
				'<a><b></a>',
				/Expected <\/b> to close <b> \(opened at 3:4\), found <\/a> \(3:7\)/,
			],
			['<a/><b/>', /Only one root element/],
			['text<a/>', /Text out of the root element/],
			["<a x='1' x='2'/>", /Duplicate attribute 'x'/],
			['<a>&nbsp;</a>', /Undefined entity '&nbsp;'.*&#160;/],
			['<a>a & b</a>', /'&' has to be escaped as '&amp;'/],
			["<a title='a < b'/>", /'<' is not allowed in the value/],
			['<a disabled/>', /has no value/],
			['<a><!-- a -- b --></a>', /'--' is not allowed inside a comment/],
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
				`<b:if cond='data:a and'/>`,
				/Invalid expression in the attribute 'cond' of <b:if>: .* \(3:23\)/,
			],
			[`<a expr:href='data:a +'/>`, /'expr:href' of <a>/],
			[`<b:section id='s' cond='data:a and'/>`, /'cond' of <b:section>/],
			[`<b:include data='data:a +' name='x'/>`, /'data' of <b:include>/],
			[`<b:include data='post title' name='x'/>`, /'data' of <b:include>/],
			[`<b:loop values='foo' var='x'/>`, /'values' of <b:loop>/],
			[`<b:loop values='1..data:n' var='x'/>`, /'values' of <b:loop>/],
			[
				`<b:loop values='1 .. 20' var='x'/>`,
				/range in the attribute 'values' of <b:loop>, it can not have spaces: '1\.\.20' \(3:17\)/,
			],
			[`<b:loop values=' 1..20' var='x'/>`, /can not have spaces/],
			[`<b:eval expr='&quot;x'/>`, /'expr' of <b:eval>.*\(3:15\)/],
		];
		for (const [body, message] of cases) {
			assert.throws(() => validateXml(HEAD + body), XmlError);
			assert.throws(() => validateXml(HEAD + body), message);
			assert.throws(() => formatXml(HEAD + body), message);
		}
	});

	test('leaves other attributes alone', () => {
		validateXml(`${HEAD}<b:include data='post' name='a and'/>`);
	});

	test('XmlError has the position', () => {
		try {
			validateXml(`${HEAD}<a>\n  <b></a>`);
			assert.fail('expected an error');
		} catch (error) {
			assert.instanceOf(error, XmlError);
			assert.strictEqual(error.line, 4);
			assert.strictEqual(error.column, 6);
		}
	});
});
