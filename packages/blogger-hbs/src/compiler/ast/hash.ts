import type { BlockStatement, MustacheStatement, SubExpression } from './types';

export function setHashString(
	node: MustacheStatement | BlockStatement | SubExpression,
	key: string,
	value: string,
): void {
	const { loc } = node;
	node.hash ??= { type: 'Hash', pairs: [], loc };
	node.hash.pairs.push({
		type: 'HashPair',
		key,
		value: { type: 'StringLiteral', value, original: value, loc },
		loc,
	});
}
