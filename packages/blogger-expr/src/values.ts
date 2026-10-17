import { BloggerImage } from 'blogger-images';

/** A value an expression works with. */
export type Value =
	| string
	| number
	| boolean
	| null
	| Value[]
	| { [key: string]: Value }
	| RichValue;

/** A property of a `RichValue`, or a function computing it when it is read. */
export type RichProperty = Value | (() => Value);

/**
 * A string or a list with properties of its own, as some of Blogger's values
 * are: an image has `.width`, the widgets have `.Blog1`. It is its `value`
 * wherever a string or a list is used, and `.name` reads its properties
 * after the built-in ones, `.length`, `.first` and `.last`.
 */
export class RichValue {
	readonly value: string | Value[];
	private readonly properties: Readonly<Record<string, RichProperty>>;

	constructor(
		value: string | Value[],
		properties: Readonly<Record<string, RichProperty>> = {},
	) {
		this.value = value;
		this.properties = properties;
	}

	/** The property `name`, computed when it is a function, undefined without it. */
	property(name: string): Value | undefined {
		if (!Object.hasOwn(this.properties, name)) {
			return undefined;
		}
		const property = this.properties[name] as RichProperty;
		return typeof property === 'function' ? property() : property;
	}

	toString(): string {
		return String(this.value);
	}

	/** Its `value` in JSON, the properties left out. */
	toJSON(): string | Value[] {
		return this.value;
	}
}

/** The string or list a `RichValue` is, any other value as it is. */
export function plain(value: Value): Exclude<Value, RichValue> {
	return value instanceof RichValue ? value.value : value;
}

/**
 * An image, as Blogger gives it: `.isResizable` whether it is hosted by
 * Blogger, and so `resizeImage` resizes it, and its `.width` and `.height`
 * when they are known, `null` otherwise.
 */
export function imageValue(
	url: string,
	{
		width = null,
		height = null,
	}: { width?: number | null; height?: number | null } = {},
): RichValue {
	return new RichValue(url, {
		isResizable: isBloggerImage(url),
		width,
		height,
	});
}

/** Whether `url` is an image hosted by Blogger, which can be resized. */
export function isBloggerImage(url: string): boolean {
	return new BloggerImage(url, {
		existing: false,
		passThrough: true,
	}).isSupported();
}

/**
 * A URL, as Blogger gives it: `.canonical` without the country domain of
 * Blogger, `example.blogspot.co.uk` as `example.blogspot.com`, and `.http`
 * and `.https` with that scheme. Each of them is a URL too.
 */
export function urlValue(url: string): RichValue {
	return new RichValue(url, {
		canonical: () => urlValue(canonicalUrl(url)),
		http: () => urlValue(withScheme(url, 'http')),
		https: () => urlValue(withScheme(url, 'https')),
	});
}

/** A Blogger host with a country domain, `example.blogspot.co.uk`, up to its `.blogspot`. */
const COUNTRY_DOMAIN =
	/^((?:[a-z][a-z0-9+.-]*:)?\/\/[^/?#]*\.blogspot)\.(?!com(?=[:/?#]|$))[a-z]{2,}(?:\.[a-z]{2,})?(?=[:/?#]|$)/i;

function canonicalUrl(url: string): string {
	return url.replace(COUNTRY_DOMAIN, '$1.com');
}

/** `url` with the scheme `scheme`, when it is `http`, `https` or left out, `//host`. */
function withScheme(url: string, scheme: 'http' | 'https'): string {
	if (/^https?:/i.test(url)) {
		return url.replace(/^https?:/i, `${scheme}:`);
	}
	return url.startsWith('//') ? `${scheme}:${url}` : url;
}
