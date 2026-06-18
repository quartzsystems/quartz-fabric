"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Server,
  Wifi,
  WifiOff,
  Plus,
  Trash2,
  Pencil,
  Search,
  RefreshCw,
  ExternalLink,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { devices as devicesApi, type ApiDevice } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/lib/toast";

type DeviceStatus = "online" | "offline" | "warning" | "unknown";

const STATUS_META: Record<DeviceStatus, { badgeClass: string; icon: React.ReactNode; label: string }> = {
  online:  { badgeClass: "badge badge-success", icon: <Wifi         size={11} />, label: "Online"  },
  offline: { badgeClass: "badge badge-danger",  icon: <WifiOff      size={11} />, label: "Offline" },
  warning: { badgeClass: "badge badge-warn",    icon: <AlertTriangle size={11} />, label: "Warning" },
  unknown: { badgeClass: "badge badge-neutral", icon: <Server        size={11} />, label: "Unknown" },
};

const ROLE_BADGE: Record<string, string> = {
  core:         "badge badge-accent",
  distribution: "badge badge-blue",
  access:       "badge badge-neutral",
  edge:         "badge badge-warn",
};

/* ── Small field helper ─────────────────────────────────────────────────────── */

function Field({
  label,
  children,
  error,
  desc,
}: {
  label: string;
  children: React.ReactNode;
  error?: string | null;
  desc?: string;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
      {desc && <div className="field-desc">{desc}</div>}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      <input
        className="input"
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ paddingRight: 36 }}
      />
      <span className="input-suffix">
        <button
          type="button"
          className="btn-icon btn-icon-sm"
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
        >
          {show ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </span>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────── */

type AddForm = {
  hostname: string;
  ip_address: string;
  location: string;
  role: ApiDevice["role"];
  ssh_username: string;
  ssh_password: string;
  ssh_port: number;
};

type EditForm = {
  hostname: string;
  ip_address: string;
  location: string;
  role: ApiDevice["role"];
  ssh_username: string;
  ssh_password: string;
  ssh_port: number;
};

const EMPTY_ADD: AddForm = {
  hostname: "",
  ip_address: "",
  location: "",
  role: "access",
  ssh_username: "",
  ssh_password: "",
  ssh_port: 22,
};

export default function DevicesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "admin";
  const canEdit = user?.role !== "viewer";

  const [deviceList, setDeviceList] = useState<ApiDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<ApiDevice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiDevice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [addForm, setAddForm] = useState<AddForm>(EMPTY_ADD);
  const [addErrors, setAddErrors] = useState<Partial<Record<keyof AddForm, string>>>({});
  const [editForm, setEditForm] = useState<EditForm>({ ...EMPTY_ADD });
  const [editErrors, setEditErrors] = useState<Partial<Record<keyof EditForm, string>>>({});

  const loadDevices = useCallback(async () => {
    setError(null);
    try {
      const data = await devicesApi.list();
      setDeviceList(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const validateAdd = () => {
    const e: Partial<Record<keyof AddForm, string>> = {};
    if (addForm.hostname.trim().length < 2) e.hostname = "Hostname required";
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(addForm.ip_address)) e.ip_address = "Invalid IP address";
    if (addForm.location.trim().length < 2) e.location = "Location required";
    if (addForm.ssh_username.trim().length < 1) e.ssh_username = "SSH username required";
    if (addForm.ssh_password.length < 1) e.ssh_password = "SSH password required";
    setAddErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateEdit = () => {
    const e: Partial<Record<keyof EditForm, string>> = {};
    if (editForm.hostname.trim().length < 2) e.hostname = "Hostname required";
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(editForm.ip_address)) e.ip_address = "Invalid IP address";
    if (editForm.location.trim().length < 2) e.location = "Location required";
    setEditErrors(e);
    return Object.keys(e).length === 0;
  };

  const filtered = deviceList.filter((d) => {
    const matchSearch =
      d.hostname.toLowerCase().includes(search.toLowerCase()) ||
      d.ip_address.includes(search) ||
      (d.model ?? "").toLowerCase().includes(search.toLowerCase()) ||
      d.location.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    const matchRole = roleFilter === "all" || d.role === roleFilter;
    return matchSearch && matchStatus && matchRole;
  });

  const stats = {
    total:   deviceList.length,
    online:  deviceList.filter((d) => d.status === "online").length,
    offline: deviceList.filter((d) => d.status === "offline").length,
    warning: deviceList.filter((d) => d.status === "warning").length,
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAdd()) return;
    setSubmitting(true);
    try {
      await devicesApi.create(addForm);
      setAddForm(EMPTY_ADD);
      setAddOpen(false);
      toast({ title: "Device added", message: `${addForm.hostname} added to inventory.`, type: "success" });
      loadDevices();
    } catch (err) {
      toast({ title: "Error", message: err instanceof Error ? err.message : "Failed to add device", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditOpen = (d: ApiDevice) => {
    setEditTarget(d);
    setEditForm({
      hostname: d.hostname,
      ip_address: d.ip_address,
      location: d.location,
      role: d.role,
      ssh_username: "",
      ssh_password: "",
      ssh_port: d.ssh_port,
    });
    setEditErrors({});
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || !validateEdit()) return;
    setSubmitting(true);
    try {
      const payload: Parameters<typeof devicesApi.update>[1] = {
        hostname: editForm.hostname,
        ip_address: editForm.ip_address,
        location: editForm.location,
        role: editForm.role,
        ssh_port: editForm.ssh_port,
      };
      if (editForm.ssh_username) payload.ssh_username = editForm.ssh_username;
      if (editForm.ssh_password) payload.ssh_password = editForm.ssh_password;
      await devicesApi.update(editTarget.id, payload);
      setEditOpen(false);
      toast({ title: "Device updated", message: `${editForm.hostname} updated.`, type: "info" });
      loadDevices();
    } catch (err) {
      toast({ title: "Error", message: err instanceof Error ? err.message : "Failed to update device", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await devicesApi.delete(deleteTarget.id);
      setDeleteOpen(false);
      toast({ title: "Device removed", message: `${deleteTarget.hostname} removed.`, type: "warn" });
      loadDevices();
    } catch (err) {
      toast({ title: "Error", message: err instanceof Error ? err.message : "Failed to delete device", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = async (id: string) => {
    setRefreshingId(id);
    try {
      await devicesApi.refresh(id);
      toast({ title: "Polling queued", message: "Device will be polled shortly.", type: "info" });
      setTimeout(loadDevices, 5000);
    } catch (err) {
      toast({ title: "Error", message: err instanceof Error ? err.message : "Failed to refresh", type: "error" });
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <div style={{ padding: 28 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "var(--qz-fs-xl)", fontWeight: 700, color: "var(--qz-fg)" }}>
            Devices &amp; Inventory
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-4)" }}>
            Dell OS9 switch inventory and status
          </p>
        </div>
        {canEdit && (
          <button className="btn" onClick={() => { setAddForm(EMPTY_ADD); setAddErrors({}); setAddOpen(true); }}>
            <Plus size={15} /> Add Device
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* Stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 72 }} />
            ))
          : [
              { label: "Total Devices", value: stats.total,   icon: <Server size={16} />,        color: "var(--qz-accent)"  },
              { label: "Online",        value: stats.online,  icon: <Wifi size={16} />,           color: "var(--qz-success)" },
              { label: "Offline",       value: stats.offline, icon: <WifiOff size={16} />,        color: "var(--qz-danger)"  },
              { label: "Warning",       value: stats.warning, icon: <AlertTriangle size={16} />,  color: "var(--qz-warn)"    },
            ].map((s) => (
              <div key={s.label} className="card" style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "var(--qz-radius-md)",
                      background: `color-mix(in oklab, ${s.color} 15%, transparent)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: s.color,
                      flexShrink: 0,
                    }}
                  >
                    {s.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: "var(--qz-fs-xl)", fontWeight: 700, color: "var(--qz-fg)" }}>{s.value}</div>
                    <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)" }}>{s.label}</div>
                  </div>
                </div>
              </div>
            ))}
      </div>

      {/* Table card */}
      <div className="card">
        {/* Filters */}
        <div style={{ padding: "12px 14px", display: "flex", gap: 10, flexWrap: "wrap", borderBottom: "1px solid var(--qz-border)" }}>
          <div className="input-wrap" style={{ flex: 1, minWidth: 200 }}>
            <span className="input-icon"><Search size={14} /></span>
            <input
              className="input"
              placeholder="Search hostname, IP, model, location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input"
            style={{ width: 160 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="online">Online</option>
            <option value="warning">Warning</option>
            <option value="offline">Offline</option>
            <option value="unknown">Unknown</option>
          </select>
          <select
            className="input"
            style={{ width: 160 }}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">All Roles</option>
            <option value="core">Core</option>
            <option value="distribution">Distribution</option>
            <option value="access">Access</option>
            <option value="edge">Edge</option>
          </select>
        </div>

        <div className="scroll-x">
          <table className="qz-table">
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>Hostname</th>
                <th>IP Address</th>
                <th>Model</th>
                <th>Role</th>
                <th>Status</th>
                <th>OS Version</th>
                <th>Location</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9}>
                      <div className="skeleton" style={{ height: 24 }} />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    style={{
                      textAlign: "center",
                      padding: "40px 20px",
                      color: "var(--qz-fg-4)",
                      fontSize: "var(--qz-fs-sm)",
                    }}
                  >
                    {search || statusFilter !== "all" || roleFilter !== "all"
                      ? "No devices match your filter"
                      : "No devices found. Add your first device to get started."}
                  </td>
                </tr>
              ) : (
                filtered.map((device) => {
                  const statusMeta = STATUS_META[device.status as DeviceStatus] ?? STATUS_META.unknown;
                  const isExpanded = expandedId === device.id;
                  return (
                    <React.Fragment key={device.id}>
                      <tr>
                        <td>
                          <button
                            className="btn-icon btn-icon-sm"
                            onClick={() => setExpandedId((p) => (p === device.id ? null : device.id))}
                          >
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <div
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: "var(--qz-radius-sm)",
                                background: "var(--qz-accent-soft)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "var(--qz-accent)",
                                flexShrink: 0,
                              }}
                            >
                              <Server size={11} />
                            </div>
                            <span
                              style={{
                                fontFamily: "var(--qz-font-mono)",
                                fontSize: "var(--qz-fs-sm)",
                                fontWeight: 500,
                              }}
                            >
                              {device.hostname}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-sm)" }}>
                            {device.ip_address}
                          </span>
                        </td>
                        <td style={{ fontSize: "var(--qz-fs-sm)" }}>{device.model ?? "N/A"}</td>
                        <td>
                          <span className={ROLE_BADGE[device.role] ?? "badge badge-neutral"}>
                            {device.role}
                          </span>
                        </td>
                        <td>
                          <span className={statusMeta.badgeClass}>
                            {statusMeta.icon}
                            {statusMeta.label}
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              fontFamily: "var(--qz-font-mono)",
                              fontSize: "var(--qz-fs-xs)",
                              color: "var(--qz-fg-4)",
                            }}
                          >
                            {device.os_version ?? "N/A"}
                          </span>
                        </td>
                        <td style={{ fontSize: "var(--qz-fs-sm)" }}>{device.location}</td>
                        <td>
                          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                            <Link href={`/dashboard/devices/${device.id}`} className="btn-icon-sm accent" title="View configuration">
                              <ExternalLink size={12} />
                            </Link>
                            <button
                              className="btn-icon-sm info"
                              title="Refresh status"
                              onClick={() => handleRefresh(device.id)}
                              disabled={refreshingId === device.id}
                            >
                              <RefreshCw size={12} style={refreshingId === device.id ? { animation: "spin 1s linear infinite" } : undefined} />
                            </button>
                            {canEdit && (
                              <button className="btn-icon-sm" style={{ background: "rgba(79,179,255,0.12)", color: "var(--qz-info)", border: "1px solid rgba(79,179,255,0.3)" }} title="Edit device" onClick={() => handleEditOpen(device)}>
                                <Pencil size={12} />
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                className="btn-icon-sm danger"
                                title="Remove device"
                                onClick={() => { setDeleteTarget(device); setDeleteOpen(true); }}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${device.id}-detail`} style={{ background: "var(--qz-surface-sunken)" }}>
                          <td colSpan={9} style={{ padding: "14px 18px" }}>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                                gap: 14,
                              }}
                            >
                              {[
                                { label: "Serial Number", value: device.serial_number ?? "Not polled", mono: true },
                                { label: "Port Count",    value: device.port_count != null ? `${device.port_count} ports` : "Not polled", mono: false },
                                { label: "Uptime",        value: device.uptime ?? "Not polled", mono: true },
                                {
                                  label: "Last Seen",
                                  value: device.last_seen
                                    ? new Date(device.last_seen).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
                                    : "Never",
                                  mono: true,
                                },
                              ].map((detail) => (
                                <div key={detail.label}>
                                  <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", marginBottom: 4 }}>
                                    {detail.label}
                                  </div>
                                  {detail.mono ? (
                                    <code>{detail.value}</code>
                                  ) : (
                                    <span style={{ fontSize: "var(--qz-fs-sm)", fontWeight: 500, color: "var(--qz-fg-2)" }}>
                                      {detail.value}
                                    </span>
                                  )}
                                </div>
                              ))}
                              {device.status !== "offline" && device.status !== "unknown" && (
                                <>
                                  <div>
                                    <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", marginBottom: 4 }}>CPU Usage</div>
                                    <span
                                      className={`badge ${device.cpu_pct != null && device.cpu_pct > 80 ? "badge-danger" : device.cpu_pct != null && device.cpu_pct > 60 ? "badge-warn" : "badge-success"}`}
                                    >
                                      {device.cpu_pct != null ? `${device.cpu_pct}%` : "N/A"}
                                    </span>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", marginBottom: 4 }}>Memory Usage</div>
                                    <span
                                      className={`badge ${device.mem_pct != null && device.mem_pct > 80 ? "badge-danger" : device.mem_pct != null && device.mem_pct > 60 ? "badge-warn" : "badge-success"}`}
                                    >
                                      {device.mem_pct != null ? `${device.mem_pct}%` : "N/A"}
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                            <div style={{ marginTop: 12 }}>
                              <Link
                                href={`/dashboard/devices/${device.id}`}
                                className="btn btn-ghost btn-sm"
                              >
                                <ExternalLink size={12} /> Full Configuration
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Device Modal */}
      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title="Add Device" size="md">
        <form onSubmit={handleAdd}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Hostname" error={addErrors.hostname}>
              <input className="input" placeholder="ACCESS-SW-10" value={addForm.hostname} onChange={(e) => setAddForm((f) => ({ ...f, hostname: e.target.value }))} />
            </Field>
            <Field label="IP Address" error={addErrors.ip_address}>
              <input className="input" placeholder="10.0.2.10" value={addForm.ip_address} onChange={(e) => setAddForm((f) => ({ ...f, ip_address: e.target.value }))} />
            </Field>
            <Field label="Role">
              <select className="input" value={addForm.role} onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value as ApiDevice["role"] }))}>
                <option value="core">Core</option>
                <option value="distribution">Distribution</option>
                <option value="access">Access</option>
                <option value="edge">Edge</option>
              </select>
            </Field>
            <Field label="Location" error={addErrors.location}>
              <input className="input" placeholder="DC1 - Rack C10" value={addForm.location} onChange={(e) => setAddForm((f) => ({ ...f, location: e.target.value }))} />
            </Field>

            <div className="divider-label">
              <KeyRound size={12} />
              SSH Credentials
            </div>

            <Field label="SSH Username" error={addErrors.ssh_username}>
              <input className="input" placeholder="admin" value={addForm.ssh_username} onChange={(e) => setAddForm((f) => ({ ...f, ssh_username: e.target.value }))} />
            </Field>
            <Field label="SSH Password" error={addErrors.ssh_password}>
              <PasswordField value={addForm.ssh_password} onChange={(v) => setAddForm((f) => ({ ...f, ssh_password: v }))} />
            </Field>
            <Field label="SSH Port">
              <input className="input" type="number" min={1} max={65535} value={addForm.ssh_port} onChange={(e) => setAddForm((f) => ({ ...f, ssh_port: parseInt(e.target.value) || 22 }))} />
            </Field>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setAddOpen(false)} disabled={submitting}>Cancel</button>
              <button type="submit" className="btn" disabled={submitting}>
                {submitting ? "Adding..." : "Add Device"}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Edit Device Modal */}
      <Modal opened={editOpen} onClose={() => setEditOpen(false)} title="Edit Device" size="md">
        <form onSubmit={handleEdit}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Hostname" error={editErrors.hostname}>
              <input className="input" value={editForm.hostname} onChange={(e) => setEditForm((f) => ({ ...f, hostname: e.target.value }))} />
            </Field>
            <Field label="IP Address" error={editErrors.ip_address}>
              <input className="input" value={editForm.ip_address} onChange={(e) => setEditForm((f) => ({ ...f, ip_address: e.target.value }))} />
            </Field>
            <Field label="Location" error={editErrors.location}>
              <input className="input" value={editForm.location} onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))} />
            </Field>
            <Field label="Role">
              <select className="input" value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as ApiDevice["role"] }))}>
                <option value="core">Core</option>
                <option value="distribution">Distribution</option>
                <option value="access">Access</option>
                <option value="edge">Edge</option>
              </select>
            </Field>

            <div className="divider-label">
              <KeyRound size={12} />
              Update SSH Credentials (leave blank to keep existing)
            </div>

            <Field label="SSH Username">
              <input className="input" placeholder="Leave blank to keep current" value={editForm.ssh_username} onChange={(e) => setEditForm((f) => ({ ...f, ssh_username: e.target.value }))} />
            </Field>
            <Field label="SSH Password">
              <PasswordField value={editForm.ssh_password} onChange={(v) => setEditForm((f) => ({ ...f, ssh_password: v }))} placeholder="Leave blank to keep current" />
            </Field>
            <Field label="SSH Port">
              <input className="input" type="number" min={1} max={65535} value={editForm.ssh_port} onChange={(e) => setEditForm((f) => ({ ...f, ssh_port: parseInt(e.target.value) || 22 }))} />
            </Field>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setEditOpen(false)} disabled={submitting}>Cancel</button>
              <button type="submit" className="btn" disabled={submitting}>
                {submitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal opened={deleteOpen} onClose={() => setDeleteOpen(false)} title="Remove Device" size="sm">
        <p style={{ margin: "0 0 20px", fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-2)" }}>
          Are you sure you want to remove <strong>{deleteTarget?.hostname}</strong> ({deleteTarget?.ip_address}) from inventory? This action cannot be undone.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setDeleteOpen(false)} disabled={submitting}>Cancel</button>
          <button className="btn btn-danger" onClick={handleDelete} disabled={submitting}>
            {submitting ? "Removing..." : "Remove Device"}
          </button>
        </div>
      </Modal>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
