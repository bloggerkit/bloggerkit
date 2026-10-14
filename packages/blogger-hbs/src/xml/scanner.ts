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
}

const NAME_START = /[A-Za-z_:À-￿]/;
const NAME_CHAR = /[A-Za-z0-9_:.\-·À-￿]/;
const WHITESPACE = /[ \t\r\n]/;
const ENTITY = /^(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+)$/;
const ENTITY_CHAR = /[A-Za-z0-9#]/;
const MARKUP = ['--', '[CDATA[', 'DOCTYPE'];

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
	private attributeNames = new Set<string>();
	private attrName = '';
	private attrDynamic = false;
	private attrValue = '';
	private attrValueDynamic = false;
	private attrValueSegments: ValueSegment[] = [];
	private quote: '"' | "'" = '"';
	/** Whether whitespace (or an expression) separates the next attribute. */
	private separated = false;
	private buffer = '';
	private count = 0;
	private entityReturn: 'text' | 'attrValue' = 'text';
	private entityPosition: Position = { line: 1, column: 0 };

	constructor(options: ScannerOptions = {}) {
		this.options = options;
	}

	/** A copy to scan a branch with. */
	clone(): XmlScanner {
		const copy = new XmlScanner(this.options);
		Object.assign(copy, this, {
			stack: [...this.stack],
			attributes: [...this.attributes],
			attributeNames: new Set(this.attributeNames),
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
		if (this.mode === 'attrValue') {
			this.addValueSegment(this.attrValue.length, locate, 0);
		} else if (this.mode === 'entity' && this.entityReturn === 'attrValue') {
			this.addValueSegment(
				this.attrValue.length + this.buffer.length,
				locate,
				0,
			);
		}
		for (let i = 0; i < text.length; i++) {
			this.step(text[i], i, locate, base);
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
					? this.entityPosition
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

	private step(char: string, i: number, locate: Locate, base: number): void {
		const fail = (message: string): never => {
			throw new XmlSyntaxError(message, locate(i));
		};

		switch (this.mode) {
			case 'text':
				if (char === '<') {
					this.mode = 'tagOpen';
					this.tagStart = base + i;
					this.tagPosition = locate(i);
				} else if (char === '&') {
					this.startEntity('text', locate(i));
				} else if (
					this.options.document &&
					this.stack.length === 0 &&
					!WHITESPACE.test(char)
				) {
					fail(`Text out of the root element: '${char}'`);
				}
				return;

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
				} else if (NAME_START.test(char)) {
					this.mode = 'startTagName';
					this.tagName = char;
					this.attributes = [];
					this.attributeNames.clear();
				} else {
					fail(
						`Invalid character '${char}' after '<', escape a literal '<' as '&lt;'`,
					);
				}
				return;

			case 'startTagName':
				if (NAME_CHAR.test(char)) {
					this.tagName += char;
				} else if (WHITESPACE.test(char)) {
					this.mode = 'inTag';
					this.separated = true;
				} else if (char === '>') {
					this.endStartTag(false, base + i + 1);
				} else if (char === '/') {
					this.mode = 'selfClose';
				} else {
					fail(`Invalid character '${char}' in the name of <${this.tagName}>`);
				}
				return;

			case 'inTag':
				if (WHITESPACE.test(char)) {
					this.separated = true;
				} else if (char === '>') {
					this.endStartTag(false, base + i + 1);
				} else if (char === '/') {
					this.mode = 'selfClose';
				} else if (NAME_START.test(char)) {
					if (!this.separated) {
						fail(
							`Missing whitespace between the attributes of <${this.tagName}>`,
						);
					}
					this.mode = 'attrName';
					this.attrName = char;
					this.attrDynamic = false;
				} else {
					fail(`Invalid character '${char}' in <${this.tagName}>`);
				}
				return;

			case 'attrName':
				if (NAME_CHAR.test(char)) {
					this.attrName += char;
				} else if (WHITESPACE.test(char)) {
					this.mode = 'afterAttrName';
				} else if (char === '=') {
					this.mode = 'beforeAttrValue';
				} else {
					this.missingValue(fail);
				}
				return;

			case 'afterAttrName':
				if (char === '=') {
					this.mode = 'beforeAttrValue';
				} else if (!WHITESPACE.test(char)) {
					this.missingValue(fail);
				}
				return;

			case 'beforeAttrValue':
				if (char === '"' || char === "'") {
					this.mode = 'attrValue';
					this.quote = char;
					this.attrValue = '';
					this.attrValueDynamic = false;
					this.attrValueSegments = [];
					this.addValueSegment(0, locate, i + 1);
				} else if (!WHITESPACE.test(char)) {
					fail(
						`The value of the attribute '${this.attrName}' of <${this.tagName}> has to be quoted`,
					);
				}
				return;

			case 'attrValue':
				if (char === this.quote) {
					this.endAttribute(fail);
				} else if (char === '<') {
					fail(
						`'<' is not allowed in the value of the attribute '${this.attrName}', escape it as '&lt;'`,
					);
				} else {
					if (char === '&') {
						this.startEntity('attrValue', locate(i));
					}
					this.attrValue += char;
				}
				return;

			case 'selfClose':
				if (char === '>') {
					this.endStartTag(true, base + i + 1);
				} else {
					fail(`Expected '>' after '/' in <${this.tagName}>`);
				}
				return;

			case 'endTagName':
				if (
					this.tagName === '' ? NAME_START.test(char) : NAME_CHAR.test(char)
				) {
					this.tagName += char;
				} else if (this.tagName !== '' && WHITESPACE.test(char)) {
					this.mode = 'afterEndTagName';
				} else if (this.tagName !== '' && char === '>') {
					this.endEndTag();
				} else {
					fail(`Invalid character '${char}' in a closing tag`);
				}
				return;

			case 'afterEndTagName':
				if (char === '>') {
					this.endEndTag();
				} else if (!WHITESPACE.test(char)) {
					fail(`Expected '>' in the closing tag </${this.tagName}>`);
				}
				return;

			case 'markup': {
				this.buffer += char;
				const match = MARKUP.find((markup) =>
					markup.startsWith(this.buffer.toUpperCase()),
				);
				if (match === undefined) {
					fail(
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
					this.entityPosition = this.tagPosition;
					this.count = 0;
					this.mode =
						match === '--'
							? 'comment'
							: match === 'DOCTYPE'
								? 'doctype'
								: 'cdata';
				}
				return;
			}

			case 'comment':
				if (char === '-') {
					this.count++;
				} else {
					if (this.count >= 2) {
						if (char !== '>') {
							fail("'--' is not allowed inside a comment");
						}
						this.mode = 'text';
					}
					this.count = 0;
				}
				return;

			case 'cdata':
				if (char === ']') {
					this.count++;
				} else {
					if (char === '>' && this.count >= 2) {
						this.mode = 'text';
					}
					this.count = 0;
				}
				return;

			case 'doctype':
				if (char === '[') {
					this.count++;
				} else if (char === ']') {
					this.count--;
				} else if (char === '>' && this.count <= 0) {
					this.mode = 'text';
					this.declare('doctype', this.buffer, base + i + 1);
					return;
				}
				this.buffer += char;
				return;

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
					return;
				}
				this.buffer += char;
				this.count = char === '?' ? 1 : 0;
				return;

			case 'entity':
				if (char === ';') {
					if (!ENTITY.test(this.buffer)) {
						throw new XmlSyntaxError(
							this.buffer === ''
								? "'&' has to be escaped as '&amp;'"
								: `Undefined entity '&${this.buffer};', XML only has &amp; &lt; &gt; &quot; &apos;, use a numeric reference like '&#160;' for others`,
							this.entityPosition,
						);
					}
					this.mode = this.entityReturn;
					if (this.mode === 'attrValue') {
						this.attrValue += `${this.buffer};`;
					}
				} else if (ENTITY_CHAR.test(char) && this.buffer.length < 32) {
					this.buffer += char;
				} else {
					throw new XmlSyntaxError(
						"'&' has to be escaped as '&amp;'",
						this.entityPosition,
					);
				}
				return;
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

	private startEntity(from: 'text' | 'attrValue', position: Position): void {
		this.mode = 'entity';
		this.entityReturn = from;
		this.entityPosition = position;
		this.buffer = '';
	}

	private missingValue(fail: (message: string) => never): never {
		return fail(
			`The attribute '${this.attrName}' of <${this.tagName}> has no value, XML requires one: ${this.attrName}='...'`,
		);
	}

	private endAttribute(fail: (message: string) => never): void {
		if (!this.attrDynamic) {
			if (this.attributeNames.has(this.attrName)) {
				fail(`Duplicate attribute '${this.attrName}' in <${this.tagName}>`);
			}
			this.attributeNames.add(this.attrName);
		}
		this.attributes.push({
			name: this.attrName,
			value: this.attrValue,
			quote: this.quote,
			dynamic: this.attrDynamic || this.attrValueDynamic,
			positionOf: positionInSegments(this.attrValueSegments),
		});
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

		if (selfClosing) {
			if (this.stack.length === 0) {
				this.rootClosed = true;
			}
		} else {
			this.stack.push({
				name: this.tagName,
				position: this.tagPosition,
				start: this.tagStart,
			});
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
		this.stack.pop();
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

function positionInSegments(segments: ValueSegment[]) {
	return (index: number): Position => {
		const segment =
			segments.findLast((item) => item.index <= index) ?? segments[0];
		return segment.locate(segment.textIndex + index - segment.index);
	};
}

/** Positions in a single text, computed from the offsets of its line starts. */
export function createLocate(
	text: string,
	start: Position = { line: 1, column: 0 },
): Locate {
	const lineStarts = [0];
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\n') {
			lineStarts.push(i + 1);
		}
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
