import {
	createRsbuild,
	type EnvironmentConfig,
	mergeRsbuildConfig,
	type RsbuildConfig,
	type RsbuildPlugin,
} from '@rsbuild/core';
import { CompileError } from './errors';

/**
 * Rsbuild config merged over the defaults (production mode, minified output, no
 * source maps, silent logs), or a function receiving the defaults and returning
 * the config to use. It applies to every build.
 *
 * What the compiler relies on (entries, output files, chunking, runtime
 * isolation) is applied last and can not be changed from here or by plugins.
 */
export type RsbuildOptions =
	| RsbuildConfig
	| ((config: RsbuildConfig) => RsbuildConfig | undefined);

export interface AssetEntry {
	import: string;
	dependOn?: string[];
}

export interface BuildAssetsOptions {
	root: string;
	entries: Record<string, AssetEntry>;
	rsbuild?: RsbuildOptions;
}

export interface AssetOutput {
	js?: string;
	css?: string;
	/** Name of the shared runtime the entry needs, see `AssetBuild.runtimes`. */
	runtime?: string;
}

export interface AssetBuild {
	outputs: Map<string, AssetOutput>;
	/** Shared runtimes of the entry groups, by name. */
	runtimes: Map<string, string>;
}

/**
 * Bundles all entries in a single rsbuild run and returns the output per entry name.
 * Nothing is written to disk.
 */
export async function buildAssets(
	options: BuildAssetsOptions,
): Promise<AssetBuild> {
	const capture = createCapture(options.entries);
	const rsbuild = await createAssetsRsbuild(options, capture);

	try {
		const { close } = await rsbuild.build();
		await close();
	} catch (cause) {
		throw new CompileError(
			`Failed to bundle assets\n${capture.errors.join('\n') || String(cause)}`,
			{ cause },
		);
	}

	return collectBuild(capture);
}

export interface WatchAssetsOptions extends BuildAssetsOptions {
	/** Called after every rebuild caused by a change of bundled files, with them. */
	onRebuild(files: string[]): void;
}

export interface AssetWatcher {
	/** The latest build, waiting for the one in progress, it throws if it failed. */
	latest(): Promise<AssetBuild>;
	close(): Promise<void>;
}

/**
 * Bundles all entries like `buildAssets` and keeps rebuilding them when the
 * bundled files change. The entries are fixed, a new watcher is needed when they
 * change.
 */
export async function watchAssets(
	options: WatchAssetsOptions,
): Promise<AssetWatcher> {
	const capture = createCapture(options.entries);
	let result: { build: AssetBuild } | { error: unknown } | undefined;
	let pending: PromiseWithResolvers<void> | undefined;

	/** The files changed since the last rebuild. */
	const changed = new Set<string>();

	const start = (): void => {
		pending ??= Promise.withResolvers();
	};

	const watchPlugin: RsbuildPlugin = {
		name: 'blogger-hbs:watch',
		setup(api) {
			// `invalid` comes as soon as a file changes, before the rebuild starts,
			// so a rebuild already on its way is waited for
			api.onAfterCreateCompiler(({ compiler }) => {
				compiler.hooks.invalid.tap(
					'blogger-hbs:watch',
					(file: string | null) => {
						if (file) {
							changed.add(file);
						}
						start();
					},
				);
			});
			api.onBeforeBuild(start);
			api.onAfterBuild({
				// after the capture plugin has collected the errors
				order: 'post',
				handler: ({ isFirstCompile }) => {
					try {
						result = { build: collectBuild(capture) };
					} catch (error) {
						result = { error };
					}
					pending?.resolve();
					pending = undefined;
					if (!isFirstCompile) {
						options.onRebuild([...changed]);
					}
					changed.clear();
				},
			});
		},
	};

	const rsbuild = await createAssetsRsbuild(options, capture, [watchPlugin]);
	start();
	const { close } = await rsbuild.build({ watch: true });

	return {
		async latest() {
			while (pending) {
				await pending.promise;
			}
			if (result === undefined || 'error' in result) {
				throw result?.error;
			}
			return result.build;
		},
		close,
	};
}

async function createAssetsRsbuild(
	options: BuildAssetsOptions,
	capture: Capture,
	plugins: RsbuildPlugin[] = [],
) {
	const { root, rsbuild: userConfig } = options;
	const { environments } = capture;

	const defaults: RsbuildConfig = {
		mode: 'production',
		logLevel: 'silent',
		source: { define: {} },
		resolve: { alias: {} },
		output: {
			minify: { js: true, css: true },
			sourceMap: { js: false, css: false },
		},
		performance: { printFileSize: false },
	};

	const config =
		typeof userConfig === 'function'
			? (userConfig(defaults) ?? defaults)
			: mergeRsbuildConfig(defaults, userConfig ?? {});

	return createRsbuild({
		cwd: root,
		loadEnv: false,
		config: {
			...config,
			environments,
			plugins: [
				...(config.plugins ?? []),
				internalsPlugin(environments),
				capturePlugin(capture),
				...plugins,
			],
		},
	});
}

/** What a compilation of an environment emitted. */
interface EnvironmentOutput {
	outputs: Map<string, AssetOutput>;
	runtimes: Map<string, string>;
	unexpected: string[];
}

interface Capture {
	entries: Record<string, AssetEntry>;
	environments: Record<string, EnvironmentConfig>;
	runtimeOf: Map<string, string>;
	/**
	 * The latest output of every environment, a rebuild only compiles the
	 * environments with changes and replaces their output.
	 */
	results: Map<string, EnvironmentOutput>;
	/** Errors of the latest build. */
	errors: string[];
}

function createCapture(entries: Record<string, AssetEntry>): Capture {
	return {
		entries,
		...createEnvironments(entries),
		results: new Map(),
		errors: [],
	};
}

/** Merges the output of all environments, throws if the latest build failed. */
function collectBuild({ runtimeOf, results, errors }: Capture): AssetBuild {
	if (errors.length > 0) {
		throw new CompileError(`Failed to bundle assets\n${errors.join('\n')}`);
	}

	const outputs = new Map<string, AssetOutput>();
	const runtimes = new Map<string, string>();
	const unexpected: string[] = [];

	for (const result of results.values()) {
		for (const [name, output] of result.outputs) {
			outputs.set(name, { ...output });
		}
		for (const [name, code] of result.runtimes) {
			runtimes.set(name, code);
		}
		unexpected.push(...result.unexpected);
	}

	if (unexpected.length > 0) {
		throw new CompileError(
			`Unsupported assets emitted: ${unexpected.join(', ')} (dynamic imports and emitted files are not supported)`,
		);
	}

	for (const [name, runtime] of runtimeOf) {
		outputs.set(name, { ...outputs.get(name), runtime });
	}

	return { outputs, runtimes };
}

function capturePlugin(capture: Capture): RsbuildPlugin {
	const { entries, runtimeOf, results } = capture;
	const runtimeNames = new Set(runtimeOf.values());

	return {
		name: 'blogger-hbs:capture',
		setup(api) {
			api.onAfterBuild(({ stats }) => {
				const json = stats?.toJson({ all: false, errors: true });
				capture.errors = (json?.errors ?? []).map((error) => error.message);
			});

			api.processAssets(
				{ stage: 'report' },
				({ assets, compilation, environment }) => {
					const result: EnvironmentOutput = {
						outputs: new Map(),
						runtimes: new Map(),
						unexpected: [],
					};

					for (const [file, source] of Object.entries(assets)) {
						const [, name, extension] = /^(.+)\.(js|css)$/.exec(file) ?? [];
						if (
							name !== undefined &&
							runtimeNames.has(name) &&
							extension === 'js'
						) {
							result.runtimes.set(name, String(source.source()));
						} else if (name === undefined || !Object.hasOwn(entries, name)) {
							result.unexpected.push(file);
						} else {
							const output = result.outputs.get(name) ?? {};
							output[extension as 'js' | 'css'] = String(source.source());
							result.outputs.set(name, output);
						}
						compilation.deleteAsset(file);
					}

					results.set(environment.name, result);
				},
			);
		},
	};
}

/** The object holding the chunk loading globals of the groups, `rspc[group]`. */
const GLOBAL_OBJECT = '(self.rspc = self.rspc || {})';

/** Name of the group of entries without any relations, the others are `$0`, `$1`, ... */
const ALONE_GROUP = '$$';

/**
 * Entries that depend on each other share a chunk loading global, so every such
 * group is built in its own environment with a global of its own, otherwise the
 * runtimes of unrelated groups on the same page would try to run each other's
 * chunks. Inside a group all entries share a single runtime chunk, an entry that
 * depends on several independent entries cannot run on more than one runtime.
 * Entries without any relations need none of this and are built together.
 */
function createEnvironments(entries: Record<string, AssetEntry>): {
	environments: Record<string, EnvironmentConfig>;
	runtimeOf: Map<string, string>;
} {
	const groups = new Map<string, string[]>();
	const alone: string[] = [];

	for (const group of groupEntries(entries)) {
		if (group.length > 1) {
			groups.set(`$${groups.size}`, group);
		} else {
			alone.push(...group);
		}
	}
	if (alone.length > 0) {
		groups.set(ALONE_GROUP, alone);
	}

	const runtimeOf = new Map<string, string>();
	const environments: Record<string, EnvironmentConfig> = {};

	for (const [name, names] of groups) {
		const shared = name !== ALONE_GROUP;
		const runtime = `${name}-runtime`;

		if (shared) {
			for (const entry of names) {
				runtimeOf.set(entry, runtime);
			}
		}

		environments[name] = {
			// the target is read when the environment is created, before the
			// internals are applied, so it has to be set here as well
			output: { target: 'web' },
			source: {
				entry: Object.fromEntries(names.map((key) => [key, entries[key]])),
			},
			tools: {
				rspack: {
					output: {
						// chunks register on `self.rspc[name]`, the only global
						// the output creates
						globalObject: GLOBAL_OBJECT,
						chunkLoadingGlobal: name,
					},
					...(shared && { optimization: { runtimeChunk: { name: runtime } } }),
				},
			},
		};
	}

	return { environments, runtimeOf };
}

/** Splits the entries into groups connected through `dependOn`. */
function groupEntries(entries: Record<string, AssetEntry>): string[][] {
	const parent = new Map(Object.keys(entries).map((name) => [name, name]));
	const find = (name: string): string => {
		const next = parent.get(name) as string;
		return next === name ? name : find(next);
	};

	for (const [name, { dependOn = [] }] of Object.entries(entries)) {
		for (const dependency of dependOn) {
			parent.set(find(name), find(dependency));
		}
	}

	const groups = new Map<string, string[]>();
	for (const name of parent.keys()) {
		const root = find(name);
		groups.set(root, [...(groups.get(root) ?? []), name]);
	}

	return [...groups.values()];
}

/**
 * Applied after everything else, config and plugins included, so that what the
 * compiler relies on stays as it is: the entries, the names and the places of
 * the output, a single chunk per entry and the runtime isolation.
 */
function internalsPlugin(
	environments: Record<string, EnvironmentConfig>,
): RsbuildPlugin {
	return {
		name: 'blogger-hbs:internals',
		setup(api) {
			api.modifyEnvironmentConfig({
				order: 'post',
				handler(config, { name }) {
					const internal = environments[name];
					const rspack = config.tools?.rspack;

					return {
						...config,
						source: { ...config.source, entry: internal.source?.entry },
						output: {
							...config.output,
							target: 'web',
							legalComments: 'none',
							cleanDistPath: false,
							filename: {
								...config.output?.filename,
								js: '[name].js',
								css: '[name].css',
							},
							distPath: { ...config.output?.distPath, js: '', css: '' },
						},
						performance: {
							...config.performance,
							chunkSplit: { strategy: 'all-in-one' },
						},
						tools: {
							...config.tools,
							htmlPlugin: false,
							rspack: [
								...(Array.isArray(rspack) ? rspack : rspack ? [rspack] : []),
								internal.tools?.rspack,
							] as never,
						},
					};
				},
			});
		},
	};
}
