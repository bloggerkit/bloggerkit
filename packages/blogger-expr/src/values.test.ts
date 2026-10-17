import { assert, describe, test } from 'vitest';
import { evaluate } from './evaluator';
import { ParseError, parse } from './parser';
import { imageValue, plain, RichValue, urlValue } from './values';

const IMAGE = 'https://blogger.googleusercontent.com/img/b/x/s1600/a.jpg';
const resized = (params: string) => IMAGE.replace('s1600', params);

describe('RichValue', () => {
	const blog1 = { id: 'Blog1', type: 'Blog' };
	const html1 = { id: 'HTML1', type: 'HTML' };
	const widgets = new RichValue([blog1, html1], {
		Blog1: blog1,
		HTML1: html1,
		Blog: [blog1],
		first: 'a property named like a built-in one',
	});
	const data = { widgets, title: new RichValue('Hello', { note: 'n' }) };

	test('a list with properties is the list, with its properties', () => {
		assert.deepEqual(evaluate('data:widgets[0]', { data }), blog1);
		assert.deepEqual(evaluate('data:widgets.Blog1', { data }), blog1);
		assert.deepEqual(
			evaluate('data:widgets.Blog.first.type', { data }),
			'Blog',
		);
		assert.strictEqual(evaluate('data:widgets.length', { data }), 2);
		assert.deepEqual(evaluate('data:widgets map (w => w.id)', { data }), [
			'Blog1',
			'HTML1',
		]);
		assert.strictEqual(evaluate('data:widgets.Nothing', { data }), null);
	});

	test('the built-in properties come first', () => {
		assert.deepEqual(evaluate('data:widgets.first', { data }), blog1);
	});

	test('a string with properties is the string, with its properties', () => {
		assert.strictEqual(evaluate('data:title.note', { data }), 'n');
		assert.strictEqual(evaluate('data:title.length', { data }), 5);
		assert.strictEqual(evaluate('data:title + "!"', { data }), 'Hello!');
		assert.strictEqual(evaluate('data:title == "Hello"', { data }), true);
		assert.strictEqual(evaluate('"ell" in data:title', { data }), true);
		assert.strictEqual(evaluate('data:title ? 1 : 2', { data }), 1);
		assert.strictEqual(
			evaluate('data:title.nothing', { data, strict: false }),
			null,
		);
		assert.throws(
			() => evaluate('data:title.nothing', { data, strict: true }),
			/Cannot read property 'nothing'/,
		);
	});

	test('it is its value as text and in JSON', () => {
		assert.strictEqual(String(data.title), 'Hello');
		assert.strictEqual(JSON.stringify({ a: data.title }), '{"a":"Hello"}');
		assert.deepEqual(plain(widgets), [blog1, html1]);
	});

	test('a property can be computed when it is read', () => {
		let reads = 0;
		const value = new RichValue('x', { later: () => ++reads });
		assert.strictEqual(evaluate('data:v.later', { data: { v: value } }), 1);
		assert.strictEqual(reads, 1);
	});
});

describe('urlValue', () => {
	const url = (href: string) => ({ data: { url: urlValue(href) } });

	test('canonical leaves the country domain of Blogger out', () => {
		assert.strictEqual(
			String(
				evaluate(
					'data:url.canonical',
					url('https://a.blogspot.co.uk/p.html?m=1'),
				),
			),
			'https://a.blogspot.com/p.html?m=1',
		);
		assert.strictEqual(
			String(
				evaluate('data:url.canonical', url('https://a.blogspot.com/p.html')),
			),
			'https://a.blogspot.com/p.html',
		);
		assert.strictEqual(
			String(evaluate('data:url.canonical', url('https://example.com/p.html'))),
			'https://example.com/p.html',
		);
	});

	test('http and https set the scheme, and are URLs too', () => {
		assert.strictEqual(
			String(evaluate('data:url.https', url('http://a.blogspot.in/'))),
			'https://a.blogspot.in/',
		);
		assert.strictEqual(
			String(evaluate('data:url.http', url('//a.blogspot.com/'))),
			'http://a.blogspot.com/',
		);
		assert.strictEqual(
			String(
				evaluate('data:url.canonical.https', url('http://a.blogspot.in/')),
			),
			'https://a.blogspot.com/',
		);
		assert.strictEqual(
			evaluate('data:url path "search"', url('https://a.blogspot.com/p')),
			'https://a.blogspot.com/search',
		);
	});
});

describe('resizeImage', () => {
	const run = (expression: string) =>
		evaluate(expression, {
			data: { image: IMAGE, other: 'https://example.com/a.jpg' },
		});
	const props = (expression: string) =>
		['isResizable', 'width', 'height'].map((name) =>
			evaluate(`(${expression}).${name}`, {
				data: { image: IMAGE, other: 'https://example.com/a.jpg' },
			}),
		);

	test('without a ratio, only the width is set', () => {
		assert.strictEqual(
			String(run('resizeImage(data:image, 640)')),
			resized('w640'),
		);
		assert.deepEqual(props('resizeImage(data:image, 640)'), [true, 640, null]);
	});

	test('a ratio at least as wide as tall crops', () => {
		assert.strictEqual(
			String(run('resizeImage(data:image, 640, "16:9")')),
			resized('w640-h360-p-k-no-nu'),
		);
		assert.deepEqual(props('resizeImage(data:image, 640, "16:9")'), [
			true,
			640,
			360,
		]);
		assert.strictEqual(
			String(run('resizeImage(data:image, 640, "1:1")')),
			resized('w640-h640-p-k-no-nu'),
		);
		assert.strictEqual(
			String(run('resizeImage(data:image, 640, " 16 : 9 ")')),
			resized('w640-h360-p-k-no-nu'),
		);
	});

	test('a taller ratio is ignored', () => {
		assert.strictEqual(
			String(run('resizeImage(data:image, 640, "9:16")')),
			resized('w640'),
		);
		assert.deepEqual(props('resizeImage(data:image, 640, "9:16")'), [
			true,
			640,
			null,
		]);
	});

	test('a ratio that is not two positive integers is an error', () => {
		for (const ratio of [
			'"wide"',
			'"1:0"',
			'"0:1"',
			'"1.5:1"',
			'"16:9:1"',
			'data:n',
		]) {
			assert.throws(
				() =>
					evaluate(`resizeImage(data:image, 640, ${ratio})`, {
						data: { image: IMAGE, n: 2 },
					}),
				/argument 3 must be a ratio of positive integers/,
				ratio,
			);
		}
	});

	test('an image not hosted by Blogger is left as it is', () => {
		assert.strictEqual(
			String(run('resizeImage(data:other, 640)')),
			'https://example.com/a.jpg',
		);
		assert.deepEqual(props('resizeImage(data:other, 640)'), [
			false,
			null,
			null,
		]);
	});

	test('an image value is resized, and sourceSet ignores a taller ratio too', () => {
		const data = { image: imageValue(IMAGE, { width: 1600, height: 900 }) };
		assert.deepEqual(
			['isResizable', 'width', 'height'].map((name) =>
				evaluate(`data:image.${name}`, { data }),
			),
			[true, 1600, 900],
		);
		assert.strictEqual(
			String(evaluate('resizeImage(data:image, 640)', { data })),
			resized('w640'),
		);
		assert.strictEqual(
			evaluate('sourceSet(data:image, [400, 800], "9:16")', { data }),
			`${resized('w400')} 400w, ${resized('w800')} 800w`,
		);
	});
});

test('a rich value is a string in the parameters of a URL', () => {
	assert.strictEqual(
		evaluate(
			'params("https://a.com/", { media: resizeImage(data:image, 640) })',
			{
				data: { image: IMAGE },
			},
		),
		`https://a.com/?media=${encodeURIComponent(resized('w640'))}`,
	);
});

describe('the width of resizeImage and sourceSet', () => {
	const data = { image: IMAGE, n: 640, s: '640' };
	const run = (expression: string) => String(evaluate(expression, { data }));

	test('is an integer of 0 or more, as a number or a string of digits only', () => {
		assert.strictEqual(run('resizeImage(data:image, 640)'), resized('w640'));
		assert.strictEqual(run('resizeImage(data:image, "640")'), resized('w640'));
		assert.strictEqual(run('resizeImage(data:image, 0)'), resized('w0'));
		assert.strictEqual(run('resizeImage(data:image, "0")'), resized('w0'));
		assert.strictEqual(run('resizeImage(data:image, data:n)'), resized('w640'));
		assert.strictEqual(
			run('resizeImage(data:image, data:s, "16:9")'),
			resized('w640-h360-p-k-no-nu'),
		);
		assert.strictEqual(
			run('sourceSet(data:image, [400, "800"])'),
			`${resized('w400')} 400w, ${resized('w800')} 800w`,
		);
	});

	test('anything else is an error, when parsing a literal and when evaluating', () => {
		for (const width of [
			'" 640"',
			'"640 "',
			'"1.5"',
			'"-1"',
			'"wide"',
			'1.5',
			'-640',
			'true',
		]) {
			assert.throws(
				() => evaluate(`resizeImage(data:image, ${width})`, { data }),
				/argument 2 must be an integer of 0 or more/,
				width,
			);
			assert.throws(
				() => evaluate(`sourceSet(data:image, [400, ${width}])`, { data }),
				/item 2 of argument 2 must be an integer of 0 or more/,
				width,
			);
		}
		for (const width of [' 640', '1.5', -1, true]) {
			assert.throws(
				() =>
					evaluate('resizeImage(data:image, data:w)', {
						data: { image: IMAGE, w: width },
					}),
				/resizeImage\(\): argument 2 must be an integer of 0 or more/,
				String(width),
			);
			assert.throws(
				() =>
					evaluate('sourceSet(data:image, data:w)', {
						data: { image: IMAGE, w: [width] },
					}),
				/sourceSet\(\): item 1 of argument 2 must be an integer of 0 or more/,
				String(width),
			);
		}
	});
});

describe('the widths of sourceSet', () => {
	test('a bad item is the place of the error, when parsing and when evaluating', () => {
		try {
			parse('sourceSet(data:image, [400, "x", 800])');
			assert.fail('expected an error');
		} catch (error) {
			assert.instanceOf(error, ParseError);
			assert.strictEqual(
				error.message,
				'sourceSet(): item 2 of argument 2 must be an integer of 0 or more, a number or a string of digits only, 640 or "640" (at position 28)',
			);
		}
		assert.throws(
			() =>
				evaluate('sourceSet(data:image, data:w)', {
					data: { image: IMAGE, w: [400, 800, '1.5'] },
				}),
			/sourceSet\(\): item 3 of argument 2 must be an integer of 0 or more, .*, got: "1.5"/,
		);
	});

	test('an empty list gives an empty string', () => {
		assert.strictEqual(
			evaluate('sourceSet(data:image, [])', { data: { image: IMAGE } }),
			'',
		);
		assert.strictEqual(
			evaluate('sourceSet(data:image, data:w)', {
				data: { image: IMAGE, w: [] },
			}),
			'',
		);
	});
});
