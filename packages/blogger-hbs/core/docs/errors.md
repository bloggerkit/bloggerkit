# Errors

An error says what it is about and where it is, the same way when compiling, in the CLI and wherever the theme is rendered:

```
✗ Helper 'format': Expected a date (./index.hbs:2:6)
✗ Plugin 'lucide': Unknown prop 'sise' of icon 'menu', did you mean 'size'? The props are size, stroke, strokeWidth, class (./index.hbs:4:3)
✗ Invalid XML: expected </b> to close <b> (opened at 2:3), found </a> (./index.hbs:2:6)
```

| Error          | Of                            | Has                                  |
| -------------- | ----------------------------- | ------------------------------------ |
| `CompileError` | the templates and the options | `loc` when it is in a template       |
| `PluginError`  | a plugin                      | `plugin`, and `loc` when it is given |
| `HelperError`  | a helper                      | `helper` and `loc`                   |
| `XmlError`     | `validateXml` and `formatXml` | `loc`, its path the `path` option    |

`loc` is `{ path, line, column }`, both 1-based. The path is the id of the template, `./index.hbs`, the name of a partial of a plugin, `p.x`, or the file of a document.

A helper throws as any function does, the renderer adds which helper it is and where it is used, the error thrown is the cause:

```ts
helpers: {
	format: (value: unknown) => {
		if (!(value instanceof Date)) {
			throw new TypeError('Expected a date');
		}
		// ...
	},
},
```

A plugin reports with `plugin.error(message, loc?)` in its hooks, `loc` being a usage of `requests` for example. Anything else thrown in a hook is the cause of `Plugin 'p' failed in 'provide'`.
