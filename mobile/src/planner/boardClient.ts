import { BACKEND_BASE_URL } from '../config/backend';

// The sessions list and lifecycle calls for Board (backend/app/boards.py). Saving the scene and
// asking about the drawing happen inside the canvas page itself (assets/board/index.html), which
// calls the same backend directly - so those are deliberately not here.
export type BoardKind = 'drawing' | 'lesson' | 'choices';

export type BoardSummary = {
  id: string;
  title: string;
  kind: BoardKind;
  thumb: string;
  createdAt: string;
  updatedAt: string;
};

async function request(path: string, method: string, body?: unknown) {
  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : `Board request failed (${response.status}).`);
  return data;
}

export function createBoard(title: string, kind: BoardKind = 'drawing') {
  return request('/boards', 'POST', { title, kind }) as Promise<{ id: string; title: string; kind: BoardKind }>;
}

export function listBoards() {
  return request('/boards', 'GET') as Promise<BoardSummary[]>;
}

export function deleteBoard(id: string) {
  return request(`/boards/${id}`, 'DELETE');
}
