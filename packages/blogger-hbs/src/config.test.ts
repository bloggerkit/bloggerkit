import * as path from 'node:path';
import { assert, describe, test } from 'vitest';
import { createFixture } from '../test/fixture';
import { assertUserConfig, defineConfig, loadConfig } from './config';

describe('assertUserConfig', () => {
	test('accepts every option', () => {
		assertUserConfig({
			root: '.',
			entry: 'src/index.hbs',
			alias: { '~': 'src' },
			plugins: [{ name: 'p', provide() {} }],
			rsbuild: {},
			context: { a: 1 },
			runtimePlugins: [{ name: 'r', helpers: { x() {} } }],
			publicDir: false,
			output: {
				dir: 'out',
				module: false,
				template: 'blog.xml',
				clean: false,
				validate: true,
				format: false,
			},
		});
	});

	test.each([
		[{ plugin: [] }, /Unknown option 'plugin', did you mean 'plugins'\?/],
		[{ foo: 1 }, /Unknown option 'foo', valid options: root, entry/],
		[{ alias: ['src'] }, /Invalid option 'alias', expected an object of paths/],
		[{ alias: { '~': '' } }, /Invalid option 'alias\['~'\]', expected a path/],
		[{ rsbuild: 5 }, /Invalid option 'rsbuild'/],
		[{ runtimePlugins: {} }, /Invalid option 'runtimePlugins'/],
		[
			{ runtimePlugins: [{ name: 'r', helpers: [] }] },
			/runtimePlugins\[0\]\.helpers/,
		],
		[{ publicDir: 1 }, /Invalid option 'publicDir', expected a path or false/],
		[
			{ output: { dri: 'x' } },
			/Unknown option 'output\.dri', did you mean 'output\.dir'\?/,
		],
		[
			{ output: { module: 'a.xml', template: 'a.xml' } },
			/would overwrite each other/,
		],
		[
			{ output: { template: '' } },
			/Invalid option 'output\.template', expected a file name or false/,
		],
		[
			{ output: { clean: 'yes' } },
			/Invalid option 'output\.clean', expected a boolean, got: 'yes'/,
		],
		[{ output: { validate: 1 } }, /Invalid option 'output\.validate'/],
	])('rejects %o', (config, message) => {
		assert.throws(() => assertUserConfig(config), message);
	});
});

describe('loadConfig', () => {
	test('finds no config', async () => {
		const cwd = await createFixture({ 'index.hbs': '<a/>' });
		const loaded = await loadConfig({ cwd });
		assert.deepEqual(loaded, { config: {}, dependencies: [] });
	});

	test('loads a config file, the root relative to it', async () => {
		const cwd = await createFixture({
			'blogger-hbs.config.mjs':
				"export default { root: 'theme', entry: 'index.hbs', context: { a: 1 } };",
		});
		const loaded = await loadConfig({ cwd });
		const file = path.join(cwd, 'blogger-hbs.config.mjs');

		assert.deepEqual(loaded.config, {
			root: path.join(cwd, 'theme'),
			entry: 'index.hbs',
			context: { a: 1 },
		});
		assert.strictEqual(loaded.file, file);
		assert.include(loaded.dependencies, file);
	});

	test('calls a config function with the command and watch mode', async () => {
		const cwd = await createFixture({
			'blogger-hbs.config.mjs':
				'export default ({ command, meta }) => ({ context: { command, watch: meta.watch } });',
		});
		const { config } = await loadConfig({ cwd, watch: true });
		assert.deepEqual(config.context, { command: 'build', watch: true });
	});

	test('loads a TypeScript config', async () => {
		const cwd = await createFixture({
			'blogger-hbs.config.ts':
				"const entry: string = 'index.hbs';\nexport default { entry };",
		});
		const { config } = await loadConfig({ cwd });
		assert.strictEqual(config.entry, 'index.hbs');
	});

	test('names the file of an invalid config', async () => {
		const cwd = await createFixture({
			'blogger-hbs.config.mjs': 'export default { entri: 1 };',
		});
		try {
			await loadConfig({ cwd });
			assert.fail('expected an error');
		} catch (error) {
			assert.match(
				(error as Error).message,
				/^Invalid config 'blogger-hbs\.config\.mjs': Unknown option 'entri', did you mean 'entry'\?/,
			);
		}
	});

	test('defineConfig returns the config as it is', () => {
		const config = { entry: 'x.hbs' };
		assert.strictEqual(defineConfig(config), config);
	});
});
