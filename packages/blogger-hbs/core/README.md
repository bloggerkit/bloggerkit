# blogger-hbs

Build Blogger themes from Handlebars templates, with bundled scripts and styles.

> [!WARNING]
> `blogger-hbs` is experimental. Its API, options and output can change in any release, without a major version bump, and it can have bugs. Pin an exact version and check the output before relying on it.

- Split a theme into templates with `{{import "./header.hbs"}}`, data with `{{import "./data.json"}}`.
- Import scripts and styles, bundled with [Rsbuild](https://rsbuild.rs) and inlined: `{{import "./main.ts"}}`.
- Every template is validated as XML, and the rendered theme is validated and formatted as Blogger saves it.
- Compile plugins provide partials and data, runtime plugins provide helpers.

## Usage

```sh
pnpm add -D blogger-hbs
```

```ts
// blogger-hbs.config.ts
import { defineConfig } from 'blogger-hbs';

export default defineConfig({
	entry: 'src/index.hbs',
	alias: { '~': 'src' },
	context: {},
});
```

```sh
blogger-hbs          # build to dist/theme.xml
blogger-hbs --watch  # build again on changes
blogger-hbs --help   # all the options
```

The same is available from JavaScript with `compileTemplate`, `watchTemplate` and `renderTemplate`.

## Rendering anywhere

The build writes `dist/compiled.js`, an ES module that imports nothing: the templates, scripts, styles and the runtimes of the plugins are all in it. `blogger-hbs/runtime` renders it in any JavaScript runtime (Node.js, Deno, Bun, Cloudflare Workers, a browser) without the compiler or Node.js.

```ts
// a Cloudflare Worker
import { createRenderer } from 'blogger-hbs/runtime';
import * as theme from './dist/compiled.js';

// set up once, render many times, each render on its own
const renderer = createRenderer(theme);

export default {
	async fetch() {
		const html = await renderer.render({ title: 'Blog' });
		return new Response(html, { headers: { 'content-type': 'text/html' } });
	},
};
```

`createRenderer(theme, { plugins })` takes runtime plugins of the host rendering the theme, for example with data of the request in `prepare`. The helpers of the theme itself are in `compiled.js`, see [Helpers of the theme](#helpers-of-the-theme). `formatXml` and `validateXml` are in `blogger-hbs/runtime` as well. A compiled module is rendered by the version of `blogger-hbs` it is compiled with, `createRenderer` checks it.

## Helpers of the theme

Helpers are given by the runtime of a plugin, which is bundled into `compiled.js`: the theme renders with them wherever it is rendered. A plugin of the theme itself only needs a name and its runtime.

```ts
// blogger-hbs.config.ts
export default defineConfig({
	plugins: [{ name: 'theme', runtime: { entry: './src/runtime.ts' } }],
});
```

```ts
// src/runtime.ts
import { defineRuntimePlugin } from 'blogger-hbs/runtime';

export default defineRuntimePlugin((api) => ({
	helpers: {
		upper: (text: string) => text.toUpperCase(),
	},
}));
```

## Plugins

A compile plugin provides partials (`{{> name.partial}}`) and data (`{{@name.value}}`) when compiling, and can come with a runtime half for rendering.

```ts
import { fileURLToPath } from 'node:url';
import type { CompilePlugin } from 'blogger-hbs';

export function myPlugin(options: { prefix: string }): CompilePlugin {
	return {
		name: 'my',
		provide({ requests }, plugin) {
			// every partial used, with where and how: `{{> my.badge size=16}}`
			for (const { name, usages } of requests) {
				for (const usage of usages) {
					if ('color' in usage.hash) {
						plugin.error(`'color' is not a prop of ${name}`, usage);
					}
				}
			}
			return Object.fromEntries(
				requests.map(({ name }) => [name, `<span class='${name}'/>`]),
			);
		},
		// bundled into compiled.js, it can not use Node.js modules
		runtime: {
			entry: fileURLToPath(new URL('./runtime.js', import.meta.url)),
			options: { prefix: options.prefix },
		},
	};
}
```

```ts
// runtime.ts, published as runtime.js
import { defineRuntimePlugin } from 'blogger-hbs/runtime';

export default defineRuntimePlugin((api, options: { prefix: string }) => ({
	helpers: {
		greet: (name: string) =>
			new api.SafeString(`${options.prefix} ${api.escapeExpression(name)}`),
	},
	// before every render, can be async, read as `{{@my.posts}}`
	async prepare(context) {
		return { posts: [] };
	},
	// after every render
	transform: (html) => html,
}));
```

| Hook | When |
| --- | --- |
| `buildStart(plugin)` | first, in every compilation, also each time when watching |
| `preprocess(templates, plugin)` | with every template, their ASTs can be changed |
| `provide({ partials, requests, templates }, plugin)` | with the partials used, again for those the provided ones use |
| `finalize({ provided, missing, requests, available }, plugin)` | once, for partials that need all the others |
| `data({ provided, available, templates }, plugin)` | once, the values are JSON |
| `buildEnd(plugin, error?)` | last, when the templates are compiled |

### Partials of a plugin

A plugin `my` provides its main partial and any names separated by single dots:

| In a template | Key provided |
| --- | --- |
| `{{> my}}`, `{{#> my}}...{{/my}}` | `.` |
| `{{> my.badge}}` | `badge` |
| `{{> my.badge.small}}` | `badge.small` |

A name is checked as it is written, `{{> my.}}`, `{{> my..badge}}`, `{{> my.badge.}}` and `{{> my/badge}}` are errors where they are, and a theme can not define an inline partial with a name of a plugin, `{{#*inline "my.badge"}}`. Partials of no plugin are left to Handlebars.

Every hook gets the plugin context: `root`, `entry`, `mode`, `watch`, `resolve(specifier, importer?)` with the aliases, `addWatchFile(file)`, `warn(message, loc?)` and `error(message, loc?)`. `enforce: 'pre'` or `'post'` runs a plugin before or after the others.

The runtime halves of all the plugins are bundled together, a module they share (a dependency of two plugins) is in `compiled.js` once and is the same instance for both. The runtime half is set up with `api` (`SafeString`, `escapeExpression`, `createFrame`, `HelperError`) and the options, which are JSON. Its helpers also work with `renderTemplate`, `prepare` and `transform` need `createRenderer`.
