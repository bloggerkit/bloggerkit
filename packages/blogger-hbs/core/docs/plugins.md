# Plugins

A compile plugin provides partials (`{{> name.partial}}`) and data (`{{@name.value}}`) when compiling, and can come with a runtime half for rendering.

```ts
import { fileURLToPath } from "node:url";
import type { CompilePlugin } from "blogger-hbs";

export function myPlugin(options: { prefix: string }): CompilePlugin {
  return {
    name: "my",
    provide({ requests }, plugin) {
      // every partial used, with where and how: `{{> my.badge size=16}}`
      for (const { name, usages } of requests) {
        for (const usage of usages) {
          if ("color" in usage.hash) {
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
      entry: fileURLToPath(new URL("./runtime.js", import.meta.url)),
      options: { prefix: options.prefix },
    },
  };
}
```

```ts
// runtime.ts, published as runtime.js
import { defineRuntimePlugin } from "blogger-hbs/runtime";

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
  transform: (xml) => xml,
}));
```

| Hook                                                           | When                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| `buildStart(plugin)`                                           | first, in every compilation, also each time when watching     |
| `preprocess(templates, plugin)`                                | with every template, their ASTs can be changed                |
| `provide({ partials, requests, templates }, plugin)`           | with the partials used, again for those the provided ones use |
| `finalize({ provided, missing, requests, available }, plugin)` | once, for partials that need all the others                   |
| `data({ provided, available, templates }, plugin)`             | once, the values are JSON                                     |
| `buildEnd(plugin, error?)`                                     | last, when the templates are compiled                         |

## Partials of a plugin

A plugin `my` provides its main partial and any names separated by single dots:

| In a template                     | Key provided  |
| --------------------------------- | ------------- |
| `{{> my}}`, `{{#> my}}...{{/my}}` | `.`           |
| `{{> my.badge}}`                  | `badge`       |
| `{{> my.badge.small}}`            | `badge.small` |

A name is checked as it is written, `{{> my.}}`, `{{> my..badge}}`, `{{> my.badge.}}` and `{{> my/badge}}` are errors where they are, and a theme can not define an inline partial with a name of a plugin, `{{#*inline "my.badge"}}`. Partials of no plugin are left to Handlebars.

## Plugin context

Every hook gets the plugin context: `root`, `entry`, `mode`, `watch`, `resolve(specifier, importer?)` with the aliases, `addWatchFile(file)`, `warn(message, loc?)` and `error(message, loc?)`. `enforce: 'pre'` or `'post'` runs a plugin before or after the others.

## Runtime half

The runtime halves of all the plugins are bundled together, a module they share (a dependency of two plugins) is in `compiled.js` once and is the same instance for both. The runtime half is set up with `api` (`SafeString`, `escapeExpression`, `createFrame`, `HelperError`) and the options, which are JSON. Its helpers also work with `renderTemplate`, `prepare` and `transform` need `createRenderer`.
