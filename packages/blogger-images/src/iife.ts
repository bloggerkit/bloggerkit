import { BloggerImage } from './blogger-image';

const GLOBAL_NAME = 'BloggerImage';

const getGlobalObject = () =>
	typeof globalThis !== 'undefined'
		? globalThis
		: typeof window !== 'undefined'
			? window
			: self;

(getGlobalObject() as unknown as { [GLOBAL_NAME]: typeof BloggerImage })[
	GLOBAL_NAME
] = BloggerImage;
