import type { APIRoute } from 'astro';
import { getSkill } from '@/lib/agents/skill';

export const GET: APIRoute = () =>
	new Response(getSkill(), {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
	});
