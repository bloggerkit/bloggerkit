import { assert, describe, test } from 'vitest';
import { render } from '../../../test/fixture';

/** Renders `<a>{{template}}</a>` with `context`, the output without the tag. */
async function run(template: string, context: unknown = {}): Promise<string> {
	const output = await render(
		{ 'index.hbs': `<a>${template}</a>` },
		{ context },
	);
	return output.slice('<a>'.length, -'</a>'.length);
}

async function runError(
	template: string,
	context: unknown = {},
): Promise<string> {
	try {
		await run(template, context);
	} catch (error) {
		return (error as Error).message;
	}
	assert.fail(`expected an error for ${template}`);
}

describe('comparison', () => {
	test.each([
		['{{eq 1 1}}', 'true'],
		['{{eq 1 "1"}}', 'false'],
		['{{eqw 1 "1"}}', 'true'],
		['{{lt 1 2}}', 'true'],
		['{{lt "b" "a"}}', 'false'],
		['{{ne 1 2}}', 'true'],
		['{{ne 1 1}}', 'false'],
		['{{ne 1 "1"}}', 'true'],
		['{{new 1 "1"}}', 'false'],
		['{{new 1 2}}', 'true'],
		['{{gt 2 1}}', 'true'],
		['{{gt "b" "a"}}', 'true'],
		['{{lte 1 1}}', 'true'],
		['{{lte 2 1}}', 'false'],
		['{{gte 1 1}}', 'true'],
		['{{gte 0 1}}', 'false'],
	])('%s is %s', async (template, output) => {
		assert.strictEqual(await run(template), output);
	});

	test('takes two arguments', async () => {
		assert.strictEqual(
			await runError('{{gt 1}}'),
			"Helper 'gt': Expected exactly 2 arguments, but got 1 (./index.hbs:1:4)",
		);
	});
});

describe('logic', () => {
	test.each([
		['{{and 1 2}}', '2'],
		['{{and 1 0 2}}', '0'],
		['{{or 0 "" "x"}}', 'x'],
		['{{or 0 ""}}', ''],
		['{{not 0}}', 'true'],
		['{{not "x"}}', 'false'],
		['{{#if (and a (not b))}}yes{{/if}}', 'yes'],
	])('%s is %o', async (template, output) => {
		assert.strictEqual(await run(template, { a: true, b: false }), output);
	});

	test('an empty array is not truthy, as for {{#if}}', async () => {
		const context = { posts: [], tags: ['x'] };
		assert.strictEqual(await run('{{not posts}}', context), 'true');
		assert.strictEqual(
			await run(
				'{{#if (or posts tags)}}{{first (or posts tags)}}{{/if}}',
				context,
			),
			'x',
		);
	});

	test.each([
		['{{default name "Anonymous"}}', { name: '' }, 'Anonymous'],
		['{{default name "Anonymous"}}', { name: null }, 'Anonymous'],
		['{{default name "Anonymous"}}', { name: 'Deo' }, 'Deo'],
		['{{default count 1}}', { count: 0 }, '0'],
		['{{default a b "c"}}', { a: undefined, b: '' }, 'c'],
	])('%s with %o is %s', async (template, context, output) => {
		assert.strictEqual(await run(template, context), output);
	});
});

describe('strings', () => {
	test.each([
		['{{concat "page-" 2 "-of-" 5}}', 'page-2-of-5'],
		['{{lower "AbC"}}', 'abc'],
		['{{upper "AbC"}}', 'ABC'],
		['{{trim "  x  "}}', 'x'],
		['{{replace "a-b-c" "-" " "}}', 'a b-c'],
		['{{replaceAll "a-b-c" "-" " "}}', 'a b c'],
		['{{replace "a" "a" "$&$&"}}', '$&amp;$&amp;'],
		['{{replaceAll "aa" "a" "$$"}}', '$$$$'],
		['{{startsWith "blogger" "blog"}}', 'true'],
		['{{endsWith "blogger" "blog"}}', 'false'],
		['{{join (split "a,b" ",") "+"}}', 'a+b'],
		['{{truncate "Hello world" 8}}', 'Hello w…'],
		['{{truncate "Hello world" 8 "..."}}', 'Hello...'],
		['{{truncate "Hello" 8}}', 'Hello'],
		['{{truncate "Hello world" 6}}', 'Hello…'],
	])('%s is %s', async (template, output) => {
		assert.strictEqual(await run(template), output);
	});

	test('escapes what it returns, as any helper', async () => {
		assert.strictEqual(await run('{{upper "<b>"}}'), '&lt;B&gt;');
	});

	test('does not take other values for strings', async () => {
		assert.strictEqual(
			await runError('{{concat "a" flag}}', { flag: true }),
			"Helper 'concat': Expected argument 2 to be a string, got: true (./index.hbs:1:4)",
		);
		assert.strictEqual(
			await runError('{{lower 5}}'),
			"Helper 'lower': Expected argument 1 to be a string, got: 5 (./index.hbs:1:4)",
		);
	});
});

describe('numbers', () => {
	test.each([
		['{{add 1 2}}', '3'],
		['{{sub 5 2}}', '3'],
		['{{mul 2 3}}', '6'],
		['{{div 7 2}}', '3.5'],
		['{{mod 7 3}}', '1'],
		['{{mod -7 3}}', '-1'],
		['{{min 3 1 2}}', '1'],
		['{{max 3 1 2}}', '3'],
		['{{round 2.5}}', '3'],
		['{{round 1.005 2}}', '1.01'],
		['{{round 1234.5678 1}}', '1234.6'],
	])('%s is %s', async (template, output) => {
		assert.strictEqual(await run(template), output);
	});

	test('counts from 1 with @index', async () => {
		assert.strictEqual(
			await run('{{#each items}}{{add @index 1}}{{/each}}', {
				items: ['a', 'b'],
			}),
			'12',
		);
	});

	test.each([
		[
			'{{add "1" 2}}',
			"Helper 'add': Expected argument 1 to be a number, got: '1'",
		],
		['{{div 1 0}}', "Helper 'div': Division by zero"],
		['{{mod 1 0}}', "Helper 'mod': Division by zero"],
		[
			'{{round 1 1.5}}',
			"Helper 'round': Expected argument 2 to be an integer, got: 1.5",
		],
		[
			'{{round 1 16}}',
			"Helper 'round': Expected argument 2 to be 0 to 15, got: 16",
		],
		['{{max}}', "Helper 'max': Expected at least 1 argument, but got 0"],
		[
			'{{truncate "a"}}',
			"Helper 'truncate': Expected 2 or 3 arguments, but got 1",
		],
	])('%s fails', async (template, message) => {
		assert.strictEqual(
			await runError(template),
			`${message} (./index.hbs:1:4)`,
		);
	});
});

describe('collections', () => {
	const context = {
		posts: ['a', 'b', 'c', 'd'],
		post: { title: 'T', labels: 'x' },
	};

	test.each([
		['{{length posts}}', '4'],
		['{{length "héllo"}}', '5'],
		['{{length post}}', '2'],
		['{{includes posts "b"}}', 'true'],
		['{{includes "blogger" "log"}}', 'true'],
		['{{first posts}}', 'a'],
		['{{last posts}}', 'd'],
		['{{first "xyz"}}', 'x'],
		['{{join (slice posts 1 3)}}', 'b, c'],
		['{{join (slice posts -2) "|"}}', 'c|d'],
		['{{slice "blogger" 0 4}}', 'blog'],
		['{{join (keys post)}}', 'title, labels'],
		['{{join (values post)}}', 'T, x'],
		['{{#each (slice posts 0 2)}}[{{this}}]{{/each}}', '[a][b]'],
	])('%s is %s', async (template, output) => {
		assert.strictEqual(await run(template, context), output);
	});

	test.each([
		[
			'{{length 5}}',
			"Helper 'length': Expected argument 1 to be an object, got: 5",
		],
		[
			'{{first post}}',
			"Helper 'first': Expected argument 1 to be an array or a string, got: an object",
		],
		[
			'{{join "abc"}}',
			"Helper 'join': Expected argument 1 to be an array, got: 'abc'",
		],
		[
			'{{keys posts}}',
			"Helper 'keys': Expected argument 1 to be an object, got: an array",
		],
		[
			'{{slice posts 1.5}}',
			"Helper 'slice': Expected argument 2 to be an integer, got: 1.5",
		],
	])('%s fails', async (template, message) => {
		assert.strictEqual(
			await runError(template, context),
			`${message} (./index.hbs:1:4)`,
		);
	});
});

describe('values', () => {
	test.each([
		['{{typeOf 1}} {{typeOf "x"}} {{typeOf a}}', 'number string undefined'],
		['{{lookup (fromJson \'{"a":[1,2]}\') "a"}}', '1,2'],
		['{{toJson (array 1 "x")}}', '[1,&quot;x&quot;]'],
		['{{{toJson (hash a=1) 1}}}', '{\n "a": 1\n}'],
		['{{{toJson (object a=1)}}}', '{"a":1}'],
		['{{length (array 1 2 3)}}', '3'],
	])('%s is %o', async (template, output) => {
		assert.strictEqual(await run(template, { a: undefined }), output);
	});

	test.each([
		['{{typeOf}}', "Helper 'typeOf': Expected exactly 1 argument, but got 0"],
		[
			'{{fromJson 1}}',
			"Helper 'fromJson': Expected argument 1 to be a string, got: 1",
		],
		['{{fromJson "{"}}', "Helper 'fromJson': Failed to parse JSON"],
		['{{toJson}}', "Helper 'toJson': Expected 1 or 2 arguments, but got 0"],
		[
			'{{toJson 1 true}}',
			"Helper 'toJson': Expected argument 2 to be a string or a number, got: true",
		],
		['{{hash 1}}', "Helper 'hash': Expected no arguments, but got 1"],
	])('%s fails', async (template, message) => {
		assert.strictEqual(
			await runError(template),
			`${message} (./index.hbs:1:4)`,
		);
	});
});

describe('iif', () => {
	test.each([
		['{{iif yes "a" "b"}}', 'a'],
		['{{iif no "a" "b"}}', 'b'],
		['{{iif no "a"}}', ''],
		['{{iif empty "a" "b"}}', 'b'],
		[
			'<i class=\'{{iif yes "card is-featured" "card"}}\'/>',
			"<i class='card is-featured'/>",
		],
	])('%s is %o', async (template, output) => {
		assert.strictEqual(
			await run(template, { yes: 1, no: 0, empty: [] }),
			output,
		);
	});
});

describe('more strings', () => {
	test.each([
		['{{padStart 7 3 "0"}}', '007'],
		['{{padStart "a" 3}}', '  a'],
		['{{padEnd "a" 3 "-"}}', 'a--'],
		['{{repeat "ab" 3}}', 'ababab'],
		['{{capitalize "élan vital"}}', 'Élan vital'],
		['{{capitalize ""}}', ''],
		['{{slugify "Héllo, World!"}}', 'hello-world'],
		['{{slugify "  Ünïcödé — 2026  "}}', 'unicode-2026'],
		['{{slugify "日本 語"}}', '日本-語'],
		// unescaped, `{{}}` escapes `=` as any output
		['{{{encodeUri "https://a.b/c d?x=é"}}}', 'https://a.b/c%20d?x=%C3%A9'],
		['{{encodeUriComponent "a b&c=d"}}', 'a%20b%26c%3Dd'],
	])('%s is %s', async (template, output) => {
		assert.strictEqual(await run(template), output);
	});

	test.each([
		[
			'{{padStart true 3}}',
			"Helper 'padStart': Expected argument 1 to be a string or a number, got: true",
		],
		[
			'{{padStart "a" 3 ""}}',
			"Helper 'padStart': Expected argument 3 to not be empty",
		],
		[
			'{{repeat "a" -1}}',
			"Helper 'repeat': Expected argument 2 to be 0 to 10000, got: -1",
		],
		[
			'{{slugify 5}}',
			"Helper 'slugify': Expected argument 1 to be a string, got: 5",
		],
	])('%s fails', async (template, message) => {
		assert.strictEqual(
			await runError(template),
			`${message} (./index.hbs:1:4)`,
		);
	});
});

describe('more numbers', () => {
	test.each([
		['{{floor 2.7}}', '2'],
		['{{ceil 2.1}}', '3'],
		['{{abs -3}}', '3'],
		['{{clamp 7 0 5}}', '5'],
		['{{clamp -1 0 5}}', '0'],
		['{{clamp 3 0 5}}', '3'],
	])('%s is %s', async (template, output) => {
		assert.strictEqual(await run(template), output);
	});

	test('clamp needs min before max', async () => {
		assert.strictEqual(
			await runError('{{clamp 1 5 0}}'),
			"Helper 'clamp': Expected argument 2 to be at most argument 3, got: 5 and 0 (./index.hbs:1:4)",
		);
	});
});

describe('more collections', () => {
	const context = {
		tags: ['b', 'a', 'b', 'c', 'a'],
		links: { rss: '/feeds', x: '/x' },
	};

	test.each([
		['{{join (range 1 5)}}', '1, 2, 3, 4, 5'],
		['{{join (range 5 1)}}', '5, 4, 3, 2, 1'],
		['{{join (range 0 10 5)}}', '0, 5, 10'],
		['{{join (range 3 3)}}', '3'],
		['{{#each (range 1 3)}}★{{/each}}', '★★★'],
		['{{join (reverse tags)}}', 'a, c, b, a, b'],
		['{{join tags}}', 'b, a, b, c, a'],
		['{{reverse "abc"}}', 'cba'],
		['{{join (unique tags)}}', 'b, a, c'],
		[
			'{{#each (entries links)}}[{{key}}={{value}}]{{/each}}',
			'[rss=/feeds][x=/x]',
		],
	])('%s is %s', async (template, output) => {
		assert.strictEqual(await run(template, context), output);
	});

	test('reverse does not change the array', async () => {
		assert.strictEqual(
			await run('{{join (reverse tags)}} {{join tags}}', context),
			'a, c, b, a, b b, a, b, c, a',
		);
	});

	test.each([
		[
			'{{range 1 5 0}}',
			"Helper 'range': Expected argument 3 to go from 1 to 5, got: 0",
		],
		[
			'{{range 1 5 -1}}',
			"Helper 'range': Expected argument 3 to go from 1 to 5, got: -1",
		],
		[
			'{{range 1 20000}}',
			"Helper 'range': Expected at most 10000 items, the range has 20000",
		],
		[
			'{{range 1.5 3}}',
			"Helper 'range': Expected argument 1 to be an integer, got: 1.5",
		],
		[
			'{{unique "ab"}}',
			"Helper 'unique': Expected argument 1 to be an array, got: 'ab'",
		],
		[
			'{{entries tags}}',
			"Helper 'entries': Expected argument 1 to be an object, got: an array",
		],
	])('%s fails', async (template, message) => {
		assert.strictEqual(
			await runError(template, context),
			`${message} (./index.hbs:1:4)`,
		);
	});
});
