import { promisify, styleText } from 'node:util';
import { gzip as gzipCallback } from 'node:zlib';
import type { CompiledTemplate } from '../compiler';
import type { XmlInfo } from '../xml';

export interface WrittenFile {
	/** As shown, relative to the working directory. */
	path: string;
	content: string;
}

export interface BuildStats {
	files: { path: string; size: number; gzip: number }[];
	/** What the rendered theme is made of, when it is validated. */
	theme?: {
		path: string;
		scripts: { count: number; size: number };
		styles: { count: number; size: number };
		markup: number;
		templates: number;
		partials: number;
		sections: number;
		widgets: number;
	};
}

const gzip = promisify(gzipCallback);

const bytes = (text: string): number => Buffer.byteLength(text);

/** How much of `theme` the pieces of code take, each piece as often as it is in it. */
function inlineSize(
	theme: string,
	codes: Iterable<string | undefined>,
): number {
	let size = 0;
	for (const code of new Set([...codes].map((item) => item?.trim()))) {
		if (code) {
			size += (theme.split(code).length - 1) * bytes(code);
		}
	}
	return size;
}

/**
 * The sizes of the files written, and what the theme is made of when it is
 * validated: its scripts and styles from the chunks, its sections and
 * widgets from `inspectXml`.
 */
export async function collectStats(
	compiled: CompiledTemplate,
	files: readonly WrittenFile[],
	theme?: WrittenFile & { info: XmlInfo },
): Promise<BuildStats> {
	const stats: BuildStats = {
		files: await Promise.all(
			files.map(async ({ path, content }) => ({
				path,
				size: bytes(content),
				gzip: (await gzip(content)).length,
			})),
		),
	};
	if (theme === undefined) {
		return stats;
	}

	const chunks = [...compiled.chunks.values()];
	const scripts = chunks.filter((chunk) => chunk.type === 'script');
	const styles = chunks.filter((chunk) => chunk.type === 'style');
	const runtimes = chunks.filter((chunk) => chunk.type === 'runtime');
	const xml = theme.content;

	const scriptSize = inlineSize(
		xml,
		[...scripts, ...runtimes].map((chunk) => chunk.code),
	);
	const styleSize = inlineSize(xml, [
		...styles.map((chunk) => chunk.code),
		...scripts.map((chunk) => chunk.css),
	]);

	stats.theme = {
		path: theme.path,
		scripts: { count: scripts.length, size: scriptSize },
		styles: { count: styles.length, size: styleSize },
		markup: Math.max(0, bytes(xml) - scriptSize - styleSize),
		templates: chunks.filter((chunk) => chunk.type === 'template').length,
		partials: compiled.pluginPartials.size,
		sections: theme.info.sections.length,
		widgets: theme.info.widgets.length,
	};
	return stats;
}

/** `950 B`, `82.4 kB`, `1.20 MB`, in units of 1000 bytes. */
export function formatSize(size: number): string {
	if (size < 1000) {
		return `${size} B`;
	}
	return size < 1_000_000
		? `${(size / 1000).toFixed(1)} kB`
		: `${(size / 1_000_000).toFixed(2)} MB`;
}

/** `+1.2 kB`, `-12 B`, nothing when it is the same, colored by the table. */
function formatSizeChange(size: number, previous: number | undefined): string {
	if (previous === undefined || size === previous) {
		return '';
	}
	const change = size - previous;
	return `${change > 0 ? '+' : '-'}${formatSize(Math.abs(change))}`;
}

/** `+1`, `-2`, nothing when it is the same. */
function formatCountChange(
	count: number,
	previous: number | undefined,
): string {
	if (previous === undefined || count === previous) {
		return '';
	}
	return `${count > previous ? '+' : '-'}${Math.abs(count - previous)}`;
}

/** The cells of a row, its count and size with their changes, empty when it has none. */
function row(
	label: string,
	count?: number,
	previousCount?: number,
	size?: number,
	previousSize?: number,
): string[] {
	return [
		label,
		count === undefined ? '' : String(count),
		count === undefined ? '' : formatCountChange(count, previousCount),
		size === undefined ? '' : formatSize(size),
		size === undefined ? '' : formatSizeChange(size, previousSize),
	];
}

/** `dist/` dim and `theme.xml` cyan, the padding after it as it is. */
function colorPath(text: string): string {
	const slash = text.lastIndexOf('/') + 1;
	const name = text.slice(slash).trimEnd();
	return (
		styleText('dim', text.slice(0, slash)) +
		styleText('cyan', name) +
		text.slice(slash + name.length)
	);
}

type Align = 'left' | 'right';

/**
 * Rows of cells padded to columns, colored once padded. A row ends at its
 * last cell with something in it, so no line ends in spaces, colored or not.
 */
function table(
	rows: string[][],
	align: Align[],
	color: (row: number, column: number, text: string) => string = (
		_row,
		_column,
		text,
	) => text,
): string[] {
	const widths = align.map((_, column) =>
		Math.max(...rows.map((row) => (row[column] ?? '').length)),
	);
	return rows.map((row, i) => {
		const last = row.findLastIndex((cell) => cell !== '');
		const cells = row
			.slice(0, last + 1)
			.map((cell, column) => {
				// a column empty in every row is left out, with its gap
				if (widths[column] === 0) {
					return undefined;
				}
				const left = align[column] === 'left';
				// the last cell is not padded after its text
				const width = left && column === last ? 0 : widths[column];
				return color(
					i,
					column,
					left ? cell.padEnd(width) : cell.padStart(width),
				);
			})
			.filter((cell) => cell !== undefined);
		return `  ${cells.join('  ')}`;
	});
}

/**
 * The tables of the files written and of what the theme is made of. A size
 * is followed by its change since `previous`, by path.
 */
export function formatStats(
	{ files, theme }: BuildStats,
	previous: ReadonlyMap<string, number> = new Map(),
	/**
	 * What the theme was made of at the last build, for the change of every
	 * count and size since.
	 */
	{ previousTheme }: { previousTheme?: BuildStats['theme'] } = {},
): string {
	const dim = (text: string) => styleText('dim', text);
	const bold = (text: string) => styleText('bold', text);
	// bigger in yellow, smaller in green
	const change = (text: string) =>
		styleText(text.trimStart().startsWith('+') ? 'yellow' : 'green', text);

	const fileRows = [
		['Written', 'Size', 'Gzip', ''],
		...files.map(({ path, size, gzip }) => [
			path,
			formatSize(size),
			formatSize(gzip),
			formatSizeChange(size, previous.get(path)),
		]),
	];
	const lines = [
		'',
		...table(
			fileRows,
			['left', 'right', 'right', 'left'],
			(row, column, text) =>
				row === 0 ? dim(text) : [colorPath, bold, dim, change][column](text),
		),
	];

	if (theme) {
		const was = previousTheme;
		// label, count, its change, size, its change
		const rows = [
			row(
				'Scripts',
				theme.scripts.count,
				was?.scripts.count,
				theme.scripts.size,
				was?.scripts.size,
			),
			row(
				'Styles',
				theme.styles.count,
				was?.styles.count,
				theme.styles.size,
				was?.styles.size,
			),
			row('Markup', undefined, undefined, theme.markup, was?.markup),
			row('Templates', theme.templates, was?.templates),
			row('Plugin partials', theme.partials, was?.partials),
			row('Sections', theme.sections, was?.sections),
			row('Widgets', theme.widgets, was?.widgets),
		];
		lines.push(
			'',
			...table(
				[[`In ${theme.path}`, 'Count', '', 'Size', ''], ...rows],
				['left', 'right', 'left', 'right', 'left'],
				(row, column, text) =>
					row === 0
						? dim(text)
						: column === 1
							? bold(text)
							: column === 2 || column === 4
								? change(text)
								: text,
			),
		);
	}

	return [...lines, ''].join('\n');
}
