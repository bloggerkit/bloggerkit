import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { parse } from '../src';

const here = dirname(fileURLToPath(import.meta.url));
const expressions: string[] = JSON.parse(
	await readFile(join(here, 'corpus.expr.json'), 'utf8'),
);

test(`parses ${expressions.length} real expressions extracted from Plus UI v3.2.0`, () => {
	for (let i = 0; i < expressions.length; i++) {
		const expression = expressions[i];
		try {
			parse(expression);
		} catch (e) {
			throw new Error(`Failed to parse corpus expression #${i}`, {
				cause: e,
			});
		}
	}
});
