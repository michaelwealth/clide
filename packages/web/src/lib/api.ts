const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 15000
): Promise<T> {
  const url = `${API_URL}${path}`;

  const controller = new AbortController();
  const timer = timeoutMs > 0
    ? setTimeout(() => controller.abort('Request timed out'), timeoutMs)
    : null;

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, (body as any).error || res.statusText);
    }

    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(0, 'Request timed out');
    }
    throw new ApiError(0, (err as Error).message || 'Network error');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── Auth ──
export const api = {
  auth: {
    me: () => request<{ user: any; workspaces: any[] }>('/api/auth/me'),
    logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
    loginUrl: () => `${API_URL}/api/auth/login`,
    passwordLogin: (email: string, password: string) =>
      request<{ user: any; workspaces: any[] }>('/api/auth/password-login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
  },

  // ── Workspaces ──
  workspaces: {
    list: () => request<{ workspaces: any[] }>('/api/workspaces'),
    create: (data: { name: string; slug: string }) =>
      request<{ workspace: any }>('/api/workspaces', { method: 'POST', body: JSON.stringify(data) }),
    get: (wid: string) => request<{ workspace: any }>(`/api/workspaces/${wid}/details`),
    update: (wid: string, data: { name: string }) =>
      request(`/api/workspaces/${wid}`, { method: 'PUT', body: JSON.stringify(data) }),
    members: {
      list: (wid: string) => request<{ members: any[] }>(`/api/workspaces/${wid}/members`),
      add: (wid: string, data: { email: string; role: string }) =>
        request(`/api/workspaces/${wid}/members`, { method: 'POST', body: JSON.stringify(data) }),
      update: (wid: string, mid: string, data: { role: string }) =>
        request(`/api/workspaces/${wid}/members/${mid}`, { method: 'PUT', body: JSON.stringify(data) }),
      remove: (wid: string, mid: string) =>
        request(`/api/workspaces/${wid}/members/${mid}`, { method: 'DELETE' }),
    },
    smsConfig: {
      get: (wid: string) => request<{ config: any }>(`/api/workspaces/${wid}/sms-config`),
      update: (wid: string, data: any) =>
        request(`/api/workspaces/${wid}/sms-config`, { method: 'PUT', body: JSON.stringify(data) }),
    },
  },

  // ── Campaigns ──
  campaigns: {
    list: (wid: string, params?: { status?: string; page?: number; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.page) qs.set('page', String(params.page));
      if (params?.limit) qs.set('limit', String(params.limit));
      return request<{ campaigns: any[]; pagination: any }>(`/api/workspaces/${wid}/campaigns?${qs}`);
    },
    create: (wid: string, data: any) =>
      request<{ campaign: any }>(`/api/workspaces/${wid}/campaigns`, { method: 'POST', body: JSON.stringify(data) }),
    get: (wid: string, cid: string) =>
      request<{ campaign: any; stats: any }>(`/api/workspaces/${wid}/campaigns/${cid}`),
    update: (wid: string, cid: string, data: any) =>
      request(`/api/workspaces/${wid}/campaigns/${cid}`, { method: 'PUT', body: JSON.stringify(data) }),
    schedule: (wid: string, cid: string) =>
      request(`/api/workspaces/${wid}/campaigns/${cid}/schedule`, { method: 'POST' }),
    activate: (wid: string, cid: string) =>
      request(`/api/workspaces/${wid}/campaigns/${cid}/activate`, { method: 'POST' }),
    pause: (wid: string, cid: string) =>
      request(`/api/workspaces/${wid}/campaigns/${cid}/pause`, { method: 'POST' }),
    expire: (wid: string, cid: string) =>
      request(`/api/workspaces/${wid}/campaigns/${cid}/expire`, { method: 'POST' }),
    delete: (wid: string, cid: string) =>
      request(`/api/workspaces/${wid}/campaigns/${cid}`, { method: 'DELETE' }),
    analytics: (wid: string, cid: string) =>
      request<any>(`/api/workspaces/${wid}/campaigns/${cid}/analytics`),
  },

  // ── Contacts ──
  contacts: {
    list: (wid: string, cid: string, params?: Record<string, string>) => {
      const qs = new URLSearchParams(params);
      return request<{ contacts: any[]; pagination: any }>(
        `/api/workspaces/${wid}/campaigns/${cid}/contacts?${qs}`
      );
    },
    upload: async (wid: string, cid: string, file: File, fieldMapping?: Record<string, string>) => {
      const formData = new FormData();
      formData.append('file', file);
      if (fieldMapping) {
        formData.append('field_mapping', JSON.stringify(fieldMapping));
      }
      const url = `${API_URL}/api/workspaces/${wid}/campaigns/${cid}/contacts/upload`;
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new ApiError(res.status, (body as any).error || res.statusText);
      }
      return res.json();
    },
    uploads: (wid: string, cid: string) =>
      request<{ uploads: any[] }>(`/api/workspaces/${wid}/campaigns/${cid}/contacts/uploads`),
    exportUrl: (wid: string, cid: string) =>
      `${API_URL}/api/workspaces/${wid}/campaigns/${cid}/contacts/export`,
  },

  // ── SMS ──
  sms: {
    send: (wid: string, cid: string, data: { contact_ids?: string[]; send_all?: boolean }) =>
      request<{ queued: number; skipped: number; total: number }>(
        `/api/workspaces/${wid}/campaigns/${cid}/sms/send`,
        { method: 'POST', body: JSON.stringify(data) }
      ),
    logs: (wid: string, cid: string, params?: Record<string, string>) => {
      const qs = new URLSearchParams(params);
      return request<{ logs: any[]; pagination: any }>(
        `/api/workspaces/${wid}/campaigns/${cid}/sms/logs?${qs}`
      );
    },
  },

  // ── Triggers ──
  triggers: {
    list: (wid: string, cid: string) =>
      request<{ triggers: any[] }>(`/api/workspaces/${wid}/campaigns/${cid}/triggers`),
    create: (wid: string, cid: string, data: any) =>
      request<{ trigger: any }>(`/api/workspaces/${wid}/campaigns/${cid}/triggers`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (wid: string, cid: string, tid: string, data: any) =>
      request(`/api/workspaces/${wid}/campaigns/${cid}/triggers/${tid}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (wid: string, cid: string, tid: string) =>
      request(`/api/workspaces/${wid}/campaigns/${cid}/triggers/${tid}`, { method: 'DELETE' }),
  },

  // ── Analytics ──
  analytics: {
    workspace: (wid: string) => request<any>(`/api/workspaces/${wid}/analytics`),
    campaign: (wid: string, cid: string) => request<any>(`/api/workspaces/${wid}/campaigns/${cid}/analytics`),
  },

  // ── Short Links ──
  links: {
    list: (wid: string, params?: Record<string, string>) => {
      const qs = new URLSearchParams(params);
      return request<{ links: any[]; pagination: any }>(`/api/workspaces/${wid}/links?${qs}`);
    },
    create: (wid: string, data: { url: string; title?: string; slug?: string; expires_at?: string }) =>
      request<{ link: any }>(`/api/workspaces/${wid}/links`, { method: 'POST', body: JSON.stringify(data) }),
    get: (wid: string, lid: string) =>
      request<{ link: any; analytics: any }>(`/api/workspaces/${wid}/links/${lid}`),
    update: (wid: string, lid: string, data: any) =>
      request(`/api/workspaces/${wid}/links/${lid}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (wid: string, lid: string) =>
      request(`/api/workspaces/${wid}/links/${lid}`, { method: 'DELETE' }),
  },

  // ── Admin ──
  admin: {
    users: {
      list: (params?: Record<string, string>) => {
        const qs = new URLSearchParams(params);
        return request<{ users: any[]; pagination: any }>(`/api/admin/users?${qs}`);
      },
      invite: (data: { email: string; name: string; is_super_admin?: boolean }) =>
        request<{ user: any }>('/api/admin/users/invite', { method: 'POST', body: JSON.stringify(data) }),
      update: (uid: string, data: any) =>
        request(`/api/admin/users/${uid}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (uid: string) =>
        request(`/api/admin/users/${uid}`, { method: 'DELETE' }),
    },
  },
};
