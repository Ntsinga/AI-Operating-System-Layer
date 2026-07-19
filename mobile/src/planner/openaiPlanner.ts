import type { InstalledApp } from '../native/AppManager';
import { tools } from '../tools/registry';

// SECURITY NOTE: This calls the OpenAI API directly from the client using a key
// bundled into the app via EXPO_PUBLIC_OPENAI_API_KEY. That means the key ships
// inside the APK and can be extracted. This is acceptable ONLY for this local,
// personal dev-only tool bench (Phase 2 prototype per docs/AI_OS_ORCHESTRATOR_PLAN.md).
// Before any real distribution, move this call behind a backend proxy that holds
// the key server-side instead.
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
const OPENAI_MODEL = 'gpt-4o-mini';
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

export type PlannedToolCall = {
  toolName: string;
  arguments: Record<string, unknown>;
};

type OpenAiToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

type OpenAiChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: OpenAiToolCall[];
    };
  }>;
  error?: { message?: string };
};

function buildOpenAiTools() {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

// Asks the model to pick exactly one tool and its arguments for the given command.
// Does NOT execute the tool - the caller must show the proposal and get explicit
// user confirmation before calling tool.execute(), per the plan's Phase 2 design.
//
// installedApps, when provided, is listed in the system prompt so open_application
// (and any future tool needing a real package name) is grounded in what is actually
// on THIS device instead of the model guessing from training-data knowledge of common
// package names - which is often wrong (e.g. Google Photos is com.google.android.apps.photos,
// not com.android.gallery). Pass the result of get_installed_apps.execute() here.
export async function planToolCall(
  command: string,
  installedApps?: InstalledApp[]
): Promise<PlannedToolCall> {
  if (!OPENAI_API_KEY) {
    throw new Error(
      'EXPO_PUBLIC_OPENAI_API_KEY is not set. Add it to mobile/.env and restart the dev server.'
    );
  }

  const appsContext = installedApps?.length
    ? `\n\nApps actually installed on this device (name -> packageName), for grounding ` +
      `open_application and similar tools - use these exact package names, do not guess:\n` +
      installedApps.map((app) => `${app.name} -> ${app.packageName}`).join('\n')
    : '';

  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a phone-control planner. Given a user command, choose exactly one tool ' +
            'from the provided list and call it with the correct arguments. Only call a tool ' +
            'that exists. If no tool fits the command, do not call any tool.' +
            appsContext,
        },
        { role: 'user', content: command },
      ],
      tools: buildOpenAiTools(),
      tool_choice: 'auto',
    }),
  });

  const data = (await response.json()) as OpenAiChatCompletionResponse;

  if (!response.ok) {
    throw new Error(data.error?.message ?? `OpenAI request failed with status ${response.status}.`);
  }

  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    const content = data.choices?.[0]?.message?.content;
    throw new Error(content?.trim() || 'The model did not choose a tool for this command.');
  }

  let parsedArguments: Record<string, unknown>;
  try {
    parsedArguments = JSON.parse(toolCall.function.arguments || '{}');
  } catch {
    throw new Error(`Model returned invalid arguments JSON for ${toolCall.function.name}.`);
  }

  return { toolName: toolCall.function.name, arguments: parsedArguments };
}
