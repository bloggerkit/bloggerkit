import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, describe, test } from 'vitest';
import type { Node } from './ast';
import { parse } from './parser';
import { PrintError, type PrintOptions, print } from './printer';

/** Removes the spans, which `print` does not keep. */
function withoutSpans(node: unknown): unknown {
	return JSON.parse(
		JSON.stringify(node, (key, value) => (key === 'span' ? undefined : value)),
	);
}

/** Prints `node`, checks that parsing the text gives `node` back. */
function roundTrip(node: Node, options?: PrintOptions): string {
	const text = print(node, options);
	assert.deepEqual(withoutSpans(parse(text)), withoutSpans(node), text);
	return text;
}

/** Parses and prints `source`. */
function reprint(source: string, options?: PrintOptions): string {
	return roundTrip(parse(source), options);
}

// Builders for nodes the parser would never produce.
const span = { start: 0, end: 0 };
const data = (name: string): Node => ({ type: 'DataReference', name, span });
const string = (value: string): Node => ({
	type: 'StringLiteral',
	value,
	span,
});
const number = (value: number): Node => ({
	type: 'NumberLiteral',
	value,
	span,
});
const identifier = (name: string): Node => ({ type: 'Identifier', name, span });
const member = (object: Node, property: string): Node => ({
	type: 'MemberExpression',
	object,
	property,
	span,
});
const index = (object: Node, value: Node): Node => ({
	type: 'IndexExpression',
	object,
	index: value,
	span,
});
const call = (callee: string, ...args: Node[]): Node =>
	({ type: 'CallExpression', callee, args, span }) as Node;
const infix = (left: Node, right: Node): Node => ({
	type: 'NamedOperatorExpression',
	operator: 'path',
	left,
	right,
	span,
});
const lambda = (source: Node, param: string, body: Node): Node => ({
	type: 'LambdaExpression',
	operator: 'map',
	source,
	param,
	body,
	span,
});
const map = (entries: Record<string, Node>): Node => ({
	type: 'MapLiteral',
	entries: Object.entries(entries).map(([key, value]) => ({ key, value })),
	span,
});

test('prints parsed expressions back', () => {
	assert.strictEqual(reprint('data:view.isHomepage'), 'data:view.isHomepage');
	assert.strictEqual(
		reprint('data:links filter (l => l.name)'),
		'data:links filter (l => l.name)',
	);
	assert.strictEqual(
		reprint(`
data:links filter (l =>
  l.name in {"https://", "#"}
)
`),
		'data:links filter (l => l.name in {"https://", "#"})',
	);
});

test('prints every expression of the corpus back', async () => {
	const here = dirname(fileURLToPath(import.meta.url));
	const corpus: string[] = JSON.parse(
		await readFile(join(here, 'corpus.expr.json'), 'utf8'),
	);

	for (const source of corpus) {
		reprint(source);
		reprint(source, { indent: 2, printWidth: 40 });
	}
});

describe('literals', () => {
	test.each([
		['"hello"', '"hello"'],
		['"say \\"hi\\""', '"say \\"hi\\""'],
		['.5', '0.5'],
		['yes', 'true'],
		['no', 'false'],
		['data:', 'data:.'],
		['[1,2 , 3]', '[1, 2, 3]'],
		['{}', '{}'],
		['{"a","b"}', '{"a", "b"}'],
		['{ a: 1, "b c": 2, "data": 3 }', '{ a: 1, "b c": 2, "data": 3 }'],
	])('%s', (source, expected) => {
		assert.strictEqual(reprint(source), expected);
	});

	test('numbers without an exponent', () => {
		assert.strictEqual(roundTrip(number(1e21)), '1000000000000000000000');
		assert.strictEqual(roundTrip(number(1e-7)), '0.0000001');
	});

	test('a "data" map key is quoted, data: starts a path', () => {
		assert.strictEqual(roundTrip(map({ data: number(1) })), '{ "data": 1 }');
	});
});

describe('paths', () => {
	test.each([
		['data:blog.author-name', 'data:blog.author-name'],
		['data:posts.0.title', 'data:posts.0.title'],
		['data:a..b', 'data:a.b'],
		['data:a[0].b["c"]', 'data:a[0].b["c"]'],
	])('%s', (source, expected) => {
		assert.strictEqual(reprint(source), expected);
	});

	test('a member of an empty path is wrapped', () => {
		const empty: Node = { type: 'EmptyDataReference', span };
		assert.strictEqual(roundTrip(member(empty, 'x')), '(data:.).x');
	});
});

describe('operators', () => {
	test.each([
		// the spelling is normalized
		['data:a eq 1 && not data:b', 'data:a == 1 and !data:b'],
		['data:a lt 1 || data:b gte 2', 'data:a < 1 or data:b >= 2'],
		// parentheses are only kept where they are needed
		['1 + 2 * 3', '1 + 2 * 3'],
		['(1 + 2) * 3', '(1 + 2) * 3'],
		['(1 - 2) - 3', '1 - 2 - 3'],
		['1 - (2 - 3)', '1 - (2 - 3)'],
		// Blogger reads `-(...)` without its `-`
		['-(1 + 2)', '1 + 2'],
		['(data:a or data:b) and data:c', '(data:a or data:b) and data:c'],
		['data:a in [1] not in [2]', 'data:a in [1] not in [2]'],
		['data:a in ([1] contains 1)', 'data:a in ([1] contains 1)'],
		['data:a ? 1 : data:b ? 2 : 3', 'data:a ? 1 : data:b ? 2 : 3'],
		['(data:a ? 1 : 2) ? 3 : 4', '(data:a ? 1 : 2) ? 3 : 4'],
		['data:a ?: data:b ?: 1', 'data:a ?: data:b ?: 1'],
		['(data:a ?: data:b) ?: 1', '(data:a ?: data:b) ?: 1'],
	])('%s', (source, expected) => {
		assert.strictEqual(reprint(source), expected);
	});
});

describe('functions and lambdas', () => {
	test.each([
		['path(data:url, (data:a + "x"))', 'path(data:url, (data:a + "x"))'],
		['data:url path "a"', 'data:url path "a"'],
		['[(data:url path "a")]', '[(data:url path "a")]'],
		[
			'data:l filter (i => i.ok) map (i => i.name)',
			'data:l filter (i => i.ok) map (i => i.name)',
		],
		[
			'(data:l filter (i => i.ok)).length',
			'(data:l filter (i => i.ok)).length',
		],
	])('%s', (source, expected) => {
		assert.strictEqual(reprint(source), expected);
	});

	test('what follows an infix function is wrapped, it would be its operand', () => {
		const url = infix(data('a'), string('x'));
		assert.strictEqual(roundTrip(member(url, 'b')), '(data:a path "x").b');
		assert.strictEqual(
			roundTrip(infix(url, string('y'))),
			'(data:a path "x") path "y"',
		);
		assert.strictEqual(
			roundTrip(lambda(url, 'v', identifier('v'))),
			'(data:a path "x") map (v => v)',
		);
	});
});

describe('errors', () => {
	test.each([
		['a string ending with a backslash', string('a\\'), /end with a backslash/],
		['a string with a line break', string('a\nb'), /line break/],
		['an empty map', map({}), /empty map/],
		['NaN', number(Number.NaN), /has to be finite/],
		['an identifier out of a lambda', identifier('x'), /out of scope/],
		[
			'a keyword as identifier',
			lambda(data('a'), 'true', identifier('true')),
			/read as a keyword/,
		],
		[
			'a dashed property out of a data path',
			lambda(data('a'), 'l', member(identifier('l'), 'author-name')),
			/has to be an identifier/,
		],
		[
			'indexing something else than a data path',
			lambda(data('a'), 'l', index(identifier('l'), number(0))),
			/Only a 'data:' path can be indexed/,
		],
		['a wrong number of arguments', call('path', string('a')), /expects 2/],
		[
			'a wrong argument',
			call('path', number(1), string('a')),
			/must be a string literal/,
		],
		['an unknown function', call('len'), /Unknown function 'len'/],
		['a malformed node', { type: 'ListLiteral', span } as Node, /array/],
	])('%s', (_, node, message) => {
		assert.throws(() => print(node), PrintError, message);
	});

	test('tells where the node is', () => {
		const node = call('path', data('url'), string('a\\'));
		try {
			print(node);
			assert.fail('expected an error');
		} catch (error) {
			assert.instanceOf(error, PrintError);
			assert.strictEqual(error.path, 'root.args[1]');
			assert.match(error.message, /\(at root\.args\[1\]\)$/);
		}
	});

	test('a cycle', () => {
		const node = { type: 'UnaryExpression', operator: '!', span } as Record<
			string,
			unknown
		>;
		node.argument = node;
		assert.throws(() => print(node as unknown as Node), PrintError, /cycle/);
	});
});

describe('large expressions', () => {
	test('long chains do not overflow the stack', () => {
		const or = Array.from({ length: 20_000 }, (_, i) => `data:a${i}`).join(
			' or ',
		);
		assert.strictEqual(print(parse(or)), or);
	});

	test('too deep nesting is a PrintError', () => {
		let node = number(1);
		for (let i = 0; i < 1_000_000; i++) {
			node = { type: 'UnaryExpression', operator: '!', argument: node, span };
		}
		assert.throws(() => print(node), PrintError, /nested too deeply/);
	});
});

describe('pretty printing', () => {
	const pretty = (source: string, printWidth: number) =>
		reprint(source, { indent: 2, printWidth });

	test('what fits stays on a line', () => {
		assert.strictEqual(pretty('data:a and data:b', 80), 'data:a and data:b');
	});

	test('breaks before operators', () => {
		assert.strictEqual(
			pretty(
				'data:view.isHomepage or data:view.isSingleItem or data:view.isError',
				30,
			),
			`data:view.isHomepage
  or data:view.isSingleItem
  or data:view.isError`,
		);
	});

	test('breaks conditionals before ? and :', () => {
		assert.strictEqual(
			pretty('data:view.isHomepage ? data:blog.title : data:view.title', 30),
			`data:view.isHomepage
  ? data:blog.title
  : data:view.title`,
		);
	});

	test('breaks collections one item per line', () => {
		assert.strictEqual(
			pretty('data:blog.view not in ["x-content-blog", "x-content-lazy"]', 30),
			`data:blog.view not in [
  "x-content-blog",
  "x-content-lazy"
]`,
		);
	});

	test('breaks lambda chains and bodies', () => {
		assert.strictEqual(
			pretty(
				'data:links filter (l => l.name == "icon") map (l => l.target)',
				40,
			),
			`data:links
  filter (l => l.name == "icon")
  map (l => l.target)`,
		);
		assert.strictEqual(
			pretty(
				'data:links filter (l => l.name contains "https://" or l.name contains "#")',
				40,
			),
			`data:links filter (l =>
  l.name contains "https://"
    or l.name contains "#"
)`,
		);
	});

	test('rejects invalid options', () => {
		assert.throws(() => print(number(1), { indent: -1 }), RangeError);
		assert.throws(() => print(number(1), { printWidth: 0 }), RangeError);
	});
});
