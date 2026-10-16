# JavaScript API

What the CLI does is available from JavaScript. `blogger-hbs` compiles, in Node.js, and `blogger-hbs/runtime` renders, anywhere, see [Rendering anywhere](./rendering.md).

## `compileTemplate(options)`

Compiles the entry and everything it imports, the options being those of the [config](./configuration.md#options) without `context`, `output` and `publicDir`.

```ts
import { compileTemplate, createRenderer } from "blogger-hbs";

const compiled = await compileTemplate({
  root: "theme",
  entry: "src/index.hbs",
});
const xml = await createRenderer(compiled).render({ title: "Blog" });
```

It returns the compiled template, which `createRenderer` and `renderTemplate` take as the compiled module:

| Property         | Description                                                 |
| ---------------- | ----------------------------------------------------------- |
| `source`         | The compiled module, what the CLI writes as `compiled.js`   |
| `entry`          | The id of the entry template, `./src/index.hbs`             |
| `format`         | The version of the compiled output, checked by the renderer |
| `chunks`         | The templates, scripts, styles and data, by id              |
| `pluginPartials` | The partials of plugins, by name                            |
| `pluginData`     | The data of plugins, by plugin                              |
| `bundledPlugins` | The runtimes of plugins                                     |

## `watchTemplate(options)`

Compiles like `compileTemplate`, and again when a file the template is made of changes, until closed. Scripts and styles are bundled again only when they change.

```ts
import { watchTemplate } from "blogger-hbs";

const watcher = await watchTemplate({
  root: "theme",
  onCompile: async (compiled) => {
    // a compilation, the first one included
  },
  onError: (error) => console.error(error),
});

await watcher.close();
```

| Option      | Description                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `onCompile` | Called with every compilation, not when the output is the same as before                                         |
| `onError`   | Called when compiling fails, it compiles again on the next change, `console.error` by default                    |
| `onStart`   | Called when compiling starts, with `{ files }`, the files changed since the last compilation, none for the first |
| `debounce`  | Milliseconds to wait for more changes, `30` by default                                                           |

## `createRenderer(compiled, { plugins? })`

Sets up a compiled template, the compiled module or what `compileTemplate` returns, to render it many times: `renderer.render(context)` returns a promise of the XML of the theme. `plugins` are runtime plugins of the host, see [Rendering anywhere](./rendering.md).

## `renderTemplate({ ...compiled, context, plugins })`

Renders once, synchronously. Runtime plugins with `prepare` or `transform` need `createRenderer`.

## And more

| Export                                                   | Description                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| `defineConfig(config)`                                   | Types for a config file                                        |
| `defineRuntimePlugin(setup)`                             | Types for the runtime of a plugin, see [Plugins](./plugins.md) |
| `validateXml(xml)`, `formatXml(xml)`                     | See [Validation and formatting](./validation.md)               |
| `CompileError`, `PluginError`, `HelperError`, `XmlError` | See [Errors](./errors.md)                                      |

`blogger-hbs/runtime` has `createRenderer`, `renderTemplate`, `defineRuntimePlugin`, `validateXml`, `formatXml` and the errors of rendering, without the compiler or Node.js.
