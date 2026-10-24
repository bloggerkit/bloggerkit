/**
 * What Blogger rendered for each expression. `null` expects the expression
 * to be refused or not computable.
 */
import { describe, expect, test } from 'vitest';
import { ExpressionError, evaluate, parse, RichValue, toText } from './index';

const DATA = {
	blog: {
		title: 'Example Blog Title',
		homepageUrl: new RichValue(
			'https://sample-blog.blogspot.com/',
			{
				canonical: new RichValue(
					'https://sample-blog.blogspot.com/',
					{},
					'url',
				),
			},
			'url',
		),
	},
	post: {
		date: new Date('2026-08-08T07:25:00Z'),
		title: 'post-1',
		featuredImage: new RichValue(
			'https://blogger.googleusercontent.com/img/b/x/s1600/test-1600x900.png',
			{
				isResizable: true,
				isYoutube: false,
				originalWidth: 1600,
				originalHeight: 900,
			},
			'image',
		),
	},
};

function render(
	source: string,
	data: Record<string, unknown> = {},
	context?: 'loop-values',
): string {
	const parsed = parse(source, { context });
	return toText(evaluate(parsed, { data: { ...DATA, ...data } }));
}

function cases(rows: [string, string | null, Record<string, unknown>?][]) {
	for (const [source, expected, data] of rows) {
		test(source, () => {
			if (expected === null) {
				expect(() => render(source, data)).toThrow(ExpressionError);
			} else {
				expect(render(source, data)).toBe(expected);
			}
		});
	}
}

describe('values', () => {
	cases([
		['"hello"', 'hello'],
		['.5', '.5'],
		['1.50', '1.50'],
		['007', '007'],
		['1e5', null],
		['yes', 'true'],
		['TRUE', 'true'],
		['null', null],
		['"a\\"b"', 'a"b'],
		['"a\\nb"', 'a\\nb'],
		['"a\\\\"', null],
		["'abc'", null],
		['[.5, 1.50, 007, yes, "x"]', '[.5,1.50,007,true,"x"]'],
		['[]', ']'],
		['[[], 1]', '[],1]'],
		['[1, 2, ]', '[1,2]'],
		['[1,, 2]', null],
		['{}', ']'],
		['{ a: 1 }', '[Object]'],
		['{ a:1 }', null],
		['{ "a-b": 1 }."a-b"', '1'],
		['{ "a-b": 1 }.a-b', ''],
		['{ a-b: 1 }.a-b', '1'],
		['[1, 2, 3][0]', null],
		['[1, 2].1', ''],
		['["a\\"b", "c\\\\d"]', '["a"b","c\\\\d"]'],
	]);
});

describe('data', () => {
	const l = { l: [10, 20, 30] };
	cases([
		['data:l[0]', '10', l],
		['data:l[-1]', '', l],
		['data:l["1"]', '20', l],
		['data:l[1.5]', '', l],
		['data:blog..title', 'Example Blog Title'],
		['blog.title', null],
		['data: blog.title', null],
		['data:n-3', '9', { 'n-3': 9 }],
		// `data:` alone is missing data, as outside a widget
		['data:', ''],
		['[data:]', '[""]'],
		['data: ?: "x"', 'x'],
		['{ any: data: }.any', ''],
		['data:.blog.title', 'Example Blog Title'],
		['data:..blog.title', 'Example Blog Title'],
	]);

	test('data: alone and a leading dot are warned about', () => {
		const warnings = (source: string) =>
			parse(source).warnings.map((w) => [w.code, w.fix]);
		expect(warnings('{ any: data:}')).toEqual([
			['bare-data', 'name the data you read: data:blog.title'],
		]);
		expect(warnings('data:.blog')).toEqual([
			['data-leading-dot', 'write data:blog'],
		]);
		expect(warnings('data:..blog.title')).toEqual([
			['data-leading-dot', 'write data:blog.title'],
		]);
		expect(warnings('data:blog.title')).toEqual([]);
		expect(warnings('data:a..b')).toEqual([]);
	});
});

describe('operators', () => {
	cases([
		['1 + 2 * 3', '7'],
		['not 1 == 2', null],
		['false ? 1 : true ? 2 : 3', '2'],
		['false == 1 in [2]', 'true'],
		['"a" + data:missing ?: "x"', 'ax'],
		['2 * data:missing ?: 3', '6'],
		['1 neq 2', 'true'],
		['1 ne 2', null],
		['7 / 3', '2.3333'],
		['1 / 0', null],
		['1.50 + 0', '1.50'],
		['.5 * 2', '1.0'],
		['1 / 1024', '0.0009765625'],
		['1 / 3 * 3', '0.9999'],
		['20 + 25 + ""', '2025'],
		['1 + 2 + "a" + 3 + 4', '12a34'],
		['1 - 1 + "a"', '0a'],
		['true + 1', null],
		['data:missing + 1 + 1', '11'],
		['5 == 5.0', 'false'],
		['5 == "5"', 'true'],
		['[1, 2] == "[1,2]"', 'true'],
		['"2" < "10"', 'true'],
		['"a" < "b"', null],
		['"a" and "b"', null],
		['true and data:blog.title', 'true'],
		['"b" in "abc"', 'true'],
		['"a" in { a: 1 }', null],
		['data:missing < 1', null],
		['-0 == 0', 'false'],
		['007 == 7', 'false'],
		['+(007) == 7', 'true'],
	]);
});

describe('minus', () => {
	cases([
		['5 - 3', '2'],
		['(5)- 3', '2'],
		['5 -(3)', '2'],
		['-(-5)', '-5'],
		['5-3', null],
		['5 -3', null],
		['5 - -3', '8'],
		['--5', null],
		['- 5', null],
		['- (5)', '5'],
		['-(1 + 1)', null],
		['-((1 + 1))', '2'],
	]);
});

describe('members after a value', () => {
	cases([
		['"x" + "ab".length', '3'],
		['1 + "abc".length * 2', '8'],
		['"x" + [1] .length', 'x1'],
		['"x" + data:t .length', '3', { t: 'ab' }],
		['"x" + data:t.length', 'x2', { t: 'ab' }],
		['"https://a.com/p?x=1#h" path "x".length', '21'],
		['1 ..3', ''],
	]);
});

describe('conditions', () => {
	cases([
		// a map is a true condition; `and`, `or` do not read what they do not need
		['!{ a: 1 }', 'false'],
		['not { a: 1 }', 'false'],
		['{ a: 1 } ? "y" : "n"', 'y'],
		['!{}', null],
		['{} ? "y" : "n"', null],
		['[1] filter (x => { a: 1 })', '[1]'],
		['[1] any (x => { a: 1 })', 'true'],
		['[1] all (x => { a: 1 })', 'true'],
		['[1] none (x => { a: 1 })', 'false'],
		['[1] count (x => { a: 1 })', '1'],
		['[1] first (x => { a: 1 })', '1'],
		['and({ a: 1 }, true)', 'true'],
		['or(false, { a: 1 })', 'true'],
		['and(false, 5)', 'false'],
		['or(true, 5)', 'true'],
		['!data:missing and 5', null],
		['false ? 5 : (true or 5)', 'true'],
		['{ a: 1 } and 5', null],
		['5 and false', null],
		['"" or 5', null],
		['data:missing or 5', null],
		['{ b: 0 } and true', 'true'],
		['5 ? 1 : 2', null],
		['"true" ? 1 : 2', '1'],
		['data:s ? 1 : 2', '1', { s: 'x' }],
		['data:s ? 1 : 2', '1', { s: 0 }],
		['(4 + 1) ? 1 : 2', null],
		['("fal" + "se") ? 1 : 2', '2'],
		['"x".length ? 1 : 2', '1'],
		['false and (1 / data:n == 1)', 'false', { n: 0 }],
		['"" ?: "x"', ''],
	]);
});

describe('lambdas, take, skip', () => {
	const l = { l: [1, 2, 3], e: [] };
	cases([
		['data:l map x => x + 1', '[2,3,4]', l],
		['data:l filter x => x > 1 map y => y * 10', null, l],
		['"n=" + data:l count x => true', 'n=3', l],
		['data:missing filter (x => true)', ']'],
		['data:l where (x => x > 1)', '[2,3]', l],
		['data:l filter (x => x > 1).size', null, l],
		['data:l map (x => data:l map (y => x))', null, l],
		['data:missing all (x => true)', 'false'],
		['[] all (x => true)', 'true'],
		['["false", "x"] map (x => x)', '[false,"x"]'],
		['["false", "x"] filter (x => x)', '["x"]'],
		['data:l take 1.4', '[1]', l],
		['data:l take 0.4', null, l],
		['data:l take 1 take 1', null, l],
		['(data:l take 2) take 1', '[1]', l],
		['take(data:l, 2)', '[1,2]', l],
	]);
});

describe('conversion when read', () => {
	cases([
		['["9999"].first + 1', '10000'],
		['"9999" + 1', '99991'],
		['["9999"]', '["9999"]'],
		['["9999"].first contains "9"', null],
		['data:n contains "9"', null, { n: '9999' }],
		['(data:n + "") contains "9"', 'true', { n: '9999' }],
		['data:z == "007"', 'true', { z: '007' }],
		['data:l', '[9999,"x"]', { l: ['9999', 'x'] }],
		[
			'data:labels map (l => l.name)',
			'[2024,true]',
			{ labels: [{ name: '2024' }, { name: 'yes' }] },
		],
		['"".length', '0'],
		['data:missing.length', ''],
	]);
});

describe('escapes and text', () => {
	const content = { content: '<b>"q" \'a\' & = \\ / : () é}\n\tend\r  \u0085﻿' };
	const yes = { w: 'yes', n: '9999', z: '007', f: '1.50' };
	cases([
		[
			'data:content.escaped',
			'&lt;b&gt;&quot;q&quot; &#39;a&#39; &amp; = \\ / : () é}\n\tend\r  \u0085﻿',
			content,
		],
		[
			'data:content.jsEscaped',
			'\\x3cb\\x3e\\x22q\\x22 \\x27a\\x27 \\x26 \\x3d \\\\ / : () é}\\n\tend\\r\\u2028\\u2029\\x85\\ufeff',
			content,
		],
		[
			'data:content.jsonEscaped',
			'\\u003cb\\u003e\\"q\\" \'a\' \\u0026 \\u003d \\\\ / : () é}\\n\\tend\\r\\u2028\\u2029\\u0085\\ufeff',
			content,
		],
		[
			'data:content.cssEscaped',
			'<b>\\"q\\" \\\'a\\\' & = \\ \\/ \\: \\(\\) é}\n\tend\r  \u0085﻿',
			content,
		],
		['"a:b/c\'d".cssEscaped', "a\\:b\\/c\\'d"],
		['"a:b/c\'d".jsEscaped', 'a:b/c\\x27d'],
		[
			'data:blog.homepageUrl.cssEscaped',
			'https\\:\\/\\/sample-blog.blogspot.com\\/',
		],
		['data:post.date.cssEscaped', 'August 08, 2026'],
		['data:n.escaped', '9999', yes],
		['data:f.jsonEscaped', '1.50', yes],
		['data:z.jsEscaped', '007', yes],
		['data:w.escaped', 'true', yes],
		['"yes".escaped', 'true'],
		['"TRUE".cssEscaped', 'true'],
		['"truex".escaped', 'truex'],
		['("y" + "es").escaped', 'true'],
		['"yes".escaped == "true"', 'true'],
		['"yes".escaped contains "t"', null],
		['"9999".escaped + 1', '10000'],
		['"9999".escaped contains "9"', null],
		['("9" + "9").escaped + 1', '100'],
		['data:content.escaped.escaped', '&amp;quot;', { content: '"' }],
		['(5).escaped', ''],
		['(1 + 1).escaped', ''],
		['(true).escaped', ''],
		['[1, "a"].escaped', ''],
		['{ a: 1 }.escaped', ''],
		['data:blog.escaped', ''],
		['data:missing.escaped', ''],
		['data:post.date.year.escaped', ''],
		['data:t.escaped', '', { t: true }],
		['data:w', 'true', yes],
		['data:w.length', '3', yes],
		['data:w.size', '3', yes],
		['data:w + ""', 'true', yes],
		['(data:w + "").length', '4', yes],
		['data:w == true', 'true', yes],
		['data:w == "yes"', 'false', yes],
		['data:w contains "y"', null, yes],
		['(data:w + "") contains "y"', 'false', yes],
		['data:t.length', '', { t: true }],
		['("yes" + "")', 'yes'],
		['("yes" + "").length', '3'],
		['("yes" + "") == "yes"', 'true'],
		['("yes" + "") == true', 'false'],
		['("yes" + "") contains "y"', 'true'],
		['("9999" + "") contains "9"', 'true'],
		['[("yes" + "")].first', 'true'],
		['{ a: ("yes" + "") }.a', 'true'],
		['[("yes" + "")]', '["yes"]'],
		['data:content.Escaped', '&lt;', { content: '<' }],
		['data:content.jsescaped', '\\x3c', { content: '<' }],
		['"a\\"<".JSONESCAPED', 'a\\"\\u003c'],
		['"a:b".CSSESCAPED', 'a\\:b'],
		['"ab".LENGTH', '2'],
		['"ab".Size', '2'],
		['[1, 2].SIZE', '2'],
		['[1, 2].First', '1'],
		['[1, 2].LAST', '2'],
		['[].Empty', 'true'],
		['data:blog.TITLE', ''],
		['{ a: 1 }.A', ''],
		['data:content.htmlEscaped', '', { content: '<' }],
		['data:content.urlEncoded', '', { content: '<' }],
	]);
});

describe('properties of each type', () => {
	// label names are HTML text: `a&b` is `a&amp;b`
	const label = (name: string, path: string) => ({
		name,
		url: new RichValue(
			`https://sample-blog.blogspot.com/search/label/${path}`,
			{},
			'url',
		),
	});
	const LABELS = {
		post: {
			...DATA.post,
			labels: [label('a&amp;b', 'a%26b'), label('Test Label', 'Test%20Label')],
		},
	};
	cases([
		['"abc".LENGTH', '3'],
		['"abc".Size', '3'],
		['"abc".first', ''],
		['"abc".empty', ''],
		['"abc".isEmpty', ''],
		['"abc".any', ''],
		['"abc".trim', ''],
		['[3, 1, 2].isEmpty', 'false'],
		['[3, 1, 2].Any', 'true'],
		['[3, 1, 2].NOTEMPTY', 'true'],
		['[3, 1, 2].LAST', '2'],
		['[].any', 'false'],
		['[].isEmpty', 'true'],
		['[].first', ''],
		['[false].any', 'true'],
		['[""].any', 'true'],
		['[0].any', 'true'],
		['[].all', ''],
		['[1].none', ''],
		['[3, 1, 2].count', ''],
		['data:post.date.YEAR', '2026'],
		['data:post.date.Month', '8'],
		['data:post.date.DAYOFMONTH', '8'],
		['data:post.date.dayofweek', '6'],
		['data:post.date.dayOfYear', '220'],
		['data:post.date.DAYOFYEAR + 1', '221'],
		['data:post.date.Iso8601', '2026-08-08T07:25:00+00:00'],
		['data:post.date.year + 1', '2027'],
		['data:post.date.month == 8', 'true'],
		['data:post.date.year.length', ''],
		['data:post.date.dayOfWeek.escaped', ''],
		['data:post.date.hour', ''],
		['data:post.date.timestamp', ''],
		['data:blog.homepageUrl.raw', 'https://sample-blog.blogspot.com/'],
		['data:blog.homepageUrl.RAW', 'https://sample-blog.blogspot.com/'],
		['data:blog.homepageUrl.raw.raw', ''],
		[
			'data:blog.homepageUrl.canonical.raw',
			'https://sample-blog.blogspot.com/',
		],
		['data:blog.homepageUrl.CANONICAL', ''],
		['(data:blog.homepageUrl + "").raw', ''],
		['"https://x.com/a".raw', ''],
		['data:blog.homepageUrl.path', ''],
		['data:post.featuredImage.ISRESIZABLE', 'true'],
		['data:post.featuredImage.OriginalWidth', '1600'],
		['data:post.featuredImage.raw', ''],
		['data:post.featuredImage.length', '69'],
		['data:blog.Title', ''],
		['(5).abs', ''],
		['(true).length', ''],
		['{ a: 1 }.size', ''],
		['data:post.labels.Any', 'true', LABELS],
		['data:post.labels.first.name.length', '7', LABELS],
		['data:post.labels.first.NAME', '', LABELS],
		['data:post.labels.first.isLast', '', LABELS],
		[
			'data:post.labels.first.url.RAW',
			'https://sample-blog.blogspot.com/search/label/a%26b',
			LABELS,
		],
		['data:post.labels map (l => l.name)', '["a&amp;b","Test Label"]', LABELS],
		['"a&b" in (data:post.labels map (l => l.name))', 'false', LABELS],
	]);
});

describe('functions', () => {
	const U =
		'"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEtest/s1600/photo.jpg"';
	const BASE =
		'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEtest';
	cases([
		['path("https://a.com/a/b?q=1#h", "c")', 'https://a.com/c?q=1#h'],
		['path("https://a.com/", "//x")', 'https://a.com//x'],
		['path("https://a.com/a/b?q=1", "")', 'https://a.com?q=1'],
		['path("", "c")', null],
		['path(5, "c")', '/c'],
		['fragment([1], "z")', 'null#z'],
		['fragment("https://a.com/p#a", "")', 'https://a.com/p#'],
		['params("https://a.com/?x=1#h", { y: 2 })', 'https://a.com/?x=1&y=2#h'],
		['params("https://a.com/?x=1&y=3", { x: 2 })', 'https://a.com/?x=2&y=3'],
		['params("https://a.com/?x=1&x=2", { x: 3 })', 'https://a.com/?x=3'],
		[
			'params("https://a.com/", { c: 1, b: 2, a: 3 })',
			'https://a.com/?a=3&b=2&c=1',
		],
		['params("https://a.com/", { a: data:missing })', 'https://a.com/'],
		['params("https://a.com/", { a: "" })', 'https://a.com/?a'],
		[
			'params("https://a.com/", { x: "a b&c/é" })',
			'https://a.com/?x=a+b%26c/%C3%A9',
		],
		['params("https://a.com/p", { "a-b": 1 })', 'https://a.com/p?%22a-b%22=1'],
		['appendParams("https://a.com/?x=1", { x: 2 })', 'https://a.com/?x=1&x=2'],
		[`resizeImage(${U}, 640)`, `${BASE}/w640/photo.jpg`],
		[`resizeImage(${U}, 100, "3:2")`, `${BASE}/w100-h66-p-k-no-nu/photo.jpg`],
		[`resizeImage(${U}, 100, "9:16")`, `${BASE}/w100/photo.jpg`],
		[`resizeImage(${U}, -5)`, `${BASE}/photo.jpg`],
		[`resizeImage(${U}, 100.7)`, `${BASE}/w101/photo.jpg`],
		[`resizeImage(${U}, 300, "wide")`, null],
		[`resizeImage(${U}, -5, "16:9")`, null],
		[
			'resizeImage("https://lh3.googleusercontent.com/a/b/s1600/x.jpg", 300)',
			'https://lh3.googleusercontent.com/a/b/s1600/x.jpg/w300',
		],
		[
			'resizeImage("https://example.com/x.jpg", 300)',
			'https://example.com/x.jpg',
		],
		[
			`sourceSet(${U}, [100, 200])`,
			`${BASE}/w100/photo.jpg 100w, ${BASE}/w200/photo.jpg 200w`,
		],
		['sourceSet("https://example.com/a.jpg", [100])', ''],
		['format(data:post.date, "yyyy-MM-dd HH:mm:ss")', '2026-08-08 07:25:00'],
		['format(data:post.date, "a")', 'am'],
		['format(data:post.date, "EEEE EEE")', 'Saturday Sat'],
		['format(data:post.date, "w W u F")', '32 1 2026 2'],
		['format(data:post.date, "[x] {y} #")', '[+00] {2026} #'],
		['format(data:post.date, "j")', null],
		['format("2026-01-05", "yyyy")', null],
		['"x" + data:post.date', 'xAugust 08, 2026'],
		['data:post.date.year + 1', '2027'],
	]);

	test('#format in another language', () => {
		const value = evaluate('format(data:post.date, "EEEE d MMMM")', {
			data: DATA,
			language: 'fr',
		});
		expect(toText(value)).toBe('samedi 8 août');
	});

	test('#38 the text of a date follows the Timestamp format and time zone', () => {
		const value = evaluate('"" + data:post.date', {
			data: DATA,
			timestampFormat: 'd.M.yy',
			timeZone: 'America/Los_Angeles',
		});
		expect(toText(value)).toBe('8.8.26');
	});
});

describe('snippet', () => {
	const H =
		'"<p>Hello <a href=\\"/x\\">world</a> and a much longer sentence here<br/>line two</p>"';
	cases([
		[
			`snippet(${H})`,
			'Hello <a href="/x">world</a> and a much longer sentence here<br>line two',
		],
		[
			`snippet(${H}, { length: 10 })`,
			'Hello <a href="/x">world</a> and a much longer sentence here<br>line t&#8230;',
		],
		[
			`snippet(${H}, { length: 10, ellipsis: false })`,
			'Hello <a href="/x">world</a> and a much longer sentence here<br>line tw',
		],
		[
			`snippet(${H}, { links: false })`,
			'Hello world and a much longer sentence here<br>line two',
		],
		[
			'snippet("a &amp; b &lt;i&gt;c&lt;/i&gt; &#233;")',
			'a &amp; b &lt;i&gt;c&lt;/i&gt; é',
		],
		['snippet("<script>x()</script>text")', 'text'],
		['snippet("<b>a</b> <b>b</b>")', '<b>a</b><b>b</b>'],
		['snippet("a <span></span> b")', 'a  b'],
		['snippet("x<div>a</div>y")', 'xa y'],
		['snippet("x<p>a</p>y")', 'xay'],
		['snippet("<u>u</u> <s>s</s>")', 'us'],
		[
			`snippet("<a href=\\"u\\">${'x'.repeat(60)}</a>", { length: 50 })`,
			`<a href="u">${'x'.repeat(49)}&#8230;</a>`,
		],
		[
			`snippet("&amp;${'x'.repeat(60)}", { length: 50 })`,
			`&amp;${'x'.repeat(44)}&#8230;`,
		],
		['snippet("abc", { length: "60" })', 'abc'],
		['snippet("abc", data:missing)', null],
	]);
});

describe('loop values', () => {
	const loop = (source: string, data: Record<string, unknown> = {}) =>
		toText(evaluate(parse(source, { context: 'loop-values' }), { data }));
	test('ranges', () => {
		expect(loop('1 to 3')).toBe('[1,2,3]');
		expect(loop('3..1')).toBe('[3,2,1]');
		expect(loop('-1..1')).toBe('[-1,0,1]');
		expect(loop('0 to data:n - 1', { n: 3 })).toBe('[0,1,2]');
		expect(parse('1 .. 3', { context: 'loop-values' }).errors[0]?.code).toBe(
			'dots-range',
		);
		expect(parse('1 to 3').errors[0]?.code).toBe('range-outside-loop');
	});
	// what Blogger looped over, with `l` = [1, 2] and `n` = 3; `null` is refused
	test.each([
		['1 to 3', '1,2,3'],
		['1..3', '1,2,3'],
		['-2..2', '-2,-1,0,1,2'],
		['3 to 1', '3,2,1'],
		['(1 to 3)', null],
		['(1..3)', null],
		['(1)..3', ''],
		['[1 to 3]', null],
		['[(1 to 3)]', null],
		['1 to 3 take 2', null],
		['1..3 take 1', null],
		['1 to 3 map (x => x)', null],
		['1 to 3 skip 1', null],
		['(1 to 3) take 2', null],
		['1 to 2 to 3', null],
		['1..3..5', null],
		['1 to (2 to 3)', null],
		['(1 to 2) to 3', null],
		['data:n - 2 to data:n * 2', '1,2,3,4,5,6'],
		['1 to 3 + 1', '1,2,3,4'],
		['1 + 1 to 3', '2,3'],
		['1 to 3 ?: 5', '1,2,3'],
		['1 to data:missing ?: 4', '1,2,3,4'],
		['1 to 3 ? 1 : 2', null],
		['true ? 1 : 2 to 3', '1,2,3'],
		['1 to 3 == 3', null],
		['true ? 1 to 2 : 3', null],
		['(1 to 3).size', null],
		['(1 to 3).first', null],
		['data:l map (x => 1 to x)', null],
		['1 to 3 contains 2', null],
		['!1 to 3', null],
		['1..data:n', null],
		['1 to data:l take 1', null],
		['1 to data:l.size', '1,2'],
		['1 to "3"', '1,2,3'],
		['"1" to 3', '1,2,3'],
		['1.5 to 3', null],
		['1 to 2.5', null],
		['1..-2', '1,0,-1,-2'],
		['-1..-3', '-1,-2,-3'],
		['0..0', '0'],
		['1 to 1', '1'],
	] as [string, string | null][])('%s', (source, expected) => {
		const parsed = parse(source, { context: 'loop-values' });
		let looped: string | null = null;
		if (parsed.errors.length === 0) {
			try {
				const value = evaluate(parsed, { data: { l: [1, 2], n: 3 } });
				looped = Array.isArray(value)
					? value.map((v) => toText(v)).join(',')
					: '';
			} catch {
				looped = null;
			}
		}
		expect(looped).toBe(expected);
	});

	test('a range is only the whole values of a loop', () => {
		const code = (source: string, context?: 'loop-values') =>
			parse(source, { context }).errors[0]?.code;
		expect(code('(1..3)', 'loop-values')).toBe('range-outside-loop');
		expect(code('[1 to 3]', 'loop-values')).toBe('range-outside-loop');
		expect(code('1..3')).toBe('range-outside-loop');
		expect(code('1 to 3')).toBe('range-outside-loop');
	});

	test('warnings', () => {
		const warnings = (source: string) =>
			parse(source, { context: 'loop-values' }).warnings.map((w) => w.code);
		expect(warnings('true ? 1 : 2 to 3')).toEqual(['range-reach']);
		expect(warnings('1 to 3 ?: 5')).toEqual(['range-reach']);
		expect(warnings('0 to data:l.size - 1')).toEqual([]);
		expect(warnings('(1)..3')).toEqual(['member-dots']);
	});
});
