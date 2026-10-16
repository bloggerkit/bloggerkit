import type { AssetChunk, Chunks } from './chunks';
import { CompileError } from './errors';
import {
	type AssetBuild,
	type AssetEntry,
	buildAssets,
	type RsbuildOptions,
} from './rsbuild';

/** The script and style chunks and the entries they are bundled as. */
export interface AssetPlan {
	assets: [id: string, chunk: AssetChunk][];
	/** Entry name of every asset chunk, by chunk id. */
	names: Map<string, string>;
	entries: Record<string, AssetEntry>;
}

/**
 * Bundles every script and style chunk in one build and stores the result on
 * the chunks (`code`, and `css` for scripts importing styles). Each chunk is
 * bundled once, however many times it is imported.
 *
 * `dependencies` holds the entries each script entry depends on.
 */
export async function bundleAssets(
	chunks: Chunks,
	root: string,
	rsbuild: RsbuildOptions | undefined,
	dependencies: Map<string, string[]>,
): Promise<void> {
	const plan = planAssets(chunks, dependencies);
	if (plan === undefined) {
		return;
	}

	const build = await buildAssets({ root, entries: plan.entries, rsbuild });
	applyAssets(chunks, plan, build);
}

/** Returns the entries to bundle, nothing when there are no scripts or styles. */
export function planAssets(
	chunks: Chunks,
	dependencies: Map<string, string[]>,
): AssetPlan | undefined {
	const assets = [...chunks].filter(
		(item): item is [string, AssetChunk] =>
			item[1].type === 'script' || item[1].type === 'style',
	);

	if (assets.length === 0) {
		return;
	}

	const names = new Map(assets.map(([id], i) => [id, `entry${i}`]));
	const nameOf = (id: string) => names.get(id) as string;

	const entries: Record<string, AssetEntry> = {};
	for (const [id, chunk] of assets) {
		const dependOn = (dependencies.get(id) ?? []).map(nameOf);
		entries[nameOf(id)] = {
			import: chunk.path,
			...(dependOn.length > 0 && { dependOn }),
		};
	}

	return { assets, names, entries };
}

/**
 * Stores the output of a build on the chunks of the plan, replacing what an
 * earlier build stored.
 */
export function applyAssets(
	chunks: Chunks,
	{ assets, names }: AssetPlan,
	build: AssetBuild,
): void {
	// the same build can be applied again, so it is not changed
	const runtimes = new Map(build.runtimes);

	for (const [id, chunk] of assets) {
		const { js, css, runtime } = build.outputs.get(names.get(id) ?? '') ?? {};

		if (chunk.type === 'script') {
			chunk.code = embeddable(js ?? '', 'script', chunk.path);
			chunk.css =
				css === undefined ? undefined : embeddable(css, 'style', chunk.path);
			chunk.runtime = runtime === undefined ? undefined : `runtime:${runtime}`;
		} else {
			chunk.code = embeddable(css ?? '', 'style', chunk.path);
			// scripts depending on a style wait for its (script) chunk to be
			// loaded, which has to come with the runtime as the style has no tag
			if (runtime !== undefined && js) {
				runtimes.set(runtime, `${runtimes.get(runtime)}\n${js}`);
			}
		}
	}

	for (const [name, code] of runtimes) {
		chunks.set(`runtime:${name}`, {
			type: 'runtime',
			code: embeddable(code, 'script', name),
		});
	}
}

/** Makes bundled code safe to inline in a CDATA section inside a script or style tag. */
function embeddable(
	code: string,
	tag: 'script' | 'style',
	file: string,
): string {
	if (code.includes(']]>')) {
		throw new CompileError(
			`Bundled ${tag} of '${file}' contains ']]>' which cannot be embedded in CDATA`,
		);
	}

	return code.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);
}
