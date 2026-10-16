import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	type CompileTemplateOptions,
	compileTemplate,
	renderTemplate,
} from 'blogger-hbs';
import { assert, describe, onTestFinished, test } from 'vitest';
import { type LucideOptions, pluginLucide } from './plugin';

/** Writes `index.hbs` into a temporary directory removed after the test. */
async function createFixture(source: string): Promise<string> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-lucide-'));
	onTestFinished(() => fs.rm(root, { recursive: true, force: true }));
	await fs.writeFile(path.join(root, 'index.hbs'), source);
	return root;
}

function compile(
	root: string,
	options?: LucideOptions,
): ReturnType<typeof compileTemplate> {
	const config: CompileTemplateOptions = {
		root,
		plugins: [pluginLucide(options)],
	};
	return compileTemplate(config);
}

async function render(
	source: string,
	options?: LucideOptions,
): Promise<string> {
	const compiled = await compile(await createFixture(source), options);
	return renderTemplate({ ...compiled, context: {} });
}

/** The `<b:case>` values of the includable, in order. */
function cases(output: string): string[] {
	return [...output.matchAll(/<b:case value='([^']+)'\/>/g)].map(
		(match) => match[1],
	);
}

async function assertRejects(promise: Promise<unknown>, message: RegExp) {
	try {
		await promise;
	} catch (error) {
		assert.match((error as Error).message, message);
		return;
	}
	assert.fail(`expected a rejection matching ${message}`);
}

describe('icons', () => {
	test('includes the includable with the name of the icon', async () => {
		const output = await render(
			'<a>{{> lucide.house}}{{> lucide.includable}}</a>',
		);
		assert.include(
			output,
			`<b:include data='{ name: "house" }' name='@lucide'/>`,
		);
	});

	test('passes the props given', async () => {
		const output = await render(
			'<a>{{> lucide.house size=16 stroke="red" strokeWidth=1.5 class="icon"}}{{> lucide.includable}}</a>',
		);
		assert.include(
			output,
			`<b:include data='{ name: "house", size: "16", stroke: "red", strokeWidth: "1.5", class: "icon" }' name='@lucide'/>`,
		);
	});

	test('reports unknown icons with where they are used and the closest name', async () => {
		const root = await createFixture(
			'<a>\n{{> lucide.mneu}}{{> lucide.includable}}</a>',
		);
		await assertRejects(
			compile(root),
			/^Plugin 'lucide': Unknown icon:\n {2}'mneu' \(\.\/index\.hbs:2:1\), did you mean 'menu'\?/,
		);
	});

	test('reports every unknown icon at once', async () => {
		const root = await createFixture(
			'<a>{{> lucide.mneu}}{{> lucide.not-an-icon-at-all}}{{> lucide.includable}}</a>',
		);
		await assertRejects(
			compile(root),
			/^Plugin 'lucide': Unknown icons:\n.*'mneu'.*\n {2}'not-an-icon-at-all' \(\.\/index\.hbs:1:\d+\)\n/,
		);
	});

	test('has no main partial, an icon is {{> lucide.name}}', async () => {
		const root = await createFixture(
			'<a>{{> lucide}}{{> lucide.includable}}</a>',
		);
		await assertRejects(
			compile(root),
			/^Plugin 'lucide' did not provide its main partial '\.' \(\{\{> lucide\}\}\) \(\.\/index\.hbs:1:4\)$/,
		);
	});

	test('requires the includable when icons are used', async () => {
		const root = await createFixture(
			'<a>{{> lucide.menu}}{{> lucide.house}}</a>',
		);
		await assertRejects(
			compile(root),
			/^Plugin 'lucide': Icons are used \(house, menu\) but not '\{\{> lucide\.includable\}\}', which renders them\. Add it once to the theme \(\.\/index\.hbs:1:4\)$/,
		);
	});

	test('reports unknown props where they are used', async () => {
		const root = await createFixture(
			'<a>\n  {{> lucide.menu sise=16}}{{> lucide.includable}}</a>',
		);
		await assertRejects(
			compile(root),
			/^Plugin 'lucide': Unknown prop 'sise' of icon 'menu', did you mean 'size'\? The props are size, stroke, strokeWidth, class \(\.\/index\.hbs:2:3\)$/,
		);
	});

	test('accepts props from data', async () => {
		const root = await createFixture(
			'<a>{{> lucide.menu size=data.size class=(toJson "a")}}{{> lucide.includable}}</a>',
		);
		const compiled = await compile(root);
		assert.include(compiled.source, 'lucide.menu');
	});
});

describe('includable', () => {
	test('renders only the icons used, sorted and once', async () => {
		const output = await render(
			'<a>{{> lucide.menu}}{{> lucide.house}}{{> lucide.menu}}{{> lucide.includable}}</a>',
		);
		assert.deepEqual(cases(output), ['house', 'menu']);
	});

	test('renders the elements of an icon on a single line', async () => {
		const output = await render(
			'<a>{{> lucide.menu}}{{> lucide.includable}}</a>',
		);
		assert.include(
			output,
			"<b:case value='menu'/>\n      <path d='M4 5h16'/><path d='M4 12h16'/><path d='M4 19h16'/>\n",
		);
	});

	test('renders the fallback icon by default', async () => {
		const output = await render('<a>{{> lucide.includable}}</a>');
		assert.deepEqual(cases(output), []);
		assert.match(output, /<b:default\/>\n\s*<circle cx='12' cy='12' r='10'\/>/);
	});

	test('can be the only thing provided', async () => {
		const output = await render('<a>{{> lucide.includable}}</a>');
		assert.include(output, "<b:includable id='@lucide' var='props'>");
		assert.include(output, "<b:switch var='data:props.name'>");
	});

	test('uses the default size, stroke and stroke width', async () => {
		const output = await render('<a>{{> lucide.includable}}</a>');
		assert.include(output, "expr:width='data:props.size ?: 24'");
		assert.include(output, "expr:height='data:props.size ?: 24'");
		assert.include(output, `expr:stroke='data:props.stroke ?: "currentColor"'`);
		assert.include(output, "expr:stroke-width='data:props.strokeWidth ?: 2'");
	});

	test('only has the class given', async () => {
		const output = await render('<a>{{> lucide.includable}}</a>');
		assert.deepEqual(output.match(/<b:class [^>]*>/g), [
			"<b:class cond='data:props.class' expr:name='data:props.class'/>",
		]);
	});
});

describe('options', () => {
	test('id, size, stroke and strokeWidth', async () => {
		const output = await render(
			'<a>{{> lucide.house}}{{> lucide.includable}}</a>',
			{ id: 'icon', size: 20, stroke: '#000', strokeWidth: 1.5 },
		);
		assert.include(output, `<b:include data='{ name: "house" }' name='icon'/>`);
		assert.include(output, "<b:includable id='icon' var='props'>");
		assert.include(output, "expr:width='data:props.size ?: 20'");
		assert.include(output, `expr:stroke='data:props.stroke ?: "#000"'`);
		assert.include(output, "expr:stroke-width='data:props.strokeWidth ?: 1.5'");
	});

	test('escapes the stroke', async () => {
		const output = await render('<a>{{> lucide.includable}}</a>', {
			stroke: "a'b",
		});
		assert.include(output, `expr:stroke='data:props.stroke ?: "a&apos;b"'`);
	});

	test('a fallback icon', async () => {
		const output = await render('<a>{{> lucide.includable}}</a>', {
			fallback: 'menu',
		});
		assert.match(output, /<b:default\/>\n\s*<path d='M4 5h16'\/>/);
	});

	test('no fallback icon', async () => {
		const output = await render('<a>{{> lucide.includable}}</a>', {
			fallback: false,
		});
		assert.match(output, /<b:default\/>\n\s*<\/b:switch>/);
	});

	test('rejects an invalid id', () => {
		assert.throws(
			() => pluginLucide({ id: "a'b" }),
			"Plugin 'lucide': Invalid includable id 'a'b'",
		);
	});

	test('rejects an unknown fallback icon', () => {
		assert.throws(
			// a typo the types catch, but not in a config written in JavaScript
			() => pluginLucide({ fallback: 'mneu' as never }),
			/^Plugin 'lucide': Unknown fallback icon:\n {2}'mneu', did you mean 'menu'\?/,
		);
	});
});
