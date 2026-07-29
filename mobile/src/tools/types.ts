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
  // Calls, messages, purchases, settings changes, wallpaper changes, and other irreversible or
  // externally visible actions (matches backend/app/context/os_harness.md's "Safety and user
  // intent" section). WorkflowCard.tsx normally auto-executes a proposed tool call immediately
  // (so a voice command doesn't stop at a redundant tap) - this forces a real tap-to-confirm
  // gate instead for anything on that list, closing the gap between what the harness prompt
  // tells the model ("tool proposals are shown to the user for confirmation before execution")
  // and what the client previously actually did (auto-execute unconditionally).
  confirmBeforeExecute?: boolean;
};
