import type { Node } from './ast';
import { FIXED_BUILTINS } from './builtins';
import { parse } from './parser';
import { plain, RichValue, type Value } from './values';

export class EvaluateError extends Error {
	constructor(
		message: string,
		public readonly node: Node,
	) {
		super(message);
		this.name = 'EvaluateError';
	}
}

export interface EvaluatorOptions {
	/** Root object reachable via `data:...`. */
	data?: Record<string, unknown>;
	/**
	 * When true, accessing a missing property/index throws `EvaluateError` instead of
	 * yielding `null`. Blogger's own renderer is lenient (missing data just emits
	 * nothing), so this defaults to `false`.
	 */
	strict?: boolean;
}

export class Evaluator {
	private readonly data: Record<string, unknown>;
	private readonly strict: boolean;
	/** Lambda-bound variables for `filter`/`map`/`any`/`all`/`none`, innermost last. */
	private readonly scopes: Record<string, Value>[] = [];

	constructor(options: EvaluatorOptions = {}) {
		this.data = options.data ?? {};
		this.strict = options.strict ?? false;
	}

	/** Looks up a lambda-bound name in the innermost-first scope chain. */
	private lookupScope(
		name: string,
	): { found: true; value: Value } | { found: false } {
		for (let i = this.scopes.length - 1; i >= 0; i--) {
			const scope = this.scopes[i] as Record<string, Value>;
			if (Object.hasOwn(scope, name)) {
				return { found: true, value: scope[name] as Value };
			}
		}
		return { found: false };
	}

	evaluate(node: Node): Value {
		switch (node.type) {
			case 'StringLiteral':
				return node.value;
			case 'NumberLiteral':
				return node.value;
			case 'BooleanLiteral':
				return node.value;

			case 'ListLiteral':
			case 'SetLiteral':
				return node.elements.map((el) => this.evaluate(el));

			case 'MapLiteral': {
				const obj: Record<string, Value> = {};
				for (const entry of node.entries) {
					obj[entry.key] = this.evaluate(entry.value);
				}
				return obj;
			}

			case 'EmptyDataReference':
				return null;
			case 'DataReference': {
				// Templates observed in the wild reference the current lambda
				// variable both bare (`l.name`) and as `data:l.name` interchangeably,
				// so lambda scope takes priority over the root data object.
				const scoped = this.lookupScope(node.name);
				if (scoped.found) {
					return scoped.value;
				}
				return this.orNull(this.data[node.name], node);
			}

			case 'Identifier': {
				// The parser only ever produces an `Identifier` node for a
				// currently-in-scope lambda parameter (everything else is a parse
				// error), so this should always resolve. The throw below is a
				// defensive fallback, not an expected runtime path.
				const scoped = this.lookupScope(node.name);
				if (scoped.found) {
					return scoped.value;
				}
				throw new EvaluateError(`'${node.name}' is not in scope`, node);
			}

			case 'MemberExpression': {
				const obj = this.evaluate(node.object);
				return this.getProperty(obj, node.property, node);
			}

			case 'IndexExpression': {
				const obj = plain(this.evaluate(node.object));
				const index = plain(this.evaluate(node.index));
				return this.evaluateIndex(obj, index, node);
			}

			case 'CallExpression':
				return this.evaluateCall(node);

			case 'UnaryExpression': {
				// `!` is the only one, a tree made by hand can have another
				const { operator } = node as { operator: unknown };
				if (operator !== '!') {
					throw new EvaluateError(
						`Unknown unary operator '${String(operator)}'`,
						node,
					);
				}
				return !isTruthy(this.evaluate(node.argument));
			}

			case 'BinaryExpression':
				return this.evaluateBinary(node);

			case 'LogicalExpression': {
				const left = this.evaluate(node.left);
				if (node.operator === 'and') {
					return isTruthy(left) ? this.evaluate(node.right) : left;
				}
				return isTruthy(left) ? left : this.evaluate(node.right);
			}

			case 'MembershipExpression': {
				const result = this.evaluateMembership(node);
				return node.negated ? !result : result;
			}

			case 'ConditionalExpression':
				return isTruthy(this.evaluate(node.test))
					? this.evaluate(node.consequent)
					: this.evaluate(node.alternate);

			case 'ElvisExpression': {
				const left = this.evaluate(node.left);
				return left === null || left === undefined
					? this.evaluate(node.right)
					: left;
			}

			case 'LambdaExpression':
				return this.evaluateLambda(node);

			case 'NamedOperatorExpression': {
				const fn = FIXED_BUILTINS[node.operator];
				return fn(this.evaluate(node.left), this.evaluate(node.right));
			}

			default: {
				const exhaustive: never = node;
				throw new EvaluateError(
					`Unknown node type ${(exhaustive as Node).type}`,
					node,
				);
			}
		}
	}

	private evaluateCall(node: Extract<Node, { type: 'CallExpression' }>): Value {
		const args = node.args.map((a) => this.evaluate(a));
		const fn = FIXED_BUILTINS[node.callee];
		return fn(...args);
	}

	private evaluateBinary(
		node: Extract<Node, { type: 'BinaryExpression' }>,
	): Value {
		const { operator } = node;
		const left = plain(this.evaluate(node.left));
		const right = plain(this.evaluate(node.right));

		switch (operator) {
			case '+':
				// strings are joined, anything else is added as numbers
				if (typeof left === 'string' || typeof right === 'string') {
					return this.stringify(left) + this.stringify(right);
				}
				return (
					this.toNumber(left, node.left) + this.toNumber(right, node.right)
				);
			case '-':
			case '*':
			case '/':
			case '%':
				return arithmetic(
					operator,
					this.toNumber(left, node.left),
					this.toNumber(right, node.right),
				);
			case '==':
				return valuesEqual(left, right);
			case '!=':
				return !valuesEqual(left, right);
			case '<':
			case '>':
			case '<=':
			case '>=':
				return this.compare(operator, left, right, node);
			default: {
				const exhaustive: never = operator;
				throw new EvaluateError(
					`Unknown binary operator ${exhaustive as string}`,
					node,
				);
			}
		}
	}

	private compare(
		op: '<' | '>' | '<=' | '>=',
		left: Value,
		right: Value,
		node: Node,
	): boolean {
		let l: number | string;
		let r: number | string;
		if (typeof left === 'number' && typeof right === 'number') {
			l = left;
			r = right;
		} else if (typeof left === 'string' && typeof right === 'string') {
			l = left;
			r = right;
		} else {
			l = this.toNumber(left, node);
			r = this.toNumber(right, node);
		}
		switch (op) {
			case '<':
				return l < r;
			case '>':
				return l > r;
			case '<=':
				return l <= r;
			case '>=':
				return l >= r;
		}
	}

	private evaluateMembership(
		node: Extract<Node, { type: 'MembershipExpression' }>,
	): boolean {
		// `left in right` and `right contains left` share the same underlying test:
		// is `item` a member of `collection`? The item is evaluated first.
		const [item, collection] = (
			node.operator === 'in'
				? [this.evaluate(node.left), this.evaluate(node.right)]
				: [this.evaluate(node.right), this.evaluate(node.left)]
		).map(plain);

		if (typeof collection === 'string') {
			return typeof item === 'string' && collection.includes(item);
		}
		if (Array.isArray(collection)) {
			return collection.some((el) => valuesEqual(el, item));
		}
		if (collection && typeof collection === 'object') {
			return typeof item === 'string' && Object.hasOwn(collection, item);
		}
		if (this.strict) {
			throw new EvaluateError(
				"'in'/'contains' requires a string, list, or map",
				node,
			);
		}
		return false;
	}

	private evaluateLambda(
		node: Extract<Node, { type: 'LambdaExpression' }>,
	): Value {
		const source = plain(this.evaluate(node.source));
		const list = Array.isArray(source)
			? source
			: this.coerceToList(source, node);

		const runBody = (item: Value): Value => {
			this.scopes.push({ [node.param]: item });
			try {
				return this.evaluate(node.body);
			} finally {
				this.scopes.pop();
			}
		};

		switch (node.operator) {
			case 'filter':
				return list.filter((item) => isTruthy(runBody(item)));
			case 'map':
				return list.map((item) => runBody(item));
			case 'any':
				return list.some((item) => isTruthy(runBody(item)));
			case 'all':
				return list.every((item) => isTruthy(runBody(item)));
			case 'none':
				return !list.some((item) => isTruthy(runBody(item)));
			default: {
				const exhaustive: never = node.operator;
				throw new EvaluateError(
					`Unknown lambda operator ${exhaustive as string}`,
					node,
				);
			}
		}
	}

	private coerceToList(source: Value, node: Node): Value[] {
		if (source === null || source === undefined) {
			if (this.strict) {
				throw new EvaluateError(
					'Lambda operator requires a list, got null',
					node,
				);
			}
			return [];
		}
		throw new EvaluateError('Lambda operator requires a list', node);
	}

	/**
	 * Index access (`data:x[i]`) only works on arrays — `data:blog["title"]` is a
	 * type error even though `blog` is data-rooted, because `blog` is a map, and
	 * maps only support dot notation. A numeric-looking string index (`x["0"]`)
	 * is accepted, same as a bare number.
	 */
	private evaluateIndex(obj: Value, index: Value, node: Node): Value {
		if (obj === null || obj === undefined) {
			if (this.strict) {
				throw new EvaluateError('Cannot index null/undefined', node);
			}
			return null;
		}
		if (!Array.isArray(obj)) {
			throw new EvaluateError(
				"Index access '[...]' is only supported on arrays; use '.' for map properties",
				node,
			);
		}
		let idx: number;
		if (typeof index === 'number') {
			idx = index;
		} else if (typeof index === 'string' && /^-?\d+$/.test(index)) {
			idx = Number(index);
		} else {
			throw new EvaluateError(
				'Array index must be a number (or numeric string)',
				node,
			);
		}
		if (!Number.isInteger(idx)) {
			throw new EvaluateError('Array index must be an integer', node);
		}
		return this.orNull(obj[idx], node);
	}

	/**
	 * The built-in properties first, `.length`, `.first`, `.last` and the
	 * items of a list, then those of a `RichValue`.
	 */
	private getProperty(rich: Value, property: string, node: Node): Value {
		const obj = plain(rich);
		const own = () =>
			rich instanceof RichValue ? rich.property(property) : undefined;

		if (obj === null || obj === undefined) {
			if (this.strict) {
				throw new EvaluateError(
					`Cannot read property '${property}' of null`,
					node,
				);
			}
			return null;
		}
		if (Array.isArray(obj)) {
			if (property === 'length') {
				return obj.length;
			}
			if (property === 'first') {
				return obj.length > 0 ? (obj[0] as Value) : null;
			}
			if (property === 'last') {
				return obj.length > 0 ? (obj[obj.length - 1] as Value) : null;
			}
			const idx = Number(property);
			if (Number.isInteger(idx)) {
				return this.orNull(obj[idx], node);
			}
			return own() ?? null;
		}
		if (typeof obj === 'object') {
			return this.orNull((obj as Record<string, Value>)[property], node);
		}
		if (typeof obj === 'string' && property === 'length') {
			return obj.length;
		}
		const value = own();
		if (value !== undefined) {
			return value;
		}
		if (this.strict) {
			throw new EvaluateError(
				`Cannot read property '${property}' of ${typeof obj}`,
				node,
			);
		}
		return null;
	}

	/** `null` for a missing value, an error with `strict`. */
	private orNull(v: unknown, node: Node): Value {
		if (v === undefined) {
			if (this.strict) {
				throw new EvaluateError('Value is undefined', node);
			}
			return null;
		}
		return v as Value;
	}

	private toNumber(v: Value, node: Node): number {
		if (typeof v === 'number') {
			return v;
		}
		if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
			return Number(v);
		}
		if (typeof v === 'boolean') {
			return v ? 1 : 0;
		}
		if (this.strict) {
			throw new EvaluateError(
				`Cannot coerce ${JSON.stringify(v)} to a number`,
				node,
			);
		}
		return Number.NaN;
	}

	private stringify(v: Value): string {
		if (v === null) {
			return '';
		}
		if (typeof v === 'string') {
			return v;
		}
		if (typeof v === 'number' || typeof v === 'boolean') {
			return String(v);
		}
		return JSON.stringify(v);
	}
}

export function isTruthy(value: Value): boolean {
	const v = plain(value);
	if (v === null || v === undefined) {
		return false;
	}
	if (typeof v === 'boolean') {
		return v;
	}
	if (typeof v === 'number') {
		return v !== 0 && !Number.isNaN(v);
	}
	if (typeof v === 'string') {
		return v.length > 0;
	}
	// a list or a map, even empty
	return true;
}

function arithmetic(
	operator: '-' | '*' | '/' | '%',
	left: number,
	right: number,
): number {
	switch (operator) {
		case '-':
			return left - right;
		case '*':
			return left * right;
		case '/':
			return left / right;
		case '%':
			return left % right;
	}
}

export function valuesEqual(left: Value, right: Value): boolean {
	const a = plain(left);
	const b = plain(right);
	if (a === b) {
		return true;
	}
	if (a === null || b === null) {
		return a === b;
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		return (
			a.length === b.length && a.every((v, i) => valuesEqual(v, b[i] as Value))
		);
	}
	if (
		typeof a === 'object' &&
		typeof b === 'object' &&
		!Array.isArray(a) &&
		!Array.isArray(b)
	) {
		const aKeys = Object.keys(a);
		const bKeys = Object.keys(b);
		if (aKeys.length !== bKeys.length) {
			return false;
		}
		return aKeys.every((k) =>
			valuesEqual(
				(a as Record<string, Value>)[k] as Value,
				(b as Record<string, Value>)[k] as Value,
			),
		);
	}
	// Loose numeric/string equality
	if (typeof a === 'number' && typeof b === 'string') {
		return String(a) === b;
	}
	if (typeof a === 'string' && typeof b === 'number') {
		return a === String(b);
	}
	return false;
}

/** Evaluates a parsed Blogger expression AST. */
export function evaluateNode(node: Node, options?: EvaluatorOptions): Value {
	return new Evaluator(options).evaluate(node);
}

/**
 * Parses and evaluates a Blogger expression in a single step.
 *
 * Example:
 *
 * ```ts
 * evaluate('data:skin.vars.feature_status == "2px" and !data:view.isError', {
 *   data: {
 *     skin: { vars: { feature_status: "2px" } },
 *     view: { isError: false }
 *   },
 * }); // => true
 * ```
 */
export function evaluate(
	source: string | Node,
	options: EvaluatorOptions = {},
): Value {
	const ast: Node = typeof source === 'string' ? parse(source) : source;
	return new Evaluator(options).evaluate(ast);
}
