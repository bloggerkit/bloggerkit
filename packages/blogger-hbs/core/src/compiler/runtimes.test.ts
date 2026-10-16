import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assert, describe, test } from 'vitest';
import { createFixture } from '../../test/fixture';
import type { CompilePlugin, JsonValue } from '../plugins';
import { createRenderer, renderTemplate } from '../runtime';
import { compileTemplate } from './compile';

/** A compile plugin whose runtime is `runtime.js` of the fixture. */
function withRuntime(root: string, options?: JsonValue): CompilePlugin {
	return {
		name: 'greet',
		runtime: { entry: path.join(root, 'runtime.js'), options },
	};
}

const RUNTIME = `
import { exclaim } from './exclaim.js';

export default (api, options) => ({
	helpers: {
		greet: (name) => new api.SafeString(\`<b>\${options.prefix} \${api.escapeExpression(name)}\${exclaim}</b>\`),
	},
});
`;

describe('runtime of compile plugins', () => {
	test('is bundled with what it imports and set up with its options', async () => {
		const root = await createFixture({
			'index.hbs': '<a>{{greet name}}</a>',
			'runtime.js': RUNTIME,
			'exclaim.js': "export const exclaim = '!';",
		});
		const compiled = await compileTemplate({
			root,
			plugins: [withRuntime(root, { prefix: 'Hi' })],
		});

		assert.lengthOf(compiled.bundledPlugins, 1);
		assert.notMatch(compiled.source, /^\s*import\b/m);

		const output = await createRenderer(compiled).render({ name: '<x>' });
		assert.strictEqual(output, '<a><b>Hi &lt;x&gt;!</b></a>');
	});

	test('renders from the emitted module, which imports nothing', async () => {
		const root = await createFixture({
			'index.hbs': '<a>{{greet "you"}}</a>',
			'runtime.js': RUNTIME,
			'exclaim.js': "export const exclaim = '!';",
		});
		const { source } = await compileTemplate({
			root,
			plugins: [withRuntime(root, { prefix: 'Hey' })],
		});

		assert.notMatch(source, /^\s*import\b/m);
		assert.include(source, 'export const format = 1;');

		// a directory of its own, without node_modules to import from
		const file = path.join(root, 'out', 'compiled.js');
		await fs.mkdir(path.dirname(file));
		await fs.writeFile(file, source);
		const theme = await import(pathToFileURL(file).href);

		assert.strictEqual(
			await createRenderer(theme).render(),
			'<a><b>Hey you!</b></a>',
		);
	});

	test('share the modules they import, once in the bundle', async () => {
		const root = await createFixture({
			'index.hbs': '<a>{{a}} {{b}} {{a}}</a>',
			'shared.js':
				"let count = 0;\nexport function next() {\n\tcount++;\n\treturn 'shared-module-' + count;\n}",
			'a.js':
				"import { next } from './shared.js';\nexport default () => ({ helpers: { a: () => 'a:' + next() } });",
			'b.js':
				"import { next } from './shared.js';\nexport default () => ({ helpers: { b: () => 'b:' + next() } });",
		});
		const compiled = await compileTemplate({
			root,
			plugins: [
				{ name: 'a', runtime: { entry: path.join(root, 'a.js') } },
				{ name: 'b', runtime: { entry: './b.js' } },
			],
		});

		assert.strictEqual(compiled.source.split('shared-module').length - 1, 1);
		// one module instance: the counter goes on across the plugins
		assert.strictEqual(
			await createRenderer(compiled).render(),
			'<a>a:shared-module-1 b:shared-module-2 a:shared-module-3</a>',
		);
	});

	test('works with renderTemplate when it only has helpers', async () => {
		const root = await createFixture({
			'index.hbs': '<a>{{greet "me"}}</a>',
			'runtime.js': RUNTIME,
			'exclaim.js': "export const exclaim = '.';",
		});
		const compiled = await compileTemplate({
			root,
			plugins: [withRuntime(root, { prefix: 'Bye' })],
		});
		assert.strictEqual(renderTemplate(compiled), '<a><b>Bye me.</b></a>');
	});

	test('can not use Node.js modules', async () => {
		const root = await createFixture({
			'index.hbs': '<a/>',
			'runtime.js':
				"import { readFileSync } from 'node:fs';\nexport default () => ({ helpers: { read: () => readFileSync('x') } });",
		});
		await assertRejects(
			compileTemplate({ root, plugins: [withRuntime(root)] }),
			/Failed to bundle the runtime of plugin 'greet', it has to run in any JavaScript runtime, without Node\.js modules\n.*node:fs/s,
		);
	});

	test('has to export a setup function as default', async () => {
		const root = await createFixture({
			'index.hbs': '<a/>',
			'runtime.js': 'export const helpers = {};',
		});
		await assertRejects(
			compileTemplate({ root, plugins: [withRuntime(root)] }),
			/The runtime of plugin 'greet' .* must export a setup function as default, made with defineRuntimePlugin/,
		);
	});

	test('takes JSON options only', async () => {
		const root = await createFixture({ 'index.hbs': '<a/>' });
		for (const [options, at] of [
			[{ when: new Date(0) }, 'runtime.options.when'],
			[{ list: [1, () => 2] }, 'runtime.options.list[1]'],
			[{ n: Number.NaN }, 'runtime.options.n'],
		] as const) {
			await assertRejects(
				compileTemplate({
					root,
					plugins: [
						{
							name: 'p',
							runtime: { entry: 'x.js', options: options as never },
						},
					],
				}),
				new RegExp(
					`Invalid '${at.replace(/[.[\]]/g, '\\$&')}' of plugin 'p', expected a JSON value`,
				),
			);
		}
	});

	test('the same object can be in the options twice', async () => {
		const root = await createFixture({
			'index.hbs': '<a>{{greet "x"}}</a>',
			'runtime.js': RUNTIME,
			'exclaim.js': "export const exclaim = '';",
		});
		const shared = { prefix: 'Yo' };
		const compiled = await compileTemplate({
			root,
			plugins: [
				{
					name: 'greet',
					runtime: {
						entry: path.join(root, 'runtime.js'),
						options: { ...shared, again: shared, also: shared },
					},
				},
			],
		});
		assert.strictEqual(
			await createRenderer(compiled).render(),
			'<a><b>Yo x</b></a>',
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
