import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { onTestFinished } from 'vitest';
import { type CompileTemplateOptions, compileTemplate } from '../src/compiler';
import { renderTemplate } from '../src/runtime';

/**
 * Writes the files, by path, into a new temporary directory removed after the
 * test, and returns the directory.
 */
export async function createFixture(
	files: Record<string, string>,
): Promise<string> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'blogger-hbs-'));
	onTestFinished(() => fs.rm(root, { recursive: true, force: true }));
	await writeFiles(root, files);
	return root;
}

export async function writeFiles(
	root: string,
	files: Record<string, string>,
): Promise<void> {
	for (const [name, content] of Object.entries(files)) {
		const file = path.join(root, name);
		await fs.mkdir(path.dirname(file), { recursive: true });
		await fs.writeFile(file, content);
	}
}

/** Compiles the files of a fixture and renders the entry with `context`. */
export async function render(
	files: Record<string, string>,
	{
		context = {},
		...options
	}: Omit<CompileTemplateOptions, 'root'> & { context?: unknown } = {},
): Promise<string> {
	const root = await createFixture(files);
	const compiled = await compileTemplate({ root, ...options });
	return renderTemplate({ ...compiled, context });
}
