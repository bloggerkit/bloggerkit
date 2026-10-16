import { assert, describe, test } from 'vitest';
import { createFixture } from '../../test/fixture';
import { compileTemplate } from '../compiler';
import type { CompilePlugin, RuntimePlugin } from '../plugins';
import { HelperError } from './helpers';
import { createRenderer, renderTemplate } from './render';

async function compile(
	files: Record<string, string>,
	plugins: CompilePlugin[] = [],
) {
	return compileTemplate({ root: await createFixture(files), plugins });
}

describe('createRenderer', () => {
	test('renders many times, each render on its own', async () => {
		const compiled = await compile({
			'index.hbs':
				'<x>{{name}}{{import "./a.ts"}}{{import "./b.ts" depends-on="./a.ts"}}</x>',
			'a.ts': "export const a = 1;\nconsole.log('A');\n",
			'b.ts': "console.log('B');\n",
		});
		const renderer = createRenderer(compiled);

		const first = await renderer.render({ name: 'one' });
		const second = await renderer.render({ name: 'one' });
		// the shared runtime of the scripts comes with each render
		assert.strictEqual(second, first);
		assert.include(await renderer.render({ name: 'two' }), '<x>two');
	});

	test('runs prepare before rendering, its values are read as data', async () => {
		const compiled = await compile({
			'index.hbs': '<x>{{@feed.title}} {{@feed.count}}</x>',
		});
		const feed: RuntimePlugin = {
			name: 'feed',
			async prepare(context) {
				await Promise.resolve();
				return { title: (context as { blog: string }).blog, count: 2 };
			},
		};

		const output = await createRenderer(compiled, { plugins: [feed] }).render({
			blog: 'Blog',
		});
		assert.strictEqual(output, '<x>Blog 2</x>');
	});

	test('prepare adds to the data of the compile plugin of the same name', async () => {
		const compiled = await compile(
			{ 'index.hbs': '<x>{{@site.name}} {{@site.time}}</x>' },
			[{ name: 'site', data: () => ({ name: 'Blog', time: 'compile' }) }],
		);
		const output = await createRenderer(compiled, {
			plugins: [{ name: 'site', prepare: () => ({ time: 'render' }) }],
		}).render();
		assert.strictEqual(output, '<x>Blog render</x>');
		// the data of the compiled template is not changed
		assert.deepEqual(compiled.pluginData.site, {
			name: 'Blog',
			time: 'compile',
		});
	});

	test('runs transform on the output, in order', async () => {
		const compiled = await compile({ 'index.hbs': '<x>a</x>' });
		const output = await createRenderer(compiled, {
			plugins: [
				{ name: 'one', transform: (xml) => xml.replace('a', 'b') },
				{ name: 'two', transform: async (xml) => `${xml}<!-- c -->` },
			],
		}).render();
		assert.strictEqual(output, '<x>b</x><!-- c -->');
	});

	test('wraps errors of hooks and checks what they return', async () => {
		const compiled = await compile({ 'index.hbs': '<x/>' });
		await assertRejects(
			createRenderer(compiled, {
				plugins: [
					{
						name: 'p',
						prepare: () => {
							throw new Error('boom');
						},
					},
				],
			}).render(),
			/^Plugin 'p' failed in 'prepare'$/,
		);
		await assertRejects(
			createRenderer(compiled, {
				plugins: [{ name: 'p', prepare: () => [] as never }],
			}).render(),
			/Plugin 'p' must return an object or nothing from 'prepare', got: an array/,
		);
		await assertRejects(
			createRenderer(compiled, {
				plugins: [{ name: 'p', transform: () => 1 as never }],
			}).render(),
			/^Plugin 'p' must return a string from 'transform', got: 1$/,
		);
	});

	test('checks the format of the compiled template', async () => {
		const compiled = await compile({ 'index.hbs': '<x/>' });
		assert.throws(
			() => createRenderer({ ...compiled, format: 0 }),
			/compiled for format 0 but this version of blogger-hbs renders format 1/,
		);
		assert.throws(
			() => createRenderer({} as never),
			/Expected a compiled template/,
		);
	});

	test('rejects plugins named like a bundled one', async () => {
		const compiled = await compile({ 'index.hbs': '<x/>' });
		const bundled = {
			...compiled,
			bundledPlugins: [{ name: 'p', setup: () => ({}) }],
		};
		assert.throws(
			() => createRenderer(bundled, { plugins: [{ name: 'p' }] }),
			/Duplicate runtime plugin 'p'/,
		);
	});

	test('reports a setup that fails or returns no hooks', async () => {
		const compiled = await compile({ 'index.hbs': '<x/>' });
		assert.throws(
			() =>
				createRenderer({
					...compiled,
					bundledPlugins: [
						{
							name: 'p',
							setup: () => {
								throw new Error('boom');
							},
						},
					],
				}),
			/^Plugin 'p' failed in 'setup'$/,
		);
		assert.throws(
			() =>
				createRenderer({
					...compiled,
					bundledPlugins: [{ name: 'p', setup: () => null as never }],
				}),
			/^Plugin 'p' must return an object from the setup of its runtime, got: null$/,
		);
	});
});

describe('errors of helpers', () => {
	async function renderError(
		files: Record<string, string>,
		helpers: RuntimePlugin['helpers'] = {},
	): Promise<HelperError> {
		const compiled = await compile(files);
		try {
			renderTemplate({ ...compiled, plugins: [{ name: 'h', helpers }] });
		} catch (error) {
			return error as HelperError;
		}
		assert.fail('expected an error');
	}

	test('say which helper it is and where it is used', async () => {
		const error = await renderError({
			'index.hbs': '<a>\n  <b>{{eq 1}}</b></a>',
		});
		assert.instanceOf(error, HelperError);
		assert.strictEqual(
			error.message,
			"Helper 'eq': Expected exactly 2 arguments, but got 1 (./index.hbs:2:6)",
		);
		assert.strictEqual(error.helper, 'eq');
		assert.deepEqual(error.loc, { path: './index.hbs', line: 2, column: 6 });
	});

	test('wrap the other errors, which are their cause', async () => {
		const cause = new Error('kaboom');
		const error = await renderError(
			{ 'index.hbs': '<a>{{boom}}</a>' },
			{
				boom: () => {
					throw cause;
				},
			},
		);
		assert.strictEqual(
			error.message,
			"Helper 'boom': kaboom (./index.hbs:1:4)",
		);
		assert.strictEqual(error.cause, cause);
	});

	test('keep the error thrown as the cause, a TypeError too', async () => {
		const cause = new TypeError('Expected a date');
		const error = await renderError(
			{ 'index.hbs': '<a>\n  {{format 1}}</a>' },
			{
				format: () => {
					throw cause;
				},
			},
		);
		assert.instanceOf(error, HelperError);
		assert.strictEqual(
			error.message,
			"Helper 'format': Expected a date (./index.hbs:2:3)",
		);
		assert.instanceOf(error.cause, TypeError);
		assert.deepEqual(error.loc, { path: './index.hbs', line: 2, column: 3 });
	});

	test('fail without a message for an error that has none', async () => {
		const error = await renderError(
			{ 'index.hbs': '<a>{{boom}}</a>' },
			{
				boom: () => {
					throw new Error();
				},
			},
		);
		assert.strictEqual(error.message, "Helper 'boom' failed (./index.hbs:1:4)");
	});

	test('give the place to one made without the options', async () => {
		const error = await renderError(
			{ 'index.hbs': '<a>{{bare}}</a>' },
			{
				bare: () => {
					throw new HelperError('no place');
				},
			},
		);
		assert.strictEqual(
			error.message,
			"Helper 'bare': no place (./index.hbs:1:4)",
		);
	});

	test('are where they are in an imported template', async () => {
		const error = await renderError({
			'index.hbs': '<a>{{import "./inner.hbs"}}</a>',
			'inner.hbs': '<i>\n {{eq 1 2 3}}</i>',
		});
		assert.strictEqual(
			error.message,
			"Helper 'eq': Expected exactly 2 arguments, but got 3 (./inner.hbs:2:2)",
		);
	});
});

describe('renderTemplate', () => {
	test('needs createRenderer for prepare and transform', async () => {
		const compiled = await compile({ 'index.hbs': '<x/>' });
		assert.throws(
			() =>
				renderTemplate({
					...compiled,
					plugins: [{ name: 'p', transform: (xml) => xml }],
				}),
			/Plugin 'p' has 'transform', render with createRenderer/,
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
