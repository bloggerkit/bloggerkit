import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { assert, describe, onTestFinished, test } from 'vitest';
import { createFixture } from '../../test/fixture';
import type { CompilePlugin } from '../plugins';
import { renderTemplate } from '../runtime';
import { type TemplateWatcher, watchTemplate } from './watch';

type Event =
	| { kind: 'compile'; output: string }
	| { kind: 'error'; message: string };

/** Watches the fixture and hands over what happens, in order. */
async function watchFixture(
	root: string,
	entry = 'index.hbs',
	plugins?: CompilePlugin[],
) {
	const events: Event[] = [];
	let waiting: ((event: Event) => void) | undefined;

	const push = (event: Event) => {
		if (waiting) {
			waiting(event);
			waiting = undefined;
		} else {
			events.push(event);
		}
	};

	const watcher: TemplateWatcher = await watchTemplate({
		root,
		entry,
		plugins,
		debounce: 10,
		onCompile: (compiled) =>
			push({
				kind: 'compile',
				output: renderTemplate({ ...compiled, context: {} }),
			}),
		onError: (error) =>
			push({ kind: 'error', message: (error as Error).message }),
	});
	onTestFinished(() => watcher.close());

	return {
		/** The next event, failing after a while. */
		next(): Promise<Event> {
			const event = events.shift();
			if (event) {
				return Promise.resolve(event);
			}
			return new Promise((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error('no event')), 10_000);
				waiting = (event) => {
					clearTimeout(timer);
					resolve(event);
				};
			});
		},
		/** Whether nothing happens for a while. */
		async quiet(ms = 400): Promise<boolean> {
			await new Promise((resolve) => setTimeout(resolve, ms));
			return events.length === 0;
		},
	};
}

async function write(root: string, file: string, content: string) {
	await fs.writeFile(path.join(root, file), content);
}

describe('watchTemplate', () => {
	test('compiles again on changes and recovers from errors', async () => {
		const root = await createFixture({
			'index.hbs':
				'<a>{{import "./b.hbs"}}{{import "./c.ts" script:raw=true}}</a>',
			'b.hbs': '<b>1</b>',
			'c.ts': "console.log('one');\n",
		});
		const watcher = await watchFixture(root);

		let event = await watcher.next();
		assert.strictEqual(event.kind, 'compile');
		assert.match(
			event.kind === 'compile' ? event.output : '',
			/<b>1<\/b>.*"one"/,
		);

		// a template
		await write(root, 'b.hbs', '<b>2</b>');
		event = await watcher.next();
		assert.include(event.kind === 'compile' && event.output, '<b>2</b>');

		// a script, rebuilt by rsbuild
		await write(root, 'c.ts', "console.log('two');\n");
		event = await watcher.next();
		assert.include(event.kind === 'compile' && event.output, '"two"');

		// the same content again changes nothing
		await write(root, 'b.hbs', '<b>2</b>');
		assert.isTrue(await watcher.quiet());

		// an error, then the fix
		await write(root, 'b.hbs', '<b>');
		event = await watcher.next();
		assert.strictEqual(event.kind, 'error');
		assert.match(
			event.kind === 'error' ? event.message : '',
			/^Invalid XML: .* \(\.\/b\.hbs:\d+:\d+\)$/,
		);

		await write(root, 'b.hbs', '<b>3</b>');
		event = await watcher.next();
		assert.include(event.kind === 'compile' && event.output, '<b>3</b>');

		// a new import of a script restarts the bundler with it
		await write(root, 'd.ts', "console.log('new');\n");
		await write(
			root,
			'index.hbs',
			'<a>{{import "./b.hbs"}}{{import "./d.ts" script:raw=true}}</a>',
		);
		event = await watcher.next();
		assert.include(event.kind === 'compile' && event.output, '"new"');
	});

	test('resolves a template created or renamed between compilations', async () => {
		const root = await createFixture({
			'index.hbs': '<a>{{import "./part"}}</a>',
		});
		const watcher = await watchFixture(root);

		let event = await watcher.next();
		assert.strictEqual(event.kind, 'error');
		assert.match(
			event.kind === 'error' ? event.message : '',
			/Failed to resolve '\.\/part'/,
		);

		await write(root, 'part.hbs', '<b>created</b>');
		event = await watcher.next();
		assert.include(event.kind === 'compile' && event.output, '<b>created</b>');

		await fs.rename(path.join(root, 'part.hbs'), path.join(root, 'part.xml'));
		await write(root, 'part.xml', '<b>renamed</b>');
		event = await watcher.next();
		assert.include(event.kind === 'compile' && event.output, '<b>renamed</b>');
	});

	test('waits for a missing entry', async () => {
		const root = await createFixture({ 'other.hbs': '<a/>' });
		const watcher = await watchFixture(root, 'later.hbs');

		let event = await watcher.next();
		assert.strictEqual(event.kind, 'error');
		assert.match(
			event.kind === 'error' ? event.message : '',
			/Entry template 'later\.hbs'/,
		);

		await write(root, 'later.hbs', '<later/>');
		event = await watcher.next();
		assert.include(event.kind === 'compile' && event.output, '<later/>');
	});

	test('rejects invalid options right away', async () => {
		const root = await createFixture({ 'index.hbs': '<a/>' });

		for (const [options, message] of [
			[{ root }, /Invalid option 'onCompile', expected a function/],
			[{ root, onCompile() {}, debounce: -1 }, /Invalid option 'debounce'/],
			[
				{ root, onComplie() {} },
				/Unknown option 'onComplie', did you mean 'onCompile'\?/,
			],
			[
				{ root: path.join(root, 'nope'), onCompile() {} },
				/Root directory .* does not exist/,
			],
		] as const) {
			try {
				await watchTemplate(options as never);
				assert.fail('expected a rejection');
			} catch (error) {
				assert.match((error as Error).message, message);
			}
		}
	});
	test('tells onStart the files changed', async () => {
		const root = await createFixture({ 'index.hbs': '<a>one</a>' });
		const started: string[][] = [];
		let compiled = 0;
		let resolveNext = () => {};
		const watcher = await watchTemplate({
			root,
			debounce: 10,
			onStart: ({ files }) => started.push(files),
			onCompile: () => {
				compiled++;
				resolveNext();
			},
		});
		onTestFinished(() => watcher.close());

		const next = new Promise<void>((resolve) => {
			resolveNext = resolve;
		});
		await write(root, 'index.hbs', '<a>two</a>');
		await next;

		assert.strictEqual(compiled, 2);
		assert.deepEqual(started, [[], [path.join(root, 'index.hbs')]]);
	});

	test('compiles again when a file a plugin watches changes', async () => {
		const root = await createFixture({
			'index.hbs': '<a>{{@words.list}}</a>',
			'words.txt': 'one',
		});
		const seen: boolean[] = [];
		const words: CompilePlugin = {
			name: 'words',
			async data(_context, plugin) {
				seen.push(plugin.watch);
				const file = path.join(plugin.root, 'words.txt');
				plugin.addWatchFile(file);
				return { list: await fs.readFile(file, 'utf8') };
			},
		};
		const watcher = await watchFixture(root, 'index.hbs', [words]);

		assert.deepEqual(await watcher.next(), {
			kind: 'compile',
			output: '<a>one</a>',
		});
		await write(root, 'words.txt', 'two');
		assert.deepEqual(await watcher.next(), {
			kind: 'compile',
			output: '<a>two</a>',
		});
		assert.deepEqual(seen, [true, true]);
	});
});
