export {
	type ExpressionCache,
	type ParseXmlOptions,
	parseXml,
	type XmlDocument,
} from './document';
export { XmlError } from './error';
export { parseExpressions } from './expressions';
export { DOCTYPE, XML_DECLARATION } from './format';
export type { XmlInfo } from './info';
export {
	type CheckResult,
	type CheckXmlOptions,
	checkXml,
	type FormatResult,
	formatXml,
	inspectXml,
	type XmlDiagnostic,
} from './process';
export {
	createLocate,
	type Locate,
	type Position,
	XmlScanner,
	XmlSyntaxError,
} from './scanner';
export type {
	AutomaticVariable,
	BackgroundVariable,
	ColorVariable,
	FontVariable,
	LengthVariable,
	SkinGroup,
	SkinVariable,
	StringVariable,
	UrlVariable,
} from './variables';
