import type { DiagnosticCode } from './diagnostics';
import type { Span } from './source';

export type TokenKind =
	| 'number' // 12, -1.50, .5
	| 'string' // "text", with its quotes
	| 'data' // data:post.title, with `data:`
	| 'word' // names, keywords, functions, operators written as words
	| '('
	| ')'
	| '['
	| ']'
	| '{'
	| '}'
	| ','
	| ':'
	| '.'
	| '..'
	| '?'
	| '?:'
	| '=>'
	| '+'
	| '-'
	| '*'
	| '/'
	| '%'
	| '=='
	| '!='
	| '<'
	| '>'
	| '<='
	| '>='
	| '&&'
	| '||'
	| '!'
	| 'end';

export interface Token {
	kind: TokenKind;
	/** The token as written. */
	text: string;
	span: Span;
	/** Whether whitespace comes right before it. */
	spaceBefore: boolean;
}

export class LexError extends Error {
	constructor(
		readonly code: DiagnosticCode,
		readonly span: Span,
		readonly detail: Record<string, string> = {},
	) {
		super(code);
	}
}

const PUNCTUATION: readonly TokenKind[] = [
	'?:',
	'=>',
	'==',
	'!=',
	'<=',
	'>=',
	'&&',
	'||',
	'(',
	')',
	'[',
	']',
	'{',
	'}',
	',',
	':',
	'?',
	'+',
	'*',
	'/',
	'%',
	'<',
	'>',
	'!',
];

const isDigit = (c: string | undefined) =>
	c !== undefined && c >= '0' && c <= '9';
const isWordStart = (c: string | undefined) =>
	c !== undefined &&
	((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$');
const isWordPart = (c: string | undefined) =>
	c !== undefined && (isWordStart(c) || (c >= '0' && c <= '9'));
const isDataPart = (c: string | undefined) =>
	c !== undefined && (isWordPart(c) || c === '.' || c === '-');
/** `\s` of a regular expression, ASCII without one. */
const isSpace = (c: string | undefined) =>
	c !== undefined &&
	(c === ' ' || (c >= '\t' && c <= '\r') || (c > '\u007f' && /\s/.test(c)));

/** Tokens that end a value, after which `.5` is a member, not a number. */
const VALUE_ENDS = new Set<TokenKind>([
	'number',
	'string',
	'data',
	'word',
	')',
	']',
	'}',
]);

/** Splits an expression into tokens, the last one `end`. Throws a `LexError`. */
export function tokenize(source: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	let spaceBefore = false;

	const push = (kind: TokenKind, start: number) => {
		tokens.push({
			kind,
			text: source.slice(start, i),
			span: { start, end: i },
			spaceBefore,
		});
		spaceBefore = false;
	};

	// digits, then `.` and digits; `1..3` and `2.length` stop at the dot
	const digitsFrom = (from: number) => {
		let j = from;
		while (isDigit(source[j])) {
			j++;
		}
		if (source[j] === '.' && isDigit(source[j + 1])) {
			j++;
			while (isDigit(source[j])) {
				j++;
			}
		}
		return j;
	};

	while (i < source.length) {
		const c = source[i];
		const start = i;

		if (isSpace(c)) {
			spaceBefore = true;
			i++;
			continue;
		}

		if (c === '"') {
			i++;
			for (;;) {
				const d = source[i];
				if (d === undefined || d === '\n' || d === '\r') {
					throw new LexError('unclosed-string', { start, end: i });
				}
				if (d === '\\' && source[i + 1] === '"') {
					i += 2;
				} else if (d === '"') {
					i++;
					break;
				} else {
					i++;
				}
			}
			push('string', start);
			continue;
		}

		if (c === "'") {
			throw new LexError('single-quoted-string', { start, end: start + 1 });
		}

		if (isDigit(c)) {
			i = digitsFrom(i);
			// `1e5`: an exponent is not part of a number
			if (
				(source[i] === 'e' || source[i] === 'E') &&
				(isDigit(source[i + 1]) ||
					source[i + 1] === '+' ||
					source[i + 1] === '-')
			) {
				let j = i + 1;
				while (
					isWordPart(source[j]) ||
					source[j] === '+' ||
					source[j] === '-'
				) {
					j++;
				}
				throw new LexError(
					'number-exponent',
					{ start, end: j },
					{ text: source.slice(start, j) },
				);
			}
			push('number', start);
			continue;
		}

		if (c === '.') {
			const previous = tokens.at(-1);
			const afterValue =
				!spaceBefore && previous !== undefined && VALUE_ENDS.has(previous.kind);
			if (source[i + 1] === '.') {
				i += 2;
				push('..', start);
			} else if (isDigit(source[i + 1]) && !afterValue) {
				i = digitsFrom(i);
				push('number', start);
			} else {
				i++;
				push('.', start);
			}
			continue;
		}

		if (c === '-') {
			const next = source[i + 1];
			const numberNext =
				isDigit(next) || (next === '.' && isDigit(source[i + 2]));
			i++;
			if (numberNext) {
				i = digitsFrom(i);
				push('number', start);
			} else {
				push('-', start);
			}
			continue;
		}

		if (isWordStart(c)) {
			i++;
			// a dash is part of a name when a name character follows: `a-b`
			while (
				isWordPart(source[i]) ||
				(source[i] === '-' && isWordPart(source[i + 1]))
			) {
				i++;
			}
			const word = source.slice(start, i);
			// `data:` starts a data path, unless whitespace follows it
			if (word === 'data' && source[i] === ':' && !isSpace(source[i + 1])) {
				i++;
				while (isDataPart(source[i])) {
					i++;
				}
				// `data:blog."title"`: the last dot is a member before a string
				if (source[i - 1] === '.' && source[i] === '"') {
					i--;
				}
				push('data', start);
			} else {
				push('word', start);
			}
			continue;
		}

		const kind = PUNCTUATION.find((p) => source.startsWith(p, i));
		if (!kind) {
			const char = String.fromCodePoint(source.codePointAt(i) ?? 0);
			throw new LexError(
				'unexpected-character',
				{ start, end: start + char.length },
				{ text: char },
			);
		}
		i += kind.length;
		push(kind, start);
	}

	tokens.push({
		kind: 'end',
		text: '',
		span: { start: source.length, end: source.length },
		spaceBefore,
	});
	return tokens;
}

/** The text of a string token, without its quotes; `\"` is a quote. */
export function stringValue(token: Token): string {
	return token.text.slice(1, -1).replaceAll('\\"', '"');
}
