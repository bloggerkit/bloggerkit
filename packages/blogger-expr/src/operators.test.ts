/**
 * Every operator between every pair of kinds, as Blogger rendered it
 * (`operators.fixture.json`). `null` is "not valid".
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { evaluate, parse, toText } from './index';

interface Fixture {
	kinds: string[];
	operators: string[];
	results: Record<string, (string | null)[]>;
}

const fixture = JSON.parse(
	readFileSync(new URL('./operators.fixture.json', import.meta.url), 'utf8'),
) as Fixture;

const cases = fixture.operators.flatMap((operator) =>
	fixture.kinds.flatMap((left, i) =>
		fixture.kinds.map((right, j) => ({
			source: `${left} ${operator} ${right}`,
			expected:
				fixture.results[operator]?.[i * fixture.kinds.length + j] ?? null,
		})),
	),
);

/** The value, or `null` when the expression is not accepted or can not be computed. */
function run(source: string): string | null {
	const parsed = parse(source);
	if (parsed.errors.length) {
		return null;
	}
	try {
		return toText(evaluate(parsed));
	} catch {
		return null;
	}
}

describe('operators between kinds', () => {
	// `data:missing and X` is false in Blogger, which does not read `X`; the
	// parser can not know the data, and refuses `X`, which fails whenever the
	// data is true.
	const unknowable = (source: string) => /^data:missing and /.test(source);

	test.each(cases.filter((c) => !unknowable(c.source)))(
		'$source',
		({ source, expected }) => {
			expect(run(source)).toBe(expected);
		},
	);

	test.each(cases.filter((c) => unknowable(c.source)))(
		'$source is refused when its right side is not a condition',
		({ source, expected }) => {
			const refused = parse(source).errors.some(
				(e) => e.code === 'condition-not-boolean',
			);
			expect(refused || run(source) === expected).toBe(true);
		},
	);

	test('parse finds what Blogger refuses, unless it depends on data', () => {
		const missed = cases.filter(
			(c) =>
				c.expected === null &&
				!c.source.includes('data:') &&
				parse(c.source).errors.length === 0,
		);
		expect(missed.map((c) => c.source)).toEqual([]);
	});
});
