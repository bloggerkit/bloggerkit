/** Based on https://gist.github.com/Sauerstoffdioxid/2a0206da9f44dde1fdfce290f38d2703 */

import {
	BOOLEAN_PARAM,
	HEX_PARAM,
	NUMBER_PARAM,
	type ParsedParam,
	parseParam,
} from './utils';

const FORMAT_PARAMS = ['rj', 'rp', 'rw', 'rwa', 'rg', 'rh', 'nw'];

export type RotateValue = 90 | 180 | 270;
export type SymbolValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export class ImageParams {
	protected readonly _params: Map<string, ParsedParam[2]>;

	/**
	 * Creates an instance of {@link ImageParams}
	 *
	 * @param params The existing params string
	 */
	constructor(params?: string) {
		if (params !== undefined && typeof params !== 'string') {
			throw new TypeError(
				`Argument 'params' must be of type string, but got: ${typeof params}`,
			);
		}

		this._params = new Map();

		if (!params) {
			return;
		}

		for (const param of params.split('-')) {
			if (!param) {
				continue;
			}
			const parsed = parseParam(param);
			if (!parsed) {
				continue;
			}
			const key = `${parsed[0]}${parsed[1]}`;
			const value = parsed[2];
			this._params.set(key, value);
		}
	}

	protected _check(): boolean {
		return true;
	}

	protected _boolean(
		param: string,
		value?: boolean,
		removeBeforeAdding?: string[],
	): boolean | this {
		const ok = this._check();

		const key = `${BOOLEAN_PARAM}${param}`;

		// get
		if (value === undefined) {
			if (ok) {
				return (this._params.get(key) as boolean | undefined) ?? false;
			}
			return false;
		}

		// delete
		if (value === false) {
			if (ok) {
				this._params.delete(key);
			}
			return this;
		}

		// set
		if (value === true) {
			if (ok) {
				if (removeBeforeAdding) {
					for (const remove of removeBeforeAdding) {
						const other = `${BOOLEAN_PARAM}${remove}`;
						this._params.delete(other);
					}
				}
				this._params.set(key, true);
			}
			return this;
		}

		throw new TypeError(
			`Argument 'value' must be of type boolean, but got: ${typeof value}`,
		);
	}

	protected _number(
		param: string,
		value?: number | null,
	): number | null | this {
		const ok = this._check();

		const key = `${NUMBER_PARAM}${param}`;

		// get
		if (value === undefined) {
			if (ok) {
				return (this._params.get(key) as number | undefined) ?? null;
			}
			return null;
		}

		// delete
		if (value === null) {
			if (ok) {
				this._params.delete(key);
			}
			return this;
		}

		// set
		if (typeof value === 'number') {
			if (ok) {
				this._params.set(key, value);
			}
			return this;
		}

		throw new TypeError(
			`Argument 'value' must be of type number | null, but got: ${typeof value}`,
		);
	}

	protected _hex(param: string, value?: string | null): string | null | this {
		const ok = this._check();

		const key = `${HEX_PARAM}${param}`;

		// get
		if (value === undefined) {
			if (ok) {
				return (this._params.get(key) as string | undefined) ?? null;
			}
			return null;
		}

		// delete
		if (value === null) {
			if (ok) {
				this._params.delete(key);
			}
			return this;
		}

		// set
		if (typeof value === 'string') {
			const regex = /^0x[0-9A-Fa-f]{6,8}$/;
			if (!regex.test(value)) {
				throw new Error(
					`Expected argument 'value' to be of format '0xrrggbb' or '0xaarrggbb', but got: '${value}'`,
				);
			}
			if (ok) {
				this._params.set(key, value);
			}
			return this;
		}

		throw new TypeError(
			`Argument 'value' must be of type string | null, but got: ${typeof value}`,
		);
	}

	protected _format(param: string, value?: boolean): boolean | this {
		return this._boolean(param, value, FORMAT_PARAMS);
	}

	width(): number | null;
	width(value: undefined): number | null;
	width(value: number | null): this;
	width(value?: number | null): number | null | this {
		return this._number('w', value);
	}

	height(): number | null;
	height(value: undefined): number | null;
	height(value: number | null): this;
	height(value?: number | null): number | null | this {
		return this._number('h', value);
	}

	size(): number | null;
	size(value: undefined): number | null;
	size(value: number | null): this;
	size(value?: number | null): number | null | this {
		return this._number('s', value);
	}

	noUpscaling(): boolean;
	noUpscaling(value: undefined): boolean;
	noUpscaling(value: boolean): this;
	noUpscaling(value?: boolean): boolean | this {
		return this._boolean('nu', value);
	}

	forceScaling(): boolean;
	forceScaling(value: undefined): boolean;
	forceScaling(value: boolean): this;
	forceScaling(value?: boolean): boolean | this {
		return this._boolean('s', value);
	}

	crop(): boolean;
	crop(value: undefined): boolean;
	crop(value: boolean): this;
	crop(value?: boolean): boolean | this {
		return this._boolean('c', value, ['cc', 'ci', 'p']);
	}

	circularCrop(): boolean;
	circularCrop(value: undefined): boolean;
	circularCrop(value: boolean): this;
	circularCrop(value?: boolean): boolean | this {
		return this._boolean('cc', value, ['c', 'ci', 'p']);
	}

	squareCrop(): boolean;
	squareCrop(value: undefined): boolean;
	squareCrop(value: boolean): this;
	squareCrop(value?: boolean): boolean | this {
		return this._boolean('ci', value, ['c', 'cc', 'p']);
	}

	alternateCrop(): boolean;
	alternateCrop(value: undefined): boolean;
	alternateCrop(value: boolean): this;
	alternateCrop(value?: boolean): boolean | this {
		return this._boolean('p', value, ['c', 'cc', 'ci']);
	}

	flipHorizontally(): boolean;
	flipHorizontally(value: undefined): boolean;
	flipHorizontally(value: boolean): this;
	flipHorizontally(value?: boolean): boolean | this {
		return this._boolean('fh', value);
	}

	flipVertically(): boolean;
	flipVertically(value: undefined): boolean;
	flipVertically(value: boolean): this;
	flipVertically(value?: boolean): boolean | this {
		return this._boolean('fv', value);
	}

	rotate(): number | null;
	rotate(value: undefined): number | null;
	rotate(value: RotateValue | null): this;
	rotate(value?: RotateValue | null): number | null | this {
		return this._number('r', value);
	}

	symbol(): number | null;
	symbol(value: undefined): number | null;
	symbol(value: SymbolValue | null): this;
	symbol(value?: SymbolValue | null): number | null | this {
		return this._number('ba', value);
	}

	borderRadius(): number | null;
	borderRadius(value: undefined): number | null;
	borderRadius(value: number | null): this;
	borderRadius(value?: number | null): number | null | this {
		return this._number('br', value);
	}

	border(): number | null;
	border(value: undefined): number | null;
	border(value: number | null): this;
	border(value?: number | null): number | null | this {
		return this._number('b', value);
	}

	color(): string | null;
	color(value: undefined): string | null;
	color(value: string | null): this;
	color(value?: string | null): string | null | this {
		return this._hex('c', value);
	}

	backgroundColor(): string | null;
	backgroundColor(value: undefined): string | null;
	backgroundColor(value: string | null): this;
	backgroundColor(value?: string | null): string | null | this {
		return this._hex('bc', value);
	}

	pad(): boolean;
	pad(value: undefined): boolean;
	pad(value: boolean): this;
	pad(value?: boolean): boolean | this {
		return this._boolean('pd', value, ['c', 'cc', 'ci', 'p']);
	}

	padColor(): string | null;
	padColor(value: undefined): string | null;
	padColor(value: string | null): this;
	padColor(value?: string | null): string | null | this {
		return this._hex('pc', value);
	}

	jpeg(): boolean;
	jpeg(value: undefined): boolean;
	jpeg(value: boolean): this;
	jpeg(value?: boolean): boolean | this {
		return this._format('rj', value);
	}

	png(): boolean;
	png(value: undefined): boolean;
	png(value: boolean): this;
	png(value?: boolean): boolean | this {
		return this._format('rp', value);
	}

	webp(): boolean;
	webp(value: undefined): boolean;
	webp(value: boolean): this;
	webp(value?: boolean): boolean | this {
		return this._format('rw', value);
	}

	animatedWebp(): boolean;
	animatedWebp(value: undefined): boolean;
	animatedWebp(value: boolean): this;
	animatedWebp(value?: boolean): boolean | this {
		return this._format('rwa', value);
	}

	gif(): boolean;
	gif(value: undefined): boolean;
	gif(value: boolean): this;
	gif(value?: boolean): boolean | this {
		return this._format('rg', value);
	}

	mp4(): boolean;
	mp4(value: undefined): boolean;
	mp4(value: boolean): this;
	mp4(value?: boolean): boolean | this {
		return this._format('rh', value);
	}

	html(): boolean;
	html(value: undefined): boolean;
	html(value: boolean): this;
	html(value?: boolean): boolean | this {
		return this._format('h', value);
	}

	download(): boolean;
	download(value: undefined): boolean;
	download(value: boolean): this;
	download(value?: boolean): boolean | this {
		return this._boolean('d', value);
	}

	noButton(): boolean;
	noButton(value: undefined): boolean;
	noButton(value: boolean): this;
	noButton(value?: boolean): boolean | this {
		return this._boolean('no', value, ['o']);
	}

	button(): boolean;
	button(value: undefined): boolean;
	button(value: boolean): this;
	button(value?: boolean): boolean | this {
		return this._boolean('o', value, ['no']);
	}

	cacheDays(): number | null;
	cacheDays(value: undefined): number | null;
	cacheDays(value: number | null): this;
	cacheDays(value?: number | null): number | null | this {
		return this._number('e', value);
	}

	disableAnimation(): boolean;
	disableAnimation(value: undefined): boolean;
	disableAnimation(value: boolean): this;
	disableAnimation(value?: boolean): boolean | this {
		return this._boolean('k', value);
	}

	frame(): number | null;
	frame(value: undefined): number | null;
	frame(value: number | null): this;
	frame(value?: number | null): number | null | this {
		return this._number('a', value);
	}

	params(): string[] {
		this._check();

		const params: string[] = [];

		for (const [key, value] of this._params) {
			const param = key.slice(3);

			if (typeof value === 'string' || typeof value === 'number') {
				params.push(`${param}${value}`);
			} else if (value === true) {
				params.push(param);
			}
		}

		return params;
	}
}
