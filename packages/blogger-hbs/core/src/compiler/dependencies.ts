import type { Chunks, ScriptChunk } from './chunks';
import { CompileError } from './errors';
import type { Requirement } from './scan';

/**
 * Validates `depends-on` targets and resolves them to entries.
 *
 * A target is a file. For a style that is its entry. For a script it is the
 * entry imported without dependencies, or the only one when it is imported with
 * a single set of them, anything else is ambiguous. Cycles are rejected.
 *
 * Returns the ids of the entries each script entry depends on.
 */
export function linkDependencies(
	chunks: Chunks,
	requirements: Requirement[],
): Map<string, string[]> {
	const entries = new Map<string, [id: string, chunk: ScriptChunk][]>();
	for (const [id, chunk] of chunks) {
		if (chunk.type === 'script') {
			entries.set(chunk.fileId, [
				...(entries.get(chunk.fileId) ?? []),
				[id, chunk],
			]);
		}
	}

	for (const { id, specifier, where } of requirements) {
		if (!entries.has(id) && chunks.get(id)?.type !== 'style') {
			throw new CompileError(
				`'depends-on' target '${specifier}' must also be imported by a template (${where})`,
			);
		}
	}

	const resolved = new Map<string, string[]>();
	for (const [id, chunk] of chunks) {
		if (chunk.type !== 'script') {
			continue;
		}

		resolved.set(
			id,
			chunk.dependsOn.map((fileId) => {
				if (chunks.get(fileId)?.type === 'style') {
					return fileId;
				}

				const candidates = entries.get(fileId) ?? [];
				const match =
					candidates.length === 1
						? candidates[0]
						: candidates.find(
								([, candidate]) => candidate.dependsOn.length === 0,
							);
				if (!match) {
					throw new CompileError(
						`'depends-on' target '${fileId}' of '${id}' is ambiguous, it is only imported with different dependencies`,
					);
				}
				return match[0];
			}),
		);
	}

	const visit = (id: string, stack: string[]): void => {
		if (stack.includes(id)) {
			throw new CompileError(
				`Circular 'depends-on': ${[...stack.slice(stack.indexOf(id)), id].join(' -> ')}`,
			);
		}

		for (const dependency of resolved.get(id) ?? []) {
			visit(dependency, [...stack, id]);
		}
	};

	for (const id of resolved.keys()) {
		visit(id, []);
	}

	return resolved;
}
