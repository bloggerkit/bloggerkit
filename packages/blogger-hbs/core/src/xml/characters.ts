/** The entities XML has, by name. */
const ENTITIES = new Map([
	['amp', '&'],
	['lt', '<'],
	['gt', '>'],
	['quot', '"'],
	['apos', "'"],
]);

/** An entity reference, matched where `lastIndex` is. */
const ENTITY_REFERENCE = /&(#x[0-9a-f]+|#[0-9]+|\w+);/iy;

/** The entity reference at `index` of `value`, and the text it is decoded to. */
export function entityAt(
	value: string,
	index: number,
): { length: number; decoded: string } | undefined {
	ENTITY_REFERENCE.lastIndex = index;
	const entity = ENTITY_REFERENCE.exec(value);
	if (entity === null) {
		return undefined;
	}
	const [whole, name] = entity;
	return { length: whole.length, decoded: decodeEntity(name) ?? whole };
}

/** `text` with its entity references decoded, those it does not know left as they are. */
export function decodeEntities(text: string): string {
	if (!text.includes('&')) {
		return text;
	}
	let decoded = '';
	let last = 0;
	for (let i = text.indexOf('&'); i >= 0; i = text.indexOf('&', i)) {
		const entity = entityAt(text, i);
		if (entity === undefined) {
			i++;
			continue;
		}
		decoded += text.slice(last, i) + entity.decoded;
		i += entity.length;
		last = i;
	}
	return decoded + text.slice(last);
}

/** The character of `&name;`, undefined for an unknown name or code point. */
function decodeEntity(name: string): string | undefined {
	if (name[0] !== '#') {
		return ENTITIES.get(name);
	}
	const hex = name[1].toLowerCase() === 'x';
	const code = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
	return code <= 0x10ffff ? String.fromCodePoint(code) : undefined;
}

/**
 * An attribute value as XML reads it: its tabs and line breaks as spaces,
 * then its entities decoded, so `&#9;` stays a tab.
 */
export function xmlValue(value: string): string {
	return decodeEntities(value.replace(/[\t\n\r]/g, ' '));
}

/** An attribute value as Blogger reads it: its entities decoded, tabs and line breaks as spaces. */
export function readValue(value: string): string {
	return decodeEntities(value).replace(/[\t\n\r]/g, ' ');
}

/**
 * An attribute value as Blogger saves it, in single quotes: its entities
 * decoded, tabs and line breaks turned into spaces, and `&`, `<`, `>`, `"`
 * and `'` escaped, the other characters written as they are.
 */
export function formatValue(value: string): {
	text: string;
	/** Where the character of the value decoded at `index` is in `text`. */
	indexOf(index: number): number;
} {
	// most values are written as they are
	if (!VALUE_SPECIAL.test(value)) {
		return { text: value, indexOf: (index) => Math.min(index, value.length) };
	}
	return escapeValue(decodeEntities(value));
}

/** A value decoded, a printed expression, escaped as `formatValue` writes it. */
export function escapeValue(decoded: string): {
	text: string;
	/** Where the character at `index` is in `text`. */
	indexOf(index: number): number;
} {
	if (!VALUE_SPECIAL.test(decoded)) {
		return {
			text: decoded,
			indexOf: (index) => Math.min(index, decoded.length),
		};
	}
	return {
		text: decoded.replace(VALUE_ESCAPED, (char) => ESCAPED.get(char) ?? ' '),
		indexOf(index) {
			// the places are found again only for the warnings of an expression
			let place = 0;
			for (let i = 0; i < index && i < decoded.length; i++) {
				place += ESCAPED.get(decoded[i])?.length ?? 1;
			}
			return place;
		},
	};
}

/** What an attribute value is not written as it is with: entities, what Blogger escapes, tabs and line breaks. */
const VALUE_SPECIAL = /[&<>"'\t\n\r]/;
const VALUE_ESCAPED = /[&<>"'\t\n\r]/g;

/** What Blogger escapes in an attribute value. */
const ESCAPED = new Map([
	['&', '&amp;'],
	['<', '&lt;'],
	['>', '&gt;'],
	['"', '&quot;'],
	["'", '&apos;'],
]);

/** What Blogger escapes in text. */
const TEXT_ESCAPED = new Map([
	['&', '&amp;'],
	['<', '&lt;'],
	['>', '&gt;'],
	['"', '&quot;'],
	["'", '&#39;'],
]);

/**
 * The decimal reference Blogger writes a character as, in text and comments:
 * one past ASCII, of the Basic Multilingual Plane, that is not a letter or a
 * decimal digit, and DEL. Undefined for the others, written as they are.
 */
export function characterReference(char: string): string | undefined {
	const code = char.codePointAt(0) ?? 0;
	return code === 0x7f ||
		(code > 0x7f && code <= 0xffff && !LETTER_OR_DIGIT.test(char))
		? `&#${code};`
		: undefined;
}

const LETTER_OR_DIGIT = /^[\p{L}\p{Nd}]$/u;

/** How Blogger writes a character in text. */
export function inText(char: string): string {
	return TEXT_ESCAPED.get(char) ?? characterReference(char) ?? char;
}
