// Copyright (C), 2026 Quartz Systems. Some rights reserved. This work is
// licensed under the terms of the MIT license which can be found in the
// root directory of this project.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("qf_token");
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {}
    throw new Error(message);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface ApiUser {
  id: string;
  username: string;
  email: string;
  display_name: string;
  role: "admin" | "operator" | "viewer";
  status: "active" | "inactive";
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoginResponse {
  token: string;
  user: ApiUser;
}

export interface UpdateProfilePayload {
  display_name?: string;
  email?: string;
  password?: string;
}

export const auth = {
  login: (username: string, password: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<ApiUser>("/auth/me"),
  updateMe: (payload: UpdateProfilePayload) =>
    request<ApiUser>("/auth/me", { method: "PUT", body: JSON.stringify(payload) }),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export interface CreateUserPayload {
  username: string;
  email: string;
  display_name: string;
  password: string;
  role: string;
}

export interface UpdateUserPayload {
  display_name?: string;
  email?: string;
  role?: string;
  status?: string;
  password?: string;
}

export const users = {
  list: () => request<ApiUser[]>("/users"),
  get: (id: string) => request<ApiUser>(`/users/${id}`),
  create: (payload: CreateUserPayload) =>
    request<ApiUser>("/users", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: UpdateUserPayload) =>
    request<ApiUser>(`/users/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<void>(`/users/${id}`, { method: "DELETE" }),
};

// ─── Devices ──────────────────────────────────────────────────────────────────

export interface ApiDevice {
  id: string;
  hostname: string;
  ip_address: string;
  model: string | null;
  location: string;
  role: "core" | "distribution" | "access" | "edge";
  status: "online" | "offline" | "warning" | "unknown";
  os_version: string | null;
  serial_number: string | null;
  port_count: number | null;
  uptime: string | null;
  cpu_pct: number | null;
  mem_pct: number | null;
  manufacturer: string | null;
  last_seen: string | null;
  rest_port: number;
  created_at: string;
  updated_at: string;
}

export interface CreateDevicePayload {
  hostname: string;
  ip_address: string;
  location: string;
  role: string;
  rest_username: string;
  rest_password: string;
  rest_port?: number;
}

export interface UpdateDevicePayload {
  hostname?: string;
  ip_address?: string;
  location?: string;
  role?: string;
  rest_username?: string;
  rest_password?: string;
  rest_port?: number;
}

export interface ApiInterface {
  id: string;
  device_id: string;
  name: string;
  description: string | null;
  status: string;
  speed: string | null;
  duplex: string | null;
  updated_at: string;
}

export interface ApiArpEntry {
  id: string;
  device_id: string;
  ip_address: string;
  mac_address: string;
  interface: string | null;
  age_minutes: string | null;
  updated_at: string;
}

export interface ApiMacEntry {
  id: string;
  device_id: string;
  mac_address: string;
  vlan: string | null;
  interface: string | null;
  entry_type: string | null;
  updated_at: string;
}

export interface ApiEvent {
  id: string;
  device_id: string;
  severity: "info" | "warning" | "error";
  message: string;
  created_at: string;
}

export interface ApiVlan {
  id: string;
  device_id: string;
  vlan_id: number;
  name: string | null;
  status: string;
  tagged_ports: string | null;
  untagged_ports: string | null;
  updated_at: string;
}

export interface ApiPsu {
  id: string;
  device_id: string;
  slot: string;
  status: string;
  present: boolean;
  power_watts: number | null;
  avg_power_watts: number | null;
  fan_speed_rpm: number | null;
  updated_at: string;
}

export interface ApiFan {
  id: string;
  device_id: string;
  slot: string;
  status: string;
  present: boolean;
  speed_rpm: string | null;
  updated_at: string;
}

export interface ApiTemp {
  id: string;
  device_id: string;
  slot: string;
  temp_c: number;
  updated_at: string;
}

export interface ApiEnvironment {
  psus: ApiPsu[];
  fans: ApiFan[];
  temps: ApiTemp[];
}

// ─── YANG Config Operations ───────────────────────────────────────────────────

export type ConfigOp =
  | { type: "iface_shutdown";      iface: string; shutdown: boolean }
  | { type: "iface_description";   iface: string; description: string }
  | { type: "iface_portmode";      iface: string; mode: string }
  | { type: "vlan_create";         vlan_id: number; name?: string }
  | { type: "vlan_delete";         vlan_id: number }
  | { type: "vlan_description";    vlan_id: number; description: string }
  | { type: "vlan_tagged_add";     vlan_id: number; iface: string }
  | { type: "vlan_tagged_remove";  vlan_id: number; iface: string }
  | { type: "vlan_untagged_add";   vlan_id: number; iface: string }
  | { type: "vlan_untagged_remove";vlan_id: number; iface: string };

export const devices = {
  list: () => request<ApiDevice[]>("/devices"),
  get: (id: string) => request<ApiDevice>(`/devices/${id}`),
  create: (payload: CreateDevicePayload) =>
    request<ApiDevice>("/devices", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: UpdateDevicePayload) =>
    request<ApiDevice>(`/devices/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<void>(`/devices/${id}`, { method: "DELETE" }),
  refresh: (id: string) =>
    request<void>(`/devices/${id}/refresh`, { method: "POST" }),
  interfaces: (id: string) => request<ApiInterface[]>(`/devices/${id}/interfaces`),
  arp: (id: string) => request<ApiArpEntry[]>(`/devices/${id}/arp`),
  mac: (id: string) => request<ApiMacEntry[]>(`/devices/${id}/mac`),
  vlans: (id: string) => request<ApiVlan[]>(`/devices/${id}/vlans`),
  events: (id: string, limit?: number) =>
    request<ApiEvent[]>(`/devices/${id}/events${limit ? `?limit=${limit}` : ""}`),
  exec: (id: string, command: string) =>
    request<{ output: string }>(`/devices/${id}/exec`, {
      method: "POST",
      body: JSON.stringify({ command }),
    }),
  environment: (id: string) => request<ApiEnvironment>(`/devices/${id}/environment`),
  configure: (id: string, ops: ConfigOp[]) =>
    request<{ output: string }>(`/devices/${id}/configure`, {
      method: "POST",
      body: JSON.stringify({ ops }),
    }),
};

// ─── Summary ──────────────────────────────────────────────────────────────────

export interface ApiSummary {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  warning_devices: number;
  total_users: number;
  active_users: number;
  recent_events: ApiEvent[];
}

export const summary = {
  get: () => request<ApiSummary>("/summary"),
};

// ─── Config Templates ─────────────────────────────────────────────────────────

export interface TemplateVariable {
  key: string;
  label: string;
  placeholder?: string;
}

export interface ApiTemplate {
  id: string;
  name: string;
  description: string | null;
  content: string;
  variables: string; // JSON string: TemplateVariable[]
  created_at: string;
  updated_at: string;
}

export interface CreateTemplatePayload {
  name: string;
  description?: string;
  content: string;
  variables: string; // JSON string
}

export interface UpdateTemplatePayload {
  name?: string;
  description?: string;
  content?: string;
  variables?: string;
}

export interface PushTemplatePayload {
  device_ids: string[];
  variables: Record<string, string>;
}

export interface PushResult {
  device_id: string;
  hostname: string;
  success: boolean;
  output: string | null;
  error: string | null;
}

export interface PushTemplateResponse {
  results: PushResult[];
}

export const templates = {
  list: () => request<ApiTemplate[]>("/templates"),
  get: (id: string) => request<ApiTemplate>(`/templates/${id}`),
  create: (payload: CreateTemplatePayload) =>
    request<ApiTemplate>("/templates", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: UpdateTemplatePayload) =>
    request<ApiTemplate>(`/templates/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<void>(`/templates/${id}`, { method: "DELETE" }),
  push: (id: string, payload: PushTemplatePayload) =>
    request<PushTemplateResponse>(`/templates/${id}/push`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface ApiSettings {
  poll_interval_secs: number;
  poll_concurrency: number;
  rest_timeout_secs: number;
  jwt_expiry_hours: number;
  display_timezone: string;
  listen_addr: string;
  cors_origin: string;
}

export interface UpdateSettingsPayload {
  poll_interval_secs?: number;
  poll_concurrency?: number;
  rest_timeout_secs?: number;
  jwt_expiry_hours?: number;
  display_timezone?: string;
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export interface GlobalEvent {
  id: string;
  device_id: string;
  device_hostname: string;
  severity: "info" | "warning" | "error";
  message: string;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  user_id: string;
  username: string;
  device_id: string;
  device_hostname: string;
  action: string;
  details: string | null;
  created_at: string;
}

export const settings = {
  get: () => request<ApiSettings>("/settings"),
  update: (payload: UpdateSettingsPayload) =>
    request<ApiSettings>("/settings", { method: "PUT", body: JSON.stringify(payload) }),
};

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  kind: "device" | "interface" | "vlan";
  device_id: string;
  device_hostname: string;
  label: string;
  sublabel: string | null;
}

export const search = {
  query: (q: string) => request<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`),
};

export const logs = {
  events: (limit?: number) =>
    request<GlobalEvent[]>(`/events${limit ? `?limit=${limit}` : ""}`),
  auditLog: (limit?: number) =>
    request<AuditLogEntry[]>(`/audit-log${limit ? `?limit=${limit}` : ""}`),
};
