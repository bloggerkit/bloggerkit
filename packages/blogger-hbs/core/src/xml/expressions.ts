import {
	type ExpressionContext,
	type ParseResult,
	parse,
	type Root,
} from 'blogger-expr';
import { decodeEntities, entityAt } from './characters';
import { DATA_SHORTHAND, expressionContext } from './elements';
import {
	type ScannedAttribute,
	type ScannedStartTag,
	XmlSyntaxError,
} from './scanner';

/**
 * A `..` range of `b:loop values` with spaces, `values='1 .. 20'`, rejected
 * with its own message: Blogger takes `1..20` only as it is.
 */
const SPACED_LOOP_RANGE = /^\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*$/;
const LOOP_RANGE = /^-?\d+\.\.-?\d+$/;

/** What `parseExpressions` gives a tag without expressions. */
const NO_EXPRESSIONS: ReadonlyMap<ScannedAttribute, ParsedExpression> =
	new Map();

/** An expression attribute parsed, which formatting prints. */
export interface ParsedExpression {
	/** The expression, or the range of a `b:loop values`. */
	root: Root;
	context: ExpressionContext;
	/**
	 * Each warning, in the order `blogger-expr` gives them: its offset in the
	 * text fed, and its index in the value decoded.
	 */
	warnings: { offset: number; index: number }[];
}

/**
 * Parses the expressions in the attributes of `tag` with `blogger-expr`, by
 * attribute. Dynamic attributes, with Handlebars in them, are left out, as
 * are `b:include data` shorthands. The first one with an error, one Blogger
 * would not accept, throws an `XmlSyntaxError` where it is. Each warning, what
 * is accepted but may not do what it looks like, goes to `warn` with its fix,
 * at its offset in the text fed. Each expression is parsed once in `cache`,
 * by its context and text.
 */
export function parseExpressions(
	tag: ScannedStartTag,
	warn?: (code: string, message: string, offset: number) => void,
	cache?: Map<string, ParseResult>,
): ReadonlyMap<ScannedAttribute, ParsedExpression> {
	let parsed: Map<ScannedAttribute, ParsedExpression> | undefined;

	for (const attribute of tag.attributes) {
		const context = expressionContext(tag.name, attribute.name);
		if (attribute.dynamic || context === undefined) {
			continue;
		}

		const { text, offsetOf } = decodeValue(attribute);
		if (
			tag.name === 'b:include' &&
			attribute.name === 'data' &&
			DATA_SHORTHAND.test(text)
		) {
			continue;
		}
		if (context === 'loop-values' && !LOOP_RANGE.test(text)) {
			const [, from, to] = SPACED_LOOP_RANGE.exec(text) ?? [];
			if (from !== undefined) {
				throw new XmlSyntaxError(
					`Invalid range in the attribute 'values' of <b:loop>, it can not have spaces: '${from}..${to}'`,
					attribute.positionOf(0),
					'loop-range',
				);
			}
		}

		const key = `${context}\u0000${text}`;
		let result = cache?.get(key);
		if (result === undefined) {
			result = parse(text, { context });
			cache?.set(key, result);
		}
		const [error] = result.errors;
		if (error) {
			throw new XmlSyntaxError(
				`Invalid expression in the attribute '${attribute.name}' of <${tag.name}>: ${error.message}`,
				attribute.positionOf(offsetOf(error.span.start)),
				'invalid-expression',
			);
		}
		const warnings = result.warnings.map((warning) => {
			const offset = attribute.offset + offsetOf(warning.span.start);
			warn?.(
				`expression-${warning.code}`,
				`Expression in the attribute '${attribute.name}' of <${tag.name}>: ${warning.message}${warning.fix ? ` Fix: ${warning.fix}` : ''}`,
				offset,
			);
			return { offset, index: warning.span.start };
		});
		parsed ??= new Map();
		// a tree without errors, as parse gives
		parsed.set(attribute, { root: result.ast as Root, context, warnings });
	}

	return parsed ?? NO_EXPRESSIONS;
}

/**
 * The value with its entities decoded, as Blogger parses it, and the offset
 * in the written value of each character of it, found again only when asked
 * for, an error is.
 */
function decodeValue({ value }: ScannedAttribute): {
	text: string;
	/** The offset in `value` of the character of `text` at `index`, its length after it. */
	offsetOf(index: number): number;
} {
	if (!value.includes('&')) {
		return { text: value, offsetOf: (index) => Math.min(index, value.length) };
	}

	return {
		text: decodeEntities(value),
		offsetOf(index) {
			// the decoded text is walked again, an entity is at the offset of its '&'
			let decoded = 0;
			for (let i = 0; i < value.length; ) {
				const entity = value[i] === '&' ? entityAt(value, i) : undefined;
				const units = entity ? entity.decoded.length : 1;
				if (index < decoded + units) {
					return i;
				}
				decoded += units;
				i += entity ? entity.length : 1;
			}
			return value.length;
		},
	};
}
