import type { ParseResult } from 'blogger-expr';
import type { Location } from '../plugins';
import { SKINS } from './elements';
import { type ParsedExpression, parseExpressions } from './expressions';
import { DOCTYPE, XML_DECLARATION } from './format';
import { createInfoCollector, type XmlInfo } from './info';
import { createLayoutCheck, type Report } from './layout';
import {
	type Locate,
	type OpenElement,
	type Position,
	type ScannedAttribute,
	type ScannedDeclaration,
	type ScannedStartTag,
	XmlSyntaxError,
} from './scanner';
import { readSkin, type SkinText } from './skin';
import { createVariableCheck, type SkinTag } from './variables';

/** An error or a warning of a theme, placed in it. */
export interface XmlDiagnostic {
	/** What it is, `'syntax'`, `'misplaced'`..., to tell it apart, or leave a warning out. */
	code: string;
	severity: 'error' | 'warning';
	/** What it is, without its place, which is `loc`. */
	message: string;
	loc: Location;
}

/** A warning of the check, placed once the text it is placed in is known. */
export interface Warning {
	code: string;
	message: string;
	/** Where it is in the source. */
	offset: number;
}

/** What the check of a document found, which the other jobs read. */
export interface Checked {
	/** Every error, those formatting fixes too, in the order of the document. */
	errors: XmlDiagnostic[];
	/** The errors that formatting fixes: where the declarations are. */
	fixable: Set<XmlDiagnostic>;
	warnings: Warning[];
	/** The warnings placed in the source, once. */
	placed?: XmlDiagnostic[];
	/** The expressions of each start tag, parsed. */
	expressions: Map<
		ScannedStartTag,
		ReadonlyMap<ScannedAttribute, ParsedExpression>
	>;
	/** Each skin read, for the formatter, by its element. */
	skins: Map<OpenElement, { skin: SkinText; tags?: SkinTag[] }>;
	info(locOf: (offset: number) => Location): XmlInfo;
}

/** Diagnostics in the order of the document. */
export function inOrder(diagnostics: XmlDiagnostic[]): XmlDiagnostic[] {
	return diagnostics.sort(
		(a, b) => a.loc.line - b.loc.line || a.loc.column - b.loc.column,
	);
}

/** Reports an error at a position. */
type ReportAt = (code: string, message: string, position: Position) => void;

/** What checks a document while it is scanned, fed in one piece. */
export interface Check {
	onStartTag(tag: ScannedStartTag): void;
	onEndTag(element: OpenElement, contentEnd: number | undefined): void;
	onText(offset: number, parent: OpenElement | undefined): void;
	onMarkup(
		kind: 'comment' | 'pi',
		start: number,
		end: number,
		parent: OpenElement | undefined,
	): void;
	/** What the check found, once the scan ends, or stops at `syntaxError`. */
	finish(
		declarations: ScannedDeclaration[],
		syntaxError: XmlSyntaxError | undefined,
	): Checked;
}

/**
 * Checks a document as Blogger reads it while it is scanned. A syntax error
 * stops it, the other errors are collected, each expression parsed once in
 * `cache`.
 */
export function createCheck(
	xml: string,
	path: string,
	locate: Locate,
	cache: Map<string, ParseResult>,
): Check {
	const errors: XmlDiagnostic[] = [];
	const fixable = new Set<XmlDiagnostic>();
	const warnings: Warning[] = [];
	const issueAt =
		(fixed: boolean): ReportAt =>
		(code, message, { line, column }) => {
			const error: XmlDiagnostic = {
				code,
				severity: 'error',
				message,
				loc: { path, line, column: column + 1 },
			};
			errors.push(error);
			if (fixed) {
				fixable.add(error);
			}
		};
	const errorAt = issueAt(false);
	const report: Report = {
		error: (code, message, offset) => errorAt(code, message, locate(offset)),
		warn: (code, message, offset) => warnings.push({ code, message, offset }),
	};

	const layout = createLayoutCheck(xml, report);
	const collector = createInfoCollector();
	const variables = createVariableCheck(report);
	const expressions: Checked['expressions'] = new Map();
	const skins: Checked['skins'] = new Map();

	/** Reads what is in a skin once, for its checks and the formatter. */
	const onSkin = (element: OpenElement, contentEnd: number) => {
		const skin = readSkin(xml, element.contentStart, contentEnd);
		// Blogger keeps comments in a template skin as they are
		if (
			'found' in skin &&
			element.name === 'b:template-skin' &&
			skin.found === 'a comment'
		) {
			return;
		}
		if ('found' in skin) {
			report.error(
				'skin-content',
				`<${element.name}> can only have text and CDATA in it, found ${skin.found}`,
				skin.offset,
			);
			return;
		}
		const cdataEnd = skin.text.indexOf(']]>');
		if (cdataEnd >= 0) {
			report.warn(
				'skin-cdata-end',
				"Blogger writes ']]>' in a skin as it is, which ends its CDATA section and breaks the theme it saves, write ']]\\>' in CSS",
				skin.sourceOf(cdataEnd),
			);
		}
		const tags = element.name === 'b:skin' ? variables.check(skin) : undefined;
		skins.set(element, { skin, tags });
	};

	/** Reports an `XmlSyntaxError` that `run` throws. */
	const reporting = (run: () => void) => {
		try {
			run();
		} catch (error) {
			if (!(error instanceof XmlSyntaxError)) {
				throw error;
			}
			errorAt(error.code, error.message, error.position);
		}
	};

	return {
		onStartTag(tag) {
			layout.onStartTag(tag);
			collector.onStartTag(tag);
			try {
				const parsed = parseExpressions(tag, report.warn, cache);
				if (parsed.size > 0) {
					expressions.set(tag, parsed);
				}
			} catch (error) {
				if (!(error instanceof XmlSyntaxError)) {
					throw error;
				}
				errorAt(error.code, error.message, error.position);
			}
		},
		onEndTag(element, contentEnd) {
			layout.onEndTag(element, contentEnd);
			if (contentEnd !== undefined && SKINS.has(element.name)) {
				onSkin(element, contentEnd);
			}
		},
		onText: layout.onText,
		onMarkup: layout.onMarkup,
		finish(declarations, syntaxError) {
			if (syntaxError) {
				errorAt(syntaxError.code, syntaxError.message, syntaxError.position);
			} else {
				reporting(() => layout.finish());
				checkDeclarations(declarations, report, errorAt, issueAt(true));
			}
			return {
				errors: inOrder(errors),
				fixable,
				warnings,
				expressions,
				skins,
				info: (locOf) => ({
					...collector.info(locOf),
					...variables.info(locOf),
				}),
			};
		},
	};
}

/**
 * Reports the declarations Blogger does not accept, one of each, the doctype
 * in capitals, and warns about those it rewrites: it writes the XML
 * declaration as XML 1.0 in UTF-8, and the doctype as `<!DOCTYPE html>`. The
 * XML declaration, when there is one, has to be the first thing in the theme:
 * to `placementAt`, formatting writes it there.
 */
function checkDeclarations(
	declarations: ScannedDeclaration[],
	report: Report,
	errorAt: ReportAt,
	placementAt: ReportAt,
): void {
	for (const kind of ['xml', 'doctype'] as const) {
		const [first, ...others] = declarations.filter(
			(item) => item.kind === kind,
		);
		for (const other of others) {
			errorAt(
				'duplicate-declaration',
				`There can only be one ${kind === 'xml' ? 'XML declaration' : 'doctype'}, another one is at ${first.position.line}:${first.position.column + 1}`,
				other.position,
			);
		}
	}

	const xmlDeclaration = declarations.find((item) => item.kind === 'xml');
	const doctype = declarations.find((item) => item.kind === 'doctype');
	if (xmlDeclaration) {
		checkXmlDeclaration(xmlDeclaration, report, errorAt);
		if (xmlDeclaration.start !== 0) {
			placementAt(
				'declaration-not-first',
				`The XML declaration has to be the first thing in the theme, Blogger fails on anything before it, even a space, ${XML_DECLARATION}`,
				xmlDeclaration.position,
			);
		}
	}
	if (doctype && !doctype.content.startsWith('DOCTYPE')) {
		errorAt(
			'doctype-case',
			`The doctype has to be written in capitals, ${DOCTYPE}, got: '<!${doctype.content}>'`,
			doctype.position,
		);
	} else if (
		doctype &&
		doctype.content.replace(/\s+/g, ' ').trim() !== 'DOCTYPE html'
	) {
		report.warn(
			'doctype-rewritten',
			`Blogger writes the doctype as ${DOCTYPE}, got: '<!${doctype.content}>'`,
			doctype.start,
		);
	}
}

/** Reports what Blogger does not accept in the XML declaration, and warns about what it rewrites: it writes XML 1.0 in UTF-8. */
function checkXmlDeclaration(
	{ content, position, start }: ScannedDeclaration,
	report: Report,
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
		errorAt(
			'xml-declaration',
			`Invalid XML declaration '<?${content}?>'`,
			position,
		);
		return;
	}
	for (const name of attributes.keys()) {
		if (!['version', 'encoding', 'standalone'].includes(name)) {
			errorAt(
				'xml-declaration',
				`Unknown '${name}' in the XML declaration`,
				position,
			);
		}
	}
	const version = attributes.get('version');
	if (version === undefined) {
		errorAt(
			'xml-declaration',
			'The XML declaration has to have a version, version="1.0"',
			position,
		);
	} else if (version !== '1.0') {
		report.warn(
			'xml-declaration-rewritten',
			`Blogger writes the XML declaration with version="1.0", got: '${version}'`,
			start,
		);
	}
	const encoding = attributes.get('encoding');
	if (encoding !== undefined && encoding.toUpperCase() !== 'UTF-8') {
		report.warn(
			'xml-declaration-rewritten',
			`Blogger themes are UTF-8, Blogger writes the XML declaration with encoding="UTF-8", got: '${encoding}'`,
			start,
		);
	}
}
