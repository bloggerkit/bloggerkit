import { forEachChild, isPath, type Node, type Root } from './ast';
import type { Span } from './source';

/** The most nodes an expression, and each index inside it, may have. */
export const COST_LIMIT = 40;

/** From how many nodes an expression is reported as close to the limit. */
export const COST_WARNING = 35;

/**
 * The size of an expression as Blogger counts it.
 *
 * Each literal, data path, parentheses, operator, `?:`, list, map,
 * property of a non-path value (properties in a row together), call and
 * `take`/`skip` is 1, plus what it
 * contains; the ternary is 2, a lambda 3. A data path is 1 whatever its length,
 * with its properties and indexes; the expression of an index is counted on its
 * own, see `indexCosts`. Map keys and characters are not counted.
 */
export function cost(node: Root): number {
	if (node.type !== 'LoopRange' && isPath(node)) {
		return 1;
	}
	switch (node.type) {
		case 'NumberLiteral':
		case 'StringLiteral':
		case 'BooleanLiteral':
			return 1;
		case 'PlusChain':
			// a + b + c counts as (a + b) + c: one node per `+`
			return sum(node.operands) + node.operators.length;
		case 'Conditional':
			return (
				2 + cost(node.condition) + cost(node.whenTrue) + cost(node.whenFalse)
			);
		case 'LambdaOperation':
			return 3 + cost(node.list) + cost(node.body);
		case 'PropertyAccess':
			// properties in a row count once: `([1]).first.size` is 1 + `([1])`
			return node.object.type === 'PropertyAccess' && !isPath(node.object)
				? cost(node.object)
				: 1 + cost(node.object);
		default: {
			let total = 1;
			forEachChild(node, (child) => {
				total += cost(child);
			});
			return total;
		}
	}
}

/** The cost of the expression of each `[index]`, which has its own limit. */
export function indexCosts(node: Root): { span: Span; cost: number }[] {
	const result: { span: Span; cost: number }[] = [];
	const visit = (n: Root) => {
		if (n.type === 'IndexAccess') {
			result.push({ span: n.index.span, cost: cost(n.index) });
		}
		forEachChild(n, visit);
	};
	visit(node);
	return result;
}

function sum(nodes: Node[]): number {
	return nodes.reduce((total, n) => total + cost(n), 0);
}
