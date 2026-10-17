import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import Handlebars from 'handlebars';
import {
	CHUNK_HASH_KEY,
	JSON_EXTENSIONS,
	SCRIPT_EXTENSIONS,
	STYLE_EXTENSIONS,
	TEMPLATE_EXTENSIONS,
} from '../constants';
import { type Location, withLocation } from '../plugins';
import { toSpecifier } from '../utils/path';
import type { Resolver } from '../utils/resolver';
import {
	extractImports,
	type Import,
	type Program,
	setHashString,
	type ValidImport,
} from './ast';
import type { Chunk, Chunks, TemplateChunk } from './chunks';
import { CompileError } from './errors';
import { markStandaloneImports } from './standalone';

/** A `depends-on` target that has to be imported by some template as well. */
export interface Requirement {
	/** Id of the required script or style file. */
	id: string;
	specifier: string;
	where: Location;
}

export interface Graph {
	chunks: Chunks;
	templates: TemplateChunk[];
	requirements: Requirement[];
}

export interface ScanOptions {
	root: string;
	resolver: Resolver;
	/** Called with every template and json file before it is read. */
	onRead?(file: string): void;
}

/**
 * Walks the entry template and every file it imports (recursively for
 * templates) and collects them as chunks. Nothing is bundled or compiled here.
 *
 * A script entry is identified by its file together with the script and style
 * files it depends on, so importing it again with the same dependencies reuses the
 * chunk, while different dependencies produce a separate entry. Every import
 * is tagged with the id of its chunk for the runtime.
 */
export async function scan(
	entry: string,
	{ root, resolver, onRead }: ScanOptions,
): Promise<Graph> {
	const chunks: Chunks = new Map();
	const templates: TemplateChunk[] = [];
	const requirements: Requirement[] = [];

	/** The file `specifier` is, from `importer`, the error is at `where`. */
	const resolve = async (
		importer: string,
		specifier: string,
		where: Location,
	): Promise<string> => {
		try {
			return await resolver.resolve(importer, specifier);
		} catch {
			throw located(`Failed to resolve '${specifier}'`, where);
		}
	};

	const scanTemplate = async (file: string, id: string): Promise<void> => {
		onRead?.(file);
		let source: string;
		try {
			source = await fs.readFile(file, 'utf-8');
		} catch (error) {
			throw new CompileError(`Failed to read template '${id}'`, {
				cause: error,
			});
		}

		let parsed: Program;
		try {
			parsed = Handlebars.parse(source, { srcName: id }) as Program;
		} catch (error) {
			throw new CompileError(`Failed to parse template '${id}'`, {
				cause: error,
			});
		}

		const kinds = new Map<string, Chunk['type'] | undefined>();
		const nested = new Set<string>();

		const imports = extractImports(parsed);
		// 1-based column, as editors show it
		const whereOf = (item: Import): Location => ({
			path: id,
			line: item.start[0],
			column: item.start[1] + 1,
		});
		// resolved all at once, used in order, so the first error is the first in the template
		const targets = await Promise.allSettled(
			imports.map((item) =>
				item.valid ? resolve(file, item.specifier, whereOf(item)) : '',
			),
		);

		for (const [i, item] of imports.entries()) {
			const where = whereOf(item);
			if (!item.valid) {
				throw located(item.reason, where);
			}
			const resolved = targets[i] as PromiseSettledResult<string>;
			if (resolved.status === 'rejected') {
				throw resolved.reason;
			}

			const target = resolved.value;
			const kind = getKind(target);
			assertSupportedOptions(kind, item, where);

			if (item.node.type === 'BlockStatement') {
				if (kind !== 'template') {
					throw located(
						`'import' block of ${kind} '${item.specifier}' is not supported, only templates can have a block`,
						where,
					);
				}
				if (item.node.inverse) {
					throw located(`'import' block does not support '{{else}}'`, where);
				}
			}

			const fileId = toSpecifier(root, target);
			let chunkId = fileId;

			if (kind === 'script') {
				const dependsOn = await resolveDependsOn(file, item, where);
				if (dependsOn.length > 0) {
					chunkId = `${fileId} depends-on=${dependsOn.join(',')}`;
				}
				chunks.set(
					chunkId,
					chunks.get(chunkId) ?? {
						type: 'script',
						path: target,
						fileId,
						dependsOn,
					},
				);
			} else if (kind === 'style') {
				chunks.set(
					chunkId,
					chunks.get(chunkId) ?? { type: 'style', path: target },
				);
			} else {
				nested.add(target);
			}

			setHashString(item.node, CHUNK_HASH_KEY, chunkId);
			kinds.set(item.specifier, kind);
		}

		markStandaloneImports(
			parsed,
			(specifier) => kinds.get(specifier) !== 'data',
		);

		const chunk: TemplateChunk = {
			type: 'template',
			path: file,
			source,
			parsed,
		};
		chunks.set(id, chunk);
		templates.push(chunk);

		for (const target of nested) {
			await visit(target, file);
		}
	};

	/** Returns the sorted, unique script and style files and records every target as required. */
	const resolveDependsOn = async (
		file: string,
		item: ValidImport,
		where: Location,
	): Promise<string[]> => {
		const files = new Set<string>();

		for (const specifier of item.dependsOn) {
			const dependency = await resolve(file, specifier, where);
			const kind = getKind(dependency);
			if (kind !== 'script' && kind !== 'style') {
				throw located(
					`'depends-on' target '${specifier}' must be a script or style that is also imported by a template`,
					where,
				);
			}

			const id = toSpecifier(root, dependency);
			requirements.push({ id, specifier, where });
			files.add(id);
		}

		return [...files].sort();
	};

	const scanData = async (
		file: string,
		id: string,
		importer: string,
	): Promise<void> => {
		onRead?.(file);
		let data: unknown;
		try {
			data = JSON.parse(await fs.readFile(file, 'utf-8'));
		} catch (error) {
			throw new CompileError(
				`Failed to parse json '${file}' imported from ${importer}`,
				{ cause: error },
			);
		}
		chunks.set(id, { type: 'data', path: file, data });
	};

	const visit = async (file: string, importer: string): Promise<void> => {
		const id = toSpecifier(root, file);
		if (chunks.has(id)) {
			return;
		}

		switch (getKind(file)) {
			case 'template':
				return scanTemplate(file, id);
			case 'data':
				return scanData(file, id, importer);
			default:
				throw new CompileError(
					`Unsupported file extension '${path.extname(file)}' for '${file}' imported from ${importer}`,
				);
		}
	};

	if (getKind(entry) !== 'template') {
		throw new CompileError(`Entry '${entry}' must be a template`);
	}
	await visit(entry, root);

	return { chunks, templates, requirements };
}

function getKind(file: string): Chunk['type'] | undefined {
	const extension = path.extname(file);
	if (TEMPLATE_EXTENSIONS.has(extension)) {
		return 'template';
	}
	if (SCRIPT_EXTENSIONS.has(extension)) {
		return 'script';
	}
	if (STYLE_EXTENSIONS.has(extension)) {
		return 'style';
	}
	if (JSON_EXTENSIONS.has(extension)) {
		return 'data';
	}
}

/** Scripts accept every option, styles only `style*`, everything else none. */
function assertSupportedOptions(
	kind: Chunk['type'] | undefined,
	item: ValidImport,
	where: Location,
): void {
	if (kind === 'script') {
		return;
	}

	const options = [
		...(item.dependsOn.length > 0 ? ['depends-on'] : []),
		...item.hashKeys,
	];
	const unsupported = options.find(
		(key) =>
			kind !== 'style' || key === 'depends-on' || key.startsWith('script'),
	);

	if (unsupported !== undefined) {
		throw located(
			`'import' of ${kind} '${item.specifier}' does not support option '${unsupported}'`,
			where,
		);
	}
}

/** An error in a template, `message (./index.hbs:2:3)`. */
export function located(message: string, loc: Location): CompileError {
	return new CompileError(withLocation(message, loc), { loc });
}
