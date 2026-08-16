/**
 * Tokenizer for Blogger template expressions.
 *
 * Input is the *already XML/entity-decoded* expression string — i.e. what you get
 * after decoding `&quot;`, `&amp;`, etc. from a `cond='...'` / `expr:x='...'` attribute.
 */

export type TokenType =
	| 'NUMBER'
	| 'STRING'
	| 'IDENT'
	| 'DATA' // the `data:` prefix
	| 'PUNCT' // ( ) [ ] { } , : .
	| 'OP' // + - * / % == != <= >= < > ! ?
	| 'EOF';

export interface Token {
	readonly type: TokenType;
	readonly value: string;
	readonly start: number;
	readonly end: number;
}

export class LexError extends Error {
	constructor(
		message: string,
		public readonly position: number,
	) {
		super(`${message} (at position ${position})`);
		this.name = 'LexError';
	}
}

const isDigit = (c: string): boolean => c >= '0' && c <= '9';
const isIdentStart = (c: string): boolean => /[A-Za-z_$]/.test(c);
const isIdentPart = (c: string): boolean => /[A-Za-z0-9_$]/.test(c);
const isSpace = (c: string): boolean =>
	c === ' ' || c === '\t' || c === '\n' || c === '\r';

const MULTI_CHAR_OPERATORS = new Set([
	'==',
	'!=',
	'<=',
	'>=',
	'?:',
	'=>',
	'&&',
	'||',
]);
const SINGLE_CHAR_OPERATORS = new Set([
	'+',
	'-',
	'*',
	'/',
	'%',
	'<',
	'>',
	'!',
	'?',
]);
const PUNCTUATION = new Set(['(', ')', '[', ']', '{', '}', ',', ':', '.']);

export function tokenize(source: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	const n = source.length;

	while (i < n) {
		const c = source[i] as string;

		if (isSpace(c)) {
			i++;
			continue;
		}

		// String literal: "..."
		//
		// Only double-quoted string literals are supported (single-quoted
		// strings are not). A string cannot span multiple lines — hitting a
		// newline before the closing quote is an unterminated-string error.
		// Only `\"` is a recognized escape; every other backslash sequence
		// (e.g. `\n`) is kept as-is (backslash and the following character,
		// literally) rather than being interpreted.
		if (c === '"') {
			const start = i;
			i++;
			let value = '';
			while (i < n && source[i] !== '"') {
				const ch = source[i] as string;
				if (ch === '\n' || ch === '\r') {
					throw new LexError(
						'Unterminated string literal (strings cannot span lines)',
						start,
					);
				}
				if (ch === '\\' && i + 1 < n && source[i + 1] === '"') {
					value += '"';
					i += 2;
					continue;
				}
				value += ch;
				i++;
			}
			if (i >= n) {
				throw new LexError('Unterminated string literal', start);
			}
			i++; // closing quote
			tokens.push({ type: 'STRING', value, start, end: i });
			continue;
		}

		// Number literal: 123, 12.5, 0.2, .5
		//
		// Only integer and decimal literals are supported; scientific
		// notation (1e5, 1.5e-3, ...) is not.
		if (isDigit(c) || (c === '.' && isDigit(source[i + 1] ?? ''))) {
			const start = i;
			while (i < n && isDigit(source[i] as string)) {
				i++;
			}
			if (source[i] === '.' && isDigit(source[i + 1] ?? '')) {
				i++;
				while (i < n && isDigit(source[i] as string)) {
					i++;
				}
			}
			tokens.push({
				type: 'NUMBER',
				value: source.slice(start, i),
				start,
				end: i,
			});
			continue;
		}

		// Identifier / keyword / `data:` prefix
		if (isIdentStart(c)) {
			const start = i;
			while (i < n && isIdentPart(source[i] as string)) {
				i++;
			}
			const word = source.slice(start, i);

			// `data:` must be immediately followed by `:` with no space. Everything
			// after the colon that is contiguous (no whitespace) and made of
			// identifier characters, `.` (path separator) or `-` (allowed inside a
			// segment name, e.g. `data:author-name`) belongs to the same reference —
			// captured here as one DATA token so path parsing can apply Blogger's
			// lenient dot-collapsing rules (see parser.ts). A space right after `:`
			// (or after any `.`) ends the path immediately, e.g. `data: x` yields an
			// empty path (-> null) followed by a separate, dangling `x` token, which
			// is exactly the "invalid" shape it should be.
			if (word === 'data' && source[i] === ':') {
				const pathStart = i + 1;
				let j = pathStart;
				while (j < n && /[A-Za-z0-9_$.-]/.test(source[j] as string)) {
					j++;
				}
				const path = source.slice(pathStart, j);
				i = j;
				tokens.push({ type: 'DATA', value: path, start, end: i });
				continue;
			}

			tokens.push({ type: 'IDENT', value: word, start, end: i });
			continue;
		}

		// Multi-char operators
		const two = source.slice(i, i + 2);
		if (MULTI_CHAR_OPERATORS.has(two)) {
			tokens.push({ type: 'OP', value: two, start: i, end: i + 2 });
			i += 2;
			continue;
		}

		if (SINGLE_CHAR_OPERATORS.has(c)) {
			tokens.push({ type: 'OP', value: c, start: i, end: i + 1 });
			i++;
			continue;
		}

		if (PUNCTUATION.has(c)) {
			tokens.push({ type: 'PUNCT', value: c, start: i, end: i + 1 });
			i++;
			continue;
		}

		throw new LexError(`Unexpected character '${c}'`, i);
	}

	tokens.push({ type: 'EOF', value: '', start: n, end: n });
	return tokens;
}
