import { BACKEND_BASE_URL } from '../config/backend';
import type { InstalledApp } from '../native/AppManager';
import { buildOpenAiToolSchemas } from '../tools/openAiSchema';

export type ProposedToolCall = {
  toolName: string;
  arguments: Record<string, unknown>;
};

export type ToolCallRecord = ProposedToolCall & { result: unknown };

export type WorkflowResponse =
  | { threadId: string; status: 'awaiting_confirmation'; proposedTool: ProposedToolCall; history: ToolCallRecord[]; reusedProcedureCount: number }
  | { threadId: string; status: 'awaiting_reply'; message: string; history: ToolCallRecord[]; reusedProcedureCount: number }
  | { threadId: string; status: 'done'; finalMessage: string; history: ToolCallRecord[]; reusedProcedureCount: number };

async function postJson(path: string, body: unknown): Promise<WorkflowResponse> {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (fetchError) {
    const detail = fetchError instanceof Error ? `${fetchError.name}: ${fetchError.message}` : String(fetchError);
    throw new Error(
      `Could not reach the backend at ${BACKEND_BASE_URL} (${detail}). Is "uvicorn app.main:app" ` +
        'running in backend/? (Emulator only - a physical device needs the host LAN IP, see CLAUDE.md.)'
    );
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data && typeof data === 'object' && 'detail' in data ? data.detail : null;
    throw new Error(typeof detail === 'string' ? detail : `Backend request failed (${response.status}).`);
  }

  return data as WorkflowResponse;
}

// Starts a new multi-step workflow for the given command. Returns either the
// first tool call proposal (caller must confirm + execute + call resumeWorkflow)
// or a final result if the model needed no tools at all.
export function startWorkflow(command: string, installedApps?: InstalledApp[]): Promise<WorkflowResponse> {
  return postJson('/workflow/start', {
    command,
    tools: buildOpenAiToolSchemas(),
    installedApps,
  });
}

// Resumes a paused workflow with the result of executing the previously proposed
// tool call (or an { error: string } object if the user cancelled or execution failed).
export function resumeWorkflow(threadId: string, result: unknown): Promise<WorkflowResponse> {
  return postJson(`/workflow/${threadId}/resume`, { result });
}
