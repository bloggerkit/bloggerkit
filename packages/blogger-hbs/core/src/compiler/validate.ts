import {
	createLocate,
	type Locate,
	type Position,
	parseExpressions,
	XmlScanner,
	XmlSyntaxError,
} from '../xml';
import type {
	BlockStatement,
	ContentStatement,
	Node,
	Program,
	Statement,
} from './ast';
import { CompileError } from './errors';

/** Helpers rendering one of their branches once, which can each open a tag. */
const CONDITIONALS = new Set(['if', 'unless']);

/**
 * Checks that the XML of a template is well-formed, taking its Handlebars
 * syntax into account. The template is a fragment: anything can be at its
 * top, but every tag it opens has to be closed.
 *
 * Expressions are accepted where their output can be valid XML: in text, in
 * quoted attribute values and between attributes. The content of a block has
 * to leave the XML as it found it, except for the branches of `{{#if}}` and
 * `{{#unless}}`, which can each open the same tag, so
 * `{{#if a}}<div class='a'>{{else}}<div>{{/if}}` is fine. The content of
 * `{{#import}}`, `{{#> partial}}` and `{{#*inline}}` blocks is rendered
 * elsewhere and checked on its own.
 *
 * Blogger expressions (`b:if cond`, `expr:*`, ...) are parsed with
 * `blogger-expr`, unless their value has Handlebars in it, which is only known
 * once rendered.
 *
 * `label` names the template in errors, a path or the name of a partial.
 */
export function validateTemplateXml(program: Program, label: string): void {
	try {
		validateFragment(program);
	} catch (error) {
		if (error instanceof XmlSyntaxError) {
			const { line, column } = error.position;
			throw new CompileError(
				`Invalid XML in ${label}:${line}:${column + 1}, ${lowerFirst(error.message)}`,
			);
		}
		throw error;
	}
}

function validateFragment(program: Program): void {
	const scanner = new XmlScanner({
		onStartTag: parseExpressions,
	});
	visitProgram(program, scanner);
	scanner.finish(endOf(program));
}

function visitProgram(program: Program, scanner: XmlScanner): void {
	for (const statement of program.body) {
		visitStatement(statement, scanner);
	}
}

function visitStatement(statement: Statement, scanner: XmlScanner): void {
	switch (statement.type) {
		case 'ContentStatement': {
			const content = statement as ContentStatement;
			scanner.feed(content.value, locateContent(content));
			return;
		}

		case 'CommentStatement':
		case 'Decorator':
			return;

		case 'DecoratorBlock':
			// `{{#*inline "name"}}` defines a partial, it renders nothing here
			validateFragment(statement.program);
			return;

		case 'MustacheStatement':
		case 'PartialStatement':
			scanner.unknown(startOf(statement), describe(statement));
			return;

		case 'PartialBlockStatement':
			if (statement.type === 'PartialBlockStatement') {
				validateFragment(statement.program);
			}
			scanner.unknown(startOf(statement), describe(statement));
			return;

		case 'BlockStatement':
			visitBlock(statement as BlockStatement, scanner);
			return;
	}
}

function visitBlock(block: BlockStatement, scanner: XmlScanner): void {
	const name = block.path.original;

	// rendered by the imported template, in place of `{{> @partial-block}}`
	if (name === 'import') {
		validateFragment(block.program);
		scanner.unknown(startOf(block), describe(block));
		return;
	}

	const start = scanner.clone();
	const program = start.clone();
	visitProgram(block.program, program);

	const inverse = start.clone();
	if (block.inverse) {
		visitProgram(block.inverse, inverse);
	}

	const label = `'{{#${name}}}' block`;

	if (CONDITIONALS.has(name)) {
		// one of the branches renders, so they only have to end the same way
		if (program.signature() !== inverse.signature()) {
			const [changed, part, other] =
				program.signature() !== start.signature()
					? [program, 'content', "its '{{else}}' content"]
					: [inverse, "'{{else}}' content", 'its content'];
			const fix = block.inverse
				? `${other} has to do the same`
				: `close it inside the block, or add an '{{else}}' doing the same`;
			throw new XmlSyntaxError(
				`The ${part} of the ${label} ${changed.describeChange(start)}, ${fix}`,
				startOf(block),
			);
		}
	} else {
		// a block can render its content any number of times
		for (const [end, part] of [
			[program, 'content'],
			[inverse, "'{{else}}' content"],
		] as const) {
			if (end.signature() !== start.signature()) {
				throw new XmlSyntaxError(
					`The ${part} of the ${label} has to keep the XML as it is, but it ${end.describeChange(start)}`,
					startOf(block),
				);
			}
		}
	}

	scanner.assign(program);
	// a block in an attribute value renders what is in it, or not
	scanner.dynamicValue();
}

function locateContent(content: ContentStatement): Locate {
	// stripped whitespace is left out of the value, the location is of the original
	const offset = Math.max(0, content.original.indexOf(content.value));
	const locate = createLocate(content.original, startOf(content));
	return (index) => locate(offset + index);
}

function startOf(node: Node): Position {
	const start = node.loc?.start;
	return start
		? { line: start.line, column: start.column }
		: { line: 1, column: 0 };
}

function endOf(node: Node): Position {
	const end = node.loc?.end;
	return end ? { line: end.line, column: end.column } : { line: 1, column: 0 };
}

function describe(statement: Statement): string {
	switch (statement.type) {
		case 'MustacheStatement':
			return `'{{${expression(statement.path)}}}'`;
		case 'PartialStatement':
			return `'{{> ${expression(statement.name)}}}'`;
		case 'PartialBlockStatement':
			return `'{{#> ${expression(statement.name)}}}'`;
		case 'BlockStatement':
			return `'{{#${statement.path.original}}}'`;
		default:
			return 'The expression';
	}
}

function expression(node: Node): string {
	if (node.type === 'PathExpression') {
		return node.original;
	}
	if (node.type === 'SubExpression') {
		return `(${node.path.original} ...)`;
	}
	return 'value' in node ? String(node.value) : node.type;
}

function lowerFirst(text: string): string {
	return /^[A-Z][a-z]/.test(text)
		? text[0].toLowerCase() + text.slice(1)
		: text;
}
