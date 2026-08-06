import { assert, test } from 'vitest';
import { parse } from './parser';
import { print } from './printer';

test('print', () => {
	assert.equal(print(parse('data:view.isHomepage')), 'data:view.isHomepage');
	assert.equal(
		print(parse('data:links filter (l => l.name)')),
		'data:links filter (l => l.name)',
	);
	assert.equal(
		print(
			parse(`
data:links filter (l =>
  l.name in {"https://", "#"}
)
`),
		),
		'data:links filter (l => l.name in {"https://", "#"})',
	);
});
