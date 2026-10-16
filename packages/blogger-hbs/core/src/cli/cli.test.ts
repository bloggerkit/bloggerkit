import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, beforeAll, describe, onTestFinished, test } from 'vitest';
import { createFixture } from '../../test/fixture';
import { DOCTYPE, XML_DECLARATION } from '../xml';

const PACKAGE = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../..',
);
const BIN = path.join(PACKAGE, 'bin/blogger-hbs.js');

interface Result {
	code: number;
	output: string;
}

/** Runs the built CLI in `cwd`, with the colors left out of the output. */
function run(cwd: string, ...args: string[]): Promise<Result> {
	return new Promise((resolve) => {
		execFile(
			process.execPath,
			[BIN, ...args],
			{ cwd, env: { ...process.env, NO_COLOR: '1' } },
			(error, stdout, stderr) => {
				resolve({
					code: typeof error?.code === 'number' ? error.code : 0,
					output: stripColors(stdout + stderr),
				});
			},
		);
	});
}

function stripColors(text: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes
	return text.replace(/\x1b\[[0-9;]*m/g, '');
}

const THEME = {
	'index.hbs': `<html
  xmlns='http://www.w3.org/1999/xhtml'
  b:version='2'>
  <body>{{title}}</body>
</html>
`,
};

beforeAll(() => {
	if (!existsSync(path.join(PACKAGE, 'dist/cli/index.js'))) {
		throw new Error('The CLI is tested from its build, run `pnpm build` first');
	}
});

describe('cli', () => {
	test('shows the help and the version', async () => {
		const cwd = await createFixture({});
		const help = await run(cwd, '--help');
		assert.strictEqual(help.code, 0);
		for (const flag of [
			'--config',
			'--entry',
			'--out-dir',
			'--context',
			'--watch',
			'--no-clean',
			'--no-validate',
			'--no-format',
		]) {
			assert.include(help.output, flag);
		}

		const version = await run(cwd, '--version');
		assert.match(version.output, /^blogger-hbs\/\d+\.\d+\.\d+/);
	});

	test('builds, formats and copies the public directory', async () => {
		const cwd = await createFixture({
			...THEME,
			'blogger-hbs.config.mjs': "export default { context: { title: 'Hi' } };",
			'public/clean-theme.xml': '<clean/>',
		});
		const { code, output } = await run(cwd);

		assert.strictEqual(code, 0, output);
		assert.match(output, /Compiled in \d+ms/);
		assert.match(output, /Formatted in \d+ms/);
		assert.strictEqual(
			await fs.readFile(path.join(cwd, 'dist/theme.xml'), 'utf-8'),
			`${XML_DECLARATION}\n${DOCTYPE}\n<html b:version='2' xmlns='http://www.w3.org/1999/xhtml'>\n  <body>Hi</body>\n</html>\n`,
		);
		assert.include(
			await fs.readFile(path.join(cwd, 'dist/compiled.js'), 'utf-8'),
			'export const chunks',
		);
		assert.strictEqual(
			await fs.readFile(path.join(cwd, 'dist/clean-theme.xml'), 'utf-8'),
			'<clean/>',
		);
	});

	test('validates without formatting, or skips both', async () => {
		const cwd = await createFixture({
			...THEME,
			'context.json': '{ "title": "Hi" }',
		});

		const unformatted = await run(
			cwd,
			'--no-format',
			'--context',
			'context.json',
		);
		assert.strictEqual(unformatted.code, 1, unformatted.output);
		assert.match(
			unformatted.output,
			/The first line has to be the XML declaration/,
		);

		const raw = await run(cwd, '--no-validate', '--context', 'context.json');
		assert.strictEqual(raw.code, 0, raw.output);
		assert.notMatch(raw.output, /Validated|Formatted/);
		assert.match(
			await fs.readFile(path.join(cwd, 'dist/theme.xml'), 'utf-8'),
			/^<html\n {2}xmlns=/,
		);
	});

	test('takes the root, entry and output directory from the arguments', async () => {
		const cwd = await createFixture({ 'theme/src/main.hbs': '<html/>' });
		const { code, output } = await run(
			cwd,
			'theme',
			'--entry',
			'src/main.hbs',
			'-o',
			'out',
		);

		assert.strictEqual(code, 0, output);
		assert.isTrue(existsSync(path.join(cwd, 'theme/out/theme.xml')));
	});

	test.each([
		[
			['--wach'],
			/Unknown option `--wach`, did you mean `--watch`\?\n {2}Run 'blogger-hbs --help'/,
		],
		[['--entry'], /value is missing/],
		[['missing-root'], /Root directory 'missing-root' does not exist/],
		[['--entry', 'nope.hbs'], /Entry template 'nope\.hbs' not found/],
		[
			['-o', '.'],
			/Refusing to clean the output directory '\.', it contains the root/,
		],
		[['--context', 'missing.json'], /Context file 'missing\.json' not found/],
		[['--context', 'bad.json'], /Context file 'bad\.json' is not valid JSON/],
		[['-c', 'nope.config.mjs'], /Cannot find config file/],
	])('fails for %o', async (args, message) => {
		const cwd = await createFixture({ ...THEME, 'bad.json': '{ bad' });
		const { code, output } = await run(cwd, ...args);
		assert.strictEqual(code, 1, output);
		assert.match(output, message);
		assert.isFalse(existsSync(path.join(cwd, 'dist')), 'nothing is written');
	});

	test('shows the cause of an error', async () => {
		const cwd = await createFixture({ 'index.hbs': '<html>{{#if}}</html>' });
		const { code, output } = await run(cwd);
		assert.strictEqual(code, 1);
		assert.match(
			output,
			/Failed to parse template .*\n {2}Caused by: Parse error on line 1/,
		);
	});

	test('shows where the rendered template is not valid', async () => {
		const cwd = await createFixture({
			'index.hbs': '<html>\n  <body/>\n</html>',
		});
		const { code, output } = await run(cwd, '--no-format');
		assert.strictEqual(code, 1);
		assert.match(
			output,
			/The rendered template is not valid XML\n {2}Caused by: The first line has to be the XML declaration, .* \(dist\/theme\.xml:1:1\)/,
		);
		// written anyway, to look at where it is invalid
		assert.isTrue(existsSync(path.join(cwd, 'dist/theme.xml')));
	});

	test('shows which helper fails and where', async () => {
		const cwd = await createFixture({
			'index.hbs': '<html>\n  {{eq 1}}\n</html>',
		});
		const { code, output } = await run(cwd);
		assert.strictEqual(code, 1);
		assert.match(
			output,
			/Helper 'eq': Expected exactly 2 arguments, but got 1 \(\.\/index\.hbs:2:3\)/,
		);
	});

	test('shows the message of an error a helper throws, once', async () => {
		const cwd = await createFixture({
			'index.hbs': '<html>\n  <p>{{format 1}}</p>\n</html>',
			'runtime.js':
				"export default () => ({ helpers: { format: () => { throw new TypeError('Expected a date'); } } });",
			'blogger-hbs.config.mjs':
				"export default { plugins: [{ name: 'theme', runtime: { entry: './runtime.js' } }] };",
		});
		const { code, output } = await run(cwd);
		assert.strictEqual(code, 1);
		assert.match(
			output,
			/✗ Helper 'format': Expected a date \(\.\/index\.hbs:2:6\)\n?$/,
		);
		assert.notInclude(output, 'Caused by');
	});

	test('watches and stops on SIGINT', async () => {
		const cwd = await createFixture(THEME);
		await fs.writeFile(
			path.join(cwd, 'blogger-hbs.config.mjs'),
			"export default { context: { title: 'one' } };",
		);

		const child = spawn(process.execPath, [BIN, '--watch'], {
			cwd,
			env: { ...process.env, NO_COLOR: '1' },
		});
		onTestFinished(() => {
			child.kill('SIGKILL');
		});

		await waitForOutput(child, /Watching for changes/);
		await fs.writeFile(
			path.join(cwd, 'index.hbs'),
			'<html><body>two</body></html>',
		);
		// the file is written after the rebuild is logged
		await waitForOutput(child, /Rebuilt in \d+ms[\s\S]*Written/);
		assert.include(
			await fs.readFile(path.join(cwd, 'dist/theme.xml'), 'utf-8'),
			'<body>two</body>',
		);

		const exit = new Promise<number | null>((resolve) =>
			child.on('exit', resolve),
		);
		child.kill('SIGINT');
		assert.strictEqual(await exit, 0);
	});
});

function waitForOutput(child: ChildProcess, pattern: RegExp): Promise<void> {
	return new Promise((resolve, reject) => {
		let output = '';
		const timer = setTimeout(
			() =>
				reject(new Error(`timed out waiting for ${pattern}, got:\n${output}`)),
			15_000,
		);
		const onData = (data: Buffer) => {
			output += stripColors(String(data));
			if (pattern.test(output)) {
				clearTimeout(timer);
				child.stdout?.off('data', onData);
				resolve();
			}
		};
		child.stdout?.on('data', onData);
		child.stderr?.on('data', (data) => {
			output += String(data);
		});
	});
}
