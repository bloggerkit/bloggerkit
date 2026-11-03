import dmSans400Url from '@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff?inline';
import dmSans600Url from '@fontsource/dm-sans/files/dm-sans-latin-600-normal.woff?inline';
import mono400Url from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?inline';
import mono500Url from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff?inline';
import { appName } from '../site';

export type ImageData = {
	title: string;
	description?: string;
	/** Shown in a pill at the top. */
	section?: string;
	/** Shown above the title. */
	folder?: string;
	/** Shown at the bottom, e.g. `blogger.fineshop.app/docs/theme-xml/tags/loops`. */
	url: string;
};

export const WIDTH = 1200;
export const HEIGHT = 630;
// Satori adds padding on top of width and height, so the box is the image size minus padding
const PADDING_X = 72;
const PADDING_Y = 64;

// Satori can't read woff2, so these are the static woff files, inlined as data URLs. They are decoded on the
// first render, not when a page only imports `WIDTH` and `HEIGHT`
const decode = async (url: string) => (await fetch(url)).arrayBuffer();
const readFonts = async () => {
	const [dmSans400, dmSans600, mono400, mono500] = await Promise.all(
		[dmSans400Url, dmSans600Url, mono400Url, mono500Url].map(decode),
	);
	return [
		{
			name: 'DM Sans',
			data: dmSans400,
			weight: 400 as const,
		},
		{
			name: 'DM Sans',
			data: dmSans600,
			weight: 600 as const,
		},
		{
			name: 'JetBrains Mono',
			data: mono400,
			weight: 400 as const,
		},
		{
			name: 'JetBrains Mono',
			data: mono500,
			weight: 500 as const,
		},
	];
};

// The `Logo.astro` mark, as a light tile for the dark image
const logo = `data:image/svg+xml;base64,${btoa(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#fafafa"/><rect x="128" y="128" width="256" height="64" rx="32" fill="#171717"/><rect x="128" y="224" width="160" height="64" rx="32" fill="#171717"/><rect x="128" y="320" width="256" height="64" rx="32" fill="#171717"/></svg>',
)}`;

// An SVG arrow, because the latin font subsets have no → glyph
const arrow = `data:image/svg+xml;base64,${btoa(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#d4d4d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
)}`;

/** SVG text to bytes, for sharp. */
const encoder = new TextEncoder();

/** Satori accepts plain objects shaped like React elements. */
type Node = { type: string; props: Record<string, unknown> };
const h = (
	type: string,
	style: Record<string, unknown>,
	...children: (Node | string | false | undefined)[]
): Node => ({
	type,
	props: {
		style,
		children: children.filter(
			(child) => child !== false && child !== undefined,
		),
	},
});

/** Titles that look like code (`b:loop`, `data:blog`, `<…>`) are set in the mono font. */
const isCode = (title: string) => /^(b|data|expr):|^</.test(title);

/** Keeps the title within two lines. Code is wider, so it counts as longer. */
function titleSize(title: string, code: boolean) {
	const length = title.length * (code ? 1.15 : 1);
	if (length <= 16) {
		return 92;
	}
	if (length <= 26) {
		return 76;
	}
	if (length <= 38) {
		return 64;
	}
	return 54;
}

/**
 * A faint grid with a glow at the top right, shared by every image. It is rendered once and each page's text is
 * composited on top, because rasterizing the tiled grid is most of the cost of an image.
 */
function background(): Node {
	return h('div', {
		width: WIDTH,
		height: HEIGHT,
		display: 'flex',
		backgroundColor: '#0a0a0a',
		backgroundImage:
			'radial-gradient(circle at 88% 0%, rgba(255,255,255,0.12), rgba(10,10,10,0) 55%), linear-gradient(to right, rgba(255,255,255,0.045) 1px, rgba(0,0,0,0) 1px), linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, rgba(0,0,0,0) 1px)',
		backgroundSize: '100% 100%, 48px 48px, 48px 48px',
	});
}

/** The page's text and logo, on a transparent background. */
function card({ title, description, section, folder, url }: ImageData): Node {
	const code = isCode(title);
	return h(
		'div',
		{
			width: WIDTH - PADDING_X * 2,
			height: HEIGHT - PADDING_Y * 2,
			display: 'flex',
			flexDirection: 'column',
			padding: `${PADDING_Y}px ${PADDING_X}px`,
			color: '#fafafa',
			fontFamily: 'DM Sans',
		},
		h(
			'div',
			{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
			},
			h(
				'div',
				{ display: 'flex', alignItems: 'center', gap: 18 },
				{ type: 'img', props: { src: logo, width: 52, height: 52 } },
				h(
					'div',
					{ fontSize: 32, fontWeight: 600, letterSpacing: -0.5 },
					appName,
				),
			),
			section &&
				h(
					'div',
					{
						display: 'flex',
						padding: '10px 22px',
						border: '1px solid rgba(255,255,255,0.18)',
						borderRadius: 999,
						backgroundColor: 'rgba(255,255,255,0.06)',
						fontSize: 24,
						color: '#d4d4d4',
					},
					section,
				),
		),
		h(
			'div',
			{
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'center',
				flexGrow: 1,
				gap: 20,
				paddingTop: 24,
			},
			folder &&
				h(
					'div',
					{
						display: 'flex',
						fontFamily: 'JetBrains Mono',
						fontSize: 24,
						color: '#a3a3a3',
						letterSpacing: 2,
						textTransform: 'uppercase',
					},
					folder,
				),
			h(
				'div',
				{
					display: 'flex',
					fontFamily: code ? 'JetBrains Mono' : 'DM Sans',
					fontWeight: code ? 500 : 600,
					fontSize: titleSize(title, code),
					lineHeight: 1.08,
					letterSpacing: code ? -1 : -2,
				},
				title,
			),
			description &&
				h(
					'div',
					{
						display: 'block',
						fontSize: 30,
						lineHeight: 1.4,
						color: '#a3a3a3',
						maxWidth: 980,
						lineClamp: 2,
					},
					description,
				),
		),
		h(
			'div',
			{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				gap: 32,
				paddingTop: 28,
				borderTop: '1px solid rgba(255,255,255,0.12)',
				fontFamily: 'JetBrains Mono',
				fontSize: 22,
				color: '#8a8a8a',
			},
			h(
				'div',
				{
					display: 'block',
					minWidth: 0,
					overflow: 'hidden',
					whiteSpace: 'nowrap',
					textOverflow: 'ellipsis',
				},
				url,
			),
			h(
				'div',
				{
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					flexShrink: 0,
					color: '#d4d4d4',
				},
				'Read the docs',
				{ type: 'img', props: { src: arrow, width: 24, height: 24 } },
			),
		),
	);
}

/** Imported lazily, since only these images need satori and sharp. */
const loadRenderers = async () => {
	const [{ default: satori }, { default: sharp }] = await Promise.all([
		import('satori'),
		import('sharp'),
	]);
	const fonts = await readFonts();
	// Satori is typed for React elements; plain objects of the same shape work
	const toSvg = (node: Node) =>
		satori(node as unknown as Parameters<typeof satori>[0], {
			width: WIDTH,
			height: HEIGHT,
			fonts,
		});
	const backgroundPng = await sharp(encoder.encode(await toSvg(background())))
		.png()
		.toBuffer();
	return { sharp, toSvg, backgroundPng };
};
let renderers: ReturnType<typeof loadRenderers> | undefined;

/** Returns a 1200×630 PNG. */
export async function renderImage(
	data: ImageData,
): Promise<Uint8Array<ArrayBuffer>> {
	renderers ??= loadRenderers();
	const { sharp, toSvg, backgroundPng } = await renderers;
	const svg = await toSvg(card(data));
	// sharp composites only its own buffers, so the card goes in as raw pixels
	const layer = await sharp(encoder.encode(svg))
		.raw()
		.toBuffer({ resolveWithObject: true });
	const png = await sharp(backgroundPng)
		.composite([{ input: layer.data, raw: layer.info }])
		.png()
		.toBuffer();
	return Uint8Array.from(png);
}
