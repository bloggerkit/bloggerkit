import { getLatestUpdate, getPages } from '../content/pages';
import { getSections } from '../content/sections';
import { appName, author, publisher, site } from '../site';
import { skillDescription, skillName, skillPath } from './skill';
import { webMcpToolNames } from './webmcp';

/** Also served as `ai-catalog.json`, the name PageSpeed Insights reads. */
export const ardPath = '/.well-known/ard.json';

/**
 * Agentic Resource Discovery manifest (https://agenticresourcediscovery.org/spec/). It lists only the Agent Skill,
 * which points agents to `llms.txt`, the page Markdown and the WebMCP tools. ARD has no media type for those.
 */
export async function getArdManifest() {
	const sections = getSections().map((section) => section.name);
	// The latest page date, so the manifest changes only when the docs do
	const updatedAt = (
		await getLatestUpdate((await getPages()).keys())
	)?.toISOString();
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
