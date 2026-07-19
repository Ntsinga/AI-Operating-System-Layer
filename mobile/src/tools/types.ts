// JSON Schema for a tool's arguments object, in the shape LLM function/tool-calling
// APIs (OpenAI, Anthropic, Gemini) expect as the "parameters" field.
export type ToolParametersSchema = {
  type: 'object';
  properties: Record<string, { type: string; description: string }>;
  required?: string[];
};

export type ToolDefinition<TInput = void, TResult = unknown> = {
  name: string;
  description: string;
  parameters: ToolParametersSchema;
  execute: (input: TInput) => Promise<TResult>;
};
