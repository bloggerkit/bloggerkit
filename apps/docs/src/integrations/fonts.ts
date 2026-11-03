import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { AstroUserConfig } from 'astro';

type FontFamily = NonNullable<AstroUserConfig['fonts']>[number];

const require = createRequire(import.meta.url);

interface FontsourceFamily {
	/** As declared in the package CSS, e.g. `DM Sans Variable`. */
	name: string;
	package: string;
	cssVariable: `--${string}`;
	/** Most-used first. Each loads only for its `unicode-range`. */
	subsets: [string, ...string[]];
	fallbacks: [string, ...string[]];
}

async function readFaces(family: FontsourceFamily) {
	const css = require.resolve(`${family.package}/wght.css`);
	// Faces are named like `dm-sans-latin-ext-wght-normal`. Try longer subsets first so `latin-ext` beats `latin`
	const subsetOf = (name: string) =>
		[...family.subsets]
			.sort((a, b) => b.length - a.length)
			.find((subset) => name.endsWith(`-${subset}-wght-normal`));
	const faces = [
		...(await readFile(css, 'utf8')).matchAll(
			/\/\* ([\w-]+) \*\/\s*@font-face \{([^}]+)\}/g,
		),
	].flatMap(([, name, body]) => {
		const subset = subsetOf(name);
		return subset ? [{ subset, body }] : [];
	});
	// Keep the order of `subsets`, since fallback metrics come from the first face
	faces.sort(
		(a, b) =>
			family.subsets.indexOf(a.subset) - family.subsets.indexOf(b.subset),
	);
	if (faces.length === 0) {
		throw new Error(`no font faces of ${family.subsets.join(', ')} in ${css}`);
	}
	return faces.map(({ subset, body }) => {
		const property = (key: string) =>
			body.match(new RegExp(`${key}:\\s*([^;]+);`))?.[1].trim();
		const required = (key: string, value: string | undefined) => {
			if (value === undefined) {
				throw new Error(`no ${key} in the ${subset} @font-face of ${css}`);
			}
			return value;
		};
		const url = required('src', property('src')?.match(/url\(([^)]+)\)/)?.[1]);
		return {
			src: [{ url: resolve(dirname(css), url), format: 'woff2' }],
			weight: required('font-weight', property('font-weight')),
			style: 'normal',
			display: 'swap' as const,
			unicodeRange: required('unicode-range', property('unicode-range')).split(
				',',
			),
			meta: { subset },
		};
	});
}

/**
 * An Astro font family from an installed Fontsource package, so nothing downloads at build time. It uses the
 * weight-only files, which are smaller than what `fontProviders.fontsource()` serves. The CSS is read when Astro
 * resolves the font, not when the config loads.
 */
export function fontsource(family: FontsourceFamily): FontFamily {
	return {
		name: family.name,
		cssVariable: family.cssVariable,
		fallbacks: family.fallbacks,
		subsets: family.subsets,
		// Astro dedupes providers by name and config, so the package name keeps each family separate
		provider: {
			name: 'fontsource-files',
			config: { package: family.package },
			resolveFont: async () => ({ fonts: await readFaces(family) }),
		},
	};
}
