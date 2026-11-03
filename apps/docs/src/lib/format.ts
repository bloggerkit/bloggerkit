/** Adds an `s` unless the count is 1: `plural(3, 'page')` → "3 pages". */
export function plural(count: number, noun: string): string {
	return `${count} ${count === 1 ? noun : `${noun}s`}`;
}
