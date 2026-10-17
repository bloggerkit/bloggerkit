import { ATTRIBUTE_NAME_REGEX, OUTPUT_FLAGS } from '../../constants';
import type {
	BlockStatement,
	Expression,
	MustacheStatement,
	Node,
	PathExpression,
	SubExpression,
} from './types';
import { walk } from './walk';

const ASSET_KEYS = new Set(['script', 'style']);
const ASSET_ATTRIBUTE_REGEX = /^(?:script|style):(.+)$/s;

interface Location {
	start: [number, number];
	end: [number, number];
	node: ImportNode;
}

export interface ValidImport extends Location {
	valid: true;
	specifier: string;
	dependsOn: string[];
	hashKeys: string[];
}

export interface InvalidImport extends Location {
	valid: false;
	reason: string;
}

export type Import = ValidImport | InvalidImport;

export function extractImports(node: Node): Import[] {
	const imports: Import[] = [];

	for (const importNode of extractImportNodes(node)) {
		const { params, loc, hash } = importNode;
		const location: Location = {
			start: [loc.start.line, loc.start.column],
			end: [loc.end.line, loc.end.column],
			node: importNode,
		};

		const invalid = (reason: string): void => {
			imports.push({
				...location,
				valid: false,
				reason,
			});
		};

		if (params.length === 0) {
			invalid("'import' expects a string literal argument");
			continue;
		}

		if (params.length > 1) {
			invalid("'import' accepts only one argument");
			continue;
		}

		const specifier = params[0];
		if (specifier.type !== 'StringLiteral') {
			invalid("First argument to 'import' must be a string literal");
			continue;
		}

		let dependsOn: string[] = [];
		const hashKeys: string[] = [];
		const seenKeys = new Set<string>();
		let reason: string | undefined;

		for (const { key, value } of hash?.pairs || []) {
			if (seenKeys.has(key)) {
				reason = `'import' option '${key}' was specified more than once`;
				break;
			}

			seenKeys.add(key);

			if (key === 'depends-on') {
				if (value.type !== 'StringLiteral') {
					reason = "'import' 'depends-on' must be a string literal";
					break;
				}
				dependsOn = value.value
					.split(',')
					.map((item) => item.trim())
					.filter(Boolean);
				// an empty list would let the option pass where it is not supported
				if (dependsOn.length === 0) {
					reason =
						"'import' 'depends-on' must list at least one script or style";
					break;
				}
				continue;
			}

			if (OUTPUT_FLAGS.has(key)) {
				if (!isFlagValue(value)) {
					reason = `'import' option '${key}' must be true, 'true' or '', got: ${describeValue(value)}`;
					break;
				}
				hashKeys.push(key);
				continue;
			}

			if (ASSET_KEYS.has(key) || isAssetAttribute(key)) {
				hashKeys.push(key);
				continue;
			}

			reason = `'import' received an invalid option '${key}'`;
			break;
		}

		// raw output has no tag, so there is nothing other options could apply to,
		// and the options of the tag left out by `only` would be ignored
		const flag = hashKeys.find((key) => OUTPUT_FLAGS.has(key));
		const mode = flag === undefined ? undefined : OUTPUT_FLAGS.get(flag);
		if (reason === undefined && flag !== undefined && mode !== undefined) {
			const omitted = mode.tag === 'script' ? 'style' : 'script';
			const conflict = hashKeys.find(
				(key) =>
					key !== flag &&
					(mode.raw ||
						OUTPUT_FLAGS.has(key) ||
						key === omitted ||
						key.startsWith(`${omitted}:`)),
			);
			if (conflict !== undefined) {
				reason = `'import' option '${flag}' cannot be combined with '${conflict}'`;
			}
		}

		if (reason !== undefined) {
			invalid(reason);
			continue;
		}

		imports.push({
			...location,
			valid: true,
			specifier: specifier.value,
			dependsOn,
			hashKeys,
		});
	}

	return imports;
}

function extractImportNodes(node: Node): ImportNode[] {
	const nodes: ImportNode[] = [];
	walk(node, (node) => {
		if (isImportNode(node)) {
			nodes.push(node);
		}
	});
	return nodes;
}

export type ImportNode = (
	| MustacheStatement
	| BlockStatement
	| SubExpression
) & {
	path: PathExpression;
};

export function isImportNode(node: Node): node is ImportNode {
	return (
		(node.type === 'MustacheStatement' ||
			node.type === 'BlockStatement' ||
			node.type === 'SubExpression') &&
		node.path.type === 'PathExpression' &&
		node.path.parts.length === 1 &&
		node.path.parts[0] === 'import'
	);
}

/** `script:raw` / `style:raw` / `script:only` / `style:only` take `true`, `'true'` or an empty string. */
function isFlagValue(value: Expression): boolean {
	return (
		(value.type === 'BooleanLiteral' && value.value) ||
		(value.type === 'StringLiteral' &&
			(value.value === 'true' || value.value === ''))
	);
}

function describeValue(value: Expression): string {
	switch (value.type) {
		case 'StringLiteral':
			return `'${value.value}'`;
		case 'BooleanLiteral':
		case 'NumberLiteral':
			return String(value.value);
		case 'NullLiteral':
			return 'null';
		case 'UndefinedLiteral':
			return 'undefined';
		case 'PathExpression':
			return `variable '${value.original}'`;
		case 'SubExpression':
			return `subexpression '${value.path.original}'`;
	}
}

function isAssetAttribute(key: string): boolean {
	const name = ASSET_ATTRIBUTE_REGEX.exec(key)?.[1];
	return name !== undefined && ATTRIBUTE_NAME_REGEX.test(name);
}
