import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getTailwindClasses } from 'tailwindcss-iso';
import { fsExists } from './utils';

export class TailwindCache {
	private readonly _file: string;

	constructor(file: string) {
		this._file = path.resolve(file);
	}

	private async _readContent(): Promise<string | null> {
		const exists = await fsExists(this._file);

		if (!exists) {
			return null;
		}

		return fs.readFile(this._file, 'utf-8');
	}

	private async _writeContent(content: string): Promise<boolean> {
		const dirname = path.dirname(this._file);

		const exists = await fsExists(dirname);

		if (!exists) {
			await fs.mkdir(dirname, { recursive: true });
		}

		const current = await this._readContent();
		if (current === null || content !== current) {
			await fs.writeFile(this._file, content, 'utf8');
			return true;
		}

		return false;
	}

	async remove(): Promise<boolean> {
		const exists = await fsExists(this._file);

		if (!exists) {
			return false;
		}

		await fs.rm(this._file);
		return true;
	}

	async read(): Promise<string[] | null> {
		const content = await this._readContent();

		if (!content) {
			return null;
		}

		try {
			return JSON.parse(content);
		} catch {
			return null;
		}
	}

	async write(classes: string[]): Promise<boolean> {
		const content = JSON.stringify(classes, null, 2);
		return this._writeContent(content);
	}

	async clear(): Promise<void> {
		await this.write([]);
	}

	async add(classes: string[]): Promise<string[]> {
		const existing = (await this.read()) ?? [];
		const merged = [...new Set([...existing, ...classes])];

		await this.write(merged);

		return merged;
	}

	async update(content: string, extension?: string): Promise<string[]> {
		const classes = (await getTailwindClasses({
			content,
			extension,
		})) as string[];

		return this.add(classes);
	}
}
