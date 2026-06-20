import react from '@vitejs/plugin-react';
import blogger from 'blogger-plugin/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
	base: process.env.VITE_BASE ?? '/',
	plugins: [
		blogger({
			proxyBlog: 'https://blogger-plugin-dev.blogspot.com',
		}),
		react(),
	],
});
