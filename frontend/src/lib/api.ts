const PROD_API = 'https://saas-platform-v4o3.onrender.com';
const DEV_API = 'http://localhost:4000';
const ENV_API = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();

const API_BASE =
  (import.meta.env.PROD && ENV_API?.includes('localhost') ? undefined : ENV_API) ||
  (import.meta.env.PROD ? PROD_API : DEV_API);

export interface ApiError extends Error {
  status: number;
  data?: unknown;
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let tenantId: string | null = null;

export function setAuth(tokens: { accessToken?: string | null; refreshToken?: string | null }) {
  if (tokens.accessToken !== undefined) {
    accessToken = tokens.accessToken;
    if (accessToken) localStorage.setItem('accessToken', accessToken);
    else localStorage.removeItem('accessToken');
  }
  if (tokens.refreshToken !== undefined) {
    refreshToken = tokens.refreshToken;
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    else localStorage.removeItem('refreshToken');
  }
}

export function loadStoredAuth() {
  accessToken = localStorage.getItem('accessToken');
  refreshToken = localStorage.getItem('refreshToken');
  tenantId = localStorage.getItem('tenantId');
}

export function setActiveTenant(id: string | null) {
  tenantId = id;
  if (id) localStorage.setItem('tenantId', id);
  else localStorage.removeItem('tenantId');
}

export function getActiveTenant(): string | null {
  return tenantId;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getApiBase() {
  return API_BASE;
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    accessToken = data.accessToken;
    if (accessToken) localStorage.setItem('accessToken', accessToken);
    return true;
  } catch {
    return false;
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { json?: unknown; sendTenant?: boolean } = {}
): Promise<T> {
  const { json, sendTenant = true, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((headers as Record<string, string>) || {}),
  };
  if (accessToken) finalHeaders.Authorization = `Bearer ${accessToken}`;
  if (sendTenant && tenantId) finalHeaders['X-Tenant-Id'] = tenantId;

  const doFetch = () =>
    fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: json !== undefined ? JSON.stringify(json) : (rest as RequestInit).body,
    });

  let res = await doFetch();
  if (res.status === 401 && refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      finalHeaders.Authorization = `Bearer ${accessToken}`;
      res = await doFetch();
    }
  }
  if (!res.ok) {
    let data: unknown = undefined;
    try {
      data = await res.json();
    } catch {
      /* noop */
    }
    const message =
      (data as { error?: string })?.error || `HTTP ${res.status} ${res.statusText}`;
    const err = new Error(message) as ApiError;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const Api = {
  login: (email: string, password: string) =>
    api<{
      accessToken: string;
      refreshToken: string;
      user: { id: string; email: string; name: string; isSuperAdmin: boolean };
      memberships: Array<{
        tenant_id: string;
        tenant_name: string;
        tenant_slug: string;
        role: string;
      }>;
    }>('/auth/login', { method: 'POST', json: { email, password }, sendTenant: false }),
  register: (email: string, name: string, password: string) =>
    api('/auth/register', {
      method: 'POST',
      json: { email, name, password },
      sendTenant: false,
    }),
  me: () => api<{ user: any; memberships: any[] }>('/auth/me', { sendTenant: false }),
  logout: (refreshToken: string) =>
    api('/auth/logout', { method: 'POST', json: { refreshToken }, sendTenant: false }),

  listOrgs: () => api<{ tenants: any[] }>('/organizations', { sendTenant: false }),
  createOrg: (data: {
    name: string;
    slug: string;
    adminEmail?: string;
    adminName?: string;
    adminPassword?: string;
  }) =>
    api<{ tenant: any }>('/organizations', {
      method: 'POST',
      json: data,
      sendTenant: false,
    }),
  updateOrg: (id: string, data: { name?: string; slug?: string }) =>
    api<{ tenant: any }>(`/organizations/${id}`, {
      method: 'PATCH',
      json: data,
      sendTenant: false,
    }),
  deactivateOrg: (id: string) =>
    api(`/organizations/${id}`, { method: 'DELETE', sendTenant: false }),

  listUsers: (tenantId: string) =>
    api<{ members: any[] }>(`/organizations/${tenantId}/users`, { sendTenant: false }),
  inviteUser: (
    tenantId: string,
    data: { email: string; name: string; password: string; role: string }
  ) =>
    api(`/organizations/${tenantId}/users`, {
      method: 'POST',
      json: data,
      sendTenant: false,
    }),
  changeUserRole: (tenantId: string, userId: string, role: string) =>
    api(`/organizations/${tenantId}/users/${userId}/role`, {
      method: 'PATCH',
      json: { role },
      sendTenant: false,
    }),
  removeUser: (tenantId: string, userId: string) =>
    api(`/organizations/${tenantId}/users/${userId}`, {
      method: 'DELETE',
      sendTenant: false,
    }),
  deactivateUser: (tenantId: string, userId: string) =>
    api(`/organizations/${tenantId}/users/${userId}/deactivate`, {
      method: 'POST',
      sendTenant: false,
    }),

  listDocs: (includeDeleted = false) =>
    api<{ documents: any[] }>(`/documents${includeDeleted ? '?includeDeleted=1' : ''}`),
  getDoc: (id: string) =>
    api<{ document: any; access: any; latestVersion: any }>(`/api/documents/${id}`),
  createDoc: (title: string) =>
    api<{ document: any }>('/documents', { method: 'POST', json: { title } }),
  updateDoc: (
    id: string,
    data: { title?: string; contentHtml?: string; autosave?: boolean }
  ) => api<{ document: any }>(`/api/documents/${id}`, { method: 'PATCH', json: data }),
  putDoc: (
    id: string,
    data: { title?: string; contentHtml?: string; autosave?: boolean }
  ) => api<{ document: any }>(`/api/documents/${id}`, { method: 'PUT', json: data }),
  deleteDoc: (id: string) => api(`/documents/${id}`, { method: 'DELETE' }),
  restoreDoc: (id: string) => api(`/documents/${id}/restore`, { method: 'POST' }),

  listPermissions: (id: string) => api<{ permissions: any[] }>(`/documents/${id}/permissions`),
  share: (id: string, data: { userId?: string; email?: string; role: string }) =>
    api(`/documents/${id}/share`, { method: 'POST', json: data }),
  updatePermission: (id: string, userId: string, role: string) =>
    api(`/documents/${id}/permissions/${userId}`, { method: 'PATCH', json: { role } }),
  revokePermission: (id: string, userId: string) =>
    api(`/documents/${id}/permissions/${userId}`, { method: 'DELETE' }),

  listVersions: (id: string) => api<{ versions: any[] }>(`/documents/${id}/versions`),
  getVersion: (id: string, versionId: string) =>
    api<{ version: any }>(`/documents/${id}/versions/${versionId}`),
  restoreVersion: (id: string, versionId: string) =>
    api<{ ok: boolean; newVersion: number }>(`/documents/${id}/versions/${versionId}/restore`, {
      method: 'POST',
    }),

  stats: (opts: { sendTenant?: boolean } = { sendTenant: true }) =>
    api<{
      scope: 'platform' | 'tenant';
      organizations?: number;
      users: number;
      documents: number;
      active_collaborators: number;
      tenant_id?: string;
      recent: Array<{
        id: string;
        actor_email: string | null;
        action: string;
        target_id: string | null;
        tenant_id: string | null;
        created_at: number;
      }>;
    }>('/stats', { sendTenant: opts.sendTenant ?? true }),

  audit: (params: { action?: string; targetId?: string; limit?: number; offset?: number } = {}) => {
    const sp = new URLSearchParams();
    if (params.action) sp.set('action', params.action);
    if (params.targetId) sp.set('targetId', params.targetId);
    if (params.limit) sp.set('limit', String(params.limit));
    if (params.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString() ? `?${sp}` : '';
    return api<{ logs: any[] }>(`/audit-logs${qs}`);
  },
};
