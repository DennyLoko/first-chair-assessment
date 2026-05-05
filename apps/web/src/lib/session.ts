const KEY = 'first-chair.sessionId';

export class EmbedMismatchUiError extends Error {
  constructor(public readonly body: unknown) {
    super('Embed model dimension mismatch');
    this.name = 'EmbedMismatchUiError';
  }
}

export async function ensureSession(providerId: string, apiKey: string): Promise<string> {
  const r = await fetch('/api/session/key', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ providerId, apiKey }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    if (r.status === 422) throw new EmbedMismatchUiError(body);
    throw new Error((body as { message?: string }).message ?? `Session error ${r.status}`);
  }
  const { sessionId } = await r.json() as { sessionId: string };
  localStorage.setItem(KEY, sessionId);

  // Set all roles to the chosen provider (single-provider mode).
  await fetch('/api/session/roles', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Session-Id': sessionId },
    body: JSON.stringify({
      visionProviderId: providerId,
      embedProviderId: providerId,
      rerankProviderId: providerId,
    }),
  });

  return sessionId;
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}

export function authHeaders(): Record<string, string> {
  const id = localStorage.getItem(KEY);
  return id ? { 'X-Session-Id': id } : {};
}
