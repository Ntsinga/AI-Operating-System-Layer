import { BACKEND_BASE_URL } from '../config/backend';

export type ImageSearchResult = {
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
  width?: number | null;
  height?: number | null;
};

export async function searchImages(query: string, count = 12): Promise<ImageSearchResult[]> {
  const response = await fetch(`${BACKEND_BASE_URL}/search/images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, count }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data && typeof data === 'object' && 'detail' in data ? data.detail : null;
    throw new Error(typeof detail === 'string' ? detail : `Image search failed (${response.status}).`);
  }
  return data as ImageSearchResult[];
}
