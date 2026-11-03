import { satteri } from '@astrojs/markdown-satteri';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { bundle } from './src/integrations/bundle';
import { fontsource } from './src/integrations/fonts';
import { getLastModified } from './src/integrations/lastmod';
import { pagefind } from './src/integrations/pagefind';
import { relativeLinks } from './src/integrations/relative-links';
import { shikiTransformers } from './src/integrations/shiki';

const lastModified = await getLastModified();

export default defineConfig({
	// Set the `SITE_URL` env variable to build for another address
	site: process.env.SITE_URL ?? 'https://blogger.fineshop.app',
	// Write `loops.html`, not `loops/index.html`, so hosts serve `/docs/.../loops` without a redirect
	trailingSlash: 'never',
	build: {
		format: 'file',
		// OG images spend most of their time in sharp, off the main thread, so pages render in parallel
		concurrency: 4,
	},
	// Author photos come from GitHub. Astro downloads, resizes and caches them at build time
	image: { domains: ['avatars.githubusercontent.com'] },
	markdown: {
		processor: satteri({ mdastPlugins: [relativeLinks] }),
		shikiConfig: {
			// Both themes as CSS variables. `code-blocks.css` picks one by `<html data-theme>`
			themes: { dark: 'github-dark', light: 'github-light-default' },
			defaultColor: false,
			transformers: shikiTransformers,
		},
	},
	// Self-hosted, with size-matched fallbacks so text doesn't shift when fonts load
	fonts: [
		fontsource({
			name: 'DM Sans Variable',
			package: '@fontsource-variable/dm-sans',
			cssVariable: '--typeface-dm-sans',
			subsets: ['latin', 'latin-ext'],
			fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
		}),
		fontsource({
			name: 'JetBrains Mono Variable',
			package: '@fontsource-variable/jetbrains-mono',
			cssVariable: '--typeface-jetbrains-mono',
			subsets: ['latin', 'latin-ext'],
			fallbacks: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
		}),
	],
	vite: {
		plugins: [tailwindcss(), bundle()],
	},
	integrations: [
		// Keep these as plain elements so `src/components/content` can replace them
		mdx({ optimize: { ignoreElementNames: ['h2', 'h3', 'h4', 'pre'] } }),
		sitemap({
			serialize: (item) => {
				const date = lastModified.get(new URL(item.url).pathname);
				return date ? { ...item, lastmod: date.toISOString() } : item;
			},
		}),
		pagefind(),
	],
});
