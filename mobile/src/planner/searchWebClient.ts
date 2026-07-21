import { BACKEND_BASE_URL } from '../config/backend';

export type WebSearchResult = {
  title: string;
  url: string;
  description: string;
};

export async function searchWeb(query: string, count = 5): Promise<WebSearchResult[]> {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_BASE_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, count }),
    });
  } catch (fetchError) {
    const detail = fetchError instanceof Error ? `${fetchError.name}: ${fetchError.message}` : String(fetchError);
    throw new Error(
      `Could not reach the backend at ${BACKEND_BASE_URL} (${detail}). Is "uvicorn app.main:app" running in backend/?`
    );
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data && typeof data === 'object' && 'detail' in data ? data.detail : null;
    throw new Error(typeof detail === 'string' ? detail : `Search request failed (${response.status}).`);
  }

  return data as WebSearchResult[];
}
