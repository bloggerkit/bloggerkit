import { assert, describe, test } from 'vitest';
import { createFixture, render } from '../../test/fixture';
import { compileTemplate } from './compile';

const SCRIPT = /<script[^>]*>[\s\S]*?<\/script>/g;
const STYLE = /<style[^>]*>[\s\S]*?<\/style>/g;

describe('scripts and styles', () => {
	test('render as tags, with the options of the import', async () => {
		const output = await render({
			'index.hbs': `<x>
{{import "./a.ts"}}
{{import "./b.css" style:media="print"}}
{{import "./c.ts" script:defer=true script=(object async=true)}}
<style>{{import "./a.ts" style:raw=true}}</style>
<script>{{import "./a.ts" script:raw="true"}}</script>
{{import "./a.ts" script:only=""}}
{{import "./a.ts" style:only=true}}
</x>`,
			'a.ts': "import './a.css';\nconsole.log('A');\n",
			'a.css': 'body { color: red; }',
			'b.css': 'p { margin: 0; }',
			'c.ts': "console.log('C');\n",
		});
		const lines = output.split('\n');

		// a script importing css renders a style and a script, in CDATA
		assert.match(
			output,
			/<style>\/\*<!\[CDATA\[\*\/\nbody\{color:red\}\n\/\*\]\]>\*\/<\/style>\n<script>\/\*<!\[CDATA\[\*\/\n.*console\.log\("A"\).*\n\/\*\]\]>\*\/<\/script>/,
		);
		assert.match(output, /<style media="print">[\s\S]*p\{margin:0\}/);
		assert.match(output, /<script async="async" defer="defer">[\s\S]*"C"/);

		// raw is the bare code, only is a single tag
		assert.include(lines, '<style>body{color:red}</style>');
		assert.isOk(
			lines.find((line) => /^<script>[^<]*"A"[^<]*<\/script>$/.test(line)),
		);
		assert.strictEqual(output.match(SCRIPT)?.length, 4);
		assert.strictEqual(output.match(STYLE)?.length, 4);
	});

	test('scripts depending on each other share a runtime, rendered once', async () => {
		const output = await render({
			'index.hbs':
				'<x>{{import "./a.ts"}}{{import "./b.ts" depends-on="./a.ts"}}</x>',
			'a.ts': "export const a = 1;\nconsole.log('A');\n",
			'b.ts': "console.log('B');\n",
		});
		const scripts = output.match(SCRIPT) ?? [];
		assert.strictEqual(scripts.length, 2);
		// the chunks register on a global of their group
		assert.include(scripts[0], 'self.rspc');
		assert.include(scripts[1], 'self.rspc');
		assert.include(scripts[1], '"B"');
	});

	test('inlines web workers', async () => {
		const output = await render({
			'index.hbs': '<x>{{import "./a.ts"}}</x>',
			'a.ts':
				"import W from './w.ts?worker&inline';\nnew W().postMessage(1);\n",
			'w.ts': 'self.onmessage = (e) => self.postMessage(e.data * 2);\n',
		});
		assert.include(output, 'new Blob');
		assert.include(output, 'postMessage(2*');
	});

	test('rejects emitted files', async () => {
		const root = await createFixture({
			'index.hbs': '<x>{{import "./a.ts"}}</x>',
			'a.ts': "import('./b').then(console.log);\n",
			'b.ts': 'export default 1;\n',
		});
		await assertRejects(
			compileTemplate({ root }),
			/Unsupported assets emitted: .*dynamic imports and emitted files are not supported/,
		);
	});

	test('reports bundling errors', async () => {
		const root = await createFixture({
			'index.hbs': '<x>{{import "./a.ts"}}</x>',
			'a.ts': 'console.log(;\n',
		});
		await assertRejects(compileTemplate({ root }), /Failed to bundle assets/);
	});

	test('a depends-on target has to be imported too', async () => {
		const root = await createFixture({
			'index.hbs': '<x>{{import "./b.ts" depends-on="./a.ts"}}</x>',
			'a.ts': "console.log('A');\n",
			'b.ts': "console.log('B');\n",
		});
		await assertRejects(
			compileTemplate({ root }),
			/'depends-on' target '\.\/a\.ts' must also be imported by a template/,
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
