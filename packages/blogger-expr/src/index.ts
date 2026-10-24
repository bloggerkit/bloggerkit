import type { Root } from './ast';
import { check } from './checker';
import { COST_LIMIT, COST_WARNING, cost, indexCosts } from './cost';
import { type Diagnostic, diagnostic, ExpressionError } from './diagnostics';
import { type EvaluateOptions, evaluateNode } from './evaluator';
import { type ExpressionContext, parseTokens, SyntaxFailure } from './parser';
import type { Value } from './values';

export type * from './ast';
export { childrenOf, forEachChild, isPath, nameOf, unwrap } from './ast';
export { COST_LIMIT, cost, indexCosts } from './cost';
export type { Diagnostic, DiagnosticCode, Severity } from './diagnostics';
export { ExpressionError, formatDiagnostic } from './diagnostics';
export type { EvaluateOptions } from './evaluator';
export type { ExpressionContext } from './parser';
export { type PrintOptions, print } from './printer';
export type { Span } from './source';
export { type TextOptions, toText } from './text';
export {
	Decimal,
	isTruthy,
	RichValue,
	TextBoolean,
	type Value,
	type ValueMap,
} from './values';

export interface ParseOptions {
	/** `loop-values` for the `values` of `<b:loop>`, where ranges are allowed. Default `expression`. */
	context?: ExpressionContext;
}

export interface ParseResult {
	source: string;
	/** The tree; `undefined` when the expression could not be read. */
	ast: Root | undefined;
	/** The size of the expression, see `cost`; `undefined` without a tree. */
	cost: number | undefined;
	/** Why the expression is not accepted. Empty when it is. */
	errors: Diagnostic[];
	/** What is accepted but may not do what it looks like, with the way to write it. */
	warnings: Diagnostic[];
}

/** Reads an expression: its tree, its cost, its errors and warnings. Never throws. */
export function parse(source: string, options: ParseOptions = {}): ParseResult {
	let ast: Root;
	try {
		ast = parseTokens(source, options.context ?? 'expression');
	} catch (error) {
		if (!(error instanceof SyntaxFailure)) {
			throw error;
		}
		return {
			source,
			ast: undefined,
			cost: undefined,
			errors: [
				diagnostic(source, 'error', error.code, error.span, error.detail),
			],
			warnings: [],
		};
	}
	const errors: Diagnostic[] = [];
	const warnings: Diagnostic[] = [];
	for (const finding of check(ast, source)) {
		(finding.severity === 'error' ? errors : warnings).push(
			diagnostic(
				source,
				finding.severity,
				finding.code,
				finding.span,
				finding.detail,
			),
		);
	}
	const total = cost(ast);
	if (total > COST_LIMIT) {
		errors.push(
			diagnostic(source, 'error', 'too-complex', ast.span, {
				cost: String(total),
			}),
		);
	} else if (total >= COST_WARNING) {
		warnings.push(
			diagnostic(source, 'warning', 'near-limit', ast.span, {
				cost: String(total),
			}),
		);
	}
	for (const index of indexCosts(ast)) {
		if (index.cost > COST_LIMIT) {
			errors.push(
				diagnostic(source, 'error', 'too-complex', index.span, {
					cost: String(index.cost),
				}),
			);
		}
	}
	errors.sort((a, b) => a.span.start - b.span.start);
	warnings.sort((a, b) => a.span.start - b.span.start);
	return { source, ast, cost: total, errors, warnings };
}

/**
 * The value of an expression for the data: a `Decimal`, a string, a
 * boolean, a list, a map, a `Date`, a `RichValue`, or `undefined` for missing
 * data. `toText(value)` writes it as Blogger prints it. Throws
 * `ExpressionError` for an expression that is not accepted or can not be
 * computed with this data.
 */
export function evaluate(
	expression: string | ParseResult,
	options: EvaluateOptions = {},
): Value {
	const parsed =
		typeof expression === 'string' ? parse(expression) : expression;
	const [error] = parsed.errors;
	if (error || !parsed.ast) {
		throw new ExpressionError(error as Diagnostic);
	}
	return evaluateNode(parsed.source, parsed.ast, options);
}
