import * as path from 'node:path';
import { compileFunction } from 'node:vm';
import { createRsbuild, type RsbuildPlugin, rspack } from '@rsbuild/core';
import type { JsonValue, RuntimePluginSetup } from '../plugins';
import type { BundledPlugin } from '../runtime/chunks';
import { CompileError } from './errors';
import type { RuntimeRequest } from './plugins';

/** The runtime half of a compile plugin, bundled. */
export interface BundledRuntime extends BundledPlugin {
	options?: JsonValue;
	/** Its export in the bundle, `p0`, `p1`, ... */
	key: string;
}

/** The runtime halves of the compile plugins, bundled together. */
export interface RuntimeBundle {
	/**
	 * A JavaScript expression evaluating to the setup functions by key, with
	 * everything they import inlined once, as it is written in the compiled
	 * module.
	 */
	code: string;
	plugins: BundledRuntime[];
}

/** Global variable the bundle assigns its exports to. */
const LIBRARY = '__bhp';

/**
 * Generated entry importing every runtime, it is not written to disk. It is in
 * the root, for the specifiers of packages to resolve from there.
 */
const ENTRY = '__blogger-hbs-runtimes__.js';

/**
 * Bundles the runtime halves of the compile plugins in one build, into code
 * without imports running in any JavaScript runtime: the target is a web
 * worker, without Node.js modules or polyfills for them. They are bundled as a
 * single entry, so a module they share (a dependency of two plugins) is in it
 * once, and is the same instance for both. Nothing is written to disk.
 */
export async function bundleRuntimes(
	root: string,
	requests: readonly RuntimeRequest[],
): Promise<RuntimeBundle | undefined> {
	if (requests.length === 0) {
		return;
	}

	const keys = requests.map((_, i) => `p${i}`);
	const entryFile = path.join(root, ENTRY);
	const entrySource = requests
		.map(({ entry }, i) => {
			// relative to the root, not to where the entry is
			const specifier = entry.startsWith('.')
				? path.resolve(root, entry)
				: entry;
			// through the namespace, a missing default export is not a build error
			return `import * as m${i} from ${JSON.stringify(specifier)};\nexport const ${keys[i]} = m${i}.default;`;
		})
		.join('\n');

	let output: string | undefined;
	const unexpected: string[] = [];
	let errors: string[] = [];

	const capture: RsbuildPlugin = {
		name: 'blogger-hbs:runtimes',
		setup(api) {
			api.onAfterBuild(({ stats }) => {
				const json = stats?.toJson({ all: false, errors: true });
				errors = (json?.errors ?? []).map((error) => error.message);
			});
			api.processAssets({ stage: 'report' }, ({ assets, compilation }) => {
				for (const [file, source] of Object.entries(assets)) {
					if (file === 'runtimes.js') {
						output = String(source.source());
					} else {
						unexpected.push(file);
					}
					compilation.deleteAsset(file);
				}
			});
		},
	};

	const rsbuild = await createRsbuild({
		cwd: root,
		loadEnv: false,
		config: {
			mode: 'production',
			logLevel: 'silent',
			source: { entry: { runtimes: entryFile } },
			output: {
				target: 'web-worker',
				minify: { js: true, css: false },
				sourceMap: { js: false, css: false },
				legalComments: 'none',
				cleanDistPath: false,
				filename: { js: '[name].js' },
				distPath: { js: '' },
			},
			performance: {
				chunkSplit: { strategy: 'all-in-one' },
				printFileSize: false,
			},
			tools: {
				htmlPlugin: false,
				rspack: {
					output: {
						library: { type: 'var', name: LIBRARY },
						asyncChunks: false,
					},
					optimization: { splitChunks: false, runtimeChunk: false },
					plugins: [
						new rspack.experiments.VirtualModulesPlugin({
							[entryFile]: entrySource,
						}),
					],
				},
			},
			plugins: [capture],
		},
	});

	const fail = (details: string, cause?: unknown) =>
		new CompileError(
			`Failed to bundle the runtime of ${describePlugins(requests)}, it has to run in any JavaScript runtime, without Node.js modules\n${details}`,
			{ cause },
		);

	let failure: unknown;
	try {
		const { close } = await rsbuild.build();
		await close();
	} catch (cause) {
		failure = cause;
	}

	// the generated entry has no default to import from a runtime without one
	for (const error of errors) {
		const i = Number(
			/export 'default' \(imported as 'm(\d+)'\) was not found/.exec(
				error,
			)?.[1],
		);
		if (requests[i]) {
			throw noSetup(requests[i]);
		}
	}
	if (failure !== undefined || errors.length > 0) {
		throw fail(errors.join('\n') || String(failure), failure);
	}
	if (unexpected.length > 0) {
		throw fail(
			`Unsupported files emitted: ${unexpected.join(', ')} (dynamic imports and emitted files are not supported)`,
		);
	}

	const code = `(() => {\n${output ?? ''}\nreturn ${LIBRARY};\n})()`;

	let exports: Record<string, unknown>;
	try {
		exports = compileFunction(`return ${code};`, []).apply(null);
	} catch (cause) {
		throw new CompileError(
			`Failed to load the runtime of ${describePlugins(requests)}`,
			{ cause },
		);
	}

	const plugins = requests.map(({ plugin, options }, i) => {
		const setup = exports[keys[i]];
		if (typeof setup !== 'function') {
			throw noSetup(requests[i]);
		}
		return {
			name: plugin,
			options,
			key: keys[i],
			setup: setup as RuntimePluginSetup<never>,
		};
	});

	return { code, plugins };
}

function noSetup({ plugin, entry }: RuntimeRequest): CompileError {
	return new CompileError(
		`The runtime of plugin '${plugin}' ('${entry}') must export a setup function as default, made with defineRuntimePlugin`,
	);
}

function describePlugins(requests: readonly RuntimeRequest[]): string {
	const names = requests.map(({ plugin }) => `'${plugin}'`);
	return `${names.length > 1 ? 'plugins' : 'plugin'} ${names.join(', ')}`;
}
