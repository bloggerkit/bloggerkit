import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
	type ExpressionContext,
	type PrintOptions,
	parse,
	print,
	type Root,
} from './index';

function format(
	source: string,
	options: PrintOptions = {},
	context?: ExpressionContext,
): string {
	const { ast, errors } = parse(source, { context });
	expect(errors).toEqual([]);
	return print(ast as Root, options);
}

/** A tree without positions, to compare trees printed differently. */
function shape(node: Root | undefined): string {
	return JSON.stringify(node, (key, value) =>
		key === 'span' || key === 'loc' ? undefined : value,
	);
}

describe('print on one line', () => {
	test.each([
		['data:a  +  "x"', 'data:a + "x"'],
		['[1,2,]', '[1, 2]'],
		['{a:  1}', '{ a: 1 }'],
		['data:l map x=>x', 'data:l map x => x'],
		['"x" + "ab" .length', '"x" + "ab" .length'],
		['data:a eq 1 && not data:b', 'data:a eq 1 && not data:b'],
	])('%s', (source, expected) => {
		expect(format(source, { printWidth: Number.POSITIVE_INFINITY })).toBe(
			expected,
		);
	});
});

describe('print to a width', () => {
	const chain =
		'data:posts filter (p => p.title != "" and p.labels.any) map (p => p.title) take 3';

	test('a chain that fits stays on one line', () => {
		expect(format(chain, { printWidth: 100 })).toBe(chain);
	});

	test('a chain of steps breaks before each step', () => {
		expect(format(chain, { printWidth: 80 })).toBe(
			[
				'data:posts',
				'  filter (p => p.title != "" and p.labels.any)',
				'  map (p => p.title)',
				'  take 3',
			].join('\n'),
		);
	});

	test('a lambda body breaks inside its parentheses', () => {
		expect(format(chain, { printWidth: 40 })).toBe(
			[
				'data:posts',
				'  filter (p =>',
				'    p.title != "" and p.labels.any',
				'  )',
				'  map (p => p.title)',
				'  take 3',
			].join('\n'),
		);
	});

	test('one step stays beside its list', () => {
		expect(
			format(
				'data:links filter (l => l.name == data:c.name and l.target not in ["https://", "#"])',
				{ printWidth: 50 },
			),
		).toBe(
			[
				'data:links filter (l =>',
				'  l.name == data:c.name and',
				'  l.target not in ["https://", "#"]',
				')',
			].join('\n'),
		);
	});

	const conditions =
		'!data:blog.isPrivateBlog and !data:view.isPreview and (data:view.isHomepage or data:view.isPost)';

	test('operators break after each operator', () => {
		expect(format(conditions, { printWidth: 80 })).toBe(
			[
				'!data:blog.isPrivateBlog and',
				'  !data:view.isPreview and',
				'  (data:view.isHomepage or data:view.isPost)',
			].join('\n'),
		);
	});

	test('operators in parentheses line up under the first', () => {
		expect(format(conditions, { printWidth: 40 })).toBe(
			[
				'!data:blog.isPrivateBlog and',
				'  !data:view.isPreview and',
				'  (',
				'    data:view.isHomepage or',
				'    data:view.isPost',
				'  )',
			].join('\n'),
		);
	});

	const ternary =
		'data:size == "1px" ? 1 : data:size == "2px" ? 2 : data:size == "3px" ? 3 : 7';

	test('ternaries after `:` break together, one level further in', () => {
		expect(format(ternary, { printWidth: 40 })).toBe(
			[
				'data:size == "1px"',
				'  ? 1',
				'  : data:size == "2px"',
				'    ? 2',
				'    : data:size == "3px"',
				'      ? 3',
				'      : 7',
			].join('\n'),
		);
	});

	test('tabWidth', () => {
		expect(format(ternary, { printWidth: 40, tabWidth: 4 })).toBe(
			[
				'data:size == "1px"',
				'    ? 1',
				'    : data:size == "2px"',
				'        ? 2',
				'        : data:size == "3px"',
				'            ? 3',
				'            : 7',
			].join('\n'),
		);
	});

	const call =
		'snippet(data:post.body, { length: 100, links: false, linebreaks: false })';

	test('a call that fits stays on one line', () => {
		expect(format(call, { printWidth: 80 })).toBe(call);
	});

	test('a last map is kept beside the other arguments', () => {
		expect(format(call, { printWidth: 60 })).toBe(
			[
				'snippet(data:post.body, {',
				'  length: 100,',
				'  links: false,',
				'  linebreaks: false',
				'})',
			].join('\n'),
		);
	});

	test('trailingComma: all ends a broken map with a comma', () => {
		expect(format(call, { printWidth: 60, trailingComma: 'all' })).toBe(
			[
				'snippet(data:post.body, {',
				'  length: 100,',
				'  links: false,',
				'  linebreaks: false,',
				'})',
			].join('\n'),
		);
	});

	test('bracketSpacing: false', () => {
		expect(format(call, { bracketSpacing: false })).toBe(
			'snippet(data:post.body, {length: 100, links: false, linebreaks: false})',
		);
	});

	test('arguments that do not fit beside the call go one a line', () => {
		expect(
			format(
				'resizeImage(data:post.featuredImage, (data:wide ? 720 : 540), (data:wide ? "16:9" : "1:1"))',
				{
					printWidth: 50,
					tabWidth: 4,
				},
			),
		).toBe(
			[
				'resizeImage(',
				'    data:post.featuredImage,',
				'    (data:wide ? 720 : 540),',
				'    (data:wide ? "16:9" : "1:1")',
				')',
			].join('\n'),
		);
	});

	test('useTabs, and a trailing comma in a list', () => {
		expect(
			format('["https://", "http://", "//", "#", "mailto:", "tel:"]', {
				printWidth: 30,
				useTabs: true,
				trailingComma: 'all',
			}),
		).toBe(
			[
				'[',
				'\t"https://",',
				'\t"http://",',
				'\t"//",',
				'\t"#",',
				'\t"mailto:",',
				'\t"tel:",',
				']',
			].join('\n'),
		);
	});

	test('a tab counts as tabWidth columns', () => {
		const source = '[data:a, data:b, data:c]';
		expect(
			format(`[${source}]`, { printWidth: 20, useTabs: true, tabWidth: 8 }),
		).toBe(
			['[', '\t[', '\t\tdata:a,', '\t\tdata:b,', '\t\tdata:c', '\t]', ']'].join(
				'\n',
			),
		);
	});
});

describe('printing keeps the tree', () => {
	const samples: [string, ExpressionContext?][] = [
		['"Page " + data:n + " of " + data:total'],
		['data:a - 1 - (2 * 3) / 4 % 5'],
		['data:a ?: data:b ?: "default"'],
		['data:a eq 1 && data:b neq 2 || not data:c'],
		['"x" in data:list and data:list not contains "y"'],
		['data:a ? (data:b ? 1 : 2) : data:c ? 3 : 4'],
		[
			'data:posts filter (p => p.labels any (l => l.name == "news")) map (p => { title: p.title, url: p.url }) skip 1 take 2',
		],
		['data:l map x => x + 1'],
		['data:l count (x => x > 1) + data:l.length'],
		['data:blog.homepageUrl path "search" params { q: "x", max: 10 }'],
		['(data:l filter (x => x)).first.title.escaped'],
		['"x" + "ab" .length + data:n .size'],
		['data:l[data:i + 1].name'],
		['data:a.b."c-d"[0]'],
		['{ "a-b": 1, c: [1, 2, { d: (data:x + 1) }], e: {} }'],
		['{1, 2, 3}'],
		[
			'format(data:post.date, "EEEE d MMMM yyyy") + " " + snippet(data:post.body, { length: 100 })',
		],
		['+(data:a, data:b, data:c) + -(data:d)'],
		['and(data:a, or(data:b, data:c), !data:d)'],
		['resizeImage(data:img, 640, "16:9") sourceSet [320, 640, 960]'],
		['data:missing ?: [] take 1'],
		['1 ..3'],
		['1 to data:n', 'loop-values'],
		['1..5', 'loop-values'],
		['(1)..3', 'loop-values'],
		['true ? 1 : data:n to data:missing ?: 4', 'loop-values'],
	];
	const fixture = JSON.parse(
		readFileSync(new URL('./operators.fixture.json', import.meta.url), 'utf8'),
	) as {
		kinds: string[];
		operators: string[];
	};
	const sources = [
		...samples,
		...fixture.operators.flatMap((operator) =>
			fixture.kinds.flatMap((a) =>
				fixture.kinds.map((b): [string] => [`${a} ${operator} ${b}`]),
			),
		),
	].filter(
		([source, context]) => parse(source, { context }).errors.length === 0,
	);

	const variants: PrintOptions[] = [
		1,
		20,
		40,
		80,
		Number.POSITIVE_INFINITY,
	].flatMap((printWidth) => [
		{ printWidth },
		{
			printWidth,
			useTabs: true,
			trailingComma: 'all' as const,
			bracketSpacing: false,
		},
	]);

	test.each(sources)('%s', (source, context) => {
		const tree = shape(parse(source, { context }).ast);
		for (const options of variants) {
			const printed = format(source, options, context);
			expect(
				shape(parse(printed, { context }).ast),
				`${JSON.stringify(options)}\n${printed}`,
			).toBe(tree);
			if (options.printWidth === Number.POSITIVE_INFINITY) {
				expect(printed).not.toContain('\n');
			}
		}
	});
});
