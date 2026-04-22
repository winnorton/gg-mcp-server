/**
 * MCP tools for the agent feature request workflow.
 * These tools allow AI agents to propose new tools and view the request pipeline.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { proposeFeature, listFeatures } from './features.js';

export function registerFeatureTools(server: McpServer) {

  server.tool(
    'gg_propose_feature',
    'Propose a new tool or feature for the Garmin Golf MCP server. Proposed features are tracked and can be auto-implemented via Ollama. Use this when you identify a gap in the available analysis tools.',
    {
      feature_name: z.string().describe('Snake_case name for the tool, e.g. "gg_tempo_analysis"'),
      description: z.string().describe('Detailed description of what the tool should do, including inputs and outputs'),
      justification: z.string().optional().describe('Why this feature is needed and how it helps with golf analysis'),
    },
    async ({ feature_name, description, justification }) => {
      const feature = proposeFeature(feature_name, description, justification, 'mcp-agent');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'proposed',
            message: `Feature "${feature_name}" has been proposed (ID: ${feature.id}). It can be auto-implemented via the web dashboard or Ollama pipeline.`,
            feature,
          }, null, 2)
        }]
      };
    }
  );

  server.tool(
    'gg_list_features',
    'View all proposed, planned, and deployed feature requests. Shows the full feature pipeline.',
    {
      status: z.enum(['proposed', 'planned', 'implementing', 'deployed', 'rejected']).optional()
        .describe('Filter by status. Omit to see all.'),
    },
    async ({ status }) => {
      const features = listFeatures(status);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: features.length,
            filter: status || 'all',
            features,
          }, null, 2)
        }]
      };
    }
  );
}
