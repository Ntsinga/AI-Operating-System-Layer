import { BACKEND_BASE_URL } from '../config/backend';

export type LearningAction = {
  surface?: string;
  role?: string;
  text?: string;
  resourceId?: string;
  action?: string;
  value?: string;
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
  return request('/procedures', 'GET') as Promise<Array<{ id: number; intent: string; steps: unknown[]; outcome: string; scope: string; version: number; state: string; createdAt: string }>>;
}

export function deleteLearnedProcedure(id: number) {
  return request(`/procedures/${id}`, 'DELETE');
}

export function approveLearnedProcedure(id: number) {
  return request(`/procedures/${id}/approve`, 'POST');
}
