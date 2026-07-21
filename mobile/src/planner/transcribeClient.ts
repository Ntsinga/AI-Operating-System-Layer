import { BACKEND_BASE_URL } from '../config/backend';

export async function transcribeAudio(fileUri: string): Promise<string> {
  const formData = new FormData();
  // React Native's fetch/FormData accepts this {uri, name, type} shape for file uploads.
  formData.append('file', {
    uri: fileUri,
    name: 'recording.m4a',
    type: 'audio/m4a',
  } as unknown as Blob);

  let response: Response;
  try {
    response = await fetch(`${BACKEND_BASE_URL}/transcribe`, {
      method: 'POST',
      body: formData,
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
    throw new Error(typeof detail === 'string' ? detail : `Transcription request failed (${response.status}).`);
  }

  return (data as { text: string }).text;
}
