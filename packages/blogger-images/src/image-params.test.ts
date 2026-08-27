import { describe, expect, test } from 'vitest';
import { ImageParams } from './image-params';

describe('ImageParams', () => {
	test('constructs with no params', () => {
		const params = new ImageParams();

		expect(params.width()).toBeNull();
		expect(params.crop()).toBe(false);
		expect(params.color()).toBeNull();
		expect(params.params()).toEqual([]);
	});

	test('throws for non-string constructor argument', () => {
		expect(() => new ImageParams(123 as any)).toThrow(
			new TypeError(
				"Argument 'params' must be of type string, but got: number",
			),
		);
	});

	test('parses number, boolean and hex tokens from an existing params string', () => {
		const params = new ImageParams('s500-w200-h100-c-c0xFFAABB-nu');

		expect(params.size()).toBe(500);
		expect(params.width()).toBe(200);
		expect(params.height()).toBe(100);
		expect(params.crop()).toBe(true);
		expect(params.color()).toBe('0xFFAABB');
		expect(params.noUpscaling()).toBe(true);
	});

	test('ignores empty segments from leading, trailing or repeated dashes', () => {
		const params = new ImageParams('-w200--h100-');

		expect(params.width()).toBe(200);
		expect(params.height()).toBe(100);
		expect(params.params().length).toBe(2);
	});

	describe('number params', () => {
		test('get, set and delete via null', () => {
			const params = new ImageParams();

			expect(params.border()).toBeNull();
			params.border(5);
			expect(params.border()).toBe(5);
			params.border(null);
			expect(params.border()).toBeNull();
		});

		test('throws for non-number, non-null values', () => {
			const params = new ImageParams();

			expect(() => params.rotate('90' as any)).toThrow(
				new TypeError(
					"Argument 'value' must be of type number | null, but got: string",
				),
			);
		});
	});

	describe('boolean params', () => {
		test('get, set and delete via false', () => {
			const params = new ImageParams();

			expect(params.flipHorizontally()).toBe(false);
			params.flipHorizontally(true);
			expect(params.flipHorizontally()).toBe(true);
			params.flipHorizontally(false);
			expect(params.flipHorizontally()).toBe(false);
		});

		test('throws for non-boolean values', () => {
			const params = new ImageParams();

			expect(() => params.pad('yes' as any)).toThrow(
				new TypeError(
					"Argument 'value' must be of type boolean, but got: string",
				),
			);
		});
	});

	describe('hex params', () => {
		test('accepts 6 and 8 digit hex values', () => {
			const params = new ImageParams()
				.color('0xFFAABB')
				.backgroundColor('0xaabbccdd');

			expect(params.color()).toBe('0xFFAABB');
			expect(params.backgroundColor()).toBe('0xaabbccdd');
		});

		test('deletes via null', () => {
			const params = new ImageParams();

			params.padColor('0x000000');
			expect(params.padColor()).toBe('0x000000');
			params.padColor(null);
			expect(params.padColor()).toBeNull();
		});

		test('throws for malformed hex strings', () => {
			const params = new ImageParams();

			expect(() => params.color('ff0000')).toThrow(
				"Expected argument 'value' to be of format '0xrrggbb' or '0xaarrggbb', but got: 'ff0000'",
			);
			expect(() => params.color('0xFF')).toThrow(
				"Expected argument 'value' to be of format '0xrrggbb' or '0xaarrggbb', but got: '0xFF'",
			);
		});

		test('throws for non-string, non-null values', () => {
			const params = new ImageParams();

			expect(() => params.color(100 as any)).toThrow(
				new TypeError(
					"Argument 'value' must be of type string | null, but got: number",
				),
			);
		});
	});

	describe('crop flags', () => {
		test('are mutually exclusive, keeping only the last one set', () => {
			const params = new ImageParams()
				.crop(true)
				.circularCrop(true)
				.alternateCrop(true);

			expect(params.crop()).toBe(false);
			expect(params.circularCrop()).toBe(false);
			expect(params.alternateCrop()).toBe(true);
		});

		test('pad removes any active crop flag', () => {
			const params = new ImageParams().squareCrop(true).pad(true);

			expect(params.squareCrop()).toBe(false);
			expect(params.pad()).toBe(true);
		});
	});

	describe('format flags', () => {
		test('are mutually exclusive, keeping only the last one set', () => {
			const params = new ImageParams().png(true).webp(true).gif(true);

			expect(params.png()).toBe(false);
			expect(params.webp()).toBe(false);
			expect(params.gif()).toBe(true);
			expect(params.params()).toContain('rg');
			expect(params.params()).not.toContain('rp');
			expect(params.params()).not.toContain('rw');
		});
	});

	describe('button flags', () => {
		test('button and noButton remove each other', () => {
			const params = new ImageParams().button(true).noButton(true);

			expect(params.button()).toBe(false);
			expect(params.noButton()).toBe(true);

			params.button(true);

			expect(params.noButton()).toBe(false);
			expect(params.button()).toBe(true);
		});
	});

	describe('params()', () => {
		test('serializes number, boolean and hex entries', () => {
			const params = new ImageParams()
				.width(200)
				.height(100)
				.crop(true)
				.color('0xFFAABB')
				.noUpscaling(true);

			expect(params.params()).toEqual(
				expect.arrayContaining(['w200', 'h100', 'c', 'c0xFFAABB', 'nu']),
			);
		});

		test('omits deleted or never-set entries', () => {
			const params = new ImageParams('w200-h100').height(null);

			expect(params.params()).toEqual(['w200']);
		});
	});
});
