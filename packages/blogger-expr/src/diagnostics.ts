import { codeFrame, lineAndColumn, type Span } from './source';

/**
 * What a diagnostic says: what is wrong, why, and how to write it instead.
 * The messages describe the expression, never what renders it.
 */
interface Explanation {
	message: string;
	cause: string;
	fix?: string;
}

type Explain = (detail: Record<string, string>) => Explanation;

/** Every error and warning, by code. `detail` fills in the expression's own text. */
const CATALOG = {
	// ----- characters and tokens -----
	'unexpected-character': ({ text }) => ({
		message: `\`${text}\` is not part of the expression language.`,
		cause:
			'Expressions are made of values, `data:` paths, words, operators and punctuation; this character is none of them.',
	}),
	'single-quoted-string': () => ({
		message: 'A string is written with double quotes.',
		cause:
			'Single quotes do not start a string; inside an XML attribute written with single quotes, write `"text"`.',
		fix: 'replace the single quotes with double quotes: "text"',
	}),
	'unclosed-string': () => ({
		message: 'This string is not closed.',
		cause:
			'A string ends at the next `"` on the same line. `\\"` is a quote inside the string, so a string can not end with a backslash.',
		fix: 'close the string with `"`; to end it with a backslash, join one: "a" + "\\"',
	}),
	'number-exponent': ({ text }) => ({
		message: `\`${text}\` is not a number.`,
		cause:
			'Numbers have no exponent: `1e5` is the number `1` followed by the word `e5`.',
		fix: 'write the number in full: 100000',
	}),
	'number-member': ({ text }) => ({
		message: `A number literal has no members: \`${text}\`.`,
		cause: 'A `.` right after the digits of a number is not a member access.',
		fix: 'read members of data, not of numbers written in the expression',
	}),

	// ----- minus -----
	'minus-spacing': ({ text }) => ({
		message: `\`${text}\` is two values with no operator between them.`,
		cause:
			'A `-` written right before a digit starts a negative number, so `5-3` reads as `5` followed by `-3`. A subtraction has spaces around its `-`.',
		fix: 'put spaces around the minus: 5 - 3',
	}),
	'unary-minus': () => ({
		message: 'A minus needs a value before it.',
		cause:
			'There is no negation operator: `-` is a subtraction, or part of a negative number such as `-5`. `-(x)` is the operator function `-` with one value, which gives that value back unchanged.',
		fix: 'subtract from zero: 0 - data:x',
	}),

	// ----- words -----
	'null-literal': ({ text }) => ({
		message: `\`${text}\` is not a value.`,
		cause:
			'There is no literal for no value. Data that is not there is missing data, which prints nothing.',
		fix: 'test for missing data with the data itself: data:x ? … : …, or data:x ?: "default"',
	}),
	'bare-word': ({ text }) => ({
		message: `\`${text}\` is not a known name.`,
		cause:
			'Data is read with the `data:` prefix; a bare word is only a keyword, a function, or the parameter of the lambda it is in.',
		fix: `read the data: data:${text}`,
	}),
	'outer-parameter': ({ text }) => ({
		message: `\`${text}\` is the parameter of an outer lambda.`,
		cause: 'Only the parameter of the innermost lambda can be read as a word.',
		fix: `read it as data: data:${text}`,
	}),
	'unknown-operator-word': ({ text, suggestion }) => ({
		message: `\`${text}\` is not an operator.`,
		cause:
			'Operators written as words are `and`, `or`, `not`, `in`, `contains`, `eq`, `neq`, `lt`, `gt`, `lte` and `gte`.',
		fix: suggestion ? `write \`${suggestion}\`` : undefined,
	}),
	'not-parameter-name': () => ({
		message: '`not` can not be the name of a parameter.',
		cause: '`not` is an operator.',
		fix: 'choose another name: (x => …)',
	}),

	// ----- structure -----
	expected: ({ expected, found }) => ({
		message: `Expected ${expected}, found ${found}.`,
		cause: 'The expression stops being valid here.',
	}),
	'map-colon-space': ({ key }) => ({
		message: `The map entry \`${key}\` needs a space after its \`:\`.`,
		cause: 'A `:` followed directly by a value is not read as a map entry.',
		fix: `write \`${key}: value\``,
	}),
	'empty-item': () => ({
		message: 'An item is missing between two commas.',
		cause:
			'Lists, sets, maps and arguments take one value between commas; only a single trailing comma is allowed.',
	}),
	'needs-parentheses': ({ what, where }) => ({
		message: `${what} in ${where} needs parentheses.`,
		cause: `${where[0]?.toUpperCase()}${where.slice(1)} take a single value: a literal, a list, a map, a data path, a call, or one of these after \`!\`. Operators, the ternary, \`?:\`, lambdas, \`take\`/\`skip\`, infix calls and members of anything but a data path are only allowed in parentheses there.`,
		fix: 'wrap the value: (value)',
	}),
	'index-on-value': () => ({
		message: '`[index]` can only follow data.',
		cause:
			'An index reads an item of a list read with `data:` or a lambda parameter, not of a value written in the expression.',
		fix: 'use .first or .last, or store the list in a variable with <b:with> and index that',
	}),
	'infix-after-infix': ({ name }) => ({
		message: `\`${name}\` follows another infix call.`,
		cause: 'Two infix calls in a row are not read as a chain.',
		fix: 'put the first call in parentheses: (url path "a") params { q: 1 }',
	}),
	'nested-too-deep': () => ({
		message: 'The expression is nested too deeply.',
		cause: 'More than 256 levels of nesting.',
	}),

	// ----- functions -----
	'unknown-function': ({ name }) => ({
		message: `\`${name}\` is not a function.`,
		cause:
			'The functions are path, params, appendParams, fragment, snippet, format, resizeImage, sourceSet, take and skip, and the operator functions such as +(…).',
	}),
	'argument-count': ({ name, expected, got }) => ({
		message: `${name}() takes ${expected}, not ${got}.`,
		cause: 'The number of arguments of a function is fixed.',
	}),
	'argument-type': ({ name, position, expected, text }) => ({
		message: `Argument ${position} of ${name}() must be ${expected}, not \`${text}\`.`,
		cause: `${name}() can not use a value of this kind there.`,
	}),
	'operator-function-count': ({ operator, got }) => ({
		message: `${operator}() needs at least ${operator === '-' || operator === '*' || operator === '/' || operator === '%' ? 'one value' : 'two values'}, not ${got}.`,
		cause: `The operator function ${operator}() combines its values; with fewer it has nothing to compute.`,
	}),

	// ----- lambdas, take and skip -----
	'lambda-on-literal': ({ operator, text }) => ({
		message: `\`${operator}\` goes through a list, not \`${text}\`.`,
		cause: 'A lambda, `take` and `skip` need a list.',
	}),
	'bare-lambda-not-last': () => ({
		message: 'A lambda without parentheses has to end the expression.',
		cause:
			'The body of a lambda written without parentheses runs to the end of the expression, so nothing can follow it.',
		fix: 'put the lambda in parentheses: data:posts filter (p => …)',
	}),
	'slice-count': ({ operator, text }) => ({
		message: `\`${operator}\` needs a number of items, not \`${text}\`.`,
		cause: `The count of \`${operator}\` is a number: a number literal, data, or an expression in parentheses. A string is never a count, and an operator after it is not part of the count.`,
		fix: `${operator} (n)`,
	}),
	'slice-count-range': ({ operator, text }) => ({
		message: `\`${operator} ${text}\` takes no item.`,
		cause:
			'The count is rounded half up; `take` needs 1 or more, `skip` 0 or more.',
	}),
	'slice-after-slice': ({ operator, previous }) => ({
		message: `\`${operator}\` can not follow \`${previous}\` directly.`,
		cause:
			'`take` after `take`, or `skip` after `skip`, is not read as a chain.',
		fix: `put the first one in parentheses: (data:l ${previous} 2) ${operator} 1`,
	}),

	// ----- conditions -----
	'operand-type': ({ operator, text, found, takes }) => ({
		message: `\`${operator}\` can not take \`${text}\`: it is ${found}.`,
		cause: takes,
	}),
	'condition-not-boolean': ({ text }) => ({
		message: `\`${text}\` is not a condition.`,
		cause:
			'A value made in the expression must be a boolean where a condition is expected (`and`, `or`, `!`, the ternary, the body of `filter`, `any`, `all`, `none`, `count` and `first`). Only booleans and the strings "true", "false", "yes", "no" and "" read as one. Data read with `data:` uses truthiness instead.',
		fix: 'compare explicitly, data:x != "" or data:n > 0, or test data directly',
	}),

	// ----- ranges -----
	'range-outside-loop': () => ({
		message: 'A range is only the whole `values` of a loop.',
		cause:
			'`start to end` and `n1..n2` are not values: they can only be the whole `values` of <b:loop>, never inside parentheses, a list, an operation, nor in another attribute.',
	}),
	'dots-range': () => ({
		message: 'A `..` range is two integers with no spaces.',
		cause:
			'`..` takes integer literals written next to it, `1..5`; for other ends, use `to`.',
		fix: 'write 1..5, or data:a to data:b',
	}),
	'range-end': ({ text }) => ({
		message: `\`${text}\` is not an integer.`,
		cause: 'The ends of a range are integers.',
	}),

	// ----- size -----
	'too-complex': ({ cost }) => ({
		message: `The expression has ${cost} nodes; at most 40 are accepted.`,
		cause:
			'Every literal, data path, operator, parentheses, list, call and member counts; a ternary counts 2 and a lambda 3. Characters do not count.',
		fix: 'split it: store a part in a variable with <b:with>, or use +(a, b, c) instead of a + b + c',
	}),

	// ----- warnings -----
	'near-limit': ({ cost }) => ({
		message: `The expression has ${cost} nodes, close to the limit of 40.`,
		cause: 'A few more operators or values will make it too complex.',
		fix: 'split it with <b:with> before it grows',
	}),
	'member-applies-to-all': ({ name }) => ({
		message: `\`.${name}\` applies to everything before it.`,
		cause:
			'A member written right after a string, or after a number or data path with a space before the dot, is read on the whole expression to its left, not on that value.',
		fix: `put the value and its member in parentheses: ("text".${name})`,
	}),
	'bare-data': ({ text }) => ({
		message: `\`${text}\` names no data.`,
		cause:
			'Outside a widget, `data:` alone reads nothing; inside a widget, it is a map that prints [Object] and is true, but none of its members can be read from it.',
		fix: 'name the data you read: data:blog.title',
	}),
	'data-leading-dot': ({ text, path }) => ({
		message: `\`${text}\` starts with a dot after \`data:\`.`,
		cause:
			'The dot is skipped in some paths and not in others: `data:.blog.title` reads `data:blog.title`, but `data:.blog` reads nothing.',
		fix: `write ${path}`,
	}),
	'member-space-after-dot': ({ name }) => ({
		message: `A member name comes right after its dot: \`. ${name}\`.`,
		cause:
			'A space before the dot of a member read is accepted, `data:blog .title`, but not after it: `data:blog. title` and `data:blog . title` are not valid.',
		fix: `remove the space: .${name}`,
	}),
	'member-access': ({ text, path }) => ({
		message: `\`${text}\` reads \`${path}\`.`,
		cause:
			'Empty segments and a dot at the end of a path are skipped, and a member after a space is read on what is before it; written plainly, it reads the same.',
		fix: `write it as it reads: ${path}`,
	}),
	'member-dots': ({ text }) => ({
		message: `\`${text}\` is a member read, not a range.`,
		cause:
			'With a space before `..`, or after `)`, `]` or `}`, the dots read a member named after the number, which gives nothing: the loop is empty.',
		fix: 'write the range with no spaces, 1..3, or with to: 1 to 3',
	}),
	'range-reach': ({ text, side }) => ({
		message: `The ${side} of the range is all of \`${text}\`.`,
		cause:
			'`to` takes everything before it as the start and everything after it as the end: `true ? 1 : 2 to 3` is `(true ? 1 : 2) to 3`, `1 to 3 take 2` is `1 to (3 take 2)`.',
		fix: `put parentheses around it: (${text})`,
	}),
	'plus-joins-numbers': () => ({
		message: 'This `+` chain joins its numbers as text.',
		cause:
			'A chain of `+` adds numbers only when none of its values is a string or missing data; otherwise every value is joined as text, including the numbers at the start: 20 + 25 + "" is "2025".',
		fix: 'put the sum in parentheses: (20 + 25) + ""',
	}),
	'default-in-operation': () => ({
		message: '`?:` binds tighter than the operator around it.',
		cause:
			'`a + b ?: c` is `a + (b ?: c)`, and `a * b ?: c` is `a * (b ?: c)`: `?:` applies to the value right before it.',
		fix: 'add parentheses to say what is meant: (a + b) ?: c',
	}),
	'number-text-equality': ({ text }) => ({
		message: `\`${text}\` compares numbers by their text.`,
		cause:
			'`==` compares numbers as written: `007 == 7`, `5 == 5.0` and `-0 == 0` are false.',
		fix: 'compute both sides (data:x * 1 == 7) or compare with < and >',
	}),
	'divisor-may-be-zero': ({ operator }) => ({
		message: `The divisor of \`${operator}\` is data, which may be 0.`,
		cause:
			operator === '%'
				? 'A remainder by 0 can not be computed.'
				: 'A division by 0 can not be computed.',
		fix: `test it first: data:n != 0 ? x ${operator} data:n : 0`,
	}),
	'negative-width-ratio': () => ({
		message: 'A negative width can not be cropped to a ratio.',
		cause:
			'A negative width removes the size of the image, so there is no width to crop to.',
		fix: 'use a width of 0 or more, or leave out the ratio',
	}),
	'remainder-by-zero': () => ({
		message: 'A remainder by 0.',
		cause: 'A remainder by 0 can not be computed.',
	}),
	'division-by-zero': () => ({
		message: 'A division by 0.',
		cause: 'A division by 0 can not be computed.',
	}),
	'missing-member-of-parentheses': () => ({
		message: 'A member of data in parentheses, as an argument or a list item.',
		cause:
			'When the data is missing, reading a member of it in parentheses there is not computable.',
		fix: 'read the member on the data path itself: data:a.b',
	}),

	// ----- evaluation -----
	'evaluate-type': ({ operation, text, found }) => ({
		message: `\`${text}\` can not be used by ${operation}: it is ${found}.`,
		cause: `${operation} needs another kind of value.`,
	}),
	'evaluate-condition': ({ text, found }) => ({
		message: `\`${text}\` is not a condition: it is ${found}.`,
		cause:
			'A value made in the expression must be a boolean, or one of the strings "true", "false", "yes", "no" and "", where a condition is expected.',
		fix: 'compare explicitly: x != "" or x > 0',
	}),
	'evaluate-invalid': ({ problem }) => ({
		message: `The expression can not be computed: ${problem}.`,
		cause:
			'A date in the data is not a valid date, or the time zone or language option is not valid.',
	}),
	'evaluate-argument': ({ name, problem, text }) => ({
		message: `${name}(): ${problem}, at \`${text}\`.`,
		cause: `${name}() can not use this value.`,
	}),
} satisfies Record<string, Explain>;

export type DiagnosticCode = keyof typeof CATALOG;

export type Severity = 'error' | 'warning';

export interface Diagnostic {
	severity: Severity;
	code: DiagnosticCode;
	/** What is wrong. */
	message: string;
	/** Why it is wrong. */
	cause: string;
	/** How to write it instead, when there is a way. */
	fix?: string;
	span: Span;
	/** From 1. */
	line: number;
	/** From 1. */
	column: number;
	/** The line with the span underlined. */
	frame: string;
}

export function diagnostic(
	source: string,
	severity: Severity,
	code: DiagnosticCode,
	at: Span,
	detail: Record<string, string> = {},
): Diagnostic {
	const explain: Explain = CATALOG[code];
	const { message, cause, fix } = explain(detail);
	const { line, column } = lineAndColumn(source, at.start);
	const result: Diagnostic = {
		severity,
		code,
		message,
		cause,
		span: at,
		line,
		column,
		frame: codeFrame(source, at),
	};
	if (fix) {
		result.fix = fix;
	}
	return result;
}

/** A diagnostic as text: `error minus-spacing at 1:2`, the frame, the cause and the fix. */
export function formatDiagnostic(d: Diagnostic): string {
	const lines = [
		`${d.severity} ${d.code} at ${d.line}:${d.column}: ${d.message}`,
		indent(d.frame),
		`  cause: ${d.cause}`,
	];
	if (d.fix) {
		lines.push(`  fix: ${d.fix}`);
	}
	return lines.join('\n');
}

function indent(text: string): string {
	return text
		.split('\n')
		.map((line) => `  ${line}`)
		.join('\n');
}

/** Thrown when an expression can not be parsed or evaluated. */
export class ExpressionError extends Error {
	readonly diagnostic: Diagnostic;

	constructor(d: Diagnostic) {
		super(formatDiagnostic(d));
		this.name = 'ExpressionError';
		this.diagnostic = d;
	}
}
