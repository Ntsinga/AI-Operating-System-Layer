import { tools } from './registry';

// Used by the backend workflow client (workflowClient.ts) so the tool schema sent
// to the LLM always comes from one source of truth: the registry itself.
export function buildOpenAiToolSchemas() {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
