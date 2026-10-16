import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/**/*.{js,ts}', '!src/**/*.{test,spec}.{js,ts}'],
	format: 'esm',
	platform: 'neutral',
	sourcemap: true,
	unbundle: true,
	deps: {
		neverBundle: true,
	},
	dts: true,
	clean: true,
	ignoreWatch: ['.turbo'],
	plugins: [
		{
			// handlebars has no `exports`, so node only finds its runtime with the
			// extension, while the typings are declared for the name without it
			name: 'handlebars-runtime',
			resolveId: {
				// before the dependencies are made external as they are
				order: 'pre',
				handler(id) {
					if (id === 'handlebars/runtime') {
						return { id: 'handlebars/runtime.js', external: true };
					}
				},
			},
		},
	],
});
