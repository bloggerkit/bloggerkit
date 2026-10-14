import {
	formatExpression,
	type ParsedExpression,
	parseExpressions,
} from './expressions';
import {
	createLocate,
	type Position,
	type ScannedAttribute,
	type ScannedDeclaration,
	type ScannedStartTag,
	XmlScanner,
	XmlSyntaxError,
} from './scanner';

export class XmlError extends Error {
	readonly line: number;
	/** 1-based. */
	readonly column: number;

	constructor(message: string, { line, column }: Position) {
		super(`${message} (${line}:${column + 1})`);
		this.name = 'XmlError';
		this.line = line;
		this.column = column + 1;
	}
}

/** The XML declaration Blogger writes, the first line of a theme. */
export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" ?>';
/** The doctype Blogger writes, the second line of a theme. */
export const DOCTYPE = '<!DOCTYPE html>';

/**
 * Throws an `XmlError` unless `xml` is a well-formed document starting with
 * the XML declaration on the first line and the doctype on the second, both
 * as `formatXml` requires them (XML 1.0 in UTF-8, an `html` doctype), whose
 * expressions (`b:if cond`, `expr:*`, ...) parse with `blogger-expr`.
 */
export function validateXml(xml: string): void {
	const { declarations } = scanDocument(xml);
	const [first, second] = [...xml.split('\n', 2)].map((line) =>
		line.replace(/\r$/, ''),
	);
	const xmlDeclaration = declarations.find((item) => item.kind === 'xml');
	const doctype = declarations.find((item) => item.kind === 'doctype');

	if (xmlDeclaration?.start !== 0) {
		throw new XmlError(
			`The first line has to be the XML declaration, ${XML_DECLARATION}`,
			xmlDeclaration?.position ?? { line: 1, column: 0 },
		);
	}
	if (first.trimEnd() !== xml.slice(0, xmlDeclaration.end)) {
		throw new XmlError(
			'The XML declaration has to be alone on the first line',
			{ line: 1, column: xmlDeclaration.end },
		);
	}
	if (
		doctype?.position.line !== 2 ||
		second?.trim() !== xml.slice(doctype.start, doctype.end)
	) {
		throw new XmlError(
			`The second line has to be the doctype, ${DOCTYPE}`,
			doctype?.position ?? { line: 2, column: 0 },
		);
	}

	// their contents are checked as when formatting
	formatXmlDeclaration(xmlDeclaration);
	formatDoctype(doctype);
}

/**
 * Validates the document and formats it as Blogger saves it:
 *
 * - the XML declaration on the first line and the doctype on the second, added
 *   when missing and moved there when elsewhere
 * - start tags on a single line, line breaks in attribute values collapsed to
 *   a space, the attributes sorted by name and quoted with single quotes
 * - expressions (`b:if cond`, `expr:*`, ...) printed by `blogger-expr` on a
 *   single line, `data:a&amp;&amp;data:b` as `data:a and data:b`
 *
 * Everything else is left as it is.
 */
export function formatXml(xml: string): string {
	const { tags, declarations, expressions } = scanDocument(xml);

	// the declarations are taken out, they are written at the top
	const edits: { start: number; end: number; text: string }[] = [
		...tags.map((tag) => ({
			start: tag.start,
			end: tag.end,
			text: formatStartTag(tag, expressions),
		})),
		...indentChildren(xml, tags),
		...declarations.map((item) => ({
			...lineOf(xml, item.start, item.end),
			text: '',
		})),
	].sort((a, b) => a.start - b.start || a.end - b.end);

	let body = '';
	let last = 0;
	for (const { start, end, text } of edits) {
		body += xml.slice(last, start) + text;
		last = end;
	}
	body += xml.slice(last);

	const xmlDeclaration = declarations.find((item) => item.kind === 'xml');
	const doctype = declarations.find((item) => item.kind === 'doctype');

	return [
		xmlDeclaration ? formatXmlDeclaration(xmlDeclaration) : XML_DECLARATION,
		doctype ? formatDoctype(doctype) : DOCTYPE,
		body.replace(/^\s+/, ''),
	].join('\n');
}

/** Elements whose children Blogger writes each on a line, indented. */
const INDENTED_PARENTS = new Set(['b:widget', 'b:widget-settings']);

/**
 * Puts the start tag of each child of an indented parent on its own line,
 * indented two spaces more than the line of the parent, by replacing the
 * whitespace before it. What is in the children is left as it is.
 */
function indentChildren(
	xml: string,
	tags: ScannedStartTag[],
): { start: number; end: number; text: string }[] {
	// indentation by start tag offset, of the parents moved to a line of their own
	const moved = new Map<number, string>();
	const edits: { start: number; end: number; text: string }[] = [];

	for (const tag of tags) {
		const { parent } = tag;
		if (parent === undefined || !INDENTED_PARENTS.has(parent.name)) {
			continue;
		}

		const indent = `${moved.get(parent.start) ?? indentationOf(xml, parent.start)}  `;
		let start = tag.start;
		while (start > 0 && /\s/.test(xml[start - 1])) {
			start--;
		}

		moved.set(tag.start, indent);
		edits.push({ start, end: tag.start, text: `\n${indent}` });
	}

	return edits;
}

/** The whitespace at the start of the line `offset` is on. */
function indentationOf(xml: string, offset: number): string {
	const lineStart = xml.lastIndexOf('\n', offset - 1) + 1;
	return /^[ \t]*/.exec(xml.slice(lineStart, offset))?.[0] ?? '';
}

interface Scanned {
	tags: ScannedStartTag[];
	declarations: ScannedDeclaration[];
	/** The expressions of the attributes, parsed while scanning. */
	expressions: Map<ScannedAttribute, ParsedExpression>;
}

function scanDocument(xml: string): Scanned {
	const locate = createLocate(xml);
	const scanned: Scanned = {
		tags: [],
		declarations: [],
		expressions: new Map(),
	};
	const scanner = new XmlScanner({
		document: true,
		onStartTag: (tag) => {
			scanned.tags.push(tag);
			for (const [attribute, expression] of parseExpressions(tag)) {
				scanned.expressions.set(attribute, expression);
			}
		},
		onDeclaration: (declaration) => scanned.declarations.push(declaration),
	});

	try {
		scanner.feed(xml, locate);
		scanner.finish(locate(xml.length));

		for (const kind of ['xml', 'doctype'] as const) {
			const found = scanned.declarations.filter((item) => item.kind === kind);
			if (found.length > 1) {
				throw new XmlSyntaxError(
					`There can only be one ${kind === 'xml' ? 'XML declaration' : 'doctype'}, another one is at ${found[0].position.line}:${found[0].position.column + 1}`,
					found[1].position,
				);
			}
		}
	} catch (error) {
		if (error instanceof XmlSyntaxError) {
			throw new XmlError(error.message, error.position);
		}
		throw error;
	}

	return scanned;
}

/**
 * The range to remove for a declaration: its whole line when nothing else is
 * on it, so no empty line is left, otherwise only the declaration.
 */
function lineOf(
	xml: string,
	start: number,
	end: number,
): { start: number; end: number } {
	let lineStart = start;
	while (lineStart > 0 && /[ \t]/.test(xml[lineStart - 1])) {
		lineStart--;
	}
	let lineEnd = end;
	while (lineEnd < xml.length && /[ \t\r]/.test(xml[lineEnd])) {
		lineEnd++;
	}

	const alone =
		(lineStart === 0 || xml[lineStart - 1] === '\n') &&
		(lineEnd === xml.length || xml[lineEnd] === '\n');

	return alone
		? { start: lineStart, end: Math.min(lineEnd + 1, xml.length) }
		: { start, end };
}

/** `<?xml version="1.0" encoding="UTF-8" ?>`, it has to be XML 1.0 in UTF-8. */
function formatXmlDeclaration({
	content,
	position,
}: ScannedDeclaration): string {
	const attributes = new Map<string, string>();
	const rest = content
		.slice('xml'.length)
		.replace(
			/\s*([\w-]+)\s*=\s*(["'])(.*?)\2/g,
			(_, name: string, _quote, value: string) => {
				attributes.set(name, value);
				return '';
			},
		)
		.trim();

	const fail = (message: string): never => {
		throw new XmlError(message, position);
	};

	if (rest !== '') {
		fail(`Invalid XML declaration '<?${content}?>'`);
	}
	for (const name of attributes.keys()) {
		if (!['version', 'encoding', 'standalone'].includes(name)) {
			fail(`Unknown '${name}' in the XML declaration`);
		}
	}
	if (attributes.get('version') !== '1.0') {
		fail(
			`The XML declaration has to have version="1.0", got: ${attributes.has('version') ? `'${attributes.get('version')}'` : 'none'}`,
		);
	}
	const encoding = attributes.get('encoding');
	if (encoding !== undefined && encoding.toUpperCase() !== 'UTF-8') {
		fail(
			`Blogger themes are UTF-8, the XML declaration has encoding '${encoding}'`,
		);
	}

	return XML_DECLARATION;
}

/** `<!DOCTYPE html>`, an identifier after `html` is kept. */
function formatDoctype({ content, position }: ScannedDeclaration): string {
	const [, root, rest] = /^DOCTYPE\s+([^\s[>]+)([\s\S]*)$/i.exec(content) ?? [];
	if (root?.toLowerCase() !== 'html') {
		throw new XmlError(
			`The doctype has to be ${DOCTYPE}, got: '<!${content}>'`,
			position,
		);
	}
	const identifiers = rest.trim().replace(/\s+/g, ' ');
	return identifiers ? `<!DOCTYPE html ${identifiers}>` : DOCTYPE;
}

function formatStartTag(
	{ name: tagName, attributes, selfClosing }: ScannedStartTag,
	expressions: Map<ScannedAttribute, ParsedExpression>,
): string {
	const formatted = [...attributes]
		.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
		.map((attribute) => {
			const parsed = expressions.get(attribute);
			const value =
				(parsed && formatExpression(parsed)) ??
				singleQuoted(attribute, collapseLineBreaks(attribute.value));
			return ` ${attribute.name}='${value}'`;
		})
		.join('');

	return `<${tagName}${formatted}${selfClosing ? '/>' : '>'}`;
}

/**
 * A value written in double quotes, rewritten for single quotes: `'` escaped
 * as `&apos;` and `&quot;` unescaped. Other entities are left as they are.
 */
function singleQuoted({ quote }: ScannedAttribute, value: string): string {
	return quote === "'"
		? value
		: value.replace(/'/g, '&apos;').replace(/&quot;/g, '"');
}

/** Every line break becomes a space, the spaces around it stay as they are. */
function collapseLineBreaks(value: string): string {
	return value.replace(/\r?\n/g, ' ');
}
