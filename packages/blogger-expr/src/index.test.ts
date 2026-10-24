import { describe, expect, test } from 'vitest';
import {
	cost,
	ExpressionError,
	evaluate,
	formatDiagnostic,
	parse,
	print,
	toText,
} from './index';
import { Decimal } from './values';

describe('parse', () => {
	test('returns the tree, the cost, errors and warnings', () => {
		const result = parse('data:posts filter (p => p.title != "") take 3');
		expect(result.errors).toEqual([]);
		expect(result.ast?.type).toBe('TakeOrSkip');
		expect(result.cost).toBe(9);
		expect(result.cost).toBe(result.ast && cost(result.ast));
	});

	test('nodes keep how they were written, and where', () => {
		expect(parse('data:x eq 007').ast).toMatchObject({
			type: 'Equality',
			operator: { name: 'equal', spelling: 'eq', span: { start: 7, end: 9 } },
			left: { type: 'DataPath', root: 'x', properties: [] },
			right: { type: 'NumberLiteral', raw: '007', value: 7 },
		});
		expect(parse('data:a.b and\n  not yes').ast).toMatchObject({
			type: 'Logical',
			operator: { name: 'and', spelling: 'and' },
			left: { root: 'a', properties: ['b'] },
			right: {
				type: 'LogicalNot',
				operator: { spelling: 'not' },
				operand: { type: 'BooleanLiteral', raw: 'yes', value: true },
				loc: {
					start: { line: 2, column: 3, offset: 15 },
					end: { line: 2, column: 10, offset: 22 },
				},
			},
		});
		expect(parse('{ a: 1, "a-b": "x" }').ast).toMatchObject({
			type: 'MapLiteral',
			entries: [
				{ key: { text: 'a', quoted: false } },
				{
					key: { text: 'a-b', quoted: true },
					value: { raw: '"x"', value: 'x' },
				},
			],
		});
		expect(parse('1 + 2 + "a"').ast).toMatchObject({
			type: 'PlusChain',
			operators: [{ name: 'plus' }, { name: 'plus' }],
		});
		expect(parse('"ab".length').ast).toMatchObject({
			type: 'PropertyAccess',
			appliesTo: 'everythingBefore',
		});
		expect(parse('{1, 2}').ast).toMatchObject({
			type: 'ListLiteral',
			notation: 'braces',
		});
		expect(parse('data:a not in data:b').ast).toMatchObject({
			type: 'Membership',
			operator: { name: 'in', spelling: 'not in' },
			negated: true,
		});
	});

	test('an error says what, why, where and how', () => {
		const [error] = parse('data:x + 5-3').errors;
		expect(error).toMatchObject({
			severity: 'error',
			code: 'minus-spacing',
			line: 1,
			column: 10,
		});
		expect(error?.fix).toBe('put spaces around the minus: 5 - 3');
		expect(formatDiagnostic(error as never)).toBe(
			[
				'error minus-spacing at 1:10: `5-3` is two values with no operator between them.',
				'  data:x + 5-3',
				'           ^^^',
				'  cause: A `-` written right before a digit starts a negative number, so `5-3` reads as `5` followed by `-3`. A subtraction has spaces around its `-`.',
				'  fix: put spaces around the minus: 5 - 3',
			].join('\n'),
		);
	});

	test('the location is on the right line', () => {
		const [error] = parse('true and\n  null').errors;
		expect(error).toMatchObject({ code: 'null-literal', line: 2, column: 3 });
	});

	test.each([
		['"a" + data:x ?: "b"', 'default-in-operation'],
		['20 + 25 + ""', 'plus-joins-numbers'],
		['"x" + "ab".length', 'member-applies-to-all'],
		['data:post.title contains "20"', 'text-search-on-data'],
		['data:n == 007', 'number-text-equality'],
		['data:a / data:b', 'divisor-may-be-zero'],
		['snippet(((data:a).b))', 'missing-member-of-parentheses'],
	])('warns: %s', (source, code) => {
		const result = parse(source);
		expect(result.errors).toEqual([]);
		expect(result.warnings.map((w) => w.code)).toContain(code);
		expect(result.warnings.find((w) => w.code === code)?.fix).toBeTruthy();
	});

	test.each([
		['5 ? 1 : 2', 'condition-not-boolean'],
		['path("x")', 'argument-count'],
		['resizeImage(data:img, "wide")', 'argument-type'],
		['params(data:url, {})', 'argument-type'],
		['1 % 0', 'remainder-by-zero'],
		['==(1)', 'operator-function-count'],
		['"abc" filter (x => true)', 'lambda-on-literal'],
		['lower("A")', 'bare-word'],
		['data:l map (x => data:m map (y => x))', 'outer-parameter'],
		['[1 + 1]', 'needs-parentheses'],
		['snippet("abc".length)', 'needs-parentheses'],
		['data:a path "b" path "c"', 'infix-after-infix'],
	])('refuses: %s', (source, code) => {
		expect(parse(source).errors.map((e) => e.code)).toContain(code);
	});
});

describe('names of JavaScript objects', () => {
	test.each([
		'constructor(1, 2)',
		'toString(1, 2)',
		'hasOwnProperty(1)',
		'data:a valueOf data:b',
		'data:l map (x => x) __proto__ 1',
	])('%s is refused, without throwing', (source) => {
		expect(parse(source).errors.length).toBeGreaterThan(0);
	});

	test.each([
		'data:s.constructor',
		'data:s.__proto__',
		'data:s.toString',
		'data:d.constructor',
		'data:d.__proto__',
		'data:l.constructor',
		'data:constructor',
		'data:__proto__',
		'data:toString',
	])('%s reads nothing', (source) => {
		const data = { s: 'x', d: new Date('2026-08-09T10:00:00Z'), l: [1] };
		expect(evaluate(source, { data })).toBeUndefined();
	});
});

describe('map keys that are names of JavaScript objects', () => {
	test.each([
		['{ __proto__: 1, a: 2 }.__proto__', '1'],
		['{ __proto__: 1, a: 2 }.a', '2'],
		['{ __proto__: 1 }', '[Object]'],
		['{ constructor: 1 }.constructor', '1'],
		['{ toString: 1 } + ""', '[Object]'],
		[
			'params("http://a.com/", { __proto__: "x", constructor: "y" })',
			'http://a.com/?__proto__=x&constructor=y',
		],
		['snippet("abc", { __proto__: 1 })', 'abc'],
		['{ toString: 1 } == { toString: 1 }', 'true'],
		['{ a: 1 } == { toString: 1 }', 'false'],
		['{} == { toString: 1 }', 'false'],
	])('%s is %s', (source, expected) => {
		expect(toText(evaluate(source))).toBe(expected);
	});

	test('a data map with an own __proto__ key', () => {
		const data = JSON.parse('{"m": {"__proto__": "own", "a": 1}}');
		expect(toText(evaluate('data:m.__proto__', { data }))).toBe('own');
		expect(
			toText(evaluate('appendParams("http://a.com/", data:m)', { data })),
		).toBe('http://a.com/?__proto__=own&a=1');
	});
});

describe('values the evaluator must not stumble on', () => {
	const date = new Date('2026-08-09T10:00:00Z'); // a Sunday

	test("'' inside quoted pattern text is a quote", () => {
		expect(
			evaluate(`format(data:d, "h 'o''clock'")`, { data: { d: date } }),
		).toBe("10 o'clock");
		expect(evaluate(`format(data:d, "h''mm")`, { data: { d: date } })).toBe(
			"10'00",
		);
	});

	test('numbers JavaScript writes with an exponent', () => {
		expect(String(evaluate('data:n', { data: { n: 1e21 } }))).toBe(
			'1000000000000000000000',
		);
		expect(String(evaluate('data:n', { data: { n: -1.5e-7 } }))).toBe(
			'-0.00000015',
		);
	});

	test('an invalid date or time zone is an ExpressionError', () => {
		const code = (run: () => unknown) => {
			try {
				run();
			} catch (error) {
				return error instanceof ExpressionError
					? error.diagnostic.code
					: 'not an ExpressionError';
			}
			return 'no error';
		};
		expect(
			code(() =>
				evaluate('data:d.year', { data: { d: new Date(Number.NaN) } }),
			),
		).toBe('evaluate-invalid');
		expect(
			code(() =>
				evaluate('data:d.year', {
					data: { d: date },
					timeZone: 'Nowhere/Nothing',
				}),
			),
		).toBe('evaluate-invalid');
	});

	test('a lone surrogate in params is encoded as U+FFFD', () => {
		expect(
			evaluate('params("http://a.com/", data:m)', {
				data: { m: { a: '\uD800' } },
			}),
		).toBe('http://a.com/?a=%EF%BF%BD');
	});

	test('a negative width removes the size of an appended image path', () => {
		expect(
			toText(
				evaluate(
					'resizeImage("https://lh3.googleusercontent.com/abc/s100/x.jpg", -1)',
				),
			),
		).toBe('https://lh3.googleusercontent.com/abc/s100/x.jpg');
	});

	test('dayOfWeek counts from Sunday, 0', () => {
		expect(String(evaluate('data:d.dayOfWeek', { data: { d: date } }))).toBe(
			'0',
		);
	});

	test('a list changed between evaluations is read again', () => {
		const tags = ['a'];
		expect(String(evaluate('data:tags.length', { data: { tags } }))).toBe('1');
		tags.push('b');
		expect(String(evaluate('data:tags.length', { data: { tags } }))).toBe('2');
	});
});

describe('cost', () => {
	test.each([
		[Array(20).fill('1').join(' + '), 39],
		[`[${Array(39).fill('1').join(', ')}]`, 40],
		[`+(${Array(39).fill('1').join(', ')})`, 40],
		['data:a.b.c[0].d', 1],
		['data:l[1 + 1]', 1],
		['(true ? 1 : 2)', 6],
		['(data:l map (x => x))', 6],
		['((data:blog).title)', 4],
		['path("a", "b")', 3],
		['{ a: 1, b: 2 }', 3],
		['([1]).first', 4],
		['([1]).first.size', 4],
		['([1]).first.size.size.size', 4],
		['("ab".length.size)', 3],
		['(snippet("ab").length.size)', 4],
		['({ a: { b: 1 } }).a.b', 5],
		['(data:z ?: [1]).first.size', 6],
	])('%s costs %i', (source, expected) => {
		expect(parse(source).cost).toBe(expected);
	});

	// samples near the limit, made of the constructs measured on Blogger
	test.each([
		// a property chain after a lambda: 41 if each property counted
		[
			'(data:items filter (i => i.name == (data:label + " [tag]") and i.name not in ["skip"] and (i.kind in ["a", "b"] or (i.kind != "x" and ("y" in i.kind or "z" in i.kind))))).first.kind ?: "none"',
			40,
		],
		// nested ternaries
		[
			'data:size == "1px" ? 1 : data:size == "2px" ? 2 : data:size == "3px" ? 3 : data:size == "4px" ? 4 : data:size == "5px" ? 5 : data:size == "6px" ? 6 : 7',
			37,
		],
		// a map of ternaries and a call with options
		[
			'{ a: data:a, b: (data:b ? data:b : data:c), c: data:d.url, d: (data:e ? "x" : "y"), e: (data:f ? data:f : (data:g and data:h ? snippet(data:h, { length: 100, links: false }) : data:c)) }',
			32,
		],
		// a lambda in a lambda, with calls
		[
			'["a", "b"] any (s => ["/", "//"] any (p => data:url == path(data:home, (p + data:s)) or snippet(data:url) contains snippet(path(data:home, (p + data:s + "/")))))',
			33,
		],
	])('%s costs %i', (source, expected) => {
		const result = parse(source);
		expect(result.cost).toBe(expected);
		expect(result.errors).toEqual([]);
	});

	test('more than 40 nodes is an error', () => {
		const [error] = parse(Array(21).fill('1').join(' + ')).errors;
		expect(error?.code).toBe('too-complex');
	});

	test('an index has its own limit', () => {
		const inside = `${Array(21).fill('1').join(' + ')} - 21`;
		expect(parse(`data:l[${inside}]`).errors[0]?.code).toBe('too-complex');
		expect(
			parse(`data:l[${Array(19).fill('1').join(' + ')} - 19]`).errors,
		).toEqual([]);
	});
});

describe('evaluate', () => {
	test('returns the actual value', () => {
		const value = evaluate('data:l take 2', { data: { l: [1, 2, 3] } });
		expect(value).toEqual([1, 2]);
		const n = evaluate('1.50 + 1');
		expect(n).toBeInstanceOf(Decimal);
		expect(Number(n)).toBe(2.5);
		expect(String(n)).toBe('2.50');
		expect(evaluate('data:missing')).toBeUndefined();
	});
});

describe('print', () => {
	test.each([
		'1 eq 1 && not false',
		'yes',
		'.5 + 007',
		'data:l count x => x > 1',
		'data:l filter (x => x > 1) take 2',
		'{ "a-b": 1, c: [1, 2] }."a-b"',
		'-(5) + 1',
		'data:blog.homepageUrl.canonical path "search"',
		'+(1, 2, 3)',
		'(data:a ?: "x") ? 1 : 2',
		'3 not in [1, 2]',
		'"x" + "ab" .length',
	])('%s', (source) => {
		const ast = parse(source).ast;
		expect(ast && print(ast)).toBe(source);
	});

	test('normalizes spacing, and reads back the same', () => {
		const ast = parse('data:a  ==(1)and[1,2] contains 1').ast;
		const printed = ast ? print(ast) : '';
		expect(printed).toBe('data:a == (1) and [1, 2] contains 1');
		expect(print(parse(printed).ast as never)).toBe(printed);
	});
});
