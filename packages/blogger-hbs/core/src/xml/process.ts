import {
	type Checked,
	inOrder,
	type Warning,
	type XmlDiagnostic,
} from './check';
import { scanOf, type XmlDocument } from './document';
import { createFormatter } from './format';
import type { XmlInfo } from './info';
import { createLocate, type Position } from './scanner';

export type { XmlDiagnostic } from './check';

export interface CheckXmlOptions {
	/** The codes of the warnings to leave out, `'unrendered-content'`... */
	ignore?: readonly string[];
}

export interface CheckResult {
	/** Every error Blogger refuses the theme or fails on, in the order of the theme. */
	errors: readonly XmlDiagnostic[];
	/** What Blogger removes or does not render, in the order of the theme. */
	warnings: readonly XmlDiagnostic[];
}

/** A theme formatted as Blogger saves it, its warnings placed in it. */
export type FormatResult =
	| { ok: true; xml: string; warnings: readonly XmlDiagnostic[] }
	/** The errors formatting does not fix. */
	| { ok: false; errors: readonly XmlDiagnostic[] };

/**
 * Checks a theme as Blogger reads it: every error Blogger refuses it or
 * fails on, and warnings about what it removes or does not render. Checked
 * once for the document, which `formatXml` reads too.
 */
export function checkXml(
	document: XmlDocument,
	{ ignore }: CheckXmlOptions = {},
): CheckResult {
	const checked = checkOf(document);
	if (checked.placed === undefined) {
		const { locate } = scanOf(document);
		checked.placed = placeWarnings(checked.warnings, document.path, (offset) =>
			locate(offset),
		);
	}
	return {
		errors: checked.errors,
		warnings: kept(checked.placed, ignore),
	};
}

/** The warnings but those of the codes in `ignore`. */
function kept(
	warnings: readonly XmlDiagnostic[],
	ignore: readonly string[] | undefined,
): readonly XmlDiagnostic[] {
	if (ignore === undefined || ignore.length === 0) {
		return warnings;
	}
	const ignored = new Set(ignore);
	return warnings.filter(({ code }) => !ignored.has(code));
}

/** Warnings placed in a text, `locate` finding the position of an offset of the source in it. */
function placeWarnings(
	warnings: Warning[],
	path: string,
	locate: (offset: number) => Position,
): XmlDiagnostic[] {
	return inOrder(
		warnings.map(({ code, message, offset }) => {
			const { line, column } = locate(offset);
			return {
				code,
				severity: 'warning',
				message,
				loc: { path, line, column: column + 1 },
			};
		}),
	);
}

/** What the check of a document found while it was scanned. */
function checkOf(document: XmlDocument): Checked {
	return scanOf(document).checked;
}

/** Where each offset of the source is in a formatted theme. */
const formattedOffsets = new WeakMap<
	FormatResult,
	{ document: XmlDocument; locate: (offset: number) => Position }
>();
const formats = new WeakMap<
	XmlDocument,
	| {
			xml: string;
			locate: (offset: number) => Position;
			/** The warnings placed in `xml`. */
			warnings: XmlDiagnostic[];
	  }
	| XmlDiagnostic[]
>();

/**
 * Formats a theme as Blogger saves it, its declarations on the first two
 * lines, once for the document; the errors formatting does not fix instead,
 * as Blogger saves no theme with errors.
 */
export function formatXml(
	document: XmlDocument,
	{ ignore }: CheckXmlOptions = {},
): FormatResult {
	const checked = checkOf(document);
	let formatted = formats.get(document);
	if (formatted === undefined) {
		const errors = checked.errors.filter(
			(error) => !checked.fixable.has(error),
		);
		if (errors.length > 0) {
			formatted = errors;
		} else {
			const { xml, locate } = format(document.source, checked, document);
			const warnings = placeWarnings(checked.warnings, document.path, locate);
			formatted = { xml, locate, warnings };
		}
		formats.set(document, formatted);
	}
	if (Array.isArray(formatted)) {
		return { ok: false, errors: formatted };
	}
	const result: FormatResult = {
		ok: true,
		xml: formatted.xml,
		warnings: kept(formatted.warnings, ignore),
	};
	formattedOffsets.set(result, { document, locate: formatted.locate });
	return result;
}

/** Formats a checked document, without errors but those formatting fixes, from what its scan found. */
function format(
	source: string,
	checked: Checked,
	document: XmlDocument,
): { xml: string; locate: (offset: number) => Position } {
	const { events, declarations } = scanOf(document);
	const formatter = createFormatter(source);
	for (const event of events) {
		switch (event.type) {
			case 'start':
				formatter.onStartTag(
					event.tag,
					checked.expressions.get(event.tag) ?? new Map(),
				);
				break;
			case 'end': {
				formatter.onEndTag(event.element, event.contentEnd);
				const read = checked.skins.get(event.element);
				if (read && event.contentEnd !== undefined) {
					formatter.onSkin(
						event.element,
						event.contentEnd,
						read.skin,
						read.tags,
					);
				}
				break;
			}
			case 'markup':
				formatter.onMarkup(event.kind, event.start, event.end, event.parent);
				break;
		}
	}
	const { xml, mapOffset } = formatter.finish(declarations);
	const locate = createLocate(xml);
	return { xml, locate: (offset) => locate(mapOffset(offset)) };
}

/**
 * What a theme is made of: its root attributes, sections, widgets and the
 * groups and variables of its skin, placed in the source, or in the theme
 * formatted from it, `formatted`.
 */
export function inspectXml(
	document: XmlDocument,
	formatted?: FormatResult,
): XmlInfo {
	const checked = checkOf(document);
	const into = formatted && formattedOffsets.get(formatted);
	if (formatted && into?.document !== document) {
		throw new TypeError(
			'The formatted theme is not formatted from the document',
		);
	}
	const locate = into?.locate ?? scanOf(document).locate;
	return checked.info((offset) => {
		const { line, column } = locate(offset);
		return { path: document.path, line, column: column + 1 };
	});
}
