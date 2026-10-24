import type { ParseResult } from 'blogger-expr';
import { type Checked, createCheck } from './check';
import {
	createLocate,
	type Locate,
	type OpenElement,
	type ScannedDeclaration,
	type ScannedStartTag,
	XmlScanner,
	XmlSyntaxError,
} from './scanner';

/** Expressions parsed, by their context and text, to parse each one once, in a theme or in every theme it is given to. */
export type ExpressionCache = Map<string, ParseResult>;

export interface ParseXmlOptions {
	/** Path of the theme, in the places of its errors and warnings. */
	path?: string;
	/** Where expressions parsed are kept, to parse them once across the themes it is given to, as when one is rebuilt. */
	cache?: ExpressionCache;
}

/**
 * A theme read and checked in one scan. `checkXml`, `formatXml` and
 * `inspectXml` read it, each doing its job once for it, the first time.
 */
export interface XmlDocument {
	readonly source: string;
	readonly path: string;
}

/** What the scan of a document reports that formatting reads again, in its order. */
export type ScanEvent =
	| { type: 'start'; tag: ScannedStartTag }
	| { type: 'end'; element: OpenElement; contentEnd?: number }
	| {
			type: 'markup';
			kind: 'comment' | 'pi';
			start: number;
			end: number;
			parent: OpenElement | undefined;
	  };

/** What the scan of a document found, which the other jobs read again. */
export interface Scanned {
	events: ScanEvent[];
	declarations: ScannedDeclaration[];
	locate: Locate;
	/** What stops the scan, when the document is not well-formed. */
	syntaxError?: XmlSyntaxError;
	/** What the check while it was scanned found. */
	checked: Checked;
}

const scans = new WeakMap<XmlDocument, Scanned>();

/** What the scan of `document`, from `parseXml`, found. */
export function scanOf(document: XmlDocument): Scanned {
	const scanned = scans.get(document);
	if (scanned === undefined) {
		throw new TypeError('The document is not one parseXml gives');
	}
	return scanned;
}

/**
 * Reads a theme in one scan, and checks it as Blogger reads it in that scan,
 * as every other job needs it checked; what it is made of is kept for them.
 * Never throws an error of the theme.
 */
export function parseXml(
	source: string,
	{ path = '', cache = new Map() }: ParseXmlOptions = {},
): XmlDocument {
	const locate = createLocate(source);
	const events: ScanEvent[] = [];
	const declarations: ScannedDeclaration[] = [];
	const check = createCheck(source, path, locate, cache);
	const scanner = new XmlScanner({
		document: true,
		onStartTag: (tag) => {
			check.onStartTag(tag);
			events.push({ type: 'start', tag });
		},
		onEndTag: (element, contentEnd) => {
			check.onEndTag(element, contentEnd);
			events.push({ type: 'end', element, contentEnd });
		},
		onText: check.onText,
		onMarkup: (kind, start, end, parent) => {
			check.onMarkup(kind, start, end, parent);
			events.push({ type: 'markup', kind, start, end, parent });
		},
		onDeclaration: (declaration) => {
			declarations.push(declaration);
		},
	});
	let syntaxError: XmlSyntaxError | undefined;
	try {
		scanner.feed(source, locate);
		scanner.finish(locate(source.length));
	} catch (error) {
		if (!(error instanceof XmlSyntaxError)) {
			throw error;
		}
		syntaxError = error;
	}
	const document: XmlDocument = { source, path };
	scans.set(document, {
		events,
		declarations,
		locate,
		syntaxError,
		checked: check.finish(declarations, syntaxError),
	});
	return document;
}
