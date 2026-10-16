import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { assert, describe, test } from 'vitest';
import { createFixture } from '../../test/fixture';
import { compileTemplate } from '../compiler';
import { bundleRuntimes } from '../compiler/runtimes';

const RUNTIME_INDEX = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'index.ts',
);

/**
 * `blogger-hbs/runtime` has to render in any JavaScript runtime: it is bundled
 * for a web worker, which fails on Node.js modules, and run where there are
 * only the globals of JavaScript itself, no `process`, `require` or `Buffer`.
 */
describe('blogger-hbs/runtime', () => {
	test('renders without Node.js', async () => {
		const root = await createFixture({
			'index.hbs':
				'<html><body>{{greet "you"}} {{@site.name}} {{import "./main.js"}}</body></html>',
			'main.js': 'console.log(1);',
			'runtime.js':
				"export default (api) => ({ helpers: { greet: (name) => new api.SafeString('<b>' + api.escapeExpression(name) + '</b>') } });",
			// exports the runtime the way a bundled plugin runtime is exported
			'expose.js': `import * as runtime from ${JSON.stringify(RUNTIME_INDEX)};\nexport default () => runtime;`,
		});

		// the runtime, and the runtime of a plugin as the compiler bundles it
		const bundle = await bundleRuntimes(root, [
			{ plugin: 'runtime', entry: path.join(root, 'expose.js') },
			{ plugin: 'greet', entry: path.join(root, 'runtime.js') },
		]);
		const compiled = await compileTemplate({
			root,
			plugins: [{ name: 'site', data: () => ({ name: 'Blog' }) }],
		});

		// a realm with the JavaScript globals only
		const realm = createContext({});
		const exports = runInContext(bundle?.code ?? '', realm);
		assert.isUndefined(
			runInContext('typeof process === "object" ? process : undefined', realm),
		);

		const api = exports.p0();
		const renderer = api.createRenderer({
			...compiled,
			bundledPlugins: [{ name: 'greet', setup: exports.p1 }],
		});
		const output: string = await renderer.render();

		assert.strictEqual(
			output,
			'<html><body><b>you</b> Blog <script>/*<![CDATA[*/\nconsole.log(1);\n/*]]>*/</script></body></html>',
		);
	});

	test('does not bundle the compiler', async () => {
		const root = await createFixture({
			'expose.js': `import * as runtime from ${JSON.stringify(RUNTIME_INDEX)};\nexport default () => runtime;`,
		});
		const bundle = await bundleRuntimes(root, [
			{ plugin: 'runtime', entry: path.join(root, 'expose.js') },
		]);
		const code = bundle?.code ?? '';
		// the compiler of Handlebars, Rsbuild or anything of blogger-hbs' compiler
		assert.notMatch(code, /JavaScriptCompiler|rsbuild|rspack|CompileError/);
		// handlebars/runtime and blogger-expr, without the handlebars compiler
		assert.isBelow(code.length, 150_000);
	});
});
