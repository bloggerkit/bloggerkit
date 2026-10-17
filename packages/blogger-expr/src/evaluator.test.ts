import { assert, expect, test } from 'vitest';
import { evaluate } from './evaluator';

test('literals', () => {
	assert.equal(evaluate('"hello"'), 'hello');
	assert.equal(evaluate('42'), 42);
	assert.equal(evaluate('3.14'), 3.14);
	assert.equal(evaluate('true'), true);
	assert.equal(evaluate('false'), false);
});

test('invalid literals', () => {
	expect(() => evaluate('null')).toThrow(/does not support/);
});

test('arithmetic and string concatenation', () => {
	assert.equal(evaluate('1 + 2 * 3'), 7);
	assert.equal(evaluate('(1 + 2) * 3'), 9);
	assert.equal(evaluate('10 % 3'), 1);
	assert.equal(evaluate('"a" + "b" + "c"'), 'abc');
	assert.equal(evaluate('"count: " + 5'), 'count: 5');
	assert.equal(evaluate('-5 + 2'), -3);
});

test('comparisons and keyword aliases', () => {
	assert.equal(evaluate('1 < 2'), true);
	assert.equal(evaluate('2 <= 2'), true);
	assert.equal(evaluate('"a" == "a"'), true);
	assert.equal(evaluate('5 gt 3'), true);
	assert.equal(evaluate('5 eq 5'), true);
	assert.equal(evaluate('5 ne 4'), true);
});

test('logical operators short-circuit and return operand values', () => {
	assert.equal(evaluate('true and false'), false);
	assert.equal(evaluate('false or true'), true);
	assert.equal(evaluate('!true'), false);
	assert.equal(evaluate('not false'), true);
	assert.equal(
		evaluate('data:x and data:y', { data: { x: 'yes', y: 'no' } }),
		'no',
	);
	assert.equal(
		evaluate('data:x or data:y', { data: { x: '', y: 'fallback' } }),
		'fallback',
	);
	assert.equal(evaluate('true && false'), false);
	assert.equal(evaluate('false || true'), true);
});

test('ternary and elvis', () => {
	assert.equal(evaluate('true ? "a" : "b"'), 'a');
	assert.equal(evaluate('false ? "a" : "b"'), 'b');
	assert.equal(evaluate('data:. ?: 5'), 5);
	assert.equal(evaluate('0 ?: 5'), 0); // elvis is nullish, not falsy
	assert.equal(evaluate('"" ?: "fallback"'), '');
});

test('membership: in / contains / not in / not contains', () => {
	assert.equal(evaluate('"index" in ["index", "archive"]'), true);
	assert.equal(evaluate('"item" in ["index", "archive"]'), false);
	assert.equal(evaluate('["index", "archive"] contains "index"'), true);
	assert.equal(evaluate('"x" not in ["index", "archive"]'), true);
	assert.equal(evaluate('"story.html" not contains "foo"'), true);
	assert.equal(evaluate('"story.html" contains "story"'), true);
});

test('data references and member access', () => {
	const data = { vars: { amp_status: '2px' }, view: { isError: false } };
	assert.equal(
		evaluate('data:vars.amp_status == "2px" and !data:view.isError', { data }),
		true,
	);
});

test('missing data is lenient by default, strict mode throws', () => {
	assert.equal(evaluate('data:missing.deeply.nested'), null);
	assert.throws(() => evaluate('data:missing.deeply.nested', { strict: true }));
});

test('list and map literals', () => {
	assert.deepEqual(evaluate('[1, 2, 3]'), [1, 2, 3]);
	assert.deepEqual(evaluate('{ a: 1, b: "x" }'), { a: 1, b: 'x' });
	assert.deepEqual(evaluate('{"a", "b", "c"}'), ['a', 'b', 'c']);
});

test('a lambda parameter is bare-accessible directly within its own lambda body', () => {
	const data = { links: [{ name: 'icon', target: 'https://icon.png' }] };
	assert.deepEqual(
		evaluate('data:links filter (l => l.name == "icon")', { data }),
		[{ name: 'icon', target: 'https://icon.png' }],
	);
	// ternary branches at the lambda's top level are still "directly within" it
	assert.deepEqual(
		evaluate('data:links map (l => l.name == "icon" ? l.target : "none")', {
			data,
		}),
		['https://icon.png'],
	);
});

test('bare access resumes once back outside the {}/[]/nested-lambda barrier', () => {
	const data = { links: [{ name: 'icon', target: 'https://icon.png' }] };
	assert.deepEqual(
		evaluate(
			'data:links map (l => l.name == "icon" ? { title: data:l.name } : l.target)',
			{ data },
		),
		[{ title: 'icon' }],
	);
});

test('lambda operators: filter / map / any / all / none', () => {
	const data = {
		links: [
			{ name: 'icon', target: 'https://icon.png' },
			{ name: 'home', target: 'https://example.com' },
		],
	};
	assert.deepEqual(
		evaluate('data:links filter (l => l.name == "icon")', { data }),
		[{ name: 'icon', target: 'https://icon.png' }],
	);
	assert.deepEqual(evaluate('data:links map (l => l.name)', { data }), [
		'icon',
		'home',
	]);
	assert.equal(
		evaluate('data:links any (l => l.name == "icon")', { data }),
		true,
	);
	assert.equal(
		evaluate('data:links all (l => l.name == "icon")', { data }),
		false,
	);
	assert.equal(
		evaluate('data:links none (l => l.name == "missing")', { data }),
		true,
	);
});

test('lambda variable is reachable both bare and as data:<param>', () => {
	const data = { items: [{ target: 'a' }, { target: 'b' }] };
	assert.deepEqual(
		evaluate('data:items filter (i => data:i.target == "a")', { data }),
		[{ target: 'a' }],
	);
});

test('chained lambda operators and .first/.last', () => {
	const data = {
		links: [
			{ name: 'icon', target: 'https://icon.png' },
			{ name: 'icon', target: 'https://icon2.png' },
			{ name: 'home', target: 'https://example.com' },
		],
	};
	assert.equal(
		evaluate(
			'(data:links filter (l => l.name == "icon") map (l => l.target)).last',
			{ data },
		),
		'https://icon2.png',
	);
	assert.equal(
		evaluate('(data:links filter (l => l.name == "missing")).first ?: "none"', {
			data,
		}),
		'none',
	);
});

test('builtins: snippet, params, path, fragment, format', () => {
	assert.equal(
		evaluate(
			'snippet("The quick brown fox jumps over the lazy dog", { length: 20 })',
		),
		'The quick brown fox...',
	);
	assert.equal(
		evaluate(
			'snippet("The quick brown fox jumps over the lazy dog", { length: 20, ellipsis: false })',
		),
		'The quick brown fox',
	);
	assert.equal(
		evaluate('params("https://example.com/x", { amp: "1" })'),
		'https://example.com/x?amp=1',
	);
	assert.equal(
		evaluate('path("https://example.com", "p/about.html")'),
		'https://example.com/p/about.html',
	);
	assert.equal(
		evaluate('fragment("https://example.com/post.html", "comment")'),
		'https://example.com/post.html#comment',
	);
	assert.equal(
		String(evaluate('format("2026-01-05T10:30:00Z", "YYYY-MM-DD")')).slice(
			0,
			4,
		),
		'2026',
	);
});

test('builtins: fixed behaviors', () => {
	// path replaces the path, keeping the query and the fragment
	assert.equal(
		evaluate('path("https://example.com/a/b.html?q=1#top", "search")'),
		'https://example.com/search?q=1#top',
	);
	// params replaces the query, appendParams adds to it, the fragment is kept
	assert.equal(
		evaluate('params("https://example.com/?amp=1&page=2#a#b", { amp: "0" })'),
		'https://example.com/?amp=0#a#b',
	);
	assert.equal(
		evaluate('appendParams("https://example.com/?skin=a", { skin: "b" })'),
		'https://example.com/?skin=a&skin=b',
	);
	assert.equal(
		evaluate('fragment("https://example.com/post.html#old", "")'),
		'https://example.com/post.html',
	);
	// Blogger's date patterns, in UTC, with quoted text
	assert.equal(
		evaluate('format("2026-01-05T10:30:00Z", "MMMM d, YYYY")'),
		'January 5, 2026',
	);
	assert.equal(
		evaluate(`format("2026-01-05T10:30:00Z", "EEE 'at' h:mm a")`),
		'Mon at 10:30 AM',
	);
	// links and line breaks are kept by default
	assert.equal(
		evaluate('snippet("<a href=\\"/x\\">one</a><br/>  two   three")'),
		'<a href="/x">one</a><br/>two three',
	);
	assert.equal(
		evaluate(
			'snippet("<a href=\\"/x\\">one</a><br/>two", { links: false, linebreaks: false })',
		),
		'one two',
	);
	expect(() => evaluate('snippet("abc", { length: -1 })')).toThrow(/length/);
	// Blogger images are resized, other URLs are kept
	assert.equal(
		evaluate(
			'resizeImage("https://blogger.googleusercontent.com/img/b/x/s1600/a.jpg", 640, "16:9")',
		),
		'https://blogger.googleusercontent.com/img/b/x/w640-h360-p-k-no-nu/a.jpg',
	);
	assert.equal(
		evaluate('resizeImage("https://example.com/a.jpg", 640, "16:9")'),
		'https://example.com/a.jpg',
	);
});

test('builtins: resizeImage and sourceSet take a ratio, not a height', () => {
	const image = 'https://blogger.googleusercontent.com/img/a/x=s1600';
	assert.equal(
		evaluate(`sourceSet("${image}", [400, 800], "16:9")`),
		`${image.replace('s1600', 'w400-h225-p-k-no-nu')} 400w, ${image.replace('s1600', 'w800-h450-p-k-no-nu')} 800w`,
	);
	expect(() => evaluate(`resizeImage("${image}", 400, 300)`)).toThrow(
		/argument 3 must be a string literal/,
	);
	expect(() =>
		evaluate(`resizeImage("${image}", 400, data:h)`, { data: { h: 300 } }),
	).toThrow(
		/resizeImage\(\): argument 3 must be a ratio of positive integers like "16:9"/,
	);
	expect(() => evaluate(`sourceSet("${image}", [400], "wide")`)).toThrow(
		/sourceSet\(\): argument 3 must be a ratio/,
	);
});
