export type ToolDefinition<TInput = void, TResult = unknown> = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (input: TInput) => Promise<TResult>;
};
