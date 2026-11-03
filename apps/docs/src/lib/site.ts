import { contentDir } from './routes';

// Build-time only. Browser code should import `routes.ts` instead

export const appName = 'Blogger Kit';
export const appDescription =
	'Guides and references for building on Blogger: the theme language, Blogger tools and the Blogger Kit packages.';
/** Shown after the site name in the home page title. */
export const appTagline = 'Docs for building on Blogger';
/** Credited on every page without `authors` in its frontmatter. */
export const author = {
	name: 'Deo Kumar',
	url: 'https://github.com/kumardeo',
	github: 'kumardeo',
};

/** The footer shows `© 2026`, later `© 2026–2027`. */
export const copyrightSince = 2026;

/** Astro's `site`, set in `astro.config.ts`. */
export const site = new URL(import.meta.env.SITE);

export const publisher = {
	name: 'Fineshop Design',
	url: 'https://fineshopdesign.com/',
	/** 512×512. Absolute, since search engines read it outside the site. */
	logo: new URL('/fineshopdesign-logo.png', site).href,
};

const gitConfig = {
	user: 'bloggerkit',
	repo: 'bloggerkit',
	branch: 'main',
	/** Path of this project in the monorepo. */
	projectDir: 'apps/docs',
};
export const githubUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;
/** `file` is relative to `src/content/docs`, e.g. `theme-xml/tags/loops.mdx`. */
export function getSourceUrl(file: string): string {
	return `${githubUrl}/blob/${gitConfig.branch}/${gitConfig.projectDir}/${contentDir}/${file}`;
}

/**
 * Chrome origin trial tokens, added to every page. Chrome enables WebMCP only on origins with a token from
 * https://developer.chrome.com/origintrials/. Tokens are public, not secrets.
 */
export const originTrialTokens: string[] = [
	// WebMCP, for https://fineshop.app and its subdomains, until 2027-03-30
	'Ahxhwc7GZQVcXKmjx1efsXa61tiuX5gkzKIkzPngbUIDOL5saVQCSvDJcNkSCsda78l//Qd/S44jqKtV4+iRNAoAAABfeyJvcmlnaW4iOiJodHRwczovL2ZpbmVzaG9wLmFwcDo0NDMiLCJmZWF0dXJlIjoiV2ViTUNQIiwiZXhwaXJ5IjoxODA2MzY0ODAwLCJpc1N1YmRvbWFpbiI6dHJ1ZX0=',
];
