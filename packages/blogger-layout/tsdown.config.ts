import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { defineConfig, type UserConfig } from 'tsdown';

export default defineConfig(async () => {
	const baseOptions: UserConfig = {
		format: 'esm',
		platform: 'neutral',
		target: 'es2018',
		sourcemap: true,
		ignoreWatch: ['.turbo'],
	};

	return [
		{
			...baseOptions,
			entry: [
				'src/**/*.{js,ts}',
				'src/*.{css,scss}',
				'!src/**/*.{test,spec}.{js,ts}',
			],
			unbundle: true,
			deps: {
				neverBundle: true,
			},
			dts: true,
			clean: true,
		},
		...(await Array.fromAsync(
			fs.glob('*.{css,scss}', { cwd: 'src' }),
			(file) => {
				console.log(
					path.join(
						path.join(path.dirname(file), `${path.parse(file).name}.min.css`),
					),
				);
				return {
					...baseOptions,
					entry: path.join('src', file),
					unbundle: false,
					deps: {
						alwaysBundle: /./,
					},
					css: {
						minify: true,
						fileName: path.join(
							path.dirname(file),
							`${path.parse(file).name}.min.css`,
						),
					},
				};
			},
		)),
	] satisfies UserConfig[];
});
