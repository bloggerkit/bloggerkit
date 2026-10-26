import { assert, test } from 'vitest';
import { packageManager, packageName } from './init';

test('the package name of a theme is one npm takes', () => {
	assert.strictEqual(packageName('My Theme'), 'my-theme');
	assert.strictEqual(packageName('  Café & Co.  '), 'caf-co.');
	assert.strictEqual(packageName('_theme'), 'theme');
	assert.strictEqual(packageName('???'), 'blogger-theme');
});

test('the package manager is the one the CLI is run with', () => {
	assert.strictEqual(packageManager('pnpm/10.0.0 npm/? node/v24'), 'pnpm');
	assert.strictEqual(packageManager('yarn/4.0.0 npm/? node/v24'), 'yarn');
	assert.strictEqual(packageManager('bun/1.2.0 npm/? node/v24'), 'bun');
	assert.strictEqual(packageManager('npm/11.0.0 node/v24'), 'npm');
	assert.strictEqual(packageManager(''), 'npm');
});
