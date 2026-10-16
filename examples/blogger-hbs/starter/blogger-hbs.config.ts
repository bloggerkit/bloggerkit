import { pluginLucide } from '@blogger-hbs/plugin-lucide';
import { defineConfig } from 'blogger-hbs';

export default defineConfig({
	entry: 'src/index.hbs',
	alias: { '~': 'src' },
	plugins: [pluginLucide({ size: 20 })],
	// read by the templates as `{{theme.name}}`, and so on
	context: {
		theme: {
			name: 'Starter',
			version: '0.0.0',
		},
	},
});
