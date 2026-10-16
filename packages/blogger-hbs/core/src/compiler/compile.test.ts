import * as path from 'node:path';
import { assert, describe, test } from 'vitest';
import { createFixture, render } from '../../test/fixture';
import type { CompilePlugin, PluginError } from '../plugins';
import { renderTemplate } from '../runtime';
import { compileTemplate } from './compile';

describe('templates', () => {
	test('imports templates relative to the importer and from the root', async () => {
		const output = await render({
			'index.hbs': '<a>{{import "./parts/b.hbs"}}</a>',
			'parts/b.hbs': '<b>{{import "./c.hbs"}}{{import "/d.hbs"}}</b>',
			'parts/c.hbs': '<c/>',
			'd.hbs': '<d/>',
		});
		assert.strictEqual(output, '<a><b><c/><d/></b></a>');
	});

	test('imports in an inline partial', async () => {
		const output = await render({
			'index.hbs':
				'<a>{{#*inline "x"}}<i>{{import "./b.hbs"}}</i>{{/inline}}{{> x}}</a>',
			'b.hbs': '<b/>',
		});
		assert.strictEqual(output, '<a><i><b/></i></a>');
	});

	test('resolves aliases and extensionless specifiers', async () => {
		const output = await render(
			{
				'index.hbs': '<a>{{import "~/b"}}</a>',
				'src/b.hbs': '<b/>',
			},
			{ alias: { '~': 'src' } },
		);
		assert.strictEqual(output, '<a><b/></a>');
	});

	test('indents a standalone import like a partial', async () => {
		const output = await render({
			'index.hbs': '<a>\n  {{import "./b.hbs"}}\n</a>',
			'b.hbs': '<b/>\n<c/>\n',
		});
		assert.strictEqual(output, '<a>\n  <b/>\n  <c/>\n</a>');
	});

	test('renders import blocks in place of the partial block', async () => {
		const output = await render(
			{
				'index.hbs':
					'{{#import "./layout.hbs"}}<main>{{title}}</main>{{/import}}',
				'layout.hbs': '<html>{{> @partial-block}}</html>',
			},
			{ context: { title: 'Hi' } },
		);
		assert.strictEqual(output, '<html><main>Hi</main></html>');
	});

	test('returns the data of json imports', async () => {
		const output = await render({
			'index.hbs':
				'{{#with (import "./data.json")}}<a>{{name}} {{#each tags}}{{this}}{{/each}}</a>{{/with}}',
			'data.json': '{ "name": "Blog", "tags": ["x", "y"] }',
		});
		assert.strictEqual(output, '<a>Blog xy</a>');
	});

	test('the same template can be imported many times', async () => {
		const output = await render(
			{
				'index.hbs': '<a>{{#each items}}{{import "./item.hbs"}}{{/each}}</a>',
				'item.hbs': '<i>{{this}}</i>',
			},
			{ context: { items: [1, 2, 3] } },
		);
		assert.strictEqual(output, '<a><i>1</i><i>2</i><i>3</i></a>');
	});

	test('rejects a recursive import when rendering', async () => {
		const root = await createFixture({
			'index.hbs': '<a>{{import "./index.hbs"}}</a>',
		});
		const compiled = await compileTemplate({ root });
		assert.throws(
			() => renderTemplate({ ...compiled, context: {} }),
			/Maximum import depth/,
		);
	});

	test('is strict about missing values', async () => {
		const root = await createFixture({ 'index.hbs': '<a>{{missing}}</a>' });
		const compiled = await compileTemplate({ root });
		assert.throws(
			() => renderTemplate({ ...compiled, context: {} }),
			/"missing" not defined/,
		);
	});
});

describe('helpers', () => {
	test.each([
		['{{eq 1 1}} {{eq 1 "1"}}', 'true false'],
		['{{eqw 1 "1"}}', 'true'],
		['{{lt 1 2}} {{lt "b" "a"}}', 'true false'],
		['{{typeOf 1}} {{typeOf "x"}}', 'number string'],
	])('%s', async (source, expected) => {
		assert.strictEqual(
			await render({ 'index.hbs': `<a>${source}</a>` }),
			`<a>${expected}</a>`,
		);
	});
});

describe('options', () => {
	test('reports a missing entry with the closest template', async () => {
		const root = await createFixture({ 'src/index.hbs': '<a/>' });

		await assertRejects(
			compileTemplate({ root }),
			/Entry template 'index\.hbs' \(the default, set 'entry' for another\) not found .* did you mean 'src\/index\.hbs'\?/,
		);
		await assertRejects(
			compileTemplate({ root, entry: 'src/indx.hbs' }),
			/did you mean 'index\.hbs'\?/,
		);
		await assertRejects(
			compileTemplate({ root, entry: 'src' }),
			/is a directory, did you mean 'src\/index\.hbs'\?/,
		);
		await assertRejects(
			compileTemplate({ root, entry: 'src/index.txt' }),
			/is not a template/,
		);
	});

	test('rejects unknown and invalid options', async () => {
		const root = await createFixture({ 'index.hbs': '<a/>' });

		await assertRejects(
			compileTemplate({ root, entri: 'x' } as never),
			/Unknown option 'entri', did you mean 'entry'\?/,
		);
		await assertRejects(
			compileTemplate({ root, plugins: {} } as never),
			/Invalid option 'plugins', expected an array/,
		);
		await assertRejects(
			compileTemplate({
				root,
				plugins: [{ name: 'x', provide: 'no' }],
			} as never),
			/Invalid 'provide' of plugin 'x'/,
		);
		await assertRejects(
			compileTemplate({ root: `${root}/missing` }),
			/Root directory .* does not exist/,
		);
		await assertRejects(
			compileTemplate({ root, alias: { '~': 'nope' } }),
			/Alias '~' points to 'nope', which is not a directory/,
		);
	});

	test('rejects unsupported import options', async () => {
		const root = await createFixture({
			'index.hbs': '{{import "./b.hbs" script:defer=true}}',
			'b.hbs': '<b/>',
		});
		await assertRejects(
			compileTemplate({ root }),
			/'import' of template '\.\/b\.hbs' does not support option 'script:defer'/,
		);
	});

	test('reports a missing import', async () => {
		const root = await createFixture({ 'index.hbs': '{{import "./b.hbs"}}' });
		await assertRejects(
			compileTemplate({ root }),
			/Failed to resolve '\.\/b\.hbs'/,
		);
	});
});

describe('xml validation', () => {
	test('validates every template', async () => {
		const root = await createFixture({
			'index.hbs': '<a>{{import "./b.hbs"}}</a>',
			'b.hbs': '<b>\n  <c>\n</b>',
		});
		await assertRejects(
			compileTemplate({ root }),
			/^Invalid XML: expected <\/c> .* \(\.\/b\.hbs:3:1\)$/,
		);
	});

	test('validates the partials of plugins', async () => {
		const root = await createFixture({ 'index.hbs': '<a>{{> p.x}}</a>' });
		await assertRejects(
			compileTemplate({
				root,
				plugins: [{ name: 'p', provide: () => ({ x: '<i>' }) }],
			}),
			/^Plugin 'p': Invalid XML: <i> \(opened at 1:1\) is not closed \(p\.x:1:1\)$/,
		);
	});

	test('validates templates changed by plugins', async () => {
		const root = await createFixture({ 'index.hbs': '<a/>' });
		const Handlebars = (await import('handlebars')).default;
		await assertRejects(
			compileTemplate({
				root,
				plugins: [
					{
						name: 'p',
						preprocess(templates) {
							templates[0].ast = Handlebars.parse('<a><b></a>') as never;
						},
					},
				],
			}),
			/^Invalid XML: .* \(\.\/index\.hbs:\d+:\d+\)$/,
		);
	});
});

describe('plugins', () => {
	test('provide, finalize and data', async () => {
		const icons: CompilePlugin = {
			name: 'icons',
			provide: ({ partials }) =>
				Object.fromEntries(
					partials
						.filter((name) => name !== 'all')
						.map((name) => [name, `<i class='${name}'/>`]),
				),
			finalize: ({ provided, missing, available }) => {
				assert.deepEqual(missing, ['all']);
				assert.includeMembers([...available], ['icons.home']);
				return {
					all: provided.map((name) => `{{> icons.${name}}}`).join(''),
				};
			},
			data: ({ provided, available }) => ({
				count: provided.length,
				total: available.length,
			}),
		};

		const output = await render(
			{
				'index.hbs':
					'<a>{{> icons.home}}<b>{{> icons.all}}</b>{{@icons.count}}</a>',
			},
			{ plugins: [icons] },
		);
		assert.strictEqual(
			output,
			"<a><i class='home'/><b><i class='home'/></b>2</a>",
		);
	});

	test('asks again for the partials used by provided partials', async () => {
		const asked: string[][] = [];
		const output = await render(
			{ 'index.hbs': '<a>{{> p.one}}</a>' },
			{
				plugins: [
					{
						name: 'p',
						provide({ partials }) {
							asked.push([...partials]);
							return { one: '<b>{{> p.two}}</b>', two: '<c/>' };
						},
					},
				],
			},
		);
		assert.strictEqual(output, '<a><b><c/></b></a>');
		assert.deepEqual(asked, [['one']]);
	});

	test('reports a partial nobody provided', async () => {
		const root = await createFixture({ 'index.hbs': '<a>{{> p.x}}</a>' });
		await assertRejects(
			compileTemplate({ root, plugins: [{ name: 'p' }] }),
			/Plugin 'p' did not provide the partial 'x'/,
		);
	});

	test('wraps errors of plugins and keeps their own errors', async () => {
		const root = await createFixture({ 'index.hbs': '<a/>' });
		await assertRejects(
			compileTemplate({
				root,
				plugins: [
					{
						name: 'p',
						provide: () => {
							throw new Error('boom');
						},
					},
				],
			}),
			/Plugin 'p' failed in 'provide'/,
		);

		const own = new Error('mine');
		own.name = 'PluginError';
		await assertRejects(
			compileTemplate({
				root,
				plugins: [
					{
						name: 'p',
						provide: () => {
							throw own;
						},
					},
				],
			}),
			/^Plugin 'p': mine$/,
		);
	});

	test('validates the results of hooks', async () => {
		const root = await createFixture({ 'index.hbs': '<a/>' });
		await assertRejects(
			compileTemplate({
				root,
				plugins: [{ name: 'p', data: () => [1] as never }],
			}),
			/must return an object or nothing from 'data'/,
		);
		await assertRejects(
			compileTemplate({
				root,
				plugins: [{ name: 'p', data: () => ({ f: () => 1 }) }],
			}),
			/^Plugin 'p' provided the data 'f' that is not serializable to JSON$/,
		);
	});
});

describe('plugin context', () => {
	test('tells where the compilation is', async () => {
		const root = await createFixture({
			'src/index.hbs': '<a/>',
			'src/b.hbs': '<b/>',
		});
		let seen: unknown;
		await compileTemplate({
			root,
			entry: 'src/index.hbs',
			alias: { '~': 'src' },
			plugins: [
				{
					name: 'p',
					async buildStart(context) {
						seen = {
							root: context.root,
							entry: context.entry,
							mode: context.mode,
							watch: context.watch,
							alias: await context.resolve('~/b.hbs'),
							relative: await context.resolve('./b.hbs'),
							missing: await context.resolve('./nope.hbs'),
						};
					},
				},
			],
		});
		assert.deepEqual(seen, {
			root,
			entry: path.join(root, 'src/index.hbs'),
			mode: 'production',
			watch: false,
			alias: path.join(root, 'src/b.hbs'),
			relative: path.join(root, 'src/b.hbs'),
			missing: undefined,
		});
	});

	test('gives every place a partial is used, with the hash', async () => {
		const root = await createFixture({
			'index.hbs':
				'<a>\n  {{> p.icon size=16 label="Home" on=true off=null}}\n{{~> p.icon size=data.size big=(eq 1 1)}}{{> p.wrap}}</a>',
		});
		const asked: unknown[] = [];
		await compileTemplate({
			root,
			plugins: [
				{
					name: 'p',
					provide({ partials, requests }) {
						asked.push({ partials, requests: structuredClone(requests) });
						return Object.fromEntries(
							partials.map((name) => [
								name,
								name === 'wrap' ? '<w>{{> p.icon}}</w>' : '<i/>',
							]),
						);
					},
				},
			],
		});

		const file = './index.hbs';
		assert.deepEqual(asked, [
			{
				partials: ['icon', 'wrap'],
				requests: [
					{
						name: 'icon',
						usages: [
							{
								path: file,
								line: 2,
								column: 3,
								hash: { size: 16, label: 'Home', on: true, off: null },
							},
							{
								path: file,
								line: 3,
								column: 1,
								hash: {
									size: { expression: 'data.size' },
									big: { expression: '(eq 1 1)' },
								},
							},
						],
					},
					{
						name: 'wrap',
						usages: [{ path: file, line: 3, column: 42, hash: {} }],
					},
				],
			},
		]);
	});

	test('finalize gets the requests of the plugin', async () => {
		const root = await createFixture({
			'index.hbs': '<a>{{> p.one}}{{> p.all}}</a>',
		});
		let names: string[] = [];
		await compileTemplate({
			root,
			plugins: [
				{
					name: 'p',
					provide: () => ({ one: '<one/>' }),
					finalize({ requests }) {
						names = requests.map(({ name }) => name);
						return { all: '<all/>' };
					},
				},
			],
		});
		assert.deepEqual(names, ['one', 'all']);
	});

	test('error stops at the place given', async () => {
		const root = await createFixture({ 'index.hbs': '<a>\n{{> p.x}}</a>' });
		try {
			await compileTemplate({
				root,
				plugins: [
					{
						name: 'p',
						provide({ requests }, plugin) {
							plugin.error('Unknown x', requests[0].usages[0]);
						},
					},
				],
			});
			assert.fail('expected an error');
		} catch (error) {
			assert.strictEqual(
				(error as Error).message,
				"Plugin 'p': Unknown x (./index.hbs:2:1)",
			);
			assert.strictEqual((error as PluginError).plugin, 'p');
			assert.deepEqual((error as PluginError).loc, {
				path: './index.hbs',
				line: 2,
				column: 1,
			});
		}
	});

	test('warn does not stop the compilation', async () => {
		const root = await createFixture({ 'index.hbs': '<a>{{> p.x}}</a>' });
		const warnings: string[] = [];
		const compiled = await compileTemplate({
			root,
			onWarn: (message) => warnings.push(message),
			plugins: [
				{
					name: 'p',
					provide({ requests }, plugin) {
						plugin.warn('x is old', requests[0].usages[0]);
						plugin.warn('no place');
						return { x: '<x/>' };
					},
				},
			],
		});
		assert.deepEqual(warnings, [
			"Plugin 'p': x is old (./index.hbs:1:4)",
			"Plugin 'p': no place",
		]);
		assert.strictEqual(renderTemplate(compiled), '<a><x/></a>');
	});

	test('a partial that is not provided is reported where it is used', async () => {
		const root = await createFixture({ 'index.hbs': '<a>\n {{> p.x}}</a>' });
		await assertRejects(
			compileTemplate({ root, plugins: [{ name: 'p' }] }),
			/^Plugin 'p' did not provide the partial 'x' \(\.\/index\.hbs:2:2\)$/,
		);
	});
});

describe('plugin partial names', () => {
	/** A plugin providing every partial asked for, as `<name/>`. */
	const echo = (asked: string[][] = []): CompilePlugin => ({
		name: 'p',
		provide({ partials }) {
			asked.push(partials);
			return Object.fromEntries(
				partials.map((name) => [
					name,
					name === '.'
						? '<main>{{> @partial-block}}</main>'
						: `<i n='${name}'/>`,
				]),
			);
		},
	});

	test('the main partial and names separated by single dots', async () => {
		const asked: string[][] = [];
		const output = await render(
			{
				'index.hbs':
					'<a>{{#> p}}x{{/p}}{{> p.a}}{{> p.a.b}}{{> p.a.b.x}}{{> p.arrow-left}}{{> p.a_b}}</a>',
			},
			{ plugins: [echo(asked)] },
		);
		assert.deepEqual(asked, [['.', 'a', 'a.b', 'a.b.x', 'arrow-left', 'a_b']]);
		assert.strictEqual(
			output,
			"<a><main>x</main><i n='a'/><i n='a.b'/><i n='a.b.x'/><i n='arrow-left'/><i n='a_b'/></a>",
		);
	});

	test.each([
		['p.', ': a partial'],
		['p..', ': a partial'],
		['p.a.', ': a partial'],
		['p..a', ': a partial'],
		['p.[a b]', ': a partial'],
		['p/a', ", did you mean 'p.a'? A partial"],
		['p.a/b', ", did you mean 'p.a.b'? A partial"],
	])('rejects {{> %s}} where it is written', async (name, rest) => {
		const root = await createFixture({
			'index.hbs': `<a>\n  {{> ${name}}}</a>`,
		});
		const escapeRegExp = (text: string) =>
			text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
		await assertRejects(
			compileTemplate({ root, plugins: [echo()] }),
			new RegExp(
				`^Invalid partial '${escapeRegExp(name)}'${escapeRegExp(rest)} of plugin 'p' is 'p' or 'p\\.name', with names separated by single dots \\(\\.\\/index\\.hbs:2:3\\)$`,
			),
		);
	});

	test('takes a name changed by preprocess, not the one written', async () => {
		const asked: string[][] = [];
		const rename: CompilePlugin = {
			name: 'rename',
			enforce: 'pre',
			preprocess(templates) {
				for (const { ast } of templates) {
					for (const statement of ast.body) {
						if (statement.type === 'PartialStatement') {
							Object.assign(statement.name, {
								original: 'p.icon',
								parts: ['p', 'icon'],
							});
						}
					}
				}
			},
		};
		const output = await render(
			{ 'index.hbs': '<a>{{> old.name}}</a>' },
			{ plugins: [rename, echo(asked)] },
		);
		assert.deepEqual(asked, [['icon']]);
		assert.strictEqual(output, "<a><i n='icon'/></a>");
	});

	test('leaves the partials of no plugin as they are', async () => {
		const output = await render(
			{
				'index.hbs':
					'<a>{{#*inline "other.x"}}<o/>{{/inline}}{{#*inline "p:a"}}<c/>{{/inline}}{{> other.x}}{{> p:a}}{{> p.a}}</a>',
			},
			{ plugins: [echo()] },
		);
		assert.strictEqual(output, "<a><o/><c/><i n='a'/></a>");
	});

	test('reports the main partial that is not provided', async () => {
		const root = await createFixture({ 'index.hbs': '<a>{{> p}}</a>' });
		await assertRejects(
			compileTemplate({ root, plugins: [{ name: 'p', provide: () => ({}) }] }),
			/^Plugin 'p' did not provide its main partial '\.' \(\{\{> p\}\}\) \(\.\/index\.hbs:1:4\)$/,
		);
	});

	test.each([
		['', /^Plugin 'p' provided a partial without a name$/],
		['a.', /^Plugin 'p' provided a partial with the invalid name 'a\.'$/],
		['.a', /^Plugin 'p' provided a partial with the invalid name '\.a'$/],
		['a..b', /^Plugin 'p' provided a partial with the invalid name 'a\.\.b'$/],
		['a b', /^Plugin 'p' provided a partial with the invalid name 'a b'$/],
	])('rejects the key %o provided by a plugin', async (key, message) => {
		const root = await createFixture({ 'index.hbs': '<a/>' });
		await assertRejects(
			compileTemplate({
				root,
				plugins: [{ name: 'p', provide: () => ({ [key]: '<x/>' }) }],
			}),
			message,
		);
	});

	test('finalize and data see the main partial', async () => {
		const root = await createFixture({
			'index.hbs': '<a>{{> p}}{{> p.a.b}}</a>',
		});
		let seen: unknown;
		await compileTemplate({
			root,
			plugins: [
				{
					name: 'p',
					provide: () => ({ '.': '<m/>', 'a.b': '<ab/>' }),
					data({ provided, available }) {
						seen = { provided, available };
					},
				},
			],
		});
		assert.deepEqual(seen, {
			provided: ['.', 'a.b'],
			available: ['p', 'p.a.b'],
		});
	});

	test.each(['p', 'p.x'])(
		'rejects the inline partial %o, a name of the plugin',
		async (name) => {
			const root = await createFixture({
				'index.hbs': `<a>\n{{#*inline "${name}"}}<x/>{{/inline}}</a>`,
			});
			await assertRejects(
				compileTemplate({ root, plugins: [echo()] }),
				new RegExp(
					`^Inline partial '${name.replace('.', '\\.')}' uses the name of plugin 'p', whose partials are 'p' and 'p\\.name' \\(.*index\\.hbs:2:1\\)$`,
				),
			);
		},
	);

	test('provides the partials used in an inline partial', async () => {
		const output = await render(
			{
				'index.hbs':
					'<a>{{#*inline "card"}}<c>{{> p.icon}}</c>{{/inline}}{{> card}}</a>',
			},
			{ plugins: [echo()] },
		);
		assert.strictEqual(output, "<a><c><i n='icon'/></c></a>");
	});
});

describe('plugin lifecycle', () => {
	test('buildStart first and buildEnd last, in the order of enforce', async () => {
		const root = await createFixture({ 'index.hbs': '<a/>' });
		const calls: string[] = [];
		const plugin = (name: string, enforce?: 'pre' | 'post'): CompilePlugin => ({
			name,
			enforce,
			buildStart: () => {
				calls.push(`${name}:start`);
			},
			preprocess: () => {
				calls.push(`${name}:preprocess`);
			},
			data: () => {
				calls.push(`${name}:data`);
			},
			buildEnd: (_context, error) => {
				calls.push(`${name}:end:${error === undefined ? 'ok' : 'error'}`);
			},
		});

		await compileTemplate({
			root,
			plugins: [plugin('b'), plugin('c', 'post'), plugin('a', 'pre')],
		});
		assert.deepEqual(calls, [
			'a:start',
			'b:start',
			'c:start',
			'a:preprocess',
			'b:preprocess',
			'c:preprocess',
			'a:data',
			'b:data',
			'c:data',
			'a:end:ok',
			'b:end:ok',
			'c:end:ok',
		]);
	});

	test('buildEnd gets the error of a failed compilation', async () => {
		const root = await createFixture({ 'index.hbs': '<a>{{> p.x}}</a>' });
		let ended: unknown;
		await assertRejects(
			compileTemplate({
				root,
				plugins: [
					{
						name: 'p',
						buildEnd: (_context, error) => {
							ended = error;
						},
					},
				],
			}),
			/did not provide the partial 'x'/,
		);
		assert.match((ended as Error).message, /did not provide the partial 'x'/);
	});

	test('validates enforce and runtime', async () => {
		const root = await createFixture({ 'index.hbs': '<a/>' });
		await assertRejects(
			compileTemplate({
				root,
				plugins: [{ name: 'p', enforce: 'first' as never }],
			}),
			/Invalid 'enforce' of plugin 'p', expected 'pre' or 'post', got: 'first'/,
		);
		await assertRejects(
			compileTemplate({
				root,
				plugins: [{ name: 'p', runtime: { entry: '' } }],
			}),
			/Invalid 'runtime.entry' of plugin 'p', expected a path/,
		);
		await assertRejects(
			compileTemplate({
				root,
				plugins: [{ name: 'p', runtime: './runtime.js' as never }],
			}),
			/Invalid 'runtime' of plugin 'p', expected an object with an 'entry'/,
		);
	});
});

async function assertRejects(promise: Promise<unknown>, message: RegExp) {
	try {
		await promise;
	} catch (error) {
		assert.match((error as Error).message, message);
		return;
	}
	assert.fail(`expected a rejection matching ${message}`);
}
