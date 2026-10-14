import { compileFunction } from 'node:vm';
import Handlebars from 'handlebars';
import type { PartialChunk, TemplateChunk } from './chunks';
import { CompileError } from './errors';

/** Precompiles every template and partial chunk into its Handlebars spec. */
export function precompileTemplates(
	templates: (TemplateChunk | PartialChunk)[],
): void {
	for (const chunk of templates) {
		const label =
			'path' in chunk ? `template '${chunk.path}'` : `partial '${chunk.name}'`;

		try {
			chunk.compiled = Handlebars.precompile(chunk.parsed, {
				strict: true,
			}) as string;
		} catch (error) {
			throw new CompileError(`Failed to compile ${label}`, { cause: error });
		}

		chunk.spec = compileFunction(`return ${chunk.compiled};`, []).apply(
			null,
		) as object;
	}
}
