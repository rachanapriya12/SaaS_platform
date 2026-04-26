/**
 * Single place for backend HTTP + WebSocket base URL.
 * - Local: defaults to http://localhost:4000
 * - Production: set VITE_API_BASE (frontend/.env.production and/or Vercel env). No trailing slash.
 */

function stripTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, '');
}

export function getApiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
  if (fromEnv) return stripTrailingSlashes(fromEnv);
  if (import.meta.env.DEV) return 'http://localhost:4000';
  console.error(
    '[CollabDocs] VITE_API_BASE is empty. Set frontend/.env.production or Vercel env and rebuild.'
  );
  return 'http://localhost:4000';
}

/** Same host as API; ws:// or wss:// */
export function getWebsocketBase(): string {
  return getApiBase().replace(/^http/, 'ws');
}
