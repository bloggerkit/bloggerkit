export const FORBIDDEN_KEYS = new Set([
	'__proto__',
	'constructor',
	'prototype',
]);

export const TEMPLATE_EXTENSIONS = new Set([
	'.hbs',
	'.handlebars',
	'.xml',
	'.html',
]);

export const SCRIPT_EXTENSIONS = new Set([
	'.mjs',
	'.js',
	'.mts',
	'.ts',
	'.jsx',
	'.tsx',
	'.cjs',
]);

export const STYLE_EXTENSIONS = new Set([
	'.css',
	'.scss',
	'.sass',
	'.less',
	'.styl',
	'.stylus',
	'.postcss',
]);

export const JSON_EXTENSIONS = new Set(['.json']);

export const INDEX_EXTENSIONS = new Set([
	...TEMPLATE_EXTENSIONS,
	...SCRIPT_EXTENSIONS,
]);

export const FILE_EXTENSIONS = new Set([
	...TEMPLATE_EXTENSIONS,
	...SCRIPT_EXTENSIONS,
	...JSON_EXTENSIONS,
]);

export const RESOLVE_EXTENSIONS = new Set([
	...TEMPLATE_EXTENSIONS,
	...SCRIPT_EXTENSIONS,
	...STYLE_EXTENSIONS,
	...JSON_EXTENSIONS,
]);

export const ATTRIBUTE_NAME_REGEX =
	/^[^\s"'>/=\p{Cc}\uFDD0-\uFDEF\uFFFE\uFFFF]+$/u;

/**
 * Version of what the compiler emits for the runtime, the compiled module
 * exports it as `format`. It changes whenever a compiled template can not be
 * rendered by the runtime of another version.
 */
export const TEMPLATE_FORMAT = 1;

/** Hash keys the compiler uses to pass information about an `import` to the runtime. */
export const CHUNK_HASH_KEY = '__chunk';
export const INDENT_HASH_KEY = '__indent';

/**
 * Whitespace, the dot separating a plugin from its partials and data, and the
 * characters Handlebars does not allow in identifiers.
 */
export const NAME_DENYLIST_REGEX = /[\s!"#%&'()*+,./;<=>@[\\\]^`{|}~]/;

/** Handlebars' own data variables, the data of a plugin is read as `@plugin-name`. */
export const RESERVED_PLUGIN_NAMES = new Set([
	'root',
	'index',
	'key',
	'first',
	'last',
	'level',
	'partial-block',
]);
