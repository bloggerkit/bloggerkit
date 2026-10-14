import { assert, describe, test } from 'vitest';
import { createFixture, render } from '../../test/fixture';
import type { CompilePlugin } from '../plugins';
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
			/Invalid XML in .*b\.hbs:3:1, expected <\/c>/,
		);
	});

	test('validates the partials of plugins', async () => {
		const root = await createFixture({ 'index.hbs': '<a>{{> p.x}}</a>' });
		await assertRejects(
			compileTemplate({
				root,
				plugins: [{ name: 'p', provide: () => ({ x: '<i>' }) }],
			}),
			/Invalid XML in partial 'p\.x'/,
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
			/Invalid XML in .*index\.hbs/,
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
			/^mine$/,
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
			/Data 'f' of plugin 'p' is not serializable/,
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
