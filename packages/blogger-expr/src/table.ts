/**
 * A lookup table without a prototype: a word or a name read from an
 * expression finds only the table's own entries, never `constructor`,
 * `toString` or `__proto__`.
 */
export function table<T>(
	entries: Record<string, T>,
): Readonly<Record<string, T | undefined>> {
	return Object.freeze(
		Object.assign(Object.create(null) as Record<string, T>, entries),
	);
}
