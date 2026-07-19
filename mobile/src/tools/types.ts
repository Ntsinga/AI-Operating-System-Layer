export type ToolDefinition<TResult> = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: () => Promise<TResult>;
};