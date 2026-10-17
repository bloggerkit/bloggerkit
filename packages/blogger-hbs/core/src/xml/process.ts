import { type Location, withLocation } from '../plugins';
import { parseExpressions } from './expressions';
import {
	createFormatter,
	DOCTYPE,
	type Formatter,
	parseDoctype,
	XML_DECLARATION,
} from './format';
import { createInfoCollector, type XmlInfo } from './info';
import { createLayoutCheck, type Report } from './layout';
import {
	createLocate,
	type Locate,
	type OpenElement,
	type Position,
	type ScannedDeclaration,
	XmlScanner,
	XmlSyntaxError,
} from './scanner';
import { readSkin, SKINS } from './skin';
import { createVariableCheck } from './variables';

/** An error or a warning, `message` without its place, which is `loc`. */
export interface XmlIssue {
	message: string;
	loc: Location;
}

/** `message (theme.xml:3:7)`, or `message (3:7)` when the document has no path. */
const placed = ({ message, loc }: XmlIssue): string =>
	withLocation(message, loc);

/**
 * The errors of a document, every one found: with one, its message is
 * `message (theme.xml:3:7)`, with more, a line for each.
 */
export class XmlError extends Error {
	/** Where the first error is. */
	readonly loc: Location;
	/** Every error, in the order of the document. */
	readonly errors: readonly XmlIssue[];

	constructor(errors: XmlIssue[]) {
		super(
			errors.length === 1
				? placed(errors[0])
				: `${errors.length} errors:\n${errors.map((error) => `  ${placed(error)}`).join('\n')}`,
		);
		this.name = 'XmlError';
		this.loc = errors[0].loc;
		this.errors = errors;
	}
}

export interface ProcessXmlOptions {
	/** Path of the document, in the places of errors and warnings. */
	path?: string;
	/** Whether to format it as Blogger saves it. */
	format?: boolean;
}

export interface XmlResult {
	/** The document, formatted with `format`. */
	xml: string;
	/** In `xml`, so their places are in the document written. */
	warnings: XmlIssue[];
	info: XmlInfo;
}

/**
 * Validates a theme as Blogger reads it, formats it as Blogger saves it with
 * `format`, and tells what it is made of. Throws an `XmlError` with every
 * error found. The document is scanned once, formatted or not.
 */
export function processXml(
	source: string,
	{ path = '', format = false }: ProcessXmlOptions = {},
): XmlResult {
	if (!format) {
		const scan = scanDocument(source, path);
		return placeIn(source, scan.locate, path, scan, (offset) => offset);
	}
	// formatted while it is scanned, the declarations written on the first two lines
	const formatter = createFormatter(source);
	const scan = scanDocument(source, path, formatter);
	const { xml, mapOffset } = formatter.finish(scan.declarations);
	return placeIn(xml, createLocate(xml), path, scan, mapOffset);
}

interface Scan {
	declarations: ScannedDeclaration[];
	locate: Locate;
	/** Placed once the document they are placed in is known. */
	warnings: { message: string; offset: number }[];
	info(locOf: (offset: number) => Location): XmlInfo;
}

/**
 * The result for `xml`, with the warnings and the info of the scan placed in
 * it, `toXml` giving the offset in it of an offset in the document scanned.
 */
function placeIn(
	xml: string,
	locate: Locate,
	path: string,
	{ warnings, info }: Scan,
	toXml: (offset: number) => number,
): XmlResult {
	const locOf = (offset: number): Location => {
		const { line, column } = locate(toXml(offset));
		return { path, line, column: column + 1 };
	};
	return {
		xml,
		warnings: warnings.map(({ message, offset }) => ({
			message,
			loc: locOf(offset),
		})),
		info: info(locOf),
	};
}

/** Reports an error at a position. */
type ReportAt = (message: string, position: Position) => void;

/**
 * Scans a document fed in one piece and throws every error found together,
 * placed in it. A syntax error stops the scan, the others are collected.
 * Without `formatter`, the declarations have to be on the first two lines,
 * formatting writes them there.
 */
function scanDocument(xml: string, path: string, formatter?: Formatter): Scan {
	const locate = createLocate(xml);
	const errors: XmlIssue[] = [];
	const warnings: Scan['warnings'] = [];
	const errorAt: ReportAt = (message, { line, column }) =>
		errors.push({ message, loc: { path, line, column: column + 1 } });
	const report: Report = {
		error: (message, offset) => errorAt(message, locate(offset)),
		warn: (message, offset) => warnings.push({ message, offset }),
	};

	const layout = createLayoutCheck(report);
	const collector = createInfoCollector();
	const variables = createVariableCheck(report);
	const declarations: ScannedDeclaration[] = [];

	/** Reads what is in a skin once, for its checks and the formatter. */
	const onSkin = (element: OpenElement, contentEnd: number) => {
		const skin = readSkin(xml, element.contentStart, contentEnd);
		if ('found' in skin) {
			report.error(
				`<${element.name}> can only have text and CDATA in it, found ${skin.found}`,
				skin.offset,
			);
			return;
		}
		const tags = element.name === 'b:skin' ? variables.check(skin) : undefined;
		formatter?.onSkin(element, contentEnd, skin, tags);
	};

	const scanner = new XmlScanner({
		document: true,
		onStartTag: (tag) => {
			layout.onStartTag(tag);
			collector.onStartTag(tag);
			reportSyntaxError(errorAt, () => {
				const expressions = parseExpressions(tag);
				formatter?.onStartTag(tag, expressions);
			});
		},
		onEndTag: (element, contentEnd) => {
			layout.onEndTag(element, contentEnd);
			if (contentEnd !== undefined && SKINS.has(element.name)) {
				onSkin(element, contentEnd);
			}
		},
		onText: layout.onText,
		onDeclaration: (declaration) => declarations.push(declaration),
	});

	reportSyntaxError(errorAt, () => {
		scanner.feed(xml, locate);
		scanner.finish(locate(xml.length));
		layout.finish();
		checkDeclarations(xml, declarations, errorAt, formatter === undefined);
	});

	if (errors.length > 0) {
		throw new XmlError(
			errors.sort(
				(a, b) => a.loc.line - b.loc.line || a.loc.column - b.loc.column,
			),
		);
	}
	return {
		declarations,
		locate,
		warnings,
		info: (locOf) => ({ ...collector.info(locOf), ...variables.info(locOf) }),
	};
}

/** Runs `scan`, an `XmlSyntaxError` it throws is reported. */
function reportSyntaxError(errorAt: ReportAt, scan: () => void): void {
	try {
		scan();
	} catch (error) {
		if (!(error instanceof XmlSyntaxError)) {
			throw error;
		}
		errorAt(error.message, error.position);
	}
}

/**
 * Reports the declarations Blogger does not accept: XML 1.0 in UTF-8, an
 * `html` doctype, one of each, and with `placed` on the first two lines.
 */
function checkDeclarations(
	xml: string,
	declarations: ScannedDeclaration[],
	errorAt: ReportAt,
	placed: boolean,
): void {
	for (const kind of ['xml', 'doctype'] as const) {
		const [first, ...others] = declarations.filter(
			(item) => item.kind === kind,
		);
		for (const other of others) {
			errorAt(
				`There can only be one ${kind === 'xml' ? 'XML declaration' : 'doctype'}, another one is at ${first.position.line}:${first.position.column + 1}`,
				other.position,
			);
		}
	}

	const xmlDeclaration = declarations.find((item) => item.kind === 'xml');
	const doctype = declarations.find((item) => item.kind === 'doctype');
	if (xmlDeclaration) {
		checkXmlDeclaration(xmlDeclaration, errorAt);
	}
	if (doctype && parseDoctype(doctype.content).root?.toLowerCase() !== 'html') {
		errorAt(
			`The doctype has to be ${DOCTYPE}, got: '<!${doctype.content}>'`,
			doctype.position,
		);
	}
	if (!placed) {
		return;
	}

	const [first, second] = xml
		.split('\n', 2)
		.map((line) => line.replace(/\r$/, ''));
	if (xmlDeclaration?.start !== 0) {
		errorAt(
			`The first line has to be the XML declaration, ${XML_DECLARATION}`,
			xmlDeclaration?.position ?? { line: 1, column: 0 },
		);
	} else if (first.trimEnd() !== xml.slice(0, xmlDeclaration.end)) {
		errorAt('The XML declaration has to be alone on the first line', {
			line: 1,
			column: xmlDeclaration.end,
		});
	}
	if (
		doctype?.position.line !== 2 ||
		second?.trim() !== xml.slice(doctype.start, doctype.end)
	) {
		errorAt(
			`The second line has to be the doctype, ${DOCTYPE}`,
			doctype?.position ?? { line: 2, column: 0 },
		);
	}
}

/** Reports what Blogger does not accept in the XML declaration, it has to be XML 1.0 in UTF-8. */
function checkXmlDeclaration(
	{ content, position }: ScannedDeclaration,
	errorAt: ReportAt,
): void {
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

	if (rest !== '') {
		errorAt(`Invalid XML declaration '<?${content}?>'`, position);
		return;
	}
	for (const name of attributes.keys()) {
		if (!['version', 'encoding', 'standalone'].includes(name)) {
			errorAt(`Unknown '${name}' in the XML declaration`, position);
		}
	}
	if (attributes.get('version') !== '1.0') {
		errorAt(
			`The XML declaration has to have version="1.0", got: ${attributes.has('version') ? `'${attributes.get('version')}'` : 'none'}`,
			position,
		);
	}
	const encoding = attributes.get('encoding');
	if (encoding !== undefined && encoding.toUpperCase() !== 'UTF-8') {
		errorAt(
			`Blogger themes are UTF-8, the XML declaration has encoding '${encoding}'`,
			position,
		);
	}
}
