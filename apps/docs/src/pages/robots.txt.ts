import type { APIRoute } from 'astro';
import { resources } from '@/lib/routes';
import { site } from '@/lib/site';

/**
 * Leaves out ARD's `Agentmap:` directive on purpose, because Lighthouse flags it as unknown.
 * Agents find `ard.json` through its `<link>` and well-known path instead.
 */
export const GET: APIRoute = () =>
	new Response(
		`User-agent: *\nAllow: /\n\nSitemap: ${new URL(resources.sitemap, site).href}\n`,
		{ headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
	);
