import { BACKEND_BASE_URL } from '../config/backend';

export type LearningAction = {
  surface?: string;
  role?: string;
  text?: string;
  contentDescription?: string;
  resourceId?: string;
  fieldKey?: string;
  action?: string;
  value?: string;
  screen?: {
    surface?: string;
    role?: string;
    title?: string;
    visibleTexts?: string[];
    interactiveElements?: Array<Record<string, unknown>>;
  };
};

export type DebugEvent = {
  traceId: string;
  flow: 'learning' | 'replay' | string;
  event: string;
  level?: 'info' | 'warn' | 'error' | string;
  sessionId?: string;
  procedureId?: number;
  step?: number;
  details?: Record<string, unknown>;
};

async function request(path: string, method: string, body?: unknown) {
  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : `Learning request failed (${response.status}).`);
  return data;
}

export function startLearningSession(intent: string, appPackage?: string) {
  return request('/learning/sessions', 'POST', { intent, appPackage });
}

export function appendLearningAction(sessionId: string, action: LearningAction) {
  return request(`/learning/sessions/${sessionId}/actions`, 'POST', { action });
}

export function completeLearningSession(sessionId: string) {
  return request(`/learning/sessions/${sessionId}/complete`, 'POST');
}

export async function listLearnedProcedures() {
  return request('/procedures', 'GET') as Promise<Array<{ id: number; intent: string; steps: Array<{ arguments?: Record<string, unknown> }>; outcome: string; scope: string; version: number; state: string; createdAt: string }>>;
}

export function deleteLearnedProcedure(id: number) {
  return request(`/procedures/${id}`, 'DELETE');
}

export function approveLearnedProcedure(id: number) {
  return request(`/procedures/${id}/approve`, 'POST');
}

export function recordDebugEvents(events: DebugEvent[]) {
  if (events.length === 0) return Promise.resolve({ stored: 0 });
  return request('/debug/events', 'POST', { events });
}

export function listDebugEvents(params: { traceId?: string; sessionId?: string; procedureId?: number; limit?: number } = {}) {
  const search = new URLSearchParams();
  if (params.traceId) search.set('traceId', params.traceId);
  if (params.sessionId) search.set('sessionId', params.sessionId);
  if (params.procedureId !== undefined) search.set('procedureId', String(params.procedureId));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  const query = search.toString();
  return request(`/debug/events${query ? `?${query}` : ''}`, 'GET') as Promise<DebugEvent[]>;
}
