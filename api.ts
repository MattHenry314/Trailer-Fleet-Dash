const API_BASE = import.meta.env.VITE_API_BASE || '/api';

function getToken() {
  return localStorage.getItem('gfc_token');
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers, ...(options.headers as any) } });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  login: (email: string) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email }) }),
  me: () => request('/auth/me'),

  getFleet: () => request('/fleet'),
  getTrailer: (key: string) => request(`/fleet/${encodeURIComponent(key)}`),
  getRateHistory: (key: string) => request(`/fleet/${encodeURIComponent(key)}/rate-history`),
  updateTrailer: (key: string, body: Record<string, unknown>) =>
    request(`/fleet/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(body) }),

  getOpportunities: () => request('/opportunities'),
  createOpportunity: (body: Record<string, unknown>) =>
    request('/opportunities', { method: 'POST', body: JSON.stringify(body) }),
  updateOpportunity: (id: number, body: Record<string, unknown>) =>
    request(`/opportunities/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  reoptimizeOpportunity: (id: number) => request(`/opportunities/${id}/reoptimize`, { method: 'POST' }),
  removeOpportunity: (id: number) => request(`/opportunities/${id}`, { method: 'DELETE' }),

  getExceptions: () => request('/exceptions'),
  resolveException: (key: string, body: Record<string, unknown>) =>
    request(`/exceptions/${encodeURIComponent(key)}/resolve`, { method: 'PUT', body: JSON.stringify(body) }),

  refreshWorkbook: (file: File) => {
    const token = getToken();
    const form = new FormData();
    form.append('workbook', file);
    return fetch(`${API_BASE}/workbook/refresh`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Refresh failed');
      return data;
    });
  },
  getWorkbookHistory: () => request('/workbook/history'),

  getEditors: () => request('/editors'),
  addEditor: (email: string, role: string) =>
    request('/editors', { method: 'POST', body: JSON.stringify({ email, role }) }),
  removeEditor: (email: string) => request(`/editors/${encodeURIComponent(email)}`, { method: 'DELETE' })
};

export { getToken };
