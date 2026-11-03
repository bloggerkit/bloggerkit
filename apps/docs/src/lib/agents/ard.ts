import { getSections } from '../content/sections';
import { appName, author, publisher, site } from '../site';
import { skillDescription, skillName, skillPath } from './skill';
import { webMcpToolNames } from './webmcp';

// Build time (server start time in `astro dev`), so `ard.json` and `ai-catalog.json` match
const updatedAt = new Date().toISOString();

/** Also served at its former name, `ai-catalog.json`, for older tools. */
export const ardPath = '/.well-known/ard.json';

/**
 * Agentic Resource Discovery manifest (https://agenticresourcediscovery.org/spec/). It lists only the Agent Skill,
 * which points agents to `llms.txt`, the page Markdown and the WebMCP tools. ARD has no media type for those.
 */
export function getArdManifest() {
	const sections = getSections().map((section) => section.name);
	return {
		// Required by the previous spec version, which PageSpeed Insights still checks
		specVersion: '1.0',
		entries: [
			{
				identifier: `urn:air:${site.hostname}:skills:${skillName}`,
				displayName: `${appName} docs`,
				type: 'text/markdown; profile="urn:air:agent-skills"',
				url: new URL(skillPath, site).href,
				description: skillDescription,
				capabilities: [...webMcpToolNames],
				representativeQueries: [
					'how do I loop over posts in a Blogger theme',
					'which Blogger theme tag shows content only on some pages',
					'what data does data:view have in Blogger',
					'show example code for Blogger comments',
					'is this Blogger theme behavior documented by Google',
				],
				tags: ['blogger', 'blogger-themes', 'documentation', ...sections],
				metadata: { publisher: publisher.name, author: author.name },
				updatedAt,
			},
		],
	};
}
