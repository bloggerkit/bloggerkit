/** The candidate closest to `name`, when it is close enough to be a typo. */
export function suggest(
	name: string,
	candidates: Iterable<string>,
): string | undefined {
	let best: string | undefined;
	let bestDistance = Number.POSITIVE_INFINITY;

	for (const candidate of candidates) {
		const distance = editDistance(name.toLowerCase(), candidate.toLowerCase());
		if (distance < bestDistance) {
			best = candidate;
			bestDistance = distance;
		}
	}

	// a third of the name can be wrong, at least one character
	return bestDistance <= Math.max(1, Math.floor(name.length / 3))
		? best
		: undefined;
}

/** `, did you mean 'x'?` or nothing. */
export function didYouMean(
	name: string,
	candidates: Iterable<string>,
	quote = "'",
): string {
	const match = suggest(name, candidates);
	return match === undefined ? '' : `, did you mean ${quote}${match}${quote}?`;
}

/** Describes a value for an error message, `got: ...`. */
export function describeValue(value: unknown): string {
	if (value === null) {
		return 'null';
	}
	if (Array.isArray(value)) {
		return 'an array';
	}
	if (typeof value === 'string') {
		return value === '' ? 'an empty string' : `'${value}'`;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	return typeof value === 'object' ? 'an object' : typeof value;
}

export function isPlainObject(
	value: unknown,
): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function editDistance(a: string, b: string): number {
	let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

	for (let i = 1; i <= a.length; i++) {
		const current = [i];
		for (let j = 1; j <= b.length; j++) {
			current[j] = Math.min(
				previous[j] + 1,
				current[j - 1] + 1,
				previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		}
		previous = current;
	}

	return previous[b.length];
}
