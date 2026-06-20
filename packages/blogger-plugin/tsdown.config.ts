import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/index.ts', 'src/vite.ts'],
	format: ['esm', 'cjs'],
	platform: 'node',
	target: 'es2018',
	sourcemap: true,
	unbundle: true,
	deps: {
		skipNodeModulesBundle: true,
	},
	dts: true,
	clean: true,
	ignoreWatch: ['.turbo'],
});
