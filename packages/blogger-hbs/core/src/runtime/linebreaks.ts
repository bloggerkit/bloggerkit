/**
 * Newlines inside embedded code and CDATA blocks are swapped for a marker so
 * whitespace handling cannot touch them, then restored once at the very end.
 */
const NEWLINE = '\0|newline|\0';

export function protectNewlines(text: string): string {
	return text.replace(/\n/g, NEWLINE);
}

export function protectCdataNewlines(text: string): string {
	return text.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, protectNewlines);
}

export function restoreLinebreaks(text: string): string {
	return text.split(NEWLINE).join('\n');
}
