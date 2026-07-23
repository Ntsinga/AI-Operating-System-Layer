import { BACKEND_BASE_URL } from '../config/backend';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_BASE_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data && typeof data === 'object' && 'detail' in data ? String(data.detail) : `Google request failed (${response.status}).`);
  return data as T;
}
export type GmailSearchResult = { id: string; threadId?: string; snippet: string; from: string; to: string; subject: string; date: string };
export type DriveSearchResult = { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string; description?: string };
export function searchGmail(query: string, maxResults = 10) { return request<GmailSearchResult[]>('/connect/google/gmail/search', { method: 'POST', body: JSON.stringify({ query, maxResults }) }); }
export function readGmail(messageId: string) { return request<GmailSearchResult & { body: string }>(`/connect/google/gmail/${encodeURIComponent(messageId)}`); }
export function searchDrive(query: string, maxResults = 10) { return request<DriveSearchResult[]>('/connect/google/drive/search', { method: 'POST', body: JSON.stringify({ query, maxResults }) }); }
export function readDrive(fileId: string) { return request<DriveSearchResult & { content: string }>(`/connect/google/drive/${encodeURIComponent(fileId)}`); }
export function createGmailDraft(to: string, subject: string, body: string) { return request<unknown>('/connect/google/gmail/drafts', { method: 'POST', body: JSON.stringify({ to, subject, body }) }); }
export function createGoogleCalendarEvent(title: string, startTime: string, endTime: string, description: string) { return request<unknown>('/connect/google/calendar/events', { method: 'POST', body: JSON.stringify({ title, startTime, endTime, description }) }); }
export function getGoogleCalendarUpcoming(hours = 168) { return request<unknown[]>(`/connect/google/calendar/upcoming?hours=${encodeURIComponent(hours)}`); }
