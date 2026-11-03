import type { APIRoute } from 'astro';
import { getArdManifest } from '@/lib/agents/ard';

export const GET: APIRoute = () => Response.json(getArdManifest());
