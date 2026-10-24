import { stripVTControlCharacters } from 'node:util';
import { assert, describe, test } from 'vitest';
import { createFixture } from '../../test/fixture';
import { compileTemplate } from '../compiler';
import { renderTemplate } from '../runtime';
import { formatXml, inspectXml, parseXml } from '../xml';
import { collectStats, formatSize, formatStats } from './stats';

const bytes = (text: string) => Buffer.byteLength(text);

describe('collectStats', () => {
	test('what the theme is made of adds up to its size', async () => {
		const root = await createFixture({
			'index.hbs': `<html>
  <b:skin><![CDATA[{{import "./style.css" style:raw=true}}]]></b:skin>
  {{import "./a.ts"}}
  {{import "./b.ts" depends-on="./a.ts"}}
  <style>{{import "./style.css" style:raw=true}}</style>
  {{> p.x}}
  {{import "./part.hbs"}}
  <b:section id='s'><b:widget id='HTML1' type='HTML'/></b:section>
</html>`,
			'part.hbs': '<p/>',
			'a.ts': "import './a.css';\nexport const a = 1;\nconsole.log('a');\n",
			'a.css': 'p{margin:0}',
			'b.ts': "console.log('b');\n",
			'style.css': 'body{color:red}',
		});
		const compiled = await compileTemplate({
			root,
			plugins: [{ name: 'p', provide: () => ({ x: '<i/>' }) }],
		});
		const document = parseXml(renderTemplate(compiled));
		const formatted = formatXml(document);
		assert.isTrue(formatted.ok);
		const xml = formatted.ok ? formatted.xml : '';
		const info = inspectXml(document, formatted);

		const { files, theme } = await collectStats(
			compiled,
			[{ path: 'dist/theme.xml', content: xml }],
			{ path: 'dist/theme.xml', content: xml, info },
		);

		assert.strictEqual(files[0].size, bytes(xml));
		assert.isBelow(files[0].gzip, files[0].size);
		assert.ok(theme);
		assert.deepEqual(
			{
				scripts: theme.scripts.count,
				styles: theme.styles.count,
				templates: theme.templates,
				partials: theme.partials,
				sections: theme.sections,
				widgets: theme.widgets,
			},
			{
				scripts: 2,
				styles: 1,
				templates: 2,
				partials: 1,
				sections: 1,
				widgets: 1,
			},
		);
		assert.strictEqual(
			theme.scripts.size + theme.styles.size + theme.markup,
			bytes(xml),
		);

		// the style is in the theme twice, with the CSS a.ts imports
		const style = [...compiled.chunks.values()].find(
			(chunk) => chunk.type === 'style',
		);
		const script = [...compiled.chunks.values()].find(
			(chunk) => chunk.type === 'script' && chunk.css,
		);
		assert.strictEqual(
			theme.styles.size,
			2 * bytes(style?.code?.trim() ?? '') +
				bytes(script?.type === 'script' ? (script.css?.trim() ?? '') : ''),
		);
	});

	test('only the files without a theme', async () => {
		const root = await createFixture({ 'index.hbs': '<html/>' });
		const compiled = await compileTemplate({ root });
		const stats = await collectStats(compiled, [
			{ path: 'dist/compiled.js', content: compiled.source },
		]);
		assert.isUndefined(stats.theme);
		assert.lengthOf(stats.files, 1);
	});
});

describe('formatSize', () => {
	test.each([
		[0, '0 B'],
		[950, '950 B'],
		[1000, '1.0 kB'],
		[82_400, '82.4 kB'],
		[1_200_000, '1.20 MB'],
	])('%i is %s', (size, text) => {
		assert.strictEqual(formatSize(size), text);
	});
});

describe('formatStats', () => {
	test('aligns the tables, with the changes since the last build', () => {
		// without colors, which they have when FORCE_COLOR is set
		const text = stripVTControlCharacters(
			formatStats(
				{
					files: [
						{ path: 'dist/theme.xml', size: 82_400, gzip: 18_100 },
						{ path: 'dist/compiled.js', size: 120_300, gzip: 25_000 },
					],
					theme: {
						path: 'dist/theme.xml',
						scripts: { count: 3, size: 41_200 },
						styles: { count: 2, size: 9_800 },
						markup: 31_400,
						templates: 12,
						partials: 8,
						sections: 2,
						widgets: 5,
					},
				},
				new Map([
					['dist/theme.xml', 81_200],
					['dist/compiled.js', 120_300],
				]),
			),
		);

		assert.strictEqual(
			text,
			`
  Written               Size     Gzip
  dist/theme.xml     82.4 kB  18.1 kB  +1.2 kB
  dist/compiled.js  120.3 kB  25.0 kB

  In dist/theme.xml  Count     Size
  Scripts                3  41.2 kB
  Styles                 2   9.8 kB
  Markup                    31.4 kB
  Templates             12
  Plugin partials        8
  Sections               2
  Widgets                5
`,
		);
	});

	test('no line ends in spaces, with colors too', () => {
		const text = formatStats({ files: [{ path: 'a', size: 1, gzip: 1 }] });
		for (const line of stripVTControlCharacters(text).split('\n')) {
			assert.notMatch(line, / $/);
		}
	});

	test('colors the tables', () => {
		const forced = process.env.FORCE_COLOR;
		process.env.FORCE_COLOR = '1';
		try {
			const text = formatStats(
				{
					files: [
						{ path: 'dist/theme.xml', size: 2000, gzip: 900 },
						{ path: 'dist/compiled.js', size: 1000, gzip: 500 },
					],
				},
				new Map([
					['dist/theme.xml', 1000],
					['dist/compiled.js', 2000],
				]),
			);
			const [, header, theme, module] = text.split('\n');
			assert.include(header, '\x1b[2mWritten');
			assert.include(theme, '\x1b[2mdist/\x1b[22m\x1b[36mtheme.xml\x1b[39m');
			assert.include(theme, '\x1b[33m+1.0 kB\x1b[39m');
			assert.include(module, '\x1b[32m-1.0 kB\x1b[39m');
			for (const line of stripVTControlCharacters(text).split('\n')) {
				assert.notMatch(line, / $/);
			}
		} finally {
			if (forced === undefined) {
				delete process.env.FORCE_COLOR;
			} else {
				process.env.FORCE_COLOR = forced;
			}
		}
	});

	describe('since the last build', () => {
		const files = [{ path: 'dist/theme.xml', size: 12_000, gzip: 3_700 }];
		const was = {
			path: 'dist/theme.xml',
			scripts: { count: 1, size: 617 },
			styles: { count: 1, size: 3_100 },
			markup: 8_300,
			templates: 6,
			partials: 8,
			sections: 2,
			widgets: 2,
		};
		const contentsOf = (theme: typeof was) =>
			stripVTControlCharacters(
				formatStats({ files, theme }, new Map(), { previousTheme: was }),
			)
				.split('\n')
				.slice(3)
				.join('\n');

		test('shows everything, with what changed, a template more', () => {
			assert.strictEqual(
				contentsOf({ ...was, templates: 7, markup: 8_612 }),
				`
  In dist/theme.xml  Count        Size
  Scripts                1       617 B
  Styles                 1      3.1 kB
  Markup                        8.6 kB  +312 B
  Templates              7  +1
  Plugin partials        8
  Sections               2
  Widgets                2
`,
			);
		});

		test('shows the change of the count and the size, a script more', () => {
			assert.strictEqual(
				contentsOf({ ...was, scripts: { count: 2, size: 1_309 } }),
				`
  In dist/theme.xml  Count        Size
  Scripts                2  +1  1.3 kB  +692 B
  Styles                 1      3.1 kB
  Markup                        8.3 kB
  Templates              6
  Plugin partials        8
  Sections               2
  Widgets                2
`,
			);
		});

		test('shows everything without changes when nothing changed', () => {
			assert.strictEqual(
				contentsOf(was),
				`
  In dist/theme.xml  Count    Size
  Scripts                1   617 B
  Styles                 1  3.1 kB
  Markup                    8.3 kB
  Templates              6
  Plugin partials        8
  Sections               2
  Widgets                2
`,
			);
		});
	});
});
