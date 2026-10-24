/** A range of an expression, in UTF-16 code units from 0, end excluded. */
export interface Span {
	start: number;
	end: number;
}

export function span(start: number, end: number): Span {
	return { start, end };
}

/** The smallest span that covers both. */
export function join(a: Span, b: Span): Span {
	return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}

/** Line and column of an offset, both from 1. */
export function lineAndColumn(
	source: string,
	offset: number,
): { line: number; column: number } {
	let line = 1;
	let lineStart = 0;
	for (let i = 0; i < offset && i < source.length; i++) {
		if (source[i] === '\n') {
			line++;
			lineStart = i + 1;
		}
	}
	return { line, column: offset - lineStart + 1 };
}

/**
 * The line of the expression with the span underlined:
 *
 * ```txt
 * 5-3
 *  ^
 * ```
 */
export function codeFrame(source: string, at: Span): string {
	const lineStart = source.lastIndexOf('\n', at.start - 1) + 1;
	const newline = source.indexOf('\n', at.start);
	const lineEnd = newline === -1 ? source.length : newline;
	const line = source.slice(lineStart, lineEnd);
	const startColumn = at.start - lineStart;
	const width = Math.max(1, Math.min(at.end, lineEnd) - at.start);
	return `${line}\n${' '.repeat(startColumn)}${'^'.repeat(width)}`;
}
