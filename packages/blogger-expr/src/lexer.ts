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

// Characters are tested by their code, not with regular expressions or
// one-character strings, which is several times faster on long expressions.

const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const SPACE = 0x20;
const QUOTE = 0x22;
const DOLLAR = 0x24;
const MINUS = 0x2d;
const DOT = 0x2e;
const COLON = 0x3a;
const BACKSLASH = 0x5c;
const UNDERSCORE = 0x5f;

const isSpace = (code: number): boolean =>
	code === SPACE ||
	code === TAB ||
	code === LINE_FEED ||
	code === CARRIAGE_RETURN;
const isDigit = (code: number): boolean => code >= 0x30 && code <= 0x39;
const isLetter = (code: number): boolean =>
	(code >= 0x61 && code <= 0x7a) || (code >= 0x41 && code <= 0x5a);
/** `[A-Za-z_$]` */
const isIdentStart = (code: number): boolean =>
	isLetter(code) || code === UNDERSCORE || code === DOLLAR;
/** `[A-Za-z0-9_$]` */
const isIdentPart = (code: number): boolean =>
	isIdentStart(code) || isDigit(code);
/** `[A-Za-z0-9_$.-]`, in a `data:` path */
const isPathPart = (code: number): boolean =>
	isIdentPart(code) || code === DOT || code === MINUS;

const TWO_CHARACTER_OPERATORS = new Set([
	'==',
	'!=',
	'<=',
	'>=',
	'?:',
	'=>',
	'&&',
	'||',
]);
/** The second characters of those, so that only a possible one is sliced out. */
const SECOND_CHARACTERS = new Set(
	[...TWO_CHARACTER_OPERATORS].map((operator) => operator[1]),
);
const ONE_CHARACTER_OPERATORS = new Set([
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

	while (i < source.length) {
		const code = source.charCodeAt(i);
		if (isSpace(code)) {
			i++;
			continue;
		}

		const token =
			code === QUOTE
				? readString(source, i)
				: startsNumber(source, i)
					? readNumber(source, i)
					: isIdentStart(code)
						? readWord(source, i)
						: readSymbol(source, i);
		tokens.push(token);
		i = token.end;
	}

	tokens.push({
		type: 'EOF',
		value: '',
		start: source.length,
		end: source.length,
	});
	return tokens;
}

/**
 * A string literal: `"..."`.
 *
 * Only double-quoted string literals are supported (single-quoted strings are
 * not). A string cannot span multiple lines — hitting a newline before the
 * closing quote is an unterminated-string error. Only `\"` is a recognized
 * escape; every other backslash sequence (e.g. `\n`) is kept as-is (backslash
 * and the following character, literally) rather than being interpreted.
 */
function readString(source: string, start: number): Token {
	let value = '';
	// where the characters not in `value` yet start
	let from = start + 1;
	let i = from;

	for (; i < source.length; i++) {
		const code = source.charCodeAt(i);
		if (code === QUOTE) {
			break;
		}
		if (code === LINE_FEED || code === CARRIAGE_RETURN) {
			throw new LexError(
				'Unterminated string literal (strings cannot span lines)',
				start,
			);
		}
		if (code === BACKSLASH && source.charCodeAt(i + 1) === QUOTE) {
			value += `${source.slice(from, i)}"`;
			i++;
			from = i + 1;
		}
	}
	if (i >= source.length) {
		throw new LexError('Unterminated string literal', start);
	}

	value += source.slice(from, i);
	return { type: 'STRING', value, start, end: i + 1 };
}

/**
 * Whether a number starts at `i`: a digit, `.` before a digit, or `-` right
 * before one of those, a negative number, `-5`. `- 5` is a minus.
 */
function startsNumber(source: string, i: number): boolean {
	const at = source.charCodeAt(i) === MINUS ? i + 1 : i;
	const code = source.charCodeAt(at);
	return isDigit(code) || (code === DOT && isDigit(source.charCodeAt(at + 1)));
}

/**
 * A number literal: `123`, `12.5`, `0.2`, `.5`, and negative, `-5`, `-.5`.
 *
 * Only integer and decimal literals are supported; scientific notation
 * (`1e5`, `1.5e-3`, ...) is not.
 */
function readNumber(source: string, start: number): Token {
	let i = source.charCodeAt(start) === MINUS ? start + 1 : start;
	while (isDigit(source.charCodeAt(i))) {
		i++;
	}
	if (source.charCodeAt(i) === DOT && isDigit(source.charCodeAt(i + 1))) {
		i++;
		while (isDigit(source.charCodeAt(i))) {
			i++;
		}
	}
	return { type: 'NUMBER', value: source.slice(start, i), start, end: i };
}

/**
 * An identifier, a keyword, or a `data:` path.
 *
 * `data:` must be immediately followed by `:` with no space. Everything after
 * the colon that is contiguous (no whitespace) and made of identifier
 * characters, `.` (path separator) or `-` (allowed inside a segment name, e.g.
 * `data:author-name`) belongs to the same reference — captured here as one
 * DATA token so path parsing can apply Blogger's lenient dot-collapsing rules
 * (see parser.ts). A space right after `:` (or after any `.`) ends the path
 * immediately, e.g. `data: x` yields an empty path (-> null) followed by a
 * separate, dangling `x` token, which is exactly the "invalid" shape it should
 * be.
 */
function readWord(source: string, start: number): Token {
	let i = start + 1;
	while (isIdentPart(source.charCodeAt(i))) {
		i++;
	}

	const isData =
		i - start === 4 &&
		source.charCodeAt(i) === COLON &&
		source.startsWith('data', start);
	if (!isData) {
		return { type: 'IDENT', value: source.slice(start, i), start, end: i };
	}

	const pathStart = i + 1;
	let end = pathStart;
	while (isPathPart(source.charCodeAt(end))) {
		end++;
	}
	return { type: 'DATA', value: source.slice(pathStart, end), start, end };
}

/** An operator or punctuation, two characters long first: `==` before `=`. */
function readSymbol(source: string, start: number): Token {
	if (SECOND_CHARACTERS.has(source[start + 1] as string)) {
		const operator = source.slice(start, start + 2);
		if (TWO_CHARACTER_OPERATORS.has(operator)) {
			return { type: 'OP', value: operator, start, end: start + 2 };
		}
	}

	const char = source[start] as string;
	if (ONE_CHARACTER_OPERATORS.has(char)) {
		return { type: 'OP', value: char, start, end: start + 1 };
	}
	if (PUNCTUATION.has(char)) {
		return { type: 'PUNCT', value: char, start, end: start + 1 };
	}
	throw new LexError(`Unexpected character '${char}'`, start);
}
