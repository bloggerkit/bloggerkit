import { assert, describe, test } from 'vitest';
import { describeValue, didYouMean, isPlainObject, suggest } from './suggest';

describe('suggest', () => {
	const options = ['root', 'entry', 'alias', 'plugins', 'rsbuild'];

	test('finds the closest name for a typo', () => {
		assert.strictEqual(suggest('entri', options), 'entry');
		assert.strictEqual(suggest('plugin', options), 'plugins');
		assert.strictEqual(suggest('Alias', options), 'alias');
	});

	test('suggests nothing when no name is close', () => {
		assert.isUndefined(suggest('context', options));
		assert.isUndefined(suggest('x', []));
	});

	test('didYouMean formats the suggestion', () => {
		assert.strictEqual(
			didYouMean('wach', ['watch']),
			", did you mean 'watch'?",
		);
		assert.strictEqual(
			didYouMean('--wach', ['--watch'], '`'),
			', did you mean `--watch`?',
		);
		assert.strictEqual(didYouMean('zzz', ['watch']), '');
	});
});

describe('describeValue', () => {
	test.each([
		[null, 'null'],
		[undefined, 'undefined'],
		[[1], 'an array'],
		['', 'an empty string'],
		['x', "'x'"],
		[5, '5'],
		[false, 'false'],
		[{}, 'an object'],
		[() => {}, 'function'],
	])('describes %o as %s', (value, description) => {
		assert.strictEqual(describeValue(value), description);
	});
});

describe('isPlainObject', () => {
	test('only accepts object literals and null-prototype objects', () => {
		assert.isTrue(isPlainObject({}));
		assert.isTrue(isPlainObject(Object.create(null)));
		assert.isFalse(isPlainObject([]));
		assert.isFalse(isPlainObject(new Map()));
		assert.isFalse(isPlainObject(null));
		assert.isFalse(isPlainObject('x'));
	});
});
