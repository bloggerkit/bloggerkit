import {
	LexError,
	type Node,
	ParseError,
	PrintError,
	parse,
	print,
} from 'blogger-expr';
import {
	type ScannedAttribute,
	type ScannedStartTag,
	XmlSyntaxError,
} from './scanner';

/**
 * Attributes holding an expression, by element, besides `expr:*` which do on
 * any element.
 */
const EXPRESSION_ATTRIBUTES: Record<string, string[]> = {
	'b:if': ['cond'],
	'b:elseif': ['cond'],
	'b:loop': ['values'],
	'b:with': ['value'],
	'b:eval': ['expr'],
	'b:switch': ['var'],
	'b:include': ['cond', 'data'],
	'b:widget': ['cond'],
	'b:section': ['cond'],
};

/** Whether the attribute `name` of `<tag>` holds an expression. */
export function isExpressionAttribute(tag: string, name: string): boolean {
	return (
		name.startsWith('expr:') ||
		(EXPRESSION_ATTRIBUTES[tag]?.includes(name) ?? false)
	);
}

/**
 * `b:include data` also takes a bare name or path, `data='post'` for
 * `data:post`, which is not an expression and is left as it is.
 */
const INCLUDE_DATA_SHORTHAND = /^\s*[A-Za-z_][\w-]*(?:\.[\w-]+)*\s*$/;

/**
 * `b:loop values` also takes a range, `values='1..20'`. Blogger only supports
 * integer literals for its ends, not expressions, and no spaces.
 */
const LOOP_RANGE = /^(-?\d+)\.\.(-?\d+)$/;
/** A range with spaces, rejected with its own message. */
const SPACED_LOOP_RANGE = /^\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*$/;

/** A range of `b:loop values`, which `blogger-expr` does not parse. */
export interface LoopRange {
	type: 'LoopRange';
	from: number;
	to: number;
}

/** What an expression attribute is parsed into. */
export type ParsedExpression = Node | LoopRange;

/**
 * Parses the expressions in the attributes of `tag` with `blogger-expr`, by
 * attribute. Dynamic attributes, with Handlebars in them, are left out, as
 * are `b:include data` shorthands. The first one that does not parse throws
 * an `XmlSyntaxError` where it is.
 */
export function parseExpressions(
	tag: ScannedStartTag,
): Map<ScannedAttribute, ParsedExpression> {
	const parsed = new Map<ScannedAttribute, ParsedExpression>();

	for (const attribute of tag.attributes) {
		if (attribute.dynamic || !isExpressionAttribute(tag.name, attribute.name)) {
			continue;
		}

		const { text, offsets } = decodeValue(attribute);
		if (
			tag.name === 'b:include' &&
			attribute.name === 'data' &&
			INCLUDE_DATA_SHORTHAND.test(text)
		) {
			continue;
		}
		if (tag.name === 'b:loop' && attribute.name === 'values') {
			const [, from, to] = LOOP_RANGE.exec(text) ?? [];
			if (from !== undefined) {
				parsed.set(attribute, {
					type: 'LoopRange',
					from: Number(from),
					to: Number(to),
				});
				continue;
			}
			const [, spacedFrom, spacedTo] = SPACED_LOOP_RANGE.exec(text) ?? [];
			if (spacedFrom !== undefined) {
				throw new XmlSyntaxError(
					`Invalid range in the attribute 'values' of <b:loop>, it can not have spaces: '${spacedFrom}..${spacedTo}'`,
					attribute.positionOf(0),
				);
			}
		}

		try {
			parsed.set(attribute, parse(text));
		} catch (error) {
			if (!(error instanceof LexError || error instanceof ParseError)) {
				throw error;
			}
			// the message of blogger-expr ends with the position in the decoded text
			const message = error.message.replace(/ \(at position \d+\)$/, '');
			throw new XmlSyntaxError(
				`Invalid expression in the attribute '${attribute.name}' of <${tag.name}>: ${message}`,
				attribute.positionOf(offsets[error.position] ?? attribute.value.length),
			);
		}
	}

	return parsed;
}

/**
 * A parsed expression printed by `blogger-expr` on a single line, escaped for
 * single quotes, as formatted attributes have: `data:a&amp;&amp;data:b` becomes
 * `data:a and data:b`. Undefined when it can not be printed.
 */
export function formatExpression(
	expression: ParsedExpression,
): string | undefined {
	if (expression.type === 'LoopRange') {
		return `${expression.from}..${expression.to}`;
	}

	let printed: string;
	try {
		printed = print(expression);
	} catch (error) {
		if (error instanceof PrintError) {
			return undefined;
		}
		throw error;
	}

	return printed
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/'/g, '&apos;');
}

const ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
};

/**
 * The value with its entities decoded, as Blogger parses it, and the offset
 * in the written value of each character of it.
 */
function decodeValue({ value }: ScannedAttribute): {
	text: string;
	offsets: number[];
} {
	let text = '';
	const offsets: number[] = [];

	for (let i = 0; i < value.length; i++) {
		const entity =
			value[i] === '&'
				? /^&(#x[0-9a-f]+|#[0-9]+|\w+);/i.exec(value.slice(i))
				: null;
		if (entity === null) {
			text += value[i];
			offsets.push(i);
			continue;
		}

		const [whole, name] = entity;
		const decoded = decodeEntity(name) ?? whole;
		text += decoded;
		// one per UTF-16 unit, as positions in `text` are
		for (let unit = 0; unit < decoded.length; unit++) {
			offsets.push(i);
		}
		i += whole.length - 1;
	}
	offsets.push(value.length);

	return { text, offsets };
}

/** The character of `&name;`, undefined for an unknown name or code point. */
function decodeEntity(name: string): string | undefined {
	if (name[0] !== '#') {
		return ENTITIES[name];
	}
	const hex = name[1].toLowerCase() === 'x';
	const code = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
	return code <= 0x10ffff ? String.fromCodePoint(code) : undefined;
}
