import Handlebars from 'handlebars';
import type { PartialChunk, TemplateChunk } from './chunks';
import { CompileError } from './errors';
import { evaluate } from './evaluate';

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

		chunk.spec = evaluate<object>(chunk.compiled);
	}
}
