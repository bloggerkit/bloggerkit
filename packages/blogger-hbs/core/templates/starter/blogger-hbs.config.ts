import { defineConfig } from 'blogger-hbs';

export default defineConfig({
	entry: 'src/index.hbs',
	alias: { '~': 'src' },
	// read by the templates as `{{theme.name}}`, and so on
	context: {
		theme: {
			name: '%THEME_NAME%',
			version: '0.0.0',
		},
	},
});
