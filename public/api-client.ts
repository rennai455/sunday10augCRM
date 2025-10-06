// Minimal typed API client generated from docs/openapi.json
// Note: This client assumes cookie-based auth; fetch includes credentials by default.

export type Order = 'asc' | 'desc';
export type CampaignSort = 'created_at' | 'updated_at';
export type LeadSort = 'created_at' | 'status' | 'updated_at';

export interface Campaign {
  id: number;
  agency_id: number;
  name: string;
  status: string;
  details?: Record<string, unknown> | null;
  created_at: string; // ISO datetime
  updated_at?: string; // ISO datetime
}

export interface Lead {
  id: number;
  campaign_id: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  status_history?: Array<Record<string, unknown>> | null;
  created_at: string; // ISO datetime
  score?: number | null;
}

export interface DashboardTotals {
  campaigns: number;
  leads: number;
  averageScore: number;
  activeClients: number;
}

export interface DashboardCampaignSummary {
  id: number;
  client: string | null;
  status: string;
  leads: number;
  started_at: string; // ISO datetime
}

export interface DashboardResponse {
  totals: DashboardTotals;
  recentCampaigns: DashboardCampaignSummary[];
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface LeadCreateBody {
  campaign_id: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  score?: number | null;
}

export interface LeadUpdateBody {
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  score?: number;
}

export interface ListParams {
  page?: number;
  pageSize?: number;
  sort?: CampaignSort | LeadSort;
  order?: Order;
}

export interface LeadsFilterQuery extends ListParams {
  campaignId?: number;
  status?: string;
  from?: string; // ISO datetime
  to?: string;   // ISO datetime
}

export interface ApiClientOptions {
  baseUrl?: string; // defaults to '' (relative)
  fetchImpl?: typeof fetch; // for tests
}

function createFetcher(baseUrl = '', fetchImpl: typeof fetch = fetch) {
  return async function request<T>(
    input: string,
    init?: RequestInit & { parseAs?: 'json' | 'text' },
  ): Promise<T> {
    const url = baseUrl ? baseUrl.replace(/\/$/, '') + input : input;
    const res = await fetchImpl(url, { credentials: 'include', ...init });
    if (!res.ok) {
      let body: any = undefined;
      try { body = await res.json(); } catch { /* ignore */ }
      const err: any = new Error(`HTTP ${res.status} ${res.statusText}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    const mode = init?.parseAs ?? 'json';
    // @ts-expect-error dynamic parse
    return mode === 'text' ? res.text() : res.json();
  };
}

export function createApiClient(opts: ApiClientOptions = {}) {
  const request = createFetcher(opts.baseUrl, opts.fetchImpl);

  // Auth
  const login = (body: LoginBody) => request<{ success: boolean; token?: string; expiresIn?: number }>(`/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const logout = () => request<{ success: boolean }>(`/api/auth/logout`, { method: 'POST' });
  const me = () => request<{ success: boolean; email?: string; agency?: string | null; role?: 'admin' | 'user' }>(`/api/auth/me`);
  const csrfToken = () => request<{ csrfToken?: string }>(`/api/csrf-token`);

  // Campaigns
  const listCampaigns = (params: ListParams = {}) => request<{ campaigns: Campaign[] }>(`/api/campaigns${toQuery(params)}`);
  const getCampaign = (id: string | number) => request<Campaign>(`/api/campaigns/${id}`);

  // Leads
  const listLeads = (params: LeadsFilterQuery = {}) => request<{ leads: Lead[] }>(`/api/leads${toQuery(params)}`);
  const getLead = (id: string | number) => request<Lead>(`/api/leads/${id}`);
  const createLead = (body: LeadCreateBody) => request<Lead>(`/api/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const updateLead = (id: string | number, body: LeadUpdateBody) => request<Lead>(`/api/leads/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const deleteLead = (id: string | number) => request<void>(`/api/leads/${id}`, { method: 'DELETE' });

  // Audit
  const auditLeads = (limit?: number) => request<{ events: Array<Record<string, unknown>> }>(`/api/audit/leads${toQuery({ limit })}`);
  const auditRecent = (limit?: number) => request<{ events: Array<Record<string, unknown>> }>(`/api/audit/recent${toQuery({ limit })}`);
  const auditSearch = (params: { action?: string; from?: string; to?: string; limit?: number }) => request<{ events: Array<Record<string, unknown>> }>(`/api/audit/search${toQuery(params)}`);

  // Dashboard
  const dashboard = () => request<DashboardResponse>(`/api/dashboard`);

  return {
    login, logout, me, csrfToken,
    listCampaigns, getCampaign,
    listLeads, getLead, createLead, updateLead, deleteLead,
    auditLeads, auditRecent, auditSearch,
    dashboard,
  };
}

function toQuery(params: Record<string, any> = {}): string {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (pairs.length === 0) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of pairs) usp.set(k, String(v));
  const q = usp.toString();
  return q ? `?${q}` : '';
}

export type ApiClient = ReturnType<typeof createApiClient>;
