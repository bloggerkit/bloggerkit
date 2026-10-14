import { type FSWatcher, watch } from 'node:fs';
import * as path from 'node:path';
import { type AssetPlan, applyAssets, planAssets } from './bundle';
import {
	type CompiledTemplate,
	type CompileTemplateOptions,
	finishTemplate,
	type PreparedTemplate,
	prepareTemplate,
} from './compile';
import { CompileError } from './errors';
import {
	assertCompileOptions,
	assertDirectories,
	invalidOption,
} from './options';
import { type AssetWatcher, watchAssets } from './rsbuild';

const WATCH_OPTION_KEYS = ['onCompile', 'onError', 'onStart', 'debounce'];

function assertWatchOptions(
	options: unknown,
): asserts options is WatchTemplateOptions {
	if (options === undefined) {
		throw new CompileError(
			"watchTemplate() expects options with an 'onCompile' callback",
		);
	}
	assertCompileOptions(options, WATCH_OPTION_KEYS);

	const { onCompile, onError, onStart, debounce } =
		options as Partial<WatchTemplateOptions>;

	if (typeof onCompile !== 'function') {
		throw invalidOption('onCompile', 'a function', onCompile);
	}
	for (const [name, value] of [
		['onError', onError],
		['onStart', onStart],
	] as const) {
		if (value !== undefined && typeof value !== 'function') {
			throw invalidOption(name, 'a function', value);
		}
	}
	if (
		debounce !== undefined &&
		(typeof debounce !== 'number' || !Number.isFinite(debounce) || debounce < 0)
	) {
		throw invalidOption('debounce', 'a number of milliseconds', debounce);
	}
}

export interface WatchTemplateOptions extends CompileTemplateOptions {
	/** Called with every successful compilation, the first one included. */
	onCompile(compiled: CompiledTemplate): void | Promise<void>;
	/**
	 * Called when compiling fails, the watcher keeps going and compiles again on
	 * the next change. Errors are logged without it.
	 */
	onError?(error: unknown): void;
	/**
	 * Called when compiling starts after a change, the first compilation
	 * included. A compilation can end without `onCompile` when the output is
	 * the same as before.
	 */
	onStart?(): void;
	/** Milliseconds to wait for more changes before compiling, 30 by default. */
	debounce?: number;
}

export interface TemplateWatcher {
	close(): Promise<void>;
}

/**
 * Compiles like `compileTemplate` and again whenever a file it is made of
 * changes, until closed. It resolves after the first compilation.
 *
 * A change of a template or json file only compiles the templates again, the
 * scripts and styles are bundled by a single rsbuild watcher that rebuilds
 * what changed. It is only restarted when the bundled entries change, for
 * example when an import of a script is added. When a change causes both, as a
 * template scanned by Tailwind does, they make a single compilation.
 */
export async function watchTemplate(
	options: WatchTemplateOptions,
): Promise<TemplateWatcher> {
	assertWatchOptions(options);
	await assertDirectories(options);

	const { onCompile, onError = console.error, debounce = 30 } = options;

	let prepared: PreparedTemplate | undefined;
	let plan: AssetPlan | undefined;
	let assets: { key: string; watcher: AssetWatcher } | undefined;
	/** Source of the last compilation passed to `onCompile`. */
	let previous: string | undefined;

	// the first compilation is a change of the templates
	let templatesChanged = true;
	let assetsChanged = false;
	let failed = false;
	let closed = false;
	let timer: NodeJS.Timeout | undefined;
	let running = Promise.resolve();

	/** The templates and json files read, and the watchers of their directories. */
	let files = new Set<string>();
	const directories = new Map<string, FSWatcher>();

	const schedule = (): void => {
		if (closed) {
			return;
		}
		clearTimeout(timer);
		timer = setTimeout(() => {
			running = running.then(compile);
		}, debounce);
	};

	const watchFiles = (read: Set<string>): void => {
		// while failing, the files that were not read are watched as well, the
		// fix can be in any of them
		files = failed ? new Set([...files, ...read]) : read;

		const needed = new Set([...files].map((file) => path.dirname(file)));
		for (const [directory, watcher] of directories) {
			if (!needed.has(directory)) {
				watcher.close();
				directories.delete(directory);
			}
		}

		for (const directory of needed) {
			if (directories.has(directory)) {
				continue;
			}
			// editors often replace files, so the directory is watched, not the file
			const watcher = watch(directory, (_event, name) => {
				const file = name ? path.join(directory, name) : undefined;
				// a file that was missing can be created anywhere near the others
				if (failed || file === undefined || files.has(file)) {
					templatesChanged = true;
					schedule();
				}
			});
			watcher.on('error', () => {
				watcher.close();
				directories.delete(directory);
			});
			directories.set(directory, watcher);
		}
	};

	const updateAssets = async (
		root: string,
		next: AssetPlan | undefined,
	): Promise<void> => {
		const key = next ? JSON.stringify(next.entries) : '';
		if (assets?.key === key) {
			return;
		}

		const previous = assets;
		assets = undefined;
		await previous?.watcher.close();

		if (next) {
			const watcher = await watchAssets({
				root,
				entries: next.entries,
				rsbuild: options.rsbuild,
				onRebuild() {
					assetsChanged = true;
					schedule();
				},
			});
			assets = { key, watcher };
		}
	};

	const compile = async (): Promise<void> => {
		if (closed || (!templatesChanged && !assetsChanged)) {
			return;
		}

		options.onStart?.();
		const templates = templatesChanged;
		templatesChanged = false;
		assetsChanged = false;

		try {
			if (templates) {
				const read = new Set<string>();
				try {
					const next = await prepareTemplate(options, (file) => read.add(file));
					failed = false;
					watchFiles(read);

					const nextPlan = planAssets(next.chunks, next.dependencies);
					await updateAssets(next.root, nextPlan);
					prepared = next;
					plan = nextPlan;
				} catch (error) {
					failed = true;
					watchFiles(read);
					throw error;
				}
			}

			// only the scripts and styles changed, but the templates do not compile
			if (prepared === undefined || failed) {
				return;
			}

			if (plan && assets) {
				const build = await assets.watcher.latest();
				// a rebuild finished while waiting is part of this compilation
				assetsChanged = false;
				applyAssets(prepared.chunks, plan, build);
			}

			const compiled = finishTemplate(prepared);
			// a change can rebuild without changing anything, for example when
			// an editor saves through a temporary file the bundler sees as well
			if (!closed && compiled.source !== previous) {
				previous = compiled.source;
				await onCompile(compiled);
			}
		} catch (error) {
			// after an error, the same output as before is a recovery to report
			previous = undefined;
			onError(error);
		}
	};

	running = running.then(compile);
	await running;

	return {
		async close() {
			closed = true;
			clearTimeout(timer);
			for (const watcher of directories.values()) {
				watcher.close();
			}
			directories.clear();
			await running;
			await assets?.watcher.close();
			assets = undefined;
		},
	};
}
