import Handlebars from 'handlebars';
import { assert, describe, test } from 'vitest';
import { extractImports, type Import } from './imports';
import type { Program } from './types';

function extract(source: string): Import[] {
	return extractImports(Handlebars.parse(source) as Program);
}

function reasonOf(source: string): string | undefined {
	const [item] = extract(source);
	return item.valid ? undefined : item.reason;
}

describe('extractImports', () => {
	test('finds imports in mustaches, blocks and subexpressions', () => {
		const imports = extract(
			`{{import "./a.hbs"}}{{#import "./b.hbs"}}x{{/import}}{{log (import "./c.json")}}`,
		);
		assert.deepEqual(
			imports.map((item) => item.valid && item.specifier),
			['./a.hbs', './b.hbs', './c.json'],
		);
	});

	test('parses depends-on and the asset options', () => {
		const [item] = extract(
			`{{import "./a.ts" depends-on=" ./b.ts , ./c.css " script:defer=true style=(object a=1)}}`,
		);
		assert.ok(item.valid);
		assert.deepEqual(item.dependsOn, ['./b.ts', './c.css']);
		assert.deepEqual(item.hashKeys, ['script:defer', 'style']);
	});

	test('requires a single string literal specifier', () => {
		assert.match(reasonOf('{{import}}') ?? '', /expects a string literal/);
		assert.match(reasonOf('{{import "a" "b"}}') ?? '', /only one argument/);
		assert.match(reasonOf('{{import name}}') ?? '', /must be a string literal/);
	});

	test('rejects unknown and repeated options', () => {
		assert.match(
			reasonOf('{{import "./a.ts" foo=1}}') ?? '',
			/invalid option 'foo'/,
		);
		assert.match(
			reasonOf('{{import "./a.ts" script:defer=1 script:defer=2}}') ?? '',
			/more than once/,
		);
	});

	test('rejects an empty depends-on', () => {
		for (const value of ['""', '" , "']) {
			assert.match(
				reasonOf(`{{import "./a.ts" depends-on=${value}}}`) ?? '',
				/must list at least one/,
			);
		}
	});

	test.each(['true', '"true"', '""'])(
		'accepts %s for script:raw and style:only',
		(value) => {
			assert.isUndefined(reasonOf(`{{import "./a.ts" script:raw=${value}}}`));
			assert.isUndefined(reasonOf(`{{import "./a.ts" style:only=${value}}}`));
		},
	);

	test.each([
		["'TRUE'", "got: 'TRUE'"],
		['false', 'got: false'],
		['1', 'got: 1'],
		['foo', "got: variable 'foo'"],
		['(concat "a")', "got: subexpression 'concat'"],
	])('rejects %s for raw and only options', (value, got) => {
		const reason = reasonOf(`{{import "./a.ts" style:raw=${value}}}`);
		assert.include(reason, "must be true, 'true' or ''");
		assert.include(reason, got);
	});

	test.each([
		[
			'script:raw=true script:defer=true',
			"'script:raw' cannot be combined with 'script:defer'",
		],
		[
			'style:raw=true style:media="x"',
			"'style:raw' cannot be combined with 'style:media'",
		],
		[
			'script:only=true script:raw=true',
			"'script:only' cannot be combined with 'script:raw'",
		],
		[
			'script:only=true style:only=true',
			"'script:only' cannot be combined with 'style:only'",
		],
		[
			'script:only=true style=(object a=1)',
			"'script:only' cannot be combined with 'style'",
		],
		[
			'style:only=true script:defer=true',
			"'style:only' cannot be combined with 'script:defer'",
		],
	])('rejects %s', (options, message) => {
		assert.include(reasonOf(`{{import "./a.ts" ${options}}}`), message);
	});

	test('allows the options of the rendered tag with only', () => {
		assert.isUndefined(
			reasonOf(
				'{{import "./a.ts" script:only=true script:defer=true script=(object async=true)}}',
			),
		);
		assert.isUndefined(
			reasonOf('{{import "./a.ts" style:only=true style:media="print"}}'),
		);
	});
});
