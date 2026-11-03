import type { APIRoute } from 'astro';
import { getArdManifest } from '@/lib/agents/ard';

export const GET: APIRoute = async () => Response.json(await getArdManifest());
