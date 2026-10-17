import type { Node } from './types';

/** Calls `callback` with `node` and every node in it, parents first. */
export function walk(node: Node, callback: (node: Node) => void): void {
	callback(node);

	switch (node.type) {
		case 'Program':
			for (const statement of node.body) {
				walk(statement, callback);
			}
			break;

		// a call: its name, its arguments and its hash, and the blocks of a block
		case 'MustacheStatement':
		case 'Decorator':
		case 'SubExpression':
		case 'BlockStatement':
		case 'DecoratorBlock':
		case 'PartialStatement':
		case 'PartialBlockStatement':
			walk('path' in node ? node.path : node.name, callback);
			for (const param of node.params) {
				walk(param, callback);
			}
			if (node.hash) {
				walk(node.hash, callback);
			}
			if ('program' in node && node.program) {
				walk(node.program, callback);
			}
			if ('inverse' in node && node.inverse) {
				walk(node.inverse, callback);
			}
			break;

		case 'Hash':
			for (const pair of node.pairs) {
				walk(pair, callback);
			}
			break;

		case 'HashPair':
			walk(node.value, callback);
			break;
	}
}
