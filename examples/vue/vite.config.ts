import vue from '@vitejs/plugin-vue';
import blogger from 'blogger-plugin/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		blogger({
			proxyBlog: 'https://blogger-plugin-dev.blogspot.com',
		}),
		vue(),
	],
});
