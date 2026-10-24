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
	/** stdout and stderr. */
	output: string;
	stdout: string;
	stderr: string;
}

/**
 * The environment of the CLI, without colors: `FORCE_COLOR`, which CI
 * sets, would make Node.js warn on stderr that `NO_COLOR` is ignored.
 */
function envWithoutColors(): NodeJS.ProcessEnv {
	const { FORCE_COLOR: _, ...env } = process.env;
	return { ...env, NO_COLOR: '1' };
}

/** Runs the built CLI in `cwd`, with the colors left out of the output. */
function run(cwd: string, ...args: string[]): Promise<Result> {
	return new Promise((resolve) => {
		execFile(
			process.execPath,
			[BIN, ...args],
			{ cwd, env: envWithoutColors() },
			(error, stdout, stderr) => {
				resolve({
					code: typeof error?.code === 'number' ? error.code : 0,
					output: stripColors(stdout + stderr),
					stdout: stripColors(stdout),
					stderr: stripColors(stderr),
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
  b:layoutsVersion='3'>
  <body>{{title}}</body>
<b:skin/></html>
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
		assert.notInclude(help.output, '───');
		assert.match(help.output, /^blogger-hbs\/\d+\.\d+\.\d+\n/);
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

		for (const flag of ['--version', '-v']) {
			const version = await run(cwd, flag);
			assert.strictEqual(version.code, 0);
			assert.match(
				version.output,
				/^\n {2}blogger-hbs v\d+\.\d+\.\d+\n─+\nCopyright \(c\) 2026-present Deo Kumar <https:\/\/github\.com\/kumardeo>\nReleased under the MIT License, provided as is, without warranty\.\nhttps:\/\/github\.com\/bloggerkit\/bloggerkit\n\nNode\.js v[\d.]+ on [\w-]+\n$/,
			);
		}
	});

	test('builds, formats and copies the public directory', async () => {
		const cwd = await createFixture({
			...THEME,
			'blogger-hbs.config.mjs': "export default { context: { title: 'Hi' } };",
			'public/clean-theme.xml': '<clean/>',
		});
		const { code, output } = await run(cwd);

		assert.strictEqual(code, 0, output);
		const { version } = JSON.parse(
			await fs.readFile(path.join(PACKAGE, 'package.json'), 'utf-8'),
		);
		const header = `blogger-hbs v${version}`;
		assert.isTrue(
			output.startsWith(`\n  ${header}\n${'─'.repeat(header.length + 2)}\n`),
			output,
		);
		assert.match(output, /Compiled in \d+ms/);
		assert.match(output, /Formatted in \d+ms/);
		assert.match(
			output,
			/Written +Size +Gzip\n +dist\/theme\.xml +\d+ B +\d+ B\n +dist\/compiled\.js +[\d.]+ kB +[\d.]+ (kB|B)\n/,
		);
		assert.match(
			output,
			/In dist\/theme\.xml +Count +Size\n +Scripts +0 +0 B\n/,
		);
		assert.match(output, /Built in \d+ms/);
		assert.strictEqual(
			await fs.readFile(path.join(cwd, 'dist/theme.xml'), 'utf-8'),
			`${XML_DECLARATION}\n<html b:layoutsVersion='3' xmlns='http://www.w3.org/1999/xhtml'>\n  <body>Hi</body>\n<b:skin><![CDATA[]]></b:skin></html>\n`,
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
			// a space before the XML declaration, which formatting removes
			'index.hbs': ` ${XML_DECLARATION}${THEME['index.hbs']}`,
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
			/The XML declaration has to be the first thing in the theme/,
		);

		const raw = await run(cwd, '--no-validate', '--context', 'context.json');
		assert.strictEqual(raw.code, 0, raw.output);
		assert.notMatch(raw.output, /Validated|Formatted/);
		assert.match(
			await fs.readFile(path.join(cwd, 'dist/theme.xml'), 'utf-8'),
			/^ <\?xml[^>]*><html\n {2}xmlns=/,
		);
	});

	test('takes the root, entry and output directory from the arguments', async () => {
		const cwd = await createFixture({
			'theme/src/main.hbs': '<html><b:skin/></html>',
		});
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
		const cwd = await createFixture({
			'index.hbs': '<html>{{#if}}<b:skin/></html>',
		});
		const { code, output } = await run(cwd);
		assert.strictEqual(code, 1);
		assert.match(
			output,
			/Failed to parse template .*\n {2}Caused by: Parse error on line 1/,
		);
	});

	test('shows every place the rendered template is not valid', async () => {
		const cwd = await createFixture({
			'index.hbs':
				"<html>\n  <b:loop var='x'/>\n  <b:section id=' s'/>\n<b:skin/></html>",
		});
		const { code, output } = await run(cwd, '--no-format');
		assert.strictEqual(code, 1);
		assert.include(
			output,
			`The rendered template is not valid XML
  Caused by: 2 errors:
    <b:loop> has to have the attribute 'values' (dist/theme.xml:2:3)
    The attribute 'id' of <b:section> can not start or end with spaces, Blogger fails to save it, got: ' s' (dist/theme.xml:3:18)`,
		);
		// written anyway, to look at where it is invalid
		assert.isTrue(existsSync(path.join(cwd, 'dist/theme.xml')));
	});

	test('shows which helper fails and where', async () => {
		const cwd = await createFixture({
			'index.hbs': '<html>\n  {{eq 1}}\n<b:skin/></html>',
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
			'index.hbs': '<html>\n  <p>{{format 1}}</p>\n<b:skin/></html>',
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

	test('warns about x and expr:x in the rendered template', async () => {
		const cwd = await createFixture({
			'index.hbs':
				"<html>\n  <a href='#' expr:href='data:blog.url'/>\n<b:skin/></html>",
		});
		const { code, output } = await run(cwd);
		assert.strictEqual(code, 0, output);
		assert.match(
			output,
			/⚠ <a> has both 'href' and 'expr:href', Blogger uses 'expr:href' \(dist\/theme\.xml:3:38\)/,
		);
		// the place is in the file written, formatted
		const written = await fs.readFile(
			path.join(cwd, 'dist/theme.xml'),
			'utf-8',
		);
		assert.strictEqual(
			written.split('\n')[2],
			"  <a expr:href='data:blog.url' href='#'/>",
		);
	});

	test('watches and stops on SIGINT', async () => {
		const cwd = await createFixture(THEME);
		await fs.writeFile(
			path.join(cwd, 'blogger-hbs.config.mjs'),
			"export default { context: { title: 'one' } };",
		);

		const child = spawn(process.execPath, [BIN, '--watch'], {
			cwd,
			env: envWithoutColors(),
		});
		onTestFinished(() => {
			child.kill('SIGKILL');
		});

		await waitForOutput(child, /Watching for changes/);
		await fs.writeFile(
			path.join(cwd, 'index.hbs'),
			'<html><body>two</body><b:skin/></html>',
		);
		// the file is written after the rebuild is logged
		const rebuilt = await waitForOutput(
			child,
			/Rebuilt in \d+ms[\s\S]*Built in/,
		);
		// a divider with the time and the file changed, then the sizes only
		assert.match(
			rebuilt,
			/─── \d\d:\d\d:\d\d · index\.hbs ─+\n✓ Rebuilt in \d+ms/,
		);
		assert.include(rebuilt, 'Written');
		// everything, the markup with the change of the text
		assert.match(rebuilt, /In dist\/theme\.xml +Count +Size\n +Scripts +0/);
		assert.match(rebuilt, /\n +Markup +[\d.]+ k?B +[-+][\d.]+ k?B\n/);
		assert.match(rebuilt, /\n +Widgets +0\n/);
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

/** The output of `child` from now until it matches `pattern`. */
function waitForOutput(child: ChildProcess, pattern: RegExp): Promise<string> {
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
				resolve(output);
			}
		};
		child.stdout?.on('data', onData);
		child.stderr?.on('data', (data) => {
			output += String(data);
		});
	});
}

describe('validate and format', () => {
	const HEAD = `${XML_DECLARATION}\n${DOCTYPE}\n`;
	const valid = `${HEAD}<html><b:if cond="true" rel="x"><p   class="a"></p></b:if><b:skin/></html>`;
	const formatted = `${HEAD}<html><b:if cond='true' rel='x'><p class='a'/></b:if><b:skin><![CDATA[]]></b:skin></html>`;

	test('validate shows the warnings and checks a valid theme', async () => {
		const cwd = await createFixture({ 'theme.xml': valid });
		const { code, output } = await run(cwd, 'validate', 'theme.xml');
		assert.strictEqual(code, 0);
		assert.include(
			output,
			"⚠ <b:if> has the attribute 'rel', Blogger only reads 'cond' (theme.xml:3:30)",
		);
		assert.match(output, /✓ Validated in \d+ms/);
	});

	test('validate shows every error of an invalid theme', async () => {
		const cwd = await createFixture({
			'theme.xml': `${HEAD}<html><b:loop var='x'/><b:with var='y'/><b:skin/></html>`,
		});
		const { code, output } = await run(cwd, 'validate', 'theme.xml');
		assert.strictEqual(code, 1);
		assert.include(
			output,
			`✗ theme.xml is not valid XML
  Caused by: 2 errors:
    <b:loop> has to have the attribute 'values' (theme.xml:3:7)
    <b:with> has to have the attribute 'value' (theme.xml:3:24)`,
		);
	});

	test('format writes only the theme to stdout, and only warnings to stderr', async () => {
		const cwd = await createFixture({ 'theme.xml': valid });
		const { code, stdout, stderr } = await run(cwd, 'format', 'theme.xml');
		assert.strictEqual(code, 0);
		assert.strictEqual(stdout, formatted);
		assert.strictEqual(
			stderr,
			"⚠ <b:if> has the attribute 'rel', Blogger only reads 'cond' (<stdout>:3:30)\n",
		);
	});

	test('format prints nothing but the theme without warnings', async () => {
		const cwd = await createFixture({
			'theme.xml': `${HEAD}<html><p   class="a"></p><b:skin/></html>`,
		});
		const { code, stdout, stderr } = await run(cwd, 'format', 'theme.xml');
		assert.strictEqual(code, 0);
		assert.strictEqual(
			stdout,
			`${HEAD}<html><p class='a'/><b:skin><![CDATA[]]></b:skin></html>`,
		);
		assert.strictEqual(stderr, '');
	});

	test('format -o writes the file, making its directory', async () => {
		const cwd = await createFixture({ 'theme.xml': valid });
		const { code, output, stdout } = await run(
			cwd,
			'format',
			'theme.xml',
			'-o',
			'out/theme.xml',
		);
		assert.strictEqual(code, 0);
		assert.strictEqual(
			await fs.readFile(path.join(cwd, 'out/theme.xml'), 'utf-8'),
			formatted,
		);
		assert.include(output, '(out/theme.xml:3:30)');
		assert.match(stdout, /✓ Formatted in \d+ms, written to out\/theme\.xml/);
	});

	test('format -o with the file itself formats it in place', async () => {
		const cwd = await createFixture({ 'theme.xml': valid });
		const { code } = await run(
			cwd,
			'format',
			'theme.xml',
			'--out',
			'theme.xml',
		);
		assert.strictEqual(code, 0);
		assert.strictEqual(
			await fs.readFile(path.join(cwd, 'theme.xml'), 'utf-8'),
			formatted,
		);
	});

	test('format writes nothing for an invalid theme', async () => {
		const cwd = await createFixture({
			'theme.xml': `${HEAD}<html><b:loop var='x'/><b:skin/></html>`,
		});
		const toFile = await run(cwd, 'format', 'theme.xml', '-o', 'out.xml');
		assert.strictEqual(toFile.code, 1);
		assert.isFalse(existsSync(path.join(cwd, 'out.xml')));
		const toStdout = await run(cwd, 'format', 'theme.xml');
		assert.strictEqual(toStdout.code, 1);
		assert.strictEqual(toStdout.stdout, '');
		assert.match(toStdout.stderr, /^\n {2}blogger-hbs v/);
		assert.include(
			toStdout.stderr,
			"<b:loop> has to have the attribute 'values' (theme.xml:3:7)",
		);
	});

	describe('--json', () => {
		const json = async (cwd: string, ...args: string[]) => {
			const result = await run(cwd, ...args, '--json');
			return { ...result, report: JSON.parse(result.stdout) };
		};

		test('validate prints the warnings and info of a valid theme, alone on stdout', async () => {
			const cwd = await createFixture({ 'theme.xml': valid });
			const { code, report, stderr } = await json(cwd, 'validate', 'theme.xml');
			assert.strictEqual(code, 0);
			assert.strictEqual(stderr, '');
			assert.deepEqual(report, {
				valid: true,
				warnings: [
					{
						code: 'unread-attribute',
						severity: 'warning',
						message:
							"<b:if> has the attribute 'rel', Blogger only reads 'cond'",
						loc: { path: 'theme.xml', line: 3, column: 30 },
					},
				],
				info: {
					root: {},
					sections: [],
					widgets: [],
					groups: [],
					variables: [],
				},
			});
		});

		test('validate prints every error of an invalid theme', async () => {
			const cwd = await createFixture({
				'theme.xml': `${HEAD}<html><b:loop var='x'/><b:with var='y'/><b:skin/></html>`,
			});
			const { code, report } = await json(cwd, 'validate', 'theme.xml');
			assert.strictEqual(code, 1);
			assert.deepEqual(report, {
				valid: false,
				errors: [
					{
						code: 'missing-attribute',
						severity: 'error',
						message: "<b:loop> has to have the attribute 'values'",
						loc: { path: 'theme.xml', line: 3, column: 7 },
					},
					{
						code: 'missing-attribute',
						severity: 'error',
						message: "<b:with> has to have the attribute 'value'",
						loc: { path: 'theme.xml', line: 3, column: 24 },
					},
				],
			});
		});

		test('format has the theme in it, or where it is written', async () => {
			const cwd = await createFixture({
				'theme.xml': `${HEAD}<html><b:section id='s'><b:widget id='HTML1' type='HTML'/></b:section><b:skin/></html>`,
			});
			const toStdout = await json(cwd, 'format', 'theme.xml');
			assert.strictEqual(toStdout.code, 0);
			assert.include(
				toStdout.report.xml,
				"<b:section id='s'>\n<b:widget id='HTML1' locked='false' title='' type='HTML' visible='true'/>",
			);
			assert.isUndefined(toStdout.report.written);
			assert.deepEqual(toStdout.report.info.widgets[0].loc, {
				path: '<stdout>',
				line: 4,
				column: 1,
			});

			const toFile = await json(cwd, 'format', 'theme.xml', '-o', 'out.xml');
			assert.strictEqual(toFile.code, 0);
			assert.strictEqual(toFile.report.written, 'out.xml');
			assert.isUndefined(toFile.report.xml);
			assert.deepEqual(toFile.report.info.widgets[0].loc, {
				path: 'out.xml',
				line: 4,
				column: 1,
			});
			assert.strictEqual(
				await fs.readFile(path.join(cwd, 'out.xml'), 'utf-8'),
				toStdout.report.xml,
			);
		});

		test('a file that can not be read is an error too', async () => {
			const cwd = await createFixture({});
			const { code, report } = await json(cwd, 'format', 'missing.xml');
			assert.strictEqual(code, 1);
			assert.strictEqual(report.valid, false);
			assert.match(
				report.errors[0].message,
				/^Can not read missing\.xml: ENOENT/,
			);
			assert.isUndefined(report.errors[0].loc);
		});
	});

	test('an error of the arguments has the header, and the help of the command', async () => {
		const cwd = await createFixture({});
		const { code, output } = await run(cwd, 'validate');
		assert.strictEqual(code, 1);
		assert.match(output, /^\n {2}blogger-hbs v[\d.]+\n─+\n/);
		assert.include(
			output,
			"✗ missing required args for command `validate <file>`\n  Run 'blogger-hbs validate --help' to see the available options",
		);
	});

	test('an error of format has its header on stderr, as stdout is for the theme', async () => {
		const cwd = await createFixture({});
		const { code, stdout, stderr } = await run(cwd, 'format');
		assert.strictEqual(code, 1);
		assert.strictEqual(stdout, '');
		assert.match(
			stderr,
			/^\n {2}blogger-hbs v[\d.]+\n─+\n✗ missing required args for command `format <file>`/,
		);
	});

	test('an error with --json has no header', async () => {
		const cwd = await createFixture({});
		const { stdout, stderr } = await run(cwd, 'format', '--json');
		assert.strictEqual(stdout, '');
		assert.match(stderr, /^✗ missing required args/);
	});

	test('a missing file says it can not be read', async () => {
		const cwd = await createFixture({});
		const { code, output } = await run(cwd, 'validate', 'missing.xml');
		assert.strictEqual(code, 1);
		assert.include(output, '✗ Can not read missing.xml');
	});
});
