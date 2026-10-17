export { parseExpressions } from './expressions';
export type { XmlInfo } from './info';
export {
	type ProcessXmlOptions,
	processXml,
	XmlError,
	type XmlIssue,
	type XmlResult,
} from './process';
export {
	createLocate,
	type Locate,
	type Position,
	XmlScanner,
	XmlSyntaxError,
} from './scanner';
