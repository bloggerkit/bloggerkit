import type { APIRoute } from 'astro';
import { renderIndex } from '@/lib/agents/llms';

/** Format: https://llmstxt.org */
export const GET: APIRoute = async () =>
	new Response(await renderIndex(), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
