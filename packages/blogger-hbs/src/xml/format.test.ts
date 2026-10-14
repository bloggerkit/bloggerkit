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
				`${HEAD}<html\n  xmlns='x'\n  b:version='2'\n  expr:lang='l'>\n</html>`,
			),
			`${HEAD}<html b:version='2' expr:lang='l' xmlns='x'>\n</html>`,
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

	test('keeps the quotes and the entities of values', () => {
		assert.strictEqual(
			formatXml(`${HEAD}<a b="x &amp; y" a='&#39;'/>`),
			`${HEAD}<a a='&#39;' b="x &amp; y"/>`,
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
