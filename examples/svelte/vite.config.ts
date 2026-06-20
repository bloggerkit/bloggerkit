import { svelte } from '@sveltejs/vite-plugin-svelte';
import blogger from 'blogger-plugin/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		blogger({
			proxyBlog: 'https://blogger-plugin-dev.blogspot.com',
		}),
		svelte(),
	],
});
