import type { APIRoute } from 'astro';
import { renderFull } from '@/lib/agents/llms';

export const GET: APIRoute = async () =>
	new Response(await renderFull(), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
