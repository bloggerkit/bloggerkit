import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { assert, describe, test } from 'vitest';
import { createFixture, writeFiles } from '../../test/fixture';
import {
	FILE_EXTENSIONS,
	INDEX_EXTENSIONS,
	RESOLVE_EXTENSIONS,
} from '../constants';
import { createResolver } from './resolver';

const resolverFor = (root: string) =>
	createResolver({
		root,
		alias: { '~': 'src' },
		extensions: {
			index: [...INDEX_EXTENSIONS],
			file: [...FILE_EXTENSIONS],
			resolve: [...RESOLVE_EXTENSIONS],
		},
	});

describe('createResolver', () => {
	test('finds a file, with or without its extension, and the index of a directory', async () => {
		const root = await createFixture({
			'src/index.hbs': '',
			'src/header.hbs': '',
			'src/card/index.hbs': '',
			'src/main.ts': '',
		});
		const importer = path.join(root, 'src/index.hbs');
		const { resolve } = resolverFor(root);

		assert.strictEqual(
			await resolve(importer, './header.hbs'),
			path.join(root, 'src/header.hbs'),
		);
		assert.strictEqual(
			await resolve(importer, './header'),
			path.join(root, 'src/header.hbs'),
		);
		assert.strictEqual(
			await resolve(importer, './card'),
			path.join(root, 'src/card/index.hbs'),
		);
		assert.strictEqual(
			await resolve(importer, '~/main'),
			path.join(root, 'src/main.ts'),
		);
		await assertRejects(resolve(importer, './missing'));
	});

	test('the first extension of the list wins', async () => {
		const root = await createFixture({ 'a.hbs': '', 'a.xml': '', 'a.ts': '' });
		const { resolve } = resolverFor(root);
		const first = [...FILE_EXTENSIONS].find((extension) =>
			['.hbs', '.xml', '.ts'].includes(extension),
		);
		assert.strictEqual(
			await resolve(path.join(root, 'index.hbs'), './a'),
			path.join(root, `a${first}`),
		);
	});

	test('follows a symlink to the real file, as an import does', async () => {
		const root = await createFixture({ 'real/header.hbs': '' });
		await fs.symlink(
			path.join(root, 'real/header.hbs'),
			path.join(root, 'header.hbs'),
		);
		await fs.symlink(path.join(root, 'real'), path.join(root, 'linked'));
		const { resolve } = resolverFor(root);
		const importer = path.join(root, 'index.hbs');

		// one file however it is reached, its path in the root
		for (const specifier of ['./header', './linked/header', './real/header']) {
			assert.strictEqual(
				await resolve(importer, specifier),
				path.join(root, 'real/header.hbs'),
				specifier,
			);
		}
	});

	test('a symlink out of the root resolves to the real file', async () => {
		const outside = await createFixture({ 'shared.hbs': '' });
		const root = await createFixture({});
		await fs.symlink(
			path.join(outside, 'shared.hbs'),
			path.join(root, 'shared.hbs'),
		);
		assert.strictEqual(
			await resolverFor(root).resolve(path.join(root, 'index.hbs'), './shared'),
			await fs.realpath(path.join(outside, 'shared.hbs')),
		);
	});

	test('a root reached through a symlink keeps its path', async () => {
		const real = await createFixture({ 'header.hbs': '' });
		const parent = await createFixture({});
		const root = path.join(parent, 'root');
		await fs.symlink(real, root);
		assert.strictEqual(
			await resolverFor(root).resolve(path.join(root, 'index.hbs'), './header'),
			path.join(root, 'header.hbs'),
		);
	});

	test('another case resolves as the file system says, as an import does', async () => {
		const root = await createFixture({ 'header.hbs': '' });
		const ignoresCase = await fs
			.stat(path.join(root, 'HEADER.hbs'))
			.then(() => true)
			.catch(() => false);
		const resolution = resolverFor(root).resolve(
			path.join(root, 'index.hbs'),
			'./HEADER',
		);
		if (ignoresCase) {
			// the real path can have the case of the file or of the import
			const resolved = await resolution;
			assert.strictEqual(path.dirname(resolved), root);
			assert.strictEqual(path.basename(resolved).toLowerCase(), 'header.hbs');
		} else {
			await assertRejects(resolution);
		}
	});

	test('reads a directory once, until it is cleared', async () => {
		const root = await createFixture({ 'index.hbs': '' });
		const importer = path.join(root, 'index.hbs');
		const resolver = resolverFor(root);

		await assertRejects(resolver.resolve(importer, './later'));
		await writeFiles(root, { 'later.hbs': '' });
		// the directory was read before the file was there
		await assertRejects(resolver.resolve(importer, './later'));

		resolver.clear(root);
		assert.strictEqual(
			await resolver.resolve(importer, './later'),
			path.join(root, 'later.hbs'),
		);

		await fs.rm(path.join(root, 'later.hbs'));
		resolver.clear();
		await assertRejects(resolver.resolve(importer, './later'));
	});
});

async function assertRejects(promise: Promise<unknown>): Promise<void> {
	try {
		await promise;
	} catch (error) {
		assert.match((error as Error).message, /^Failed to resolve/);
		return;
	}
	assert.fail('expected the resolution to fail');
}
