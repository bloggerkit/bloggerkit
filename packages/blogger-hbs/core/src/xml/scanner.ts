/**
 * An incremental XML scanner. Text is fed in pieces and parts whose content is
 * unknown (Handlebars expressions) can be marked in between, so a template can
 * be checked without being rendered. The state can be copied to follow the
 * branches of a block separately.
 *
 * It checks well-formedness only: tags, attributes, entities, comments, CDATA
 * sections, processing instructions and the doctype. The first error throws.
 */

export interface Position {
	/** 1-based line. */
	line: number;
	/** 0-based column, as Handlebars has it, messages show it 1-based. */
	column: number;
}

/** Position of a character of the text fed, by its index in that text. */
export type Locate = (index: number) => Position;

export class XmlSyntaxError extends Error {
	readonly position: Position;

	constructor(message: string, position: Position) {
		super(message);
		this.name = 'XmlSyntaxError';
		this.position = position;
	}
}

export interface ScannedAttribute {
	name: string;
	/** The value as it is written, entities are not decoded. */
	value: string;
	quote: '"' | "'";
	/**
	 * Whether the name or the value has output unknown until rendering, a
	 * Handlebars expression or block, `value` is then only the text around it.
	 */
	dynamic: boolean;
	/** Offset of the first character of `value` in the text fed, see `ScannerOptions.onStartTag`. */
	offset: number;
	/** Position of the character of `value` at `index`, of the closing quote at its length. */
	positionOf(index: number): Position;
}

/** Where a piece of an attribute value is in the text it was fed with. */
interface ValueSegment {
	/** Index in the value of its first character. */
	index: number;
	locate: Locate;
	/** Index in the text fed of its first character. */
	textIndex: number;
}

export interface ScannedStartTag {
	name: string;
	/** Offset of `<` in the text fed, see `ScannerOptions.onStartTag`. */
	start: number;
	/** Offset right after `>`. */
	end: number;
	attributes: ScannedAttribute[];
	selfClosing: boolean;
	/** The element the tag is in, undefined at the top. */
	parent?: OpenElement;
}

export interface ScannerOptions {
	/**
	 * A whole document: a single root element and no text out of it. A template
	 * is a fragment, which can have anything at its top.
	 */
	document?: boolean;
	/**
	 * Called with every start tag. Its offsets are only right when the text is
	 * fed in one piece, `ScannedAttribute.positionOf` always is.
	 */
	onStartTag?(tag: ScannedStartTag): void;
	/**
	 * Called when an element ends, with the offset of the `<` of its end tag,
	 * where what is in it ends, or self-closed, without.
	 */
	onEndTag?(element: OpenElement, contentEnd?: number): void;
	/**
	 * Called with the offset of the first character that is not whitespace in
	 * every run of text, a run ending at a tag, of every entity in it and of
	 * every CDATA section, offsets as in `onStartTag`.
	 */
	onText?(offset: number, parent: OpenElement | undefined): void;
	/** Called with the XML declaration and the doctype, like `onStartTag`. */
	onDeclaration?(declaration: ScannedDeclaration): void;
}

export interface ScannedDeclaration {
	kind: 'xml' | 'doctype';
	/** What is between `<?` and `?>`, or `<!` and `>`. */
	content: string;
	/** Offset of `<`. */
	start: number;
	/** Offset right after `>`. */
	end: number;
	position: Position;
}

type Mode =
	| 'text'
	| 'tagOpen'
	| 'startTagName'
	| 'inTag'
	| 'attrName'
	| 'afterAttrName'
	| 'beforeAttrValue'
	| 'attrValue'
	| 'selfClose'
	| 'endTagName'
	| 'afterEndTagName'
	| 'markup'
	| 'comment'
	| 'cdata'
	| 'doctype'
	| 'pi'
	| 'entity';

export interface OpenElement {
	name: string;
	position: Position;
	/** Offset of the `<` of its start tag. */
	start: number;
	/** Offset right after its start tag, where what is in it starts. */
	contentStart: number;
}

const ENTITY = /^(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+)$/;
const MARKUP = ['--', '[CDATA[', 'DOCTYPE'];

const LT = 0x3c;
const AMP = 0x26;

function isWhitespace(code: number): boolean {
	return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

/** `[A-Za-z_:]`, and everything from U+00C0, as names have them. */
function isNameStart(code: number): boolean {
	return (
		(code >= 0x61 && code <= 0x7a) ||
		(code >= 0x41 && code <= 0x5a) ||
		code === 0x5f ||
		code === 0x3a ||
		code >= 0xc0
	);
}

/** A name start, `[0-9.-]` or `·`. */
function isNameChar(code: number): boolean {
	return (
		isNameStart(code) ||
		(code >= 0x30 && code <= 0x39) ||
		code === 0x2e ||
		code === 0x2d ||
		code === 0xb7
	);
}

/** `[A-Za-z0-9#]`, in entity references. */
function isEntityChar(code: number): boolean {
	return (
		(code >= 0x61 && code <= 0x7a) ||
		(code >= 0x41 && code <= 0x5a) ||
		(code >= 0x30 && code <= 0x39) ||
		code === 0x23
	);
}

// the end of a run from `i`, the first character not in it or the length of `text`,
// a loop for each, as calling a test passed in would be slower

function nameEnd(text: string, i: number): number {
	let end = i;
	while (end < text.length && isNameChar(text.charCodeAt(end))) {
		end++;
	}
	return end;
}

function whitespaceEnd(text: string, i: number): number {
	let end = i;
	while (end < text.length && isWhitespace(text.charCodeAt(end))) {
		end++;
	}
	return end;
}

function entityNameEnd(text: string, i: number): number {
	let end = i;
	while (end < text.length && isEntityChar(text.charCodeAt(end))) {
		end++;
	}
	return end;
}

/** The index of `search` in `text` from `from`, or the length of `text`. */
function indexOrEnd(text: string, search: string, from: number): number {
	const index = text.indexOf(search, from);
	return index < 0 ? text.length : index;
}

const DESCRIPTIONS: Record<Mode, string> = {
	text: 'text',
	tagOpen: "a tag right after '<'",
	startTagName: 'the name of a tag',
	inTag: 'a tag',
	attrName: 'the name of an attribute',
	afterAttrName: 'an attribute',
	beforeAttrValue: 'an attribute',
	attrValue: 'an attribute value',
	selfClose: "a tag right after '/'",
	endTagName: 'a closing tag',
	afterEndTagName: 'a closing tag',
	markup: "markup right after '<!'",
	comment: 'a comment',
	cdata: 'a CDATA section',
	doctype: 'the doctype',
	pi: 'a processing instruction',
	entity: 'an entity reference',
};

export class XmlScanner {
	private readonly options: ScannerOptions;

	private mode: Mode = 'text';
	/** The elements open, innermost last. */
	private stack: OpenElement[] = [];
	private rootClosed = false;

	// the tag being scanned
	private tagName = '';
	private tagPosition: Position = { line: 1, column: 0 };
	private tagStart = 0;
	private attributes: ScannedAttribute[] = [];
	/** The names of the attributes of the tag, without the ones Handlebars renders. */
	private attributeNames: string[] = [];
	private attrName = '';
	private attrDynamic = false;
	private attrValue = '';
	private attrValueDynamic = false;
	private attrValueSegments: ValueSegment[] = [];
	private attrValueOffset = 0;
	/** Where the part of the value not in `attrValue` yet starts in the text fed. */
	private valueFrom = 0;
	private quote: '"' | "'" = '"';
	/** Whether the text since the last tag is reported, see `ScannerOptions.onText`. */
	private textReported = false;
	/** Whether whitespace (or an expression) separates the next attribute. */
	private separated = false;
	private buffer = '';
	private count = 0;
	private entityReturn: 'text' | 'attrValue' = 'text';
	/** Where the entity, comment or CDATA section being scanned starts, placed only for an error. */
	private entityLocate: Locate = () => ({ line: 1, column: 0 });
	private entityIndex = 0;
	/** Where the character being scanned is, for `fail`. */
	private locate: Locate = () => ({ line: 1, column: 0 });
	private index = 0;

	constructor(options: ScannerOptions = {}) {
		this.options = options;
	}

	/** A copy to scan a branch with. */
	clone(): XmlScanner {
		const copy = new XmlScanner(this.options);
		Object.assign(copy, this, {
			stack: [...this.stack],
			attributes: [...this.attributes],
			attributeNames: [...this.attributeNames],
			attrValueSegments: [...this.attrValueSegments],
		});
		return copy;
	}

	/** Continues from the state of `other`, a scanned branch. */
	assign(other: XmlScanner): void {
		Object.assign(this, other.clone());
	}

	/** Compares the parts of the state that make the following text valid or not. */
	signature(): string {
		const inside = this.mode === 'attrValue' ? this.quote : '';
		return `${this.mode}${inside}|${this.stack.map((element) => element.name).join('/')}|${this.tagName}`;
	}

	/** Describes how this state differs from `start`, after a block. */
	describeChange(start: XmlScanner): string {
		const opened = this.stack.slice(start.stack.length);
		const common = this.stack.length >= start.stack.length;

		if (common && opened.length > 0 && this.mode === 'text') {
			return `opens ${opened.map(describeElement).join(', ')} without closing ${opened.length > 1 ? 'them' : 'it'}`;
		}
		if (this.stack.length < start.stack.length) {
			const closed = start.stack.slice(this.stack.length);
			return `closes ${closed.map(describeElement).join(', ')}, opened before it`;
		}
		if (this.mode !== start.mode) {
			return `ends inside ${DESCRIPTIONS[this.mode]}${this.tagName ? ` of <${this.tagName}>` : ''}, but starts inside ${DESCRIPTIONS[start.mode]}`;
		}
		return 'changes the XML structure';
	}

	/** Scans `text`, `base` is added to the offsets of `onStartTag`. */
	feed(text: string, locate: Locate, base = 0): void {
		this.locate = locate;
		if (this.inAttributeValue()) {
			this.addValueSegment(this.attrValue.length, locate, 0);
			this.valueFrom = 0;
		}
		for (
			let i = this.skip(text, 0);
			i < text.length;
			i = this.skip(text, this.step(text, i, locate, base))
		) {}
		// the value goes on in the next piece
		if (this.inAttributeValue()) {
			this.attrValue += text.slice(this.valueFrom);
		}
	}

	/** Whether an attribute value is being scanned, an entity in it too. */
	private inAttributeValue(): boolean {
		return (
			this.mode === 'attrValue' ||
			(this.mode === 'entity' && this.entityReturn === 'attrValue')
		);
	}

	/**
	 * The index of the next character from `i` the scan has to look at, the
	 * others are taken as they are. It only skips what the mode accepts anyway,
	 * so the errors are the same, and stops at the end of `text`, so text fed
	 * in pieces is scanned the same.
	 */
	private skip(text: string, i: number): number {
		switch (this.mode) {
			case 'text': {
				// once the text is reported, only a tag or an entity ends it
				let end = i;
				for (; end < text.length; end++) {
					const code = text.charCodeAt(end);
					if (
						code === LT ||
						code === AMP ||
						(!this.textReported && !isWhitespace(code))
					) {
						break;
					}
				}
				return end;
			}

			case 'attrValue': {
				const quote = this.quote.charCodeAt(0);
				let end = i;
				for (; end < text.length; end++) {
					const code = text.charCodeAt(end);
					if (code === quote || code === LT || code === AMP) {
						break;
					}
				}
				return end;
			}

			// right after '-', ']' or '?', the next character ends it or not
			case 'comment':
				return this.count === 0 ? indexOrEnd(text, '-', i) : i;
			case 'cdata':
				return this.count === 0 ? indexOrEnd(text, ']', i) : i;
			case 'pi': {
				if (this.count > 0) {
					return i;
				}
				const end = indexOrEnd(text, '?', i);
				this.buffer += text.slice(i, end);
				return end;
			}

			// a run of name characters, the character after it ends the name or not
			case 'startTagName':
			case 'attrName':
			case 'endTagName': {
				// an end tag name starts with a name start, which `step` checks
				if (this.mode === 'endTagName' && this.tagName === '') {
					return i;
				}
				const end = nameEnd(text, i);
				if (this.mode === 'attrName') {
					this.attrName += text.slice(i, end);
				} else {
					this.tagName += text.slice(i, end);
				}
				return end;
			}

			// whitespace between attributes, and around `=` and in end tags
			case 'inTag':
			case 'afterAttrName':
			case 'beforeAttrValue':
			case 'afterEndTagName': {
				const end = whitespaceEnd(text, i);
				if (end > i && this.mode === 'inTag') {
					this.separated = true;
				}
				return end;
			}

			// the name of an entity, up to the 32 characters `step` accepts
			case 'entity': {
				const end = Math.min(
					entityNameEnd(text, i),
					i + 32 - this.buffer.length,
				);
				this.buffer += text.slice(i, end);
				return end;
			}

			default:
				return i;
		}
	}

	/**
	 * Marks output unknown until rendering, a Handlebars expression. It is
	 * accepted where any output can be valid, otherwise it throws.
	 */
	unknown(position: Position, label: string): void {
		const error = (message: string) =>
			new XmlSyntaxError(`${label} ${message}`, position);

		switch (this.mode) {
			case 'attrValue':
				this.attrValueDynamic = true;
				return;
			case 'text':
			case 'comment':
			case 'cdata':
			case 'pi':
			case 'doctype':
				return;
			case 'inTag':
				// it can render attributes, which have to be separated as well
				this.separated = true;
				return;
			case 'attrName':
				this.attrDynamic = true;
				return;
			case 'afterAttrName':
			case 'beforeAttrValue':
				throw error(
					`is the value of the attribute '${this.attrName}', which has to be quoted: ${this.attrName}='...'`,
				);
			case 'tagOpen':
			case 'startTagName':
			case 'endTagName':
			case 'afterEndTagName':
				throw error('can not be (part of) the name of a tag');
			case 'entity':
				throw error(
					"can not be part of an entity reference, escape '&' as '&amp;'",
				);
			default:
				throw error(`can not be inside ${DESCRIPTIONS[this.mode]}`);
		}
	}

	/**
	 * Marks the attribute value being scanned as dynamic, when a block is in
	 * it. Its content is scanned on a copy, so `unknown` is not called.
	 */
	dynamicValue(): void {
		if (this.mode === 'attrValue') {
			this.attrValueDynamic = true;
		}
	}

	/** Throws unless everything fed is complete. */
	finish(position: Position): void {
		if (this.mode !== 'text') {
			throw new XmlSyntaxError(
				`Unexpected end inside ${DESCRIPTIONS[this.mode]}${this.tagName ? ` of <${this.tagName}>` : ''}`,
				this.mode === 'comment' ||
					this.mode === 'cdata' ||
					this.mode === 'entity'
					? this.entityPosition()
					: this.tagPosition,
			);
		}
		const open = this.stack.at(-1);
		if (open) {
			throw new XmlSyntaxError(
				`${describeElement(open)} is not closed`,
				open.position,
			);
		}
		if (this.options.document && !this.rootClosed) {
			throw new XmlSyntaxError('The document has no root element', position);
		}
	}

	/** Scans the character of `text` at `i`, returns the index of the next one to scan. */
	private step(text: string, i: number, locate: Locate, base: number): number {
		const char = text[i];
		const code = text.charCodeAt(i);
		const next = i + 1;
		this.index = i;

		switch (this.mode) {
			case 'text':
				if (char === '<') {
					this.mode = 'tagOpen';
					this.tagStart = base + i;
					this.tagPosition = locate(i);
					this.textReported = false;
				} else if (char === '&') {
					this.reportText(base + i);
					this.startEntity('text', i);
				} else if (!isWhitespace(code)) {
					if (this.options.document && this.stack.length === 0) {
						this.fail(`Text out of the root element: '${char}'`);
					}
					this.reportText(base + i);
				}
				return next;

			case 'tagOpen':
				if (char === '/') {
					this.mode = 'endTagName';
					this.tagName = '';
				} else if (char === '!') {
					this.mode = 'markup';
					this.buffer = '';
				} else if (char === '?') {
					this.mode = 'pi';
					this.count = 0;
					this.buffer = '';
				} else if (isNameStart(code)) {
					// the name at once, a slice of the text
					const end = nameEnd(text, next);
					this.mode = 'startTagName';
					this.tagName = text.slice(i, end);
					this.attributes = [];
					this.attributeNames = [];
					return end;
				} else {
					this.fail(
						`Invalid character '${char}' after '<', escape a literal '<' as '&lt;'`,
					);
				}
				return next;

			case 'startTagName':
				if (isNameChar(code)) {
					this.tagName += char;
				} else if (isWhitespace(code)) {
					this.mode = 'inTag';
					this.separated = true;
				} else if (char === '>') {
					this.endStartTag(false, base + i + 1);
				} else if (char === '/') {
					this.mode = 'selfClose';
				} else {
					this.fail(
						`Invalid character '${char}' in the name of <${this.tagName}>`,
					);
				}
				return next;

			case 'inTag':
				if (isWhitespace(code)) {
					this.separated = true;
				} else if (char === '>') {
					this.endStartTag(false, base + i + 1);
				} else if (char === '/') {
					this.mode = 'selfClose';
				} else if (isNameStart(code)) {
					if (!this.separated) {
						this.fail(
							`Missing whitespace between the attributes of <${this.tagName}>`,
						);
					}
					const end = nameEnd(text, next);
					this.mode = 'attrName';
					this.attrName = text.slice(i, end);
					this.attrDynamic = false;
					return end;
				} else {
					this.fail(`Invalid character '${char}' in <${this.tagName}>`);
				}
				return next;

			case 'attrName':
				if (isNameChar(code)) {
					this.attrName += char;
				} else if (isWhitespace(code)) {
					this.mode = 'afterAttrName';
				} else if (char === '=') {
					this.mode = 'beforeAttrValue';
				} else {
					this.missingValue();
				}
				return next;

			case 'afterAttrName':
				if (char === '=') {
					this.mode = 'beforeAttrValue';
				} else if (!isWhitespace(code)) {
					this.missingValue();
				}
				return next;

			case 'beforeAttrValue':
				if (char === '"' || char === "'") {
					this.mode = 'attrValue';
					this.quote = char;
					this.attrValue = '';
					this.valueFrom = next;
					this.attrValueDynamic = false;
					this.attrValueSegments = [];
					this.attrValueOffset = base + i + 1;
					this.addValueSegment(0, locate, i + 1);
				} else if (!isWhitespace(code)) {
					this.fail(
						`The value of the attribute '${this.attrName}' of <${this.tagName}> has to be quoted`,
					);
				}
				return next;

			case 'attrValue':
				if (char === this.quote) {
					// the value at once, after what is in the pieces before
					this.attrValue += text.slice(this.valueFrom, i);
					this.endAttribute();
				} else if (char === '<') {
					this.fail(
						`'<' is not allowed in the value of the attribute '${this.attrName}', escape it as '&lt;'`,
					);
				} else if (char === '&') {
					this.startEntity('attrValue', i);
				}
				return next;

			case 'selfClose':
				if (char === '>') {
					this.endStartTag(true, base + i + 1);
				} else {
					this.fail(`Expected '>' after '/' in <${this.tagName}>`);
				}
				return next;

			case 'endTagName':
				if (this.tagName === '' ? isNameStart(code) : isNameChar(code)) {
					const end = nameEnd(text, next);
					this.tagName += text.slice(i, end);
					return end;
				}
				if (this.tagName !== '' && isWhitespace(code)) {
					this.mode = 'afterEndTagName';
				} else if (this.tagName !== '' && char === '>') {
					this.endEndTag();
				} else {
					this.fail(`Invalid character '${char}' in a closing tag`);
				}
				return next;

			case 'afterEndTagName':
				if (char === '>') {
					this.endEndTag();
				} else if (!isWhitespace(code)) {
					this.fail(`Expected '>' in the closing tag </${this.tagName}>`);
				}
				return next;

			case 'markup': {
				this.buffer += char;
				const match = MARKUP.find((markup) =>
					markup.startsWith(this.buffer.toUpperCase()),
				);
				if (match === undefined) {
					this.fail(
						`Invalid markup '<!${this.buffer}', expected a comment, a CDATA section or the doctype`,
					);
				} else if (match === this.buffer.toUpperCase()) {
					if (
						match === 'DOCTYPE' &&
						this.options.document &&
						(this.stack.length > 0 || this.rootClosed)
					) {
						throw new XmlSyntaxError(
							'The doctype has to come before the root element',
							this.tagPosition,
						);
					}
					const { tagPosition } = this;
					this.entityLocate = () => tagPosition;
					this.count = 0;
					if (match === '[CDATA[') {
						this.options.onText?.(this.tagStart, this.stack.at(-1));
					}
					this.mode =
						match === '--'
							? 'comment'
							: match === 'DOCTYPE'
								? 'doctype'
								: 'cdata';
				}
				return next;
			}

			case 'comment':
				if (char === '-') {
					this.count++;
				} else {
					if (this.count >= 2) {
						if (char !== '>') {
							this.fail("'--' is not allowed inside a comment");
						}
						this.mode = 'text';
					}
					this.count = 0;
				}
				return next;

			case 'cdata':
				if (char === ']') {
					this.count++;
				} else {
					if (char === '>' && this.count >= 2) {
						this.mode = 'text';
					}
					this.count = 0;
				}
				return next;

			case 'doctype':
				if (char === '[') {
					this.count++;
				} else if (char === ']') {
					this.count--;
				} else if (char === '>' && this.count <= 0) {
					this.mode = 'text';
					this.declare('doctype', this.buffer, base + i + 1);
					return next;
				}
				this.buffer += char;
				return next;

			case 'pi':
				if (char === '>' && this.count > 0) {
					this.mode = 'text';
					const content = this.buffer.slice(0, -1);
					const target = /^[^\s?]*/.exec(content)?.[0] ?? '';
					if (target.toLowerCase() === 'xml') {
						if (target !== 'xml') {
							throw new XmlSyntaxError(
								`'${target}' is reserved, the XML declaration is '<?xml ...?>'`,
								this.tagPosition,
							);
						}
						this.declare('xml', content, base + i + 1);
					}
					return next;
				}
				this.buffer += char;
				this.count = char === '?' ? 1 : 0;
				return next;

			case 'entity':
				if (char === ';') {
					if (!ENTITY.test(this.buffer)) {
						throw new XmlSyntaxError(
							this.buffer === ''
								? "'&' has to be escaped as '&amp;'"
								: `Undefined entity '&${this.buffer};', XML only has &amp; &lt; &gt; &quot; &apos;, use a numeric reference like '&#160;' for others`,
							this.entityPosition(),
						);
					}
					this.mode = this.entityReturn;
				} else if (isEntityChar(code) && this.buffer.length < 32) {
					this.buffer += char;
				} else {
					throw new XmlSyntaxError(
						"'&' has to be escaped as '&amp;'",
						this.entityPosition(),
					);
				}
				return next;
		}
	}

	private declare(
		kind: ScannedDeclaration['kind'],
		content: string,
		end: number,
	): void {
		this.options.onDeclaration?.({
			kind,
			content,
			start: this.tagStart,
			end,
			position: this.tagPosition,
		});
	}

	private addValueSegment(index: number, locate: Locate, textIndex: number) {
		this.attrValueSegments.push({ index, locate, textIndex });
	}

	private startEntity(from: 'text' | 'attrValue', index: number): void {
		this.mode = 'entity';
		this.entityReturn = from;
		this.entityLocate = this.locate;
		this.entityIndex = index;
		this.buffer = '';
	}

	private entityPosition(): Position {
		return this.entityLocate(this.entityIndex);
	}

	/** Throws at the character being scanned. */
	private fail(message: string): never {
		throw new XmlSyntaxError(message, this.locate(this.index));
	}

	/** Reports the text being scanned, once a run, see `ScannerOptions.onText`. */
	private reportText(offset: number): void {
		if (!this.textReported) {
			this.textReported = true;
			this.options.onText?.(offset, this.stack.at(-1));
		}
	}

	private missingValue(): never {
		return this.fail(
			`The attribute '${this.attrName}' of <${this.tagName}> has no value, XML requires one: ${this.attrName}='...'`,
		);
	}

	private endAttribute(): void {
		if (!this.attrDynamic) {
			if (this.attributeNames.includes(this.attrName)) {
				this.fail(
					`Duplicate attribute '${this.attrName}' in <${this.tagName}>`,
				);
			}
			this.attributeNames.push(this.attrName);
		}
		this.attributes.push(
			new Attribute(
				this.attrName,
				this.attrValue,
				this.quote,
				this.attrDynamic || this.attrValueDynamic,
				this.attrValueOffset,
				this.attrValueSegments,
			),
		);
		this.mode = 'inTag';
		this.separated = false;
	}

	private endStartTag(selfClosing: boolean, end: number): void {
		if (this.options.document && this.stack.length === 0 && this.rootClosed) {
			throw new XmlSyntaxError(
				`Only one root element is allowed, found <${this.tagName}> after it`,
				this.tagPosition,
			);
		}

		this.options.onStartTag?.({
			name: this.tagName,
			start: this.tagStart,
			end,
			attributes: this.attributes,
			selfClosing,
			parent: this.stack.at(-1),
		});

		const element: OpenElement = {
			name: this.tagName,
			position: this.tagPosition,
			start: this.tagStart,
			contentStart: end,
		};
		if (selfClosing) {
			if (this.stack.length === 0) {
				this.rootClosed = true;
			}
			this.options.onEndTag?.(element);
		} else {
			this.stack.push(element);
		}
		this.tagName = '';
		this.mode = 'text';
	}

	private endEndTag(): void {
		// reported where the closing tag starts
		const fail = (message: string): never => {
			throw new XmlSyntaxError(message, this.tagPosition);
		};

		const open = this.stack.at(-1);
		if (open === undefined) {
			fail(`Closing tag </${this.tagName}> has no opening tag`);
		} else if (open.name !== this.tagName) {
			fail(
				`Expected </${open.name}> to close ${describeElement(open)}, found </${this.tagName}>`,
			);
		}
		const closed = this.stack.pop() as OpenElement;
		this.options.onEndTag?.(closed, this.tagStart);
		if (this.stack.length === 0) {
			this.rootClosed = true;
		}
		this.tagName = '';
		this.mode = 'text';
	}
}

function describeElement({ name, position }: OpenElement): string {
	return `<${name}> (opened at ${position.line}:${position.column + 1})`;
}

/** An attribute as scanned, a method placing its characters instead of a function for each. */
class Attribute implements ScannedAttribute {
	constructor(
		readonly name: string,
		readonly value: string,
		readonly quote: '"' | "'",
		readonly dynamic: boolean,
		readonly offset: number,
		private readonly segments: readonly ValueSegment[],
	) {}

	positionOf(index: number): Position {
		const segment =
			this.segments.findLast((item) => item.index <= index) ?? this.segments[0];
		return segment.locate(segment.textIndex + index - segment.index);
	}
}

/** Positions in a single text, computed from the offsets of its line starts. */
export function createLocate(
	text: string,
	start: Position = { line: 1, column: 0 },
): Locate {
	const lineStarts = [0];
	for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) {
		lineStarts.push(i + 1);
	}

	return (index) => {
		let low = 0;
		let high = lineStarts.length - 1;
		while (low < high) {
			const middle = (low + high + 1) >> 1;
			if (lineStarts[middle] <= index) {
				low = middle;
			} else {
				high = middle - 1;
			}
		}
		return low === 0
			? { line: start.line, column: start.column + index }
			: { line: start.line + low, column: index - lineStarts[low] };
	};
}
