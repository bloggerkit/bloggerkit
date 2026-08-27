import { ImageParams } from './image-params';
import { HOST_REGEX, PARAMS_REGEX } from './utils';

export interface BloggerImageOptions {
	/**
	 * Whether to keep existing image parameters.
	 *
	 * @default true
	 */
	existing?: boolean;

	/**
	 * When `true`, skips transformations on unsupported URLs.
	 *
	 * Instead of throwing an error for unsupported URLs, `.url()` will return the
	 * original URL unchanged.
	 *
	 * @default false
	 */
	passThrough?: boolean;
}

export class BloggerImage extends ImageParams {
	private readonly _url: string;
	private readonly _passThrough: boolean;
	private readonly _match: [string, number] | null;

	/**
	 * Creates an instance of {@link BloggerImage}
	 *
	 * @param url The image url
	 * @param options Options
	 */
	constructor(url: string | URL, options: BloggerImageOptions = {}) {
		const { existing = true, passThrough = false } = options;

		let imageUrl: string;
		if (url instanceof URL) {
			imageUrl = url.href;
		} else if (typeof url === 'string') {
			imageUrl = url;
		} else {
			throw new TypeError(
				`Argument 'url' must be of type string | URL, but got: ${typeof url}`,
			);
		}

		let match: [string, number] | null = null;
		if (HOST_REGEX.test(imageUrl)) {
			const m = imageUrl.match(PARAMS_REGEX);
			if (typeof m?.[0] === 'string' && typeof m.index === 'number') {
				match = [m[0], m.index];
			}
		}

		if (existing && match) {
			super(match[0]);
		} else {
			super();
		}

		this._url = imageUrl;
		this._passThrough = !!passThrough;
		this._match = match;
	}

	protected _check(): boolean {
		if (this._match) {
			return true;
		}
		if (!this._passThrough) {
			throw new Error('Image URL is not supported for transformations');
		}
		return false;
	}

	/**
	 * Checks whether image URL is supported for transformations
	 *
	 * @returns `true` if image URL is supported otherwise `false`
	 */
	isSupported() {
		return !!this._match;
	}

	/**
	 * Get the image url with updated params
	 */
	url() {
		this._check();

		const url = this._url;
		const match = this._match;

		if (!match) {
			return url;
		}

		const params = this.params();

		return `${url.slice(0, match[1])}${params.join('-') || 's0'}${url.slice(match[1] + match[0].length)}`;
	}
}
