"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Pencil,
  RefreshCw,
  Server,
  ShieldAlert,
  Terminal,
  Activity,
  Clock,
  Eye,
  EyeOff,
  Tag,
  AlertTriangle,
  Wifi,
  WifiOff,
  Send,
  BookOpen,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  devices as devicesApi,
  type ApiArpEntry,
  type ApiDevice,
  type ApiEvent,
  type ApiInterface,
  type ApiMacEntry,
  type ApiVlan,
} from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/lib/toast";

const PRESET_COMMANDS = [
  { label: "Show Version",           value: "show version" },
  { label: "Show Running Config",    value: "show running-config" },
  { label: "Show Interfaces",        value: "show interfaces" },
  { label: "Show Interfaces Status", value: "show interfaces status" },
  { label: "Show VLAN",              value: "show vlan" },
  { label: "Show ARP",               value: "show arp" },
  { label: "Show MAC Table",         value: "show mac-address-table" },
  { label: "Show Spanning Tree",     value: "show spanning-tree 0" },
  { label: "Show LLDP Neighbors",    value: "show lldp neighbors" },
  { label: "Show IP Route",          value: "show ip route" },
  { label: "Show CPU",               value: "show processes cpu" },
  { label: "Show Memory",            value: "show memory" },
  { label: "Show Logging",           value: "show logging" },
];

type DeviceStatus = "online" | "offline" | "warning" | "unknown";

const STATUS_META: Record<DeviceStatus, { badgeClass: string; icon: React.ReactNode; label: string }> = {
  online:  { badgeClass: "badge badge-success", icon: <Wifi          size={11} />, label: "Online"  },
  offline: { badgeClass: "badge badge-danger",  icon: <WifiOff       size={11} />, label: "Offline" },
  warning: { badgeClass: "badge badge-warn",    icon: <AlertTriangle size={11} />, label: "Warning" },
  unknown: { badgeClass: "badge badge-neutral", icon: <Server        size={11} />, label: "Unknown" },
};

const TABS = [
  { id: "overview",   label: "Overview",  icon: <Server    size={13} /> },
  { id: "interfaces", label: "Interfaces",icon: <Activity  size={13} /> },
  { id: "vlans",      label: "VLANs",     icon: <Tag       size={13} /> },
  { id: "arp",        label: "ARP",       icon: <Clock     size={13} /> },
  { id: "mac",        label: "MAC Table", icon: <BookOpen  size={13} /> },
  { id: "commands",   label: "Commands",  icon: <Terminal  size={13} /> },
];

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string | null }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

function PasswordField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
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
        <button type="button" className="btn-icon btn-icon-sm" onClick={() => setShow((s) => !s)} tabIndex={-1}>
          {show ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </span>
    </div>
  );
}

export default function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = user?.role !== "viewer";
  const isAdmin = user?.role === "admin";

  const [device, setDevice] = useState<ApiDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Tab data
  const [interfaces, setInterfaces] = useState<ApiInterface[] | null>(null);
  const [vlans, setVlans] = useState<ApiVlan[] | null>(null);
  const [arpEntries, setArpEntries] = useState<ApiArpEntry[] | null>(null);
  const [macEntries, setMacEntries] = useState<ApiMacEntry[] | null>(null);
  const [events, setEvents] = useState<ApiEvent[] | null>(null);
  const [tabLoading, setTabLoading] = useState(false);

  // Command executor
  const [command, setCommand] = useState("");
  const [execOutput, setExecOutput] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);

  // Interface edit modal
  const [editingIface, setEditingIface] = useState<ApiInterface | null>(null);
  const [editIfaceDesc, setEditIfaceDesc] = useState("");
  const [editIfaceShutdown, setEditIfaceShutdown] = useState(false);
  const [savingIface, setSavingIface] = useState(false);

  // VLAN edit modal
  const [editingVlan, setEditingVlan] = useState<ApiVlan | null>(null);
  const [editVlanName, setEditVlanName] = useState("");
  const [savingVlan, setSavingVlan] = useState(false);

  const loadDevice = useCallback(async () => {
    try {
      const d = await devicesApi.get(id);
      setDevice(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load device");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDevice();
  }, [loadDevice]);

  const loadTabData = useCallback(
    async (tab: string) => {
      if (tab === "overview" || tab === "commands") return;
      setTabLoading(true);
      try {
        if (tab === "interfaces" && !interfaces) {
          setInterfaces(await devicesApi.interfaces(id));
        } else if (tab === "vlans" && !vlans) {
          setVlans(await devicesApi.vlans(id));
        } else if (tab === "arp" && !arpEntries) {
          setArpEntries(await devicesApi.arp(id));
        } else if (tab === "mac" && !macEntries) {
          setMacEntries(await devicesApi.mac(id));
        }
      } catch (e) {
        toast({ title: "Error", message: e instanceof Error ? e.message : "Failed to load data", type: "error" });
      } finally {
        setTabLoading(false);
      }
    },
    [id, interfaces, vlans, arpEntries, macEntries, toast]
  );

  useEffect(() => {
    loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  useEffect(() => {
    devicesApi.events(id, 10).then(setEvents).catch(() => {});
  }, [id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await devicesApi.refresh(id);
      toast({ title: "Poll queued", message: "Device will be polled shortly.", type: "info" });
    } catch (e) {
      toast({ title: "Error", message: e instanceof Error ? e.message : "Failed to queue poll", type: "error" });
    } finally {
      setRefreshing(false);
    }
  };

  const handleExec = async () => {
    if (!command.trim()) return;
    setExecuting(true);
    setExecOutput(null);
    try {
      const res = await devicesApi.exec(id, command);
      setExecOutput(res.output);
    } catch (e) {
      setExecOutput(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExecuting(false);
    }
  };

  const openIfaceEdit = (iface: ApiInterface) => {
    setEditingIface(iface);
    setEditIfaceDesc(iface.description ?? "");
    setEditIfaceShutdown(iface.status.toLowerCase() === "down");
  };

  const saveIfaceEdit = async () => {
    if (!editingIface) return;
    setSavingIface(true);
    try {
      const lines = ["configure terminal", `interface ${editingIface.name}`];
      if (editIfaceDesc !== (editingIface.description ?? "")) {
        lines.push(`description ${editIfaceDesc}`);
      }
      const wasDown = editingIface.status.toLowerCase() === "down";
      if (editIfaceShutdown !== wasDown) {
        lines.push(editIfaceShutdown ? "shutdown" : "no shutdown");
      }
      lines.push("end");
      const res = await devicesApi.exec(id, lines.join("\n"));
      toast({ title: "Interface updated", message: `${editingIface.name} configured successfully.`, type: "success" });
      setExecOutput(res.output);
      setInterfaces(null);
      setEditingIface(null);
    } catch (e) {
      toast({ title: "Error", message: e instanceof Error ? e.message : "Command failed", type: "error" });
    } finally {
      setSavingIface(false);
    }
  };

  const openVlanEdit = (vlan: ApiVlan) => {
    setEditingVlan(vlan);
    setEditVlanName(vlan.name ?? "");
  };

  const saveVlanEdit = async () => {
    if (!editingVlan) return;
    setSavingVlan(true);
    try {
      const cmd = ["configure terminal", `vlan ${editingVlan.vlan_id}`, `name ${editVlanName}`, "end"].join("\n");
      const res = await devicesApi.exec(id, cmd);
      toast({ title: "VLAN updated", message: `VLAN ${editingVlan.vlan_id} name updated.`, type: "success" });
      setExecOutput(res.output);
      setVlans(null);
      setEditingVlan(null);
    } catch (e) {
      toast({ title: "Error", message: e instanceof Error ? e.message : "Command failed", type: "error" });
    } finally {
      setSavingVlan(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 48 }} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !device) {
    return (
      <div style={{ padding: 28 }}>
        <div className="alert alert-danger" style={{ marginBottom: 14 }}>
          <AlertCircle size={15} />
          <span>{error ?? "Device not found"}</span>
        </div>
        <Link href="/dashboard/devices" className="btn btn-ghost btn-sm">
          <ArrowLeft size={14} /> Back to Devices
        </Link>
      </div>
    );
  }

  const statusMeta = STATUS_META[device.status as DeviceStatus] ?? STATUS_META.unknown;

  return (
    <div style={{ padding: 28 }}>
      {/* Interface edit modal */}
      <Modal
        opened={!!editingIface}
        onClose={() => setEditingIface(null)}
        title={`Edit Interface: ${editingIface?.name ?? ""}`}
        size="md"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Description">
            <input
              className="input"
              placeholder="Server uplink"
              value={editIfaceDesc}
              onChange={(e) => setEditIfaceDesc(e.target.value)}
            />
          </Field>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={editIfaceShutdown}
              onChange={(e) => setEditIfaceShutdown(e.target.checked)}
              style={{ accentColor: "var(--qz-danger)" }}
            />
            <span style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-2)" }}>
              Shutdown interface
            </span>
          </label>
          <div className="alert alert-warn">
            <ShieldAlert size={14} />
            <span>This will push configuration to the live switch immediately.</span>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setEditingIface(null)}>Cancel</button>
            <button className="btn" onClick={saveIfaceEdit} disabled={savingIface}>
              <Check size={13} />
              {savingIface ? "Applying..." : "Apply to Switch"}
            </button>
          </div>
        </div>
      </Modal>

      {/* VLAN edit modal */}
      <Modal
        opened={!!editingVlan}
        onClose={() => setEditingVlan(null)}
        title={`Edit VLAN ${editingVlan?.vlan_id ?? ""}`}
        size="sm"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="VLAN Name">
            <input
              className="input"
              placeholder="Production"
              value={editVlanName}
              onChange={(e) => setEditVlanName(e.target.value)}
            />
          </Field>
          <div className="alert alert-warn">
            <ShieldAlert size={14} />
            <span>This will push configuration to the live switch immediately.</span>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setEditingVlan(null)}>Cancel</button>
            <button className="btn" onClick={saveVlanEdit} disabled={savingVlan || !editVlanName.trim()}>
              <Check size={13} />
              {savingVlan ? "Applying..." : "Apply to Switch"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/dashboard/devices" className="btn btn-ghost btn-sm">
            <ArrowLeft size={14} />
          </Link>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: "var(--qz-fs-xl)",
                  fontWeight: 700,
                  color: "var(--qz-fg)",
                  fontFamily: "var(--qz-font-mono)",
                }}
              >
                {device.hostname}
              </h2>
              <span className={statusMeta.badgeClass}>
                {statusMeta.icon}
                {statusMeta.label}
              </span>
            </div>
            <p style={{ margin: "3px 0 0", fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-4)" }}>
              {device.ip_address} &mdash; {device.location}
            </p>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw size={14} style={refreshing ? { animation: "spin 1s linear infinite" } : undefined} />
          Poll Now
        </button>
      </div>

      {/* Quick stats card */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
            gap: 16,
          }}
        >
          {[
            { label: "Model",         value: device.model,        mono: false },
            { label: "OS Version",    value: device.os_version,   mono: true  },
            { label: "Serial #",      value: device.serial_number,mono: true  },
            { label: "Port Count",    value: device.port_count != null ? `${device.port_count} ports` : null, mono: false },
            { label: "Uptime",        value: device.uptime,       mono: false },
            { label: "Last Seen",     value: device.last_seen ? new Date(device.last_seen).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : null, mono: false },
          ].map((r) => (
            <div key={r.label}>
              <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", marginBottom: 3 }}>
                {r.label}
              </div>
              {r.mono ? (
                <code>{r.value ?? "N/A"}</code>
              ) : (
                <span style={{ fontSize: "var(--qz-fs-sm)", fontWeight: 500, color: "var(--qz-fg-2)" }}>
                  {r.value ?? "N/A"}
                </span>
              )}
            </div>
          ))}
        </div>
        {(device.cpu_pct != null || device.mem_pct != null) && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--qz-border)", display: "flex", gap: 20 }}>
            {device.cpu_pct != null && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)" }}>CPU:</span>
                <span className={`badge ${device.cpu_pct > 80 ? "badge-danger" : device.cpu_pct > 60 ? "badge-warn" : "badge-success"}`}>
                  {device.cpu_pct}%
                </span>
              </div>
            )}
            {device.mem_pct != null && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)" }}>Memory:</span>
                <span className={`badge ${device.mem_pct > 80 ? "badge-danger" : device.mem_pct > 60 ? "badge-warn" : "badge-success"}`}>
                  {device.mem_pct}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: 20 }}>
        {TABS.filter((t) => t.id !== "commands" || canEdit).map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn${activeTab === tab.id ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-hdr">
              <span style={{ fontWeight: 600, fontSize: "var(--qz-fs-sm)" }}>Device Details</span>
            </div>
            <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
              {[
                { label: "Hostname",     value: device.hostname,                      mono: true  },
                { label: "IP Address",   value: device.ip_address,                    mono: true  },
                { label: "Role",         value: device.role,                          mono: false },
                { label: "Location",     value: device.location,                      mono: false },
                { label: "SSH Port",     value: String(device.ssh_port),              mono: true  },
                { label: "Added",        value: new Date(device.created_at).toLocaleDateString(), mono: false },
                { label: "Last Updated", value: new Date(device.updated_at).toLocaleString(),     mono: false },
              ].map((r) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-4)", flexShrink: 0 }}>{r.label}</span>
                  {r.mono ? <code>{r.value}</code> : <span style={{ fontSize: "var(--qz-fs-sm)", fontWeight: 500, color: "var(--qz-fg-2)", textAlign: "right" }}>{r.value}</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-hdr">
              <span style={{ fontWeight: 600, fontSize: "var(--qz-fs-sm)" }}>Recent Events</span>
            </div>
            <div style={{ padding: 16 }}>
              {!events ? (
                <div className="skeleton" style={{ height: 60 }} />
              ) : events.length === 0 ? (
                <span style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-4)" }}>No events recorded.</span>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {events.map((ev) => (
                    <div key={ev.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span className={`badge ${ev.severity === "error" ? "badge-danger" : ev.severity === "warning" ? "badge-warn" : "badge-info"}`} style={{ flexShrink: 0 }}>
                        {ev.severity}
                      </span>
                      <span style={{ fontSize: "var(--qz-fs-xs)", fontFamily: "var(--qz-font-mono)", flex: 1 }}>
                        {ev.message}
                      </span>
                      <span style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", flexShrink: 0 }}>
                        {new Date(ev.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Interfaces */}
      {activeTab === "interfaces" && (
        <div className="card">
          <div className="card-hdr" style={{ justifyContent: "space-between" }}>
            <span style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-3)" }}>
              {interfaces ? `${interfaces.length} interfaces` : "Loading..."}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => { setInterfaces(null); loadTabData("interfaces"); }}>
              Reload
            </button>
          </div>
          {canEdit && (
            <div style={{ padding: "6px 14px", fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", borderBottom: "1px solid var(--qz-border)" }}>
              Click any row to edit description or shutdown state.
            </div>
          )}
          <div className="scroll-x">
            <table className="qz-table">
              <thead>
                <tr>
                  <th>Interface</th>
                  <th>Status</th>
                  <th>Speed</th>
                  <th>Duplex</th>
                  <th>Description</th>
                  {canEdit && <th style={{ width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {tabLoading || !interfaces
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}><td colSpan={canEdit ? 6 : 5}><div className="skeleton" style={{ height: 20 }} /></td></tr>
                    ))
                  : interfaces.length === 0
                  ? <tr><td colSpan={canEdit ? 6 : 5} style={{ textAlign: "center", padding: 32, color: "var(--qz-fg-4)" }}>No interface data. Trigger a poll.</td></tr>
                  : interfaces.map((iface) => (
                      <tr key={iface.id} style={canEdit ? { cursor: "pointer" } : undefined} onClick={canEdit ? () => openIfaceEdit(iface) : undefined}>
                        <td><code>{iface.name}</code></td>
                        <td>
                          <span className={`badge ${iface.status.toLowerCase() === "up" ? "badge-success" : iface.status.toLowerCase() === "down" ? "badge-danger" : "badge-neutral"}`}>
                            {iface.status}
                          </span>
                        </td>
                        <td style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-3)" }}>{iface.speed ?? "N/A"}</td>
                        <td style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-3)" }}>{iface.duplex ?? "N/A"}</td>
                        <td style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-3)" }}>{iface.description ?? ""}</td>
                        {canEdit && (
                          <td>
                            <button className="btn-icon-sm" style={{ background: "rgba(79,179,255,0.12)", color: "var(--qz-info)", border: "1px solid rgba(79,179,255,0.3)" }} onClick={(e) => { e.stopPropagation(); openIfaceEdit(iface); }}>
                              <Pencil size={11} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VLANs */}
      {activeTab === "vlans" && (
        <div className="card">
          <div className="card-hdr" style={{ justifyContent: "space-between" }}>
            <span style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-3)" }}>
              {vlans ? `${vlans.length} VLANs` : "Loading..."}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => { setVlans(null); loadTabData("vlans"); }}>
              Reload
            </button>
          </div>
          <div className="scroll-x">
            <table className="qz-table">
              <thead>
                <tr>
                  <th>VLAN ID</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Tagged Ports</th>
                  <th>Untagged Ports</th>
                  {canEdit && <th style={{ width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {tabLoading || !vlans
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={canEdit ? 6 : 5}><div className="skeleton" style={{ height: 20 }} /></td></tr>
                    ))
                  : vlans.length === 0
                  ? <tr><td colSpan={canEdit ? 6 : 5} style={{ textAlign: "center", padding: 32, color: "var(--qz-fg-4)" }}>No VLAN data. Trigger a poll.</td></tr>
                  : vlans.map((vlan) => (
                      <tr key={vlan.id} style={canEdit ? { cursor: "pointer" } : undefined} onClick={canEdit ? () => openVlanEdit(vlan) : undefined}>
                        <td>
                          <span className="badge badge-accent">{vlan.vlan_id}</span>
                        </td>
                        <td style={{ fontSize: "var(--qz-fs-sm)", fontWeight: 500 }}>{vlan.name ?? ""}</td>
                        <td>
                          <span className={`badge ${vlan.status === "active" ? "badge-success" : "badge-neutral"}`}>{vlan.status}</span>
                        </td>
                        <td><span style={{ fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-3)" }}>{vlan.tagged_ports ?? ""}</span></td>
                        <td><span style={{ fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-3)" }}>{vlan.untagged_ports ?? ""}</span></td>
                        {canEdit && (
                          <td>
                            <button className="btn-icon-sm" style={{ background: "rgba(79,179,255,0.12)", color: "var(--qz-info)", border: "1px solid rgba(79,179,255,0.3)" }} onClick={(e) => { e.stopPropagation(); openVlanEdit(vlan); }}>
                              <Pencil size={11} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ARP */}
      {activeTab === "arp" && (
        <div className="card">
          <div className="card-hdr" style={{ justifyContent: "space-between" }}>
            <span style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-3)" }}>
              {arpEntries ? `${arpEntries.length} entries` : "Loading..."}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => { setArpEntries(null); loadTabData("arp"); }}>Reload</button>
          </div>
          <div className="scroll-x">
            <table className="qz-table">
              <thead><tr><th>IP Address</th><th>MAC Address</th><th>Interface</th><th>Age (min)</th></tr></thead>
              <tbody>
                {tabLoading || !arpEntries
                  ? Array.from({ length: 5 }).map((_, i) => <tr key={i}><td colSpan={4}><div className="skeleton" style={{ height: 20 }} /></td></tr>)
                  : arpEntries.length === 0
                  ? <tr><td colSpan={4} style={{ textAlign: "center", padding: 32, color: "var(--qz-fg-4)" }}>No ARP entries.</td></tr>
                  : arpEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td><code>{entry.ip_address}</code></td>
                        <td><code>{entry.mac_address}</code></td>
                        <td style={{ fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-3)" }}>{entry.interface ?? ""}</td>
                        <td style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-3)" }}>{entry.age_minutes ?? "N/A"}</td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MAC Table */}
      {activeTab === "mac" && (
        <div className="card">
          <div className="card-hdr" style={{ justifyContent: "space-between" }}>
            <span style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-3)" }}>
              {macEntries ? `${macEntries.length} entries` : "Loading..."}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => { setMacEntries(null); loadTabData("mac"); }}>Reload</button>
          </div>
          <div className="scroll-x">
            <table className="qz-table">
              <thead><tr><th>MAC Address</th><th>VLAN</th><th>Interface</th><th>Type</th></tr></thead>
              <tbody>
                {tabLoading || !macEntries
                  ? Array.from({ length: 5 }).map((_, i) => <tr key={i}><td colSpan={4}><div className="skeleton" style={{ height: 20 }} /></td></tr>)
                  : macEntries.length === 0
                  ? <tr><td colSpan={4} style={{ textAlign: "center", padding: 32, color: "var(--qz-fg-4)" }}>No MAC table entries.</td></tr>
                  : macEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td><code>{entry.mac_address}</code></td>
                        <td>{entry.vlan ? <span className="badge badge-accent">{entry.vlan}</span> : <span style={{ color: "var(--qz-fg-4)", fontSize: "var(--qz-fs-xs)" }}>N/A</span>}</td>
                        <td style={{ fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-3)" }}>{entry.interface ?? ""}</td>
                        <td style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-3)" }}>{entry.entry_type ?? ""}</td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Commands */}
      {activeTab === "commands" && canEdit && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className={`alert ${isAdmin ? "alert-warn" : "alert-info"}`}>
            <ShieldAlert size={14} />
            <span>
              {isAdmin
                ? "Commands are pushed to the switch immediately. Double-check before executing."
                : "You can run show commands. Configuration changes require admin role."}
            </span>
          </div>

          <div className="card">
            <div className="card-hdr">
              <span style={{ fontWeight: 600, fontSize: "var(--qz-fs-sm)" }}>Preset Show Commands</span>
            </div>
            <div style={{ padding: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PRESET_COMMANDS.map((cmd) => (
                <button
                  key={cmd.value}
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCommand(cmd.value)}
                >
                  {cmd.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-hdr">
              <span style={{ fontWeight: 600, fontSize: "var(--qz-fs-sm)" }}>Command</span>
            </div>
            <div style={{ padding: 16 }}>
              <textarea
                className="input"
                rows={5}
                placeholder="show version"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                style={{ fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-xs)", lineHeight: 1.6, marginBottom: 10, resize: "vertical" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button className="btn" onClick={handleExec} disabled={executing || !command.trim()}>
                  <Send size={13} />
                  {executing ? "Executing..." : "Execute"}
                </button>
                {execOutput && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setExecOutput(null)}>
                    Clear output
                  </button>
                )}
              </div>
              {execOutput !== null && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", marginBottom: 6 }}>Output:</div>
                  <div
                    style={{
                      background: "var(--qz-surface-sunken)",
                      border: "1px solid var(--qz-border)",
                      borderRadius: "var(--qz-radius-md)",
                      padding: "12px 14px",
                      fontFamily: "var(--qz-font-mono)",
                      fontSize: "var(--qz-fs-xs)",
                      color: "var(--qz-accent)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      maxHeight: 340,
                      overflowY: "auto",
                      lineHeight: 1.7,
                    }}
                  >
                    {execOutput}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
