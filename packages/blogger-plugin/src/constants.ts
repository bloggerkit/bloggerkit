import { version as viteVersion } from 'vite';

export const DEFAULT_MODULE_FILES: Set<string> = new Set([
	'src/index.tsx',
	'src/index.ts',
	'src/index.jsx',
	'src/index.js',
	'src/main.tsx',
	'src/main.ts',
	'src/main.jsx',
	'src/main.js',
]);

export const DEFAULT_TEMPLATE_FILES: Set<string> = new Set([
	'index.xml',
	'template.xml',
	'theme.xml',
	'src/index.xml',
	'src/template.xml',
	'src/theme.xml',
]);

export const TAILWIND_CACHE_FILE: string = '.tailwind-classes.json';

export const TEMPLATE_OUT_FILE: string = 'template.xml';
export const TEMPLATE_TAGS_OUT_FILE: string = 'template.tags.xml';
export const TEMPLATE_MINIFIED_OUT_FILE: string = 'template.min.xml';

export const VITE_MAJOR: number = Number(viteVersion.split('.')[0]);
export const VITE_BUNDLER_KEY = (
	VITE_MAJOR >= 8 ? 'rolldownOptions' : 'rollupOptions'
) as 'rollupOptions';
