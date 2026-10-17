/**
 * Newlines inside embedded code and CDATA blocks are swapped for a marker so
 * the indentation of imports cannot touch them, then restored once at the
 * very end.
 */
const NEWLINE = '\0|newline|\0';

export function protectNewlines(text: string): string {
	return text.replaceAll('\n', NEWLINE);
}

const CDATA = /<!\[CDATA\[[\s\S]*?\]\]>/g;

export function protectCdataNewlines(text: string): string {
	return text.includes('<![CDATA[')
		? text.replace(CDATA, protectNewlines)
		: text;
}

export function restoreLinebreaks(text: string): string {
	return text.replaceAll(NEWLINE, '\n');
}
