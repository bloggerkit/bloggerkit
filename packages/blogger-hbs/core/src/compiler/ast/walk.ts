import type { Node } from './types';

export function walk(node: Node, callback: (node: Node) => void): void {
	callback(node);

	switch (node.type) {
		case 'Program':
			for (const statement of node.body) {
				walk(statement, callback);
			}
			break;

		case 'MustacheStatement':
			walk(node.path, callback);
			for (const param of node.params) {
				walk(param, callback);
			}
			if (node.hash) {
				walk(node.hash, callback);
			}
			break;

		case 'BlockStatement':
			walk(node.path, callback);
			for (const param of node.params) {
				walk(param, callback);
			}
			if (node.hash) {
				walk(node.hash, callback);
			}
			walk(node.program, callback);

			if (node.inverse) {
				walk(node.inverse, callback);
			}
			break;

		case 'PartialStatement':
			walk(node.name, callback);
			for (const param of node.params) {
				walk(param, callback);
			}
			if (node.hash) {
				walk(node.hash, callback);
			}
			break;

		case 'PartialBlockStatement':
			walk(node.name, callback);
			for (const param of node.params) {
				walk(param, callback);
			}
			if (node.hash) {
				walk(node.hash, callback);
			}
			walk(node.program, callback);
			break;

		case 'SubExpression':
			walk(node.path, callback);
			for (const param of node.params) {
				walk(param, callback);
			}
			if (node.hash) {
				walk(node.hash, callback);
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

export * from './types';
