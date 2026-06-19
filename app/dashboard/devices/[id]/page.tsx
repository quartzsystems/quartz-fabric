"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  Trash2,
  GitCommitHorizontal,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronDown,
  Plus,
  Wind,
  Zap,
  Thermometer,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  devices as devicesApi,
  type ApiArpEntry,
  type ApiDevice,
  type ApiEnvironment,
  type ApiEvent,
  type ApiInterface,
  type ApiMacEntry,
  type ApiTemp,
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

type StagedChange = {
  id: string;
  summary: string;
  commands: string;
};

const TABS = [
  { id: "overview",   label: "Overview",  icon: <Server    size={13} /> },
  { id: "interfaces", label: "Interfaces",icon: <Activity  size={13} /> },
  { id: "vlans",      label: "VLANs",     icon: <Tag       size={13} /> },
  { id: "arp",        label: "ARP",       icon: <Clock     size={13} /> },
  { id: "mac",        label: "MAC Table", icon: <BookOpen  size={13} /> },
  { id: "commands",   label: "Commands",  icon: <Terminal  size={13} /> },
];

function canonicalize(name: string): string {
  return name
    .replace(/^GigabitEthernet\s*/i,       "gi")
    .replace(/^TenGigabitEthernet\s*/i,    "te")
    .replace(/^FortyGigabitEthernet\s*/i,  "fo")
    .replace(/^HundredGigabitEthernet\s*/i,"hu")
    .replace(/^ManagementEthernet\s*/i,    "ma")
    .replace(/^Port-channel\s*/i,          "po")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function expandVlanList(input: string): number[] {
  const vlans = new Set<number>();
  for (const part of input.split(",")) {
    const t = part.trim();
    if (!t) continue;
    if (t.includes("-")) {
      const [s, e] = t.split("-").map(Number);
      if (!isNaN(s) && !isNaN(e)) for (let v = s; v <= Math.min(e, 4094); v++) vlans.add(v);
    } else {
      const n = Number(t);
      if (!isNaN(n) && n >= 1 && n <= 4094) vlans.add(n);
    }
  }
  return [...vlans].sort((a, b) => a - b);
}

// Single-VLAN searchable dropdown
function VlanPicker({
  vlans,
  value,
  onChange,
  nullable = false,
  placeholder = "Select VLAN",
  disabled = false,
}: {
  vlans: ApiVlan[];
  value: string;
  onChange: (v: string) => void;
  nullable?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const openDropdown = () => {
    if (disabled) return;
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left, width: r.width, maxHeight: window.innerHeight - r.bottom - 20 });
    }
    setOpen((o) => !o);
  };

  const selected = vlans.find((v) => String(v.vlan_id) === value);
  const filtered = vlans.filter((v) => {
    const term = q.toLowerCase();
    return String(v.vlan_id).includes(term) || (v.name ?? "").toLowerCase().includes(term);
  });

  const pick = (v: ApiVlan | null) => {
    onChange(v ? String(v.vlan_id) : "");
    setOpen(false);
    setQ("");
  };

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        className="input"
        onClick={openDropdown}
        disabled={disabled}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", cursor: "pointer", textAlign: "left" }}
      >
        {selected ? (
          <span>
            <span style={{ fontFamily: "var(--qz-font-mono)", fontSize: 12 }}>{selected.vlan_id}</span>
            {selected.name && <span style={{ color: "var(--qz-fg-3)", marginLeft: 6 }}>{selected.name}</span>}
          </span>
        ) : (
          <span style={{ color: "var(--qz-fg-4)" }}>{value || placeholder}</span>
        )}
        <ChevronDown size={13} style={{ color: "var(--qz-fg-4)", flexShrink: 0 }} />
      </button>

      {open && dropPos && typeof document !== "undefined" && createPortal(
        <div ref={dropRef} style={{ position: "fixed", top: dropPos.top, left: dropPos.left, width: dropPos.width, background: "var(--qz-surface-raised)", border: "1px solid var(--qz-border-strong)", borderRadius: "var(--qz-radius-lg)", boxShadow: "var(--qz-shadow-2)", zIndex: 9999, overflow: "hidden" }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--qz-border)", display: "flex", alignItems: "center", gap: 6 }}>
            <Search size={12} style={{ color: "var(--qz-fg-4)" }} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search VLANs…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 12, color: "var(--qz-fg-1)", fontFamily: "var(--qz-font-sans)" }}
            />
          </div>
          <div style={{ maxHeight: Math.min(220, dropPos.maxHeight), overflowY: "auto" }}>
            {nullable && (
              <button type="button" onClick={() => pick(null)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px", background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: "var(--qz-fg-3)", fontFamily: "var(--qz-font-sans)" }}>
                None
              </button>
            )}
            {filtered.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--qz-fg-4)" }}>No VLANs match</div>}
            {filtered.map((v) => {
              const isSel = String(v.vlan_id) === value;
              return (
                <button key={v.vlan_id} type="button" onClick={() => pick(v)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px", background: isSel ? "color-mix(in oklab, var(--qz-accent) 10%, transparent)" : "transparent", border: "none", cursor: "pointer", fontFamily: "var(--qz-font-sans)" }}>
                  <span style={{ width: 14, display: "flex", alignItems: "center", flexShrink: 0 }}>
                    {isSel && <Check size={12} style={{ color: "var(--qz-accent)" }} />}
                  </span>
                  <span style={{ fontFamily: "var(--qz-font-mono)", fontSize: 12, color: "var(--qz-fg-2)", flexShrink: 0 }}>{v.vlan_id}</span>
                  {v.name && <span style={{ fontSize: 13, color: "var(--qz-fg-1)" }}>{v.name}</span>}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Multi-VLAN searchable checkbox dropdown
function VlanMultiPicker({
  vlans,
  value,
  onChange,
  disabled = false,
}: {
  vlans: ApiVlan[];
  value: string; // comma-separated VLAN IDs
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const openDropdown = () => {
    if (disabled) return;
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left, width: r.width, maxHeight: window.innerHeight - r.bottom - 20 });
    }
    setOpen((o) => !o);
  };

  const selectedIds = new Set(
    value.split(",").map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => !isNaN(n) && n > 0)
  );

  const filtered = vlans.filter((v) => {
    const term = q.toLowerCase();
    return String(v.vlan_id).includes(term) || (v.name ?? "").toLowerCase().includes(term);
  });

  const toggle = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange([...next].sort((a, b) => a - b).join(","));
  };

  const label =
    selectedIds.size === 0 ? "Select VLANs…" :
    selectedIds.size === 1 ? `VLAN ${[...selectedIds][0]}` :
    `${selectedIds.size} VLANs selected`;

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        className="input"
        onClick={openDropdown}
        disabled={disabled}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ color: selectedIds.size === 0 ? "var(--qz-fg-4)" : "var(--qz-fg-1)" }}>{label}</span>
        <ChevronDown size={13} style={{ color: "var(--qz-fg-4)", flexShrink: 0 }} />
      </button>

      {open && dropPos && typeof document !== "undefined" && createPortal(
        <div ref={dropRef} style={{ position: "fixed", top: dropPos.top, left: dropPos.left, width: dropPos.width, background: "var(--qz-surface-raised)", border: "1px solid var(--qz-border-strong)", borderRadius: "var(--qz-radius-lg)", boxShadow: "var(--qz-shadow-2)", zIndex: 9999, overflow: "hidden" }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--qz-border)", display: "flex", alignItems: "center", gap: 6 }}>
            <Search size={12} style={{ color: "var(--qz-fg-4)" }} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search VLANs…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 12, color: "var(--qz-fg-1)", fontFamily: "var(--qz-font-sans)" }}
            />
          </div>
          <div style={{ padding: "4px 12px", display: "flex", gap: 8, borderBottom: "1px solid var(--qz-border)" }}>
            <button type="button" onClick={() => onChange(vlans.map((v) => v.vlan_id).sort((a, b) => a - b).join(","))} style={{ fontSize: 11, color: "var(--qz-accent)", background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}>
              Select all
            </button>
            <span style={{ color: "var(--qz-fg-4)", fontSize: 11 }}>·</span>
            <button type="button" onClick={() => onChange("")} style={{ fontSize: 11, color: "var(--qz-fg-4)", background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}>
              Clear
            </button>
          </div>
          <div style={{ maxHeight: Math.min(300, dropPos.maxHeight), overflowY: "auto" }}>
            {filtered.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--qz-fg-4)" }}>No VLANs match</div>}
            {filtered.map((v) => {
              const checked = selectedIds.has(v.vlan_id);
              return (
                <button key={v.vlan_id} type="button" onClick={() => toggle(v.vlan_id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "7px 12px", background: checked ? "color-mix(in oklab, var(--qz-accent) 8%, transparent)" : "transparent", border: "none", cursor: "pointer", fontFamily: "var(--qz-font-sans)" }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${checked ? "var(--qz-accent)" : "var(--qz-border-strong)"}`, background: checked ? "var(--qz-accent)" : "transparent", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    {checked && <Check size={9} style={{ color: "var(--qz-ink-0)" }} />}
                  </div>
                  <span style={{ fontFamily: "var(--qz-font-mono)", fontSize: 12, color: "var(--qz-fg-2)", flexShrink: 0 }}>{v.vlan_id}</span>
                  {v.name && <span style={{ fontSize: 13, color: "var(--qz-fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</span>}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function naturalCompare(a: string, b: string): number {
  const re = /(\d+)/g;
  const pa = a.split(re);
  const pb = b.split(re);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const sa = pa[i] ?? "";
    const sb = pb[i] ?? "";
    const na = Number(sa);
    const nb = Number(sb);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    if (sa !== sb) return sa < sb ? -1 : 1;
  }
  return 0;
}

function compressPorts(ports: string | null | undefined): string {
  if (!ports) return "";
  const parts = ports.split(",").map(p => p.trim()).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  type P = { prefix: string; slot: number; port: number };
  const parsed: Array<P | string> = parts.map(p => {
    const m = p.match(/^(\w+)\s+(\d+)\/(\d+)$/);
    return m ? { prefix: m[1], slot: Number(m[2]), port: Number(m[3]) } : p;
  });
  const objs = (parsed.filter(p => typeof p !== "string") as P[]).sort((a, b) => {
    const pc = a.prefix.localeCompare(b.prefix);
    if (pc !== 0) return pc;
    if (a.slot !== b.slot) return a.slot - b.slot;
    return a.port - b.port;
  });
  const strs = parsed.filter((p): p is string => typeof p === "string");
  const ranges: string[] = [];
  let i = 0;
  while (i < objs.length) {
    const start = objs[i];
    let j = i + 1;
    while (j < objs.length && objs[j].prefix === start.prefix && objs[j].slot === start.slot && objs[j].port === objs[j - 1].port + 1) j++;
    const end = objs[j - 1];
    ranges.push(start.port === end.port
      ? `${start.prefix} ${start.slot}/${start.port}`
      : `${start.prefix} ${start.slot}/${start.port}-${end.slot}/${end.port}`);
    i = j;
  }
  return [...ranges, ...strs].join(", ");
}

function expandIfaceName(name: string): string {
  return name
    .replace(/^Hu\s+/i,  "HundredGigabitEthernet ")
    .replace(/^Te\s+/i,  "TenGigabitEthernet ")
    .replace(/^Fo\s+/i,  "FortyGigabitEthernet ")
    .replace(/^Gi\s+/i,  "GigabitEthernet ")
    .replace(/^Ma\s+/i,  "ManagementEthernet ")
    .replace(/^Mg\s+/i,  "ManagementEthernet ")
    .replace(/^Po\s+/i,  "port-channel ")
    .replace(/^Vl\s+/i,  "Vlan ");
}

function formatSpeed(speed: string | null | undefined): string {
  if (!speed) return "—";
  const m = speed.match(/^(\d+)\s*[Mm]bit/);
  if (!m) return speed;
  const mbits = parseInt(m[1], 10);
  if (mbits >= 1000) return `${mbits / 1000}GbE`;
  return `${mbits}M`;
}

function Field({ label, children, error, desc }: { label: string; children: React.ReactNode; error?: string | null; desc?: string }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
      {desc && <div className="field-desc">{desc}</div>}
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
  const [envData, setEnvData] = useState<ApiEnvironment | null>(null);
  const [tabLoading, setTabLoading] = useState(false);

  // Command executor
  const [command, setCommand] = useState("");
  const [execOutput, setExecOutput] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);

  // Staged changes
  const [stagedChanges, setStagedChanges] = useState<StagedChange[]>([]);
  const [commitOpen, setCommitOpen] = useState(false);
  const [committing, setCommitting] = useState(false);

  // Interface search / sort
  const [ifaceSearch, setIfaceSearch] = useState("");
  const [ifaceSortCol, setIfaceSortCol] = useState<"name" | "status" | "mode" | "speed" | "duplex" | "description">("name");
  const [ifaceSortDir, setIfaceSortDir] = useState<"asc" | "desc">("asc");
  const [colWidths, setColWidths] = useState<Partial<Record<string, number>>>({});

  // Multi-selection
  const [selectedIfaceIds, setSelectedIfaceIds] = useState<Set<string>>(new Set());
  const [selectedVlanIds,  setSelectedVlanIds]  = useState<Set<string>>(new Set());

  // Bulk interface configure modal
  const [bulkConfigOpen,       setBulkConfigOpen]       = useState(false);
  const [bulkDesc,             setBulkDesc]             = useState("");
  const [bulkShutdown,         setBulkShutdown]         = useState<"" | "shutdown" | "enable">("");
  const [bulkSwitchportMode,   setBulkSwitchportMode]   = useState<"" | "access" | "trunk">("");
  const [bulkAccessVlan,       setBulkAccessVlan]       = useState("");
  const [bulkNativeVlan,       setBulkNativeVlan]       = useState("");
  const [bulkTaggedVlans,      setBulkTaggedVlans]      = useState("");

  // Drag-select refs — no re-render needed, just coordinate state
  const ifaceDragRef = useRef<{ startIdx: number; base: Set<string>; adding: boolean; moved: boolean } | null>(null);
  const vlanDragRef  = useRef<{ startIdx: number; base: Set<string>; adding: boolean; moved: boolean } | null>(null);

  // Interface edit modal
  const [editingIface, setEditingIface] = useState<ApiInterface | null>(null);
  const [editIfaceDesc, setEditIfaceDesc] = useState("");
  const [editIfaceShutdown, setEditIfaceShutdown] = useState(false);
  const [initIfaceShutdown, setInitIfaceShutdown] = useState(false);
  const [editIfaceSwitchportMode, setEditIfaceSwitchportMode] = useState<"" | "access" | "trunk">("");
  const [editIfaceAccessVlan, setEditIfaceAccessVlan] = useState("");
  const [editIfaceNativeVlan, setEditIfaceNativeVlan] = useState("");
  const [editIfaceTaggedVlans, setEditIfaceTaggedVlans] = useState("");
  const [ifaceConfigLoading, setIfaceConfigLoading] = useState(false);
  const [initSwitchportMode, setInitSwitchportMode] = useState<"" | "access" | "trunk">("");
  const [initAccessVlan, setInitAccessVlan] = useState("");
  const [initTaggedVlans, setInitTaggedVlans] = useState("");
  const [initNativeVlan, setInitNativeVlan] = useState("");


  // VLAN edit modal
  const [editingVlan, setEditingVlan] = useState<ApiVlan | null>(null);
  const [editVlanName, setEditVlanName] = useState("");
  const [editVlanId, setEditVlanId] = useState("");
  const [confirmDeleteVlan, setConfirmDeleteVlan] = useState(false);

  // VLAN create modal
  const [creatingVlan, setCreatingVlan] = useState(false);
  const [newVlanId, setNewVlanId] = useState("");
  const [newVlanName, setNewVlanName] = useState("");


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
        if (tab === "interfaces") {
          const [ifaceResult, vlanResult] = await Promise.allSettled([
            !interfaces ? devicesApi.interfaces(id) : Promise.resolve(null),
            !vlans      ? devicesApi.vlans(id)       : Promise.resolve(null),
          ]);
          if (ifaceResult.status === "fulfilled" && ifaceResult.value) setInterfaces(ifaceResult.value as Awaited<ReturnType<typeof devicesApi.interfaces>>);
          if (vlanResult.status  === "fulfilled" && vlanResult.value)  setVlans(vlanResult.value   as Awaited<ReturnType<typeof devicesApi.vlans>>);
          const failures = [ifaceResult, vlanResult].filter(r => r.status === "rejected");
          if (failures.length) throw new Error((failures[0] as PromiseRejectedResult).reason?.message ?? "Failed to load data");
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
    devicesApi.environment(id).then(setEnvData).catch(() => {});
  }, [id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await devicesApi.refresh(id);
      toast({ title: "Poll queued", message: "Device will be polled shortly.", type: "info" });
      // The backend poll is async — re-fetch displayed data once the poll likely completes.
      // Two attempts at staggered intervals to handle fast and slow devices.
      const refetchAll = () => {
        loadDevice();
        devicesApi.events(id, 10).then(setEvents).catch(() => {});
        devicesApi.environment(id).then(setEnvData).catch(() => {});
      };
      setTimeout(refetchAll, 8_000);
      setTimeout(refetchAll, 25_000);
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

  const openIfaceEdit = async (iface: ApiInterface) => {
    setEditingIface(iface);
    setEditIfaceDesc(iface.description ?? "");
    setEditIfaceShutdown(false);
    setInitIfaceShutdown(false);
    setEditIfaceSwitchportMode("");
    setInitSwitchportMode("");
    setEditIfaceAccessVlan("");
    setInitAccessVlan("");
    setEditIfaceTaggedVlans("");
    setInitTaggedVlans("");
    setEditIfaceNativeVlan("");
    setInitNativeVlan("");
    setIfaceConfigLoading(true);
    try {
      // Use the full interface type name so Dell OS9 returns only this interface's block
      const fullName = expandIfaceName(iface.name);
      const res = await devicesApi.exec(id, `show running-config interface ${fullName}`);
      const out = res.output;

      // Extract just this interface's config block to avoid false matches when the
      // switch returns the full running-config instead of a single-interface view
      const nameEsc = fullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const blockRe = new RegExp(
        `(?:^|\\n)interface\\s+${nameEsc}\\s*\\n([\\s\\S]*?)(?=\\n!|\\ninterface\\s|$)`,
        "i"
      );
      const blockMatch = out.match(blockRe);
      const block = blockMatch ? blockMatch[1] : out;

      // Description from live running-config overrides stale DB value
      const descMatch = block.match(/^\s*description\s+(.+)$/m);
      if (descMatch) setEditIfaceDesc(descMatch[1].trim());

      const isShutdown = /^\s*shutdown\b/m.test(block);
      let mode: "" | "access" | "trunk" =
        /^\s*portmode access\b/m.test(block) ? "access" :
        /^\s*portmode hybrid\b/m.test(block) ? "trunk" : "";

      setEditIfaceShutdown(isShutdown);
      setInitIfaceShutdown(isShutdown);

      // If running-config has no portmode line (default may not be written),
      // fall back to the VLAN map's observed mode.
      const info = ifaceVlanMap.get(canonicalize(iface.name));
      if (mode === "" && info) {
        mode = info.mode === "access" ? "access" : "trunk";
      }
      setEditIfaceSwitchportMode(mode);
      setInitSwitchportMode(mode);

      // Populate VLAN fields with cross-mode fallback so a hybrid port that only
      // carries one untagged VLAN (looks like "access" in the VLAN map) still
      // gets its native VLAN pre-filled, and vice-versa.
      if (mode === "access") {
        const v = info?.mode === "access" ? String(info.vlan) :
                  info?.mode === "trunk" && info.native != null ? String(info.native) : "";
        if (v) { setEditIfaceAccessVlan(v); setInitAccessVlan(v); }
      } else if (mode === "trunk") {
        const tagged = info?.mode === "trunk" ? info.tagged.join(",") : "";
        const native = info?.mode === "trunk"
          ? (info.native != null ? String(info.native) : "")
          : info?.mode === "access" ? String(info.vlan) : "";
        setEditIfaceTaggedVlans(tagged); setInitTaggedVlans(tagged);
        setEditIfaceNativeVlan(native);  setInitNativeVlan(native);
      }
    } catch {
      // leave defaults if fetch fails
    } finally {
      setIfaceConfigLoading(false);
    }
  };

  const saveIfaceEdit = () => {
    if (!editingIface) return;
    const ifaceName = editingIface.name;
    const summaryParts: string[] = [];

    // Detect what actually changed so we only generate commands for real differences
    const modeChanged = editIfaceSwitchportMode !== "" && editIfaceSwitchportMode !== initSwitchportMode;
    const accessVlanChanged = editIfaceSwitchportMode === "access" && editIfaceSwitchportMode === initSwitchportMode && editIfaceAccessVlan.trim() !== initAccessVlan;
    const trunkVlanChanged = editIfaceSwitchportMode === "trunk" && editIfaceSwitchportMode === initSwitchportMode && (editIfaceTaggedVlans !== initTaggedVlans || editIfaceNativeVlan.trim() !== initNativeVlan);
    const switchportChanged = modeChanged || accessVlanChanged || trunkVlanChanged;

    // 1. Remove from current VLAN assignments — only when switchport config is changing.
    //    Dell OS9 requires the port to be unassigned from all VLANs before portmode can change.
    const removeLines: string[] = [];
    if (switchportChanged) {
      const currentInfo = ifaceVlanMap.get(canonicalize(ifaceName));
      if (currentInfo) {
        const toRemove: Array<{ vlan: number; type: "tagged" | "untagged" }> = [];
        if (currentInfo.mode === "trunk") {
          for (const v of currentInfo.tagged) toRemove.push({ vlan: v, type: "tagged" });
          if (currentInfo.native != null) toRemove.push({ vlan: currentInfo.native, type: "untagged" });
        } else {
          toRemove.push({ vlan: currentInfo.vlan, type: "untagged" });
        }
        if (toRemove.length > 0) {
          removeLines.push("configure terminal");
          toRemove.forEach(({ vlan, type }, i) => {
            removeLines.push(`interface vlan ${vlan}`, `no ${type} ${ifaceName}`);
            if (i < toRemove.length - 1) removeLines.push("exit");
          });
          removeLines.push("end");
        }
      }
    }

    // 2. Port-level commands
    const portLines = ["configure terminal", `interface ${ifaceName}`];
    if (editIfaceDesc !== (editingIface.description ?? "")) {
      portLines.push(editIfaceDesc ? `description ${editIfaceDesc}` : "no description");
      summaryParts.push(`description → "${editIfaceDesc}"`);
    }
    if (editIfaceShutdown !== initIfaceShutdown) {
      portLines.push(editIfaceShutdown ? "shutdown" : "no shutdown");
      summaryParts.push(editIfaceShutdown ? "shutdown" : "no shutdown");
    }
    if (modeChanged) {
      if (editIfaceSwitchportMode === "access") {
        portLines.push("no portmode", "portmode access");
        summaryParts.push(`mode → access${editIfaceAccessVlan ? `, VLAN ${editIfaceAccessVlan}` : ""}`);
      } else if (editIfaceSwitchportMode === "trunk") {
        portLines.push("no portmode", "portmode hybrid");
        const trunkDesc = [
          editIfaceTaggedVlans ? `tagged: ${editIfaceTaggedVlans}` : "",
          editIfaceNativeVlan  ? `native: ${editIfaceNativeVlan}`  : "",
        ].filter(Boolean).join(", ");
        summaryParts.push(`mode → trunk${trunkDesc ? ` (${trunkDesc})` : ""}`);
      }
    } else if (switchportChanged) {
      if (editIfaceSwitchportMode === "access") {
        summaryParts.push(`VLAN → ${editIfaceAccessVlan}`);
      } else if (editIfaceSwitchportMode === "trunk") {
        const trunkDesc = [
          editIfaceTaggedVlans ? `tagged: ${editIfaceTaggedVlans}` : "",
          editIfaceNativeVlan  ? `native: ${editIfaceNativeVlan}`  : "",
        ].filter(Boolean).join(", ");
        summaryParts.push(`VLANs → ${trunkDesc}`);
      }
    }
    portLines.push("end");

    // 3. New VLAN assignments — only when switchport config is changing
    const vlanLines: string[] = [];
    if (switchportChanged) {
      if (editIfaceSwitchportMode === "access" && editIfaceAccessVlan.trim()) {
        vlanLines.push("configure terminal", `interface vlan ${editIfaceAccessVlan.trim()}`, `untagged ${ifaceName}`, "end");
      } else if (editIfaceSwitchportMode === "trunk") {
        const tagged = expandVlanList(editIfaceTaggedVlans);
        const assignments: Array<{ vlan: number | string; type: "tagged" | "untagged" }> = [
          ...tagged.map((v) => ({ vlan: v, type: "tagged" as const })),
          ...(editIfaceNativeVlan.trim() ? [{ vlan: editIfaceNativeVlan.trim(), type: "untagged" as const }] : []),
        ];
        if (assignments.length > 0) {
          vlanLines.push("configure terminal");
          assignments.forEach(({ vlan, type }, i) => {
            vlanLines.push(`interface vlan ${vlan}`, `${type} ${ifaceName}`);
            vlanLines.push(i < assignments.length - 1 ? "exit" : "end");
          });
        }
      }
    }

    if (summaryParts.length > 0) {
      const change: StagedChange = {
        id: `iface-${ifaceName}`,
        summary: `Interface ${ifaceName}: ${summaryParts.join(", ")}`,
        commands: [...removeLines, ...portLines, ...vlanLines].join("\n"),
      };
      setStagedChanges((prev) => [...prev.filter((c) => c.id !== change.id), change]);
      toast({ title: "Change staged", message: `${ifaceName} queued for commit.`, type: "info" });
    }
    setEditingIface(null);
  };

  const openVlanEdit = (vlan: ApiVlan) => {
    setEditingVlan(vlan);
    setEditVlanId(String(vlan.vlan_id));
    setEditVlanName(vlan.name ?? "");
    setConfirmDeleteVlan(false);
  };

  const saveVlanEdit = () => {
    if (!editingVlan) return;
    const oldId = editingVlan.vlan_id;
    const newId = parseInt(editVlanId, 10);
    const idChanging = !isNaN(newId) && newId !== oldId && newId >= 1 && newId <= 4094;

    let commands: string[];
    let summary: string;

    if (idChanging) {
      const parsePorts = (s: string | null) => (s ?? "").split(",").map((p) => p.trim()).filter(Boolean);
      const tagged = parsePorts(editingVlan.tagged_ports);
      const untagged = parsePorts(editingVlan.untagged_ports);
      commands = ["configure terminal", `vlan ${newId}`, ...(editVlanName ? [`name ${editVlanName}`] : []), "exit"];
      if (tagged.length > 0 || untagged.length > 0) {
        commands.push(`interface vlan ${newId}`);
        tagged.forEach((p) => commands.push(`tagged ${p}`));
        untagged.forEach((p) => commands.push(`untagged ${p}`));
        commands.push("exit");
      }
      commands.push(`no vlan ${oldId}`, "end");
      summary = `VLAN ${oldId} → ${newId}${editVlanName !== (editingVlan.name ?? "") ? `, name → "${editVlanName}"` : ""}`;
    } else {
      commands = ["configure terminal", `vlan ${oldId}`, ...(editVlanName ? [`name ${editVlanName}`] : []), "end"];
      summary = `VLAN ${oldId}: name → "${editVlanName}"`;
    }

    const change: StagedChange = { id: `vlan-${oldId}`, summary, commands: commands.join("\n") };
    setStagedChanges((prev) => [...prev.filter((c) => c.id !== change.id), change]);
    setEditingVlan(null);
    toast({ title: "Change staged", message: `${summary} queued for commit.`, type: "info" });
  };

  const stageVlanDelete = () => {
    if (!editingVlan) return;
    const vlan = editingVlan;
    const summary = `Delete VLAN ${vlan.vlan_id}${vlan.name ? ` (${vlan.name})` : ""}`;
    const change: StagedChange = {
      id: `vlan-del-${vlan.vlan_id}`,
      summary,
      commands: ["configure terminal", `no vlan ${vlan.vlan_id}`, "end"].join("\n"),
    };
    setStagedChanges((prev) => [...prev.filter((c) => c.id !== change.id), change]);
    setEditingVlan(null);
    toast({ title: "Change staged", message: `${summary} queued for commit.`, type: "info" });
  };

  const saveVlanCreate = () => {
    const id = parseInt(newVlanId, 10);
    if (isNaN(id) || id < 1 || id > 4094) return;
    const summary = `Create VLAN ${id}${newVlanName ? ` (${newVlanName})` : ""}`;
    const change: StagedChange = {
      id: `vlan-create-${id}`,
      summary,
      commands: ["configure terminal", `vlan ${id}`, ...(newVlanName ? [`name ${newVlanName}`] : []), "end"].join("\n"),
    };
    setStagedChanges((prev) => [...prev.filter((c) => c.id !== change.id), change]);
    setCreatingVlan(false);
    setNewVlanId("");
    setNewVlanName("");
    toast({ title: "Change staged", message: `${summary} queued for commit.`, type: "info" });
  };

  const stageBulkIfaceShutdown = (ids: Set<string>, shutdown: boolean) => {
    const ifaces = (sortedInterfaces ?? []).filter((i) => ids.has(i.id));
    if (ifaces.length === 0) return;
    const lines = ["configure terminal"];
    ifaces.forEach((iface, idx) => {
      lines.push(`interface ${iface.name}`, shutdown ? "shutdown" : "no shutdown");
      lines.push(idx < ifaces.length - 1 ? "exit" : "end");
    });
    const summary = `${shutdown ? "Shutdown" : "Enable"} ${ifaces.length} interface${ifaces.length !== 1 ? "s" : ""}`;
    setStagedChanges((prev) => [...prev, { id: `bulk-iface-${shutdown ? "down" : "up"}-${Date.now()}`, summary, commands: lines.join("\n") }]);
    setSelectedIfaceIds(new Set());
    toast({ title: "Change staged", message: `${summary} queued for commit.`, type: "info" });
  };

  const stageBulkIfaceConfigure = () => {
    const ifaces = (sortedInterfaces ?? []).filter((i) => selectedIfaceIds.has(i.id));
    if (ifaces.length === 0) return;
    const lines: string[] = [];

    for (const iface of ifaces) {
      const ifaceName = iface.name;
      const currentInfo = ifaceVlanMap.get(canonicalize(ifaceName));
      const modeChanging = bulkSwitchportMode !== "";

      // Remove from current VLANs when switching mode (Dell OS9 requires this first)
      if (modeChanging && currentInfo) {
        const toRemove: Array<{ vlan: number; type: "tagged" | "untagged" }> = [];
        if (currentInfo.mode === "trunk") {
          for (const v of currentInfo.tagged) toRemove.push({ vlan: v, type: "tagged" });
          if (currentInfo.native != null) toRemove.push({ vlan: currentInfo.native, type: "untagged" });
        } else {
          toRemove.push({ vlan: currentInfo.vlan, type: "untagged" });
        }
        if (toRemove.length > 0) {
          lines.push("configure terminal");
          toRemove.forEach(({ vlan, type }, i) => {
            lines.push(`interface vlan ${vlan}`, `no ${type} ${ifaceName}`);
            if (i < toRemove.length - 1) lines.push("exit");
          });
          lines.push("end");
        }
      }

      // Port-level commands
      const portCmds: string[] = [`interface ${ifaceName}`];
      if (bulkDesc.trim())            portCmds.push(`description ${bulkDesc.trim()}`);
      if (bulkShutdown === "shutdown") portCmds.push("shutdown");
      if (bulkShutdown === "enable")   portCmds.push("no shutdown");
      if (modeChanging) {
        if (bulkSwitchportMode === "access") portCmds.push("no portmode", "portmode access");
        if (bulkSwitchportMode === "trunk")  portCmds.push("no portmode", "portmode hybrid");
      }
      if (portCmds.length > 1) lines.push("configure terminal", ...portCmds, "end");

      // New VLAN assignments
      if (modeChanging) {
        if (bulkSwitchportMode === "access" && bulkAccessVlan.trim()) {
          lines.push("configure terminal", `interface vlan ${bulkAccessVlan.trim()}`, `untagged ${ifaceName}`, "end");
        } else if (bulkSwitchportMode === "trunk") {
          const tagged = expandVlanList(bulkTaggedVlans);
          const assignments: Array<{ vlan: number | string; type: "tagged" | "untagged" }> = [
            ...tagged.map((v) => ({ vlan: v, type: "tagged" as const })),
            ...(bulkNativeVlan.trim() ? [{ vlan: bulkNativeVlan.trim(), type: "untagged" as const }] : []),
          ];
          if (assignments.length > 0) {
            lines.push("configure terminal");
            assignments.forEach(({ vlan, type }, i) => {
              lines.push(`interface vlan ${vlan}`, `${type} ${ifaceName}`);
              lines.push(i < assignments.length - 1 ? "exit" : "end");
            });
          }
        }
      }
    }

    if (lines.length === 0) return;
    const count = ifaces.length;
    const summary = `Bulk configure ${count} interface${count !== 1 ? "s" : ""}`;
    setStagedChanges((prev) => [...prev, { id: `bulk-iface-config-${Date.now()}`, summary, commands: lines.join("\n") }]);
    setBulkConfigOpen(false);
    setSelectedIfaceIds(new Set());
    toast({ title: "Change staged", message: `${summary} queued for commit.`, type: "info" });
  };

  const stageBulkVlanDelete = (ids: Set<string>) => {
    const toDelete = (vlans ?? []).filter((v) => ids.has(v.id));
    if (toDelete.length === 0) return;
    const lines = ["configure terminal", ...toDelete.map((v) => `no vlan ${v.vlan_id}`), "end"];
    const summary = `Delete ${toDelete.length} VLAN${toDelete.length !== 1 ? "s" : ""} (${toDelete.map((v) => v.vlan_id).join(", ")})`;
    setStagedChanges((prev) => [...prev, { id: `bulk-vlan-del-${Date.now()}`, summary, commands: lines.join("\n") }]);
    setSelectedVlanIds(new Set());
    toast({ title: "Change staged", message: `${summary} queued for commit.`, type: "info" });
  };

  const handleCommit = async () => {
    setCommitting(true);
    try {
      const allCommands = stagedChanges.map((c) => c.commands).join("\n");
      const res = await devicesApi.exec(id, allCommands);
      toast({ title: "Committed", message: `${stagedChanges.length} change(s) pushed to switch. Polling for updated data…`, type: "success" });
      setExecOutput(res.output);
      setStagedChanges([]);
      setCommitOpen(false);
      setInterfaces(null);
      setVlans(null);
      devicesApi.refresh(id).catch(() => {});
    } catch (e) {
      toast({ title: "Commit failed", message: e instanceof Error ? e.message : "Command failed", type: "error" });
    } finally {
      setCommitting(false);
    }
  };

  // Build interface → VLAN mode map from VLAN data
  type IfaceModeInfo =
    | { mode: "access"; vlan: number }
    | { mode: "trunk";  tagged: number[]; native: number | null };

  const ifaceVlanMap = new Map<string, IfaceModeInfo>();
  if (vlans) {
    const parsePorts = (s: string | null) => (s ?? "").split(",").map(p => p.trim()).filter(Boolean);
    const taggedMap  = new Map<string, number[]>();
    const untaggedMap = new Map<string, number[]>();
    for (const vlan of vlans) {
      for (const p of parsePorts(vlan.tagged_ports))   { const k = canonicalize(p); taggedMap.set(k,   [...(taggedMap.get(k)   ?? []), vlan.vlan_id]); }
      for (const p of parsePorts(vlan.untagged_ports)) { const k = canonicalize(p); untaggedMap.set(k, [...(untaggedMap.get(k) ?? []), vlan.vlan_id]); }
    }
    for (const k of new Set([...taggedMap.keys(), ...untaggedMap.keys()])) {
      const tagged   = (taggedMap.get(k)   ?? []).sort((a, b) => a - b);
      const untagged = (untaggedMap.get(k) ?? []).sort((a, b) => a - b);
      if (tagged.length > 0) ifaceVlanMap.set(k, { mode: "trunk",  tagged, native: untagged[0] ?? null });
      else                   ifaceVlanMap.set(k, { mode: "access", vlan: untagged[0] });
    }
  }

  const toggleIfaceSort = (col: typeof ifaceSortCol) => {
    if (ifaceSortCol === col) setIfaceSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setIfaceSortCol(col); setIfaceSortDir("asc"); }
  };

  const startColResize = useCallback((col: string, e: React.MouseEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const th = e.currentTarget.parentElement as HTMLTableCellElement;
    const startX = e.clientX;
    const startWidth = th.offsetWidth;
    const onMove = (ev: MouseEvent) => {
      setColWidths(prev => ({ ...prev, [col]: Math.max(60, startWidth + ev.clientX - startX) }));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const sortedInterfaces = interfaces
    ? [...interfaces]
        .filter((iface) => {
          const q    = ifaceSearch.toLowerCase();
          const info = ifaceVlanMap.get(canonicalize(iface.name));
          const modeStr = info?.mode ?? "";
          const vlanStr = info?.mode === "access" ? String(info.vlan) : (info?.tagged.join(",") ?? "");
          return (
            iface.name.toLowerCase().includes(q) ||
            iface.status.toLowerCase().includes(q) ||
            (iface.speed ?? "").toLowerCase().includes(q) ||
            (iface.duplex ?? "").toLowerCase().includes(q) ||
            (iface.description ?? "").toLowerCase().includes(q) ||
            modeStr.includes(q) ||
            vlanStr.includes(q)
          );
        })
        .sort((a, b) => {
          let cmp = 0;
          if (ifaceSortCol === "name")        cmp = naturalCompare(a.name, b.name);
          else if (ifaceSortCol === "status") cmp = a.status.localeCompare(b.status);
          else if (ifaceSortCol === "mode") {
            const ma = ifaceVlanMap.get(canonicalize(a.name))?.mode ?? "";
            const mb = ifaceVlanMap.get(canonicalize(b.name))?.mode ?? "";
            cmp = ma.localeCompare(mb);
          }
          else if (ifaceSortCol === "speed")  cmp = naturalCompare(a.speed ?? "", b.speed ?? "");
          else if (ifaceSortCol === "duplex") cmp = (a.duplex ?? "").localeCompare(b.duplex ?? "");
          else                                cmp = (a.description ?? "").localeCompare(b.description ?? "");
          return ifaceSortDir === "asc" ? cmp : -cmp;
        })
    : null;

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
        size="lg"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {ifaceConfigLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)" }}>
              <RefreshCw size={12} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
              Fetching current configuration from switch…
            </div>
          )}
          <Field label="Description">
            <input
              className="input"
              placeholder="Server uplink"
              value={editIfaceDesc}
              onChange={(e) => setEditIfaceDesc(e.target.value)}
              disabled={ifaceConfigLoading}
            />
          </Field>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: ifaceConfigLoading ? "default" : "pointer", opacity: ifaceConfigLoading ? 0.5 : 1 }}>
            <input
              type="checkbox"
              checked={editIfaceShutdown}
              onChange={(e) => setEditIfaceShutdown(e.target.checked)}
              style={{ accentColor: "var(--qz-danger)" }}
              disabled={ifaceConfigLoading}
            />
            <span style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-2)" }}>
              Shutdown interface
            </span>
          </label>

          <div className="divider-label">Switchport</div>

          <Field label="Port Mode">
            <select
              className="input"
              value={editIfaceSwitchportMode}
              onChange={(e) => setEditIfaceSwitchportMode(e.target.value as "" | "access" | "trunk")}
              disabled={ifaceConfigLoading}
            >
              <option value="">No change</option>
              <option value="access">Access</option>
              <option value="trunk">Trunk</option>
            </select>
          </Field>

          {editIfaceSwitchportMode === "access" && (
            <Field label="Access VLAN" desc="VLAN to assign to this port">
              <VlanPicker
                vlans={vlans ?? []}
                value={editIfaceAccessVlan}
                onChange={setEditIfaceAccessVlan}
                disabled={ifaceConfigLoading}
              />
            </Field>
          )}

          {editIfaceSwitchportMode === "trunk" && (
            <>
              <Field label="Allowed VLANs" desc="Tagged VLANs carried on this trunk">
                <VlanMultiPicker
                  vlans={vlans ?? []}
                  value={editIfaceTaggedVlans}
                  onChange={setEditIfaceTaggedVlans}
                  disabled={ifaceConfigLoading}
                />
              </Field>
              <Field label="Native VLAN / Network" desc="Untagged (native) VLAN — leave blank to keep current">
                <VlanPicker
                  vlans={vlans ?? []}
                  value={editIfaceNativeVlan}
                  onChange={setEditIfaceNativeVlan}
                  nullable
                  placeholder="None"
                  disabled={ifaceConfigLoading}
                />
              </Field>
            </>
          )}

          <div className="alert alert-info">
            <GitCommitHorizontal size={14} />
            <span>Change will be staged — review and push to the switch from the commit bar.</span>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setEditingIface(null)}>Cancel</button>
            <button className="btn" onClick={saveIfaceEdit} disabled={ifaceConfigLoading}>
              <Check size={13} />
              Stage Change
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
          <Field label="VLAN ID" desc="Change to renumber this VLAN on the switch">
            <input
              className="input"
              type="number"
              min={1}
              max={4094}
              value={editVlanId}
              onChange={(e) => setEditVlanId(e.target.value)}
            />
          </Field>
          {editVlanId !== String(editingVlan?.vlan_id ?? "") && (
            <div className="alert alert-warn" style={{ marginTop: -6 }}>
              <AlertTriangle size={14} />
              <span>Renumbering will create VLAN {editVlanId}, migrate all ports, then delete VLAN {editingVlan?.vlan_id}.</span>
            </div>
          )}
          <Field label="VLAN Name">
            <input
              className="input"
              placeholder="Production"
              value={editVlanName}
              onChange={(e) => setEditVlanName(e.target.value)}
            />
          </Field>
          <div className="alert alert-info">
            <GitCommitHorizontal size={14} />
            <span>Change will be staged — review and push to the switch from the commit bar.</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            {canEdit && !confirmDeleteVlan && (
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--qz-danger)" }} onClick={() => setConfirmDeleteVlan(true)}>
                <Trash2 size={13} /> Delete VLAN
              </button>
            )}
            {confirmDeleteVlan && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-danger)" }}>Delete VLAN {editingVlan?.vlan_id}?</span>
                <button className="btn btn-danger btn-sm" onClick={stageVlanDelete}>Confirm</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteVlan(false)}>Cancel</button>
              </div>
            )}
            {!confirmDeleteVlan && <span />}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setEditingVlan(null)}>Cancel</button>
              <button className="btn" onClick={saveVlanEdit}>
                <Check size={13} /> Stage Change
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* VLAN create modal */}
      <Modal
        opened={creatingVlan}
        onClose={() => setCreatingVlan(false)}
        title="New VLAN"
        size="sm"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="VLAN ID" desc="1–4094">
            <input
              className="input"
              type="number"
              min={1}
              max={4094}
              placeholder="10"
              value={newVlanId}
              onChange={(e) => setNewVlanId(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Name" desc="Optional — leave blank for no name">
            <input
              className="input"
              placeholder="Production"
              value={newVlanName}
              onChange={(e) => setNewVlanName(e.target.value)}
            />
          </Field>
          <div className="alert alert-info">
            <GitCommitHorizontal size={14} />
            <span>Change will be staged — review and push to the switch from the commit bar.</span>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setCreatingVlan(false)}>Cancel</button>
            <button className="btn" onClick={saveVlanCreate} disabled={!newVlanId.trim() || parseInt(newVlanId, 10) < 1 || parseInt(newVlanId, 10) > 4094}>
              <Check size={13} /> Stage Change
            </button>
          </div>
        </div>
      </Modal>

      {/* Bulk interface configure modal */}
      <Modal
        opened={bulkConfigOpen}
        onClose={() => setBulkConfigOpen(false)}
        title={`Configure ${selectedIfaceIds.size} Interface${selectedIfaceIds.size !== 1 ? "s" : ""}`}
        size="sm"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="alert alert-info" style={{ marginBottom: 2 }}>
            <AlertCircle size={14} />
            <span>Only fields you fill in will be applied. Leave a field blank to leave it unchanged.</span>
          </div>

          <Field label="Description" desc="Leave blank to keep existing">
            <input
              className="input"
              placeholder="e.g. Server uplink"
              value={bulkDesc}
              onChange={(e) => setBulkDesc(e.target.value)}
            />
          </Field>

          <Field label="Power State">
            <select className="input" value={bulkShutdown} onChange={(e) => setBulkShutdown(e.target.value as "" | "shutdown" | "enable")}>
              <option value="">No change</option>
              <option value="enable">Enable (no shutdown)</option>
              <option value="shutdown">Shutdown</option>
            </select>
          </Field>

          <div className="divider-label">Switchport</div>

          <Field label="Port Mode">
            <select className="input" value={bulkSwitchportMode} onChange={(e) => setBulkSwitchportMode(e.target.value as "" | "access" | "trunk")}>
              <option value="">No change</option>
              <option value="access">Access</option>
              <option value="trunk">Trunk</option>
            </select>
          </Field>

          {bulkSwitchportMode === "access" && (
            <Field label="Access VLAN" desc="VLAN to assign to all selected ports">
              <VlanPicker vlans={vlans ?? []} value={bulkAccessVlan} onChange={setBulkAccessVlan} />
            </Field>
          )}

          {bulkSwitchportMode === "trunk" && (
            <>
              <Field label="Allowed VLANs" desc="Tagged VLANs for all selected trunk ports">
                <VlanMultiPicker vlans={vlans ?? []} value={bulkTaggedVlans} onChange={setBulkTaggedVlans} />
              </Field>
              <Field label="Native VLAN" desc="Untagged (native) VLAN — leave blank to skip">
                <VlanPicker vlans={vlans ?? []} value={bulkNativeVlan} onChange={setBulkNativeVlan} nullable placeholder="None" />
              </Field>
            </>
          )}

          <div className="alert alert-info">
            <GitCommitHorizontal size={14} />
            <span>Changes will be staged — review and push to the switch from the commit bar.</span>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setBulkConfigOpen(false)}>Cancel</button>
            <button
              className="btn"
              onClick={stageBulkIfaceConfigure}
              disabled={!bulkDesc.trim() && !bulkShutdown && !bulkSwitchportMode}
            >
              <Check size={13} /> Stage Changes
            </button>
          </div>
        </div>
      </Modal>

      {/* Commit modal */}
      <Modal opened={commitOpen} onClose={() => setCommitOpen(false)} title={`Staged Changes (${stagedChanges.length})`} size="lg">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {stagedChanges.map((change) => (
            <div
              key={change.id}
              style={{
                background: "var(--qz-surface-sunken)",
                border: "1px solid var(--qz-border)",
                borderRadius: "var(--qz-radius-md)",
                padding: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: "var(--qz-fs-sm)", fontWeight: 500, color: "var(--qz-fg-2)" }}>{change.summary}</span>
                <button
                  className="btn-icon-sm danger"
                  title="Remove this change"
                  onClick={() => setStagedChanges((prev) => prev.filter((c) => c.id !== change.id))}
                >
                  <Trash2 size={11} />
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  fontFamily: "var(--qz-font-mono)",
                  fontSize: "var(--qz-fs-xs)",
                  color: "var(--qz-accent)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  lineHeight: 1.6,
                }}
              >
                {change.commands}
              </pre>
            </div>
          ))}
          {stagedChanges.length === 0 && (
            <p style={{ margin: 0, fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-4)", textAlign: "center", padding: "20px 0" }}>
              No staged changes.
            </p>
          )}
          <div className="alert alert-warn">
            <ShieldAlert size={14} />
            <span>Committing will push all staged changes to the live switch simultaneously.</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: "var(--qz-danger)" }}
              onClick={() => { setStagedChanges([]); setCommitOpen(false); }}
              disabled={stagedChanges.length === 0}
            >
              Discard All
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setCommitOpen(false)}>Close</button>
              <button
                className="btn"
                onClick={handleCommit}
                disabled={committing || stagedChanges.length === 0}
              >
                <Check size={13} />
                {committing ? "Committing..." : `Commit ${stagedChanges.length} Change${stagedChanges.length !== 1 ? "s" : ""}`}
              </button>
            </div>
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
            { label: "Manufacturer",  value: device.manufacturer, mono: false },
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

      {/* Staged changes bar */}
      {stagedChanges.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            marginBottom: 20,
            background: "color-mix(in oklab, var(--qz-warn) 10%, var(--qz-surface))",
            border: "1px solid color-mix(in oklab, var(--qz-warn) 35%, transparent)",
            borderRadius: "var(--qz-radius-md)",
          }}
        >
          <GitCommitHorizontal size={14} style={{ color: "var(--qz-warn)", flexShrink: 0 }} />
          <span style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-2)", flex: 1 }}>
            <strong style={{ color: "var(--qz-warn)" }}>{stagedChanges.length}</strong> staged change{stagedChanges.length !== 1 ? "s" : ""} — not yet pushed to switch
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setCommitOpen(true)}>View Changes</button>
          <button className="btn btn-sm" onClick={() => setCommitOpen(true)}>
            <Check size={12} /> Commit
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--qz-danger)" }}
            onClick={() => setStagedChanges([])}
          >
            Discard All
          </button>
        </div>
      )}

      {/* Overview */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-hdr">
              <span style={{ fontWeight: 600, fontSize: "var(--qz-fs-sm)" }}>Device Details</span>
            </div>
            <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
              {[
                { label: "Hostname",     value: device.hostname,                      mono: true  },
                { label: "IP Address",   value: device.ip_address,                    mono: true  },
                { label: "Role",         value: device.role,                          mono: false },
                { label: "Location",     value: device.location,                      mono: false },
                { label: "SSH Port",     value: String(device.ssh_port),              mono: true  },
                { label: "Added",        value: new Date(device.created_at).toLocaleDateString(), mono: false },
                { label: "Last Updated", value: new Date(device.updated_at).toLocaleString(),     mono: false },
              ].map((r) => (
                <div key={r.label}>
                  <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", marginBottom: 3 }}>{r.label}</div>
                  {r.mono ? <code style={{ whiteSpace: "nowrap" }}>{r.value}</code> : <span style={{ fontSize: "var(--qz-fs-sm)", fontWeight: 500, color: "var(--qz-fg-2)" }}>{r.value}</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-hdr" style={{ justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600, fontSize: "var(--qz-fs-sm)" }}>Hardware Health</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => devicesApi.environment(id).then(setEnvData).catch(() => {})}
              >
                <RefreshCw size={12} />
                Reload
              </button>
            </div>
            <div style={{ padding: 16 }}>
              {envData === null ? (
                <div style={{ display: "flex", gap: 12 }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="skeleton" style={{ height: 56, width: 120, borderRadius: "var(--qz-radius-md)" }} />
                  ))}
                </div>
              ) : envData.psus.length === 0 && envData.fans.length === 0 && (envData.temps?.length ?? 0) === 0 ? (
                <span style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-4)" }}>
                  No environment data collected yet — poll the device to gather PSU and fan health.
                </span>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                  {/* Power Supplies */}
                  {envData.psus.length > 0 && (
                    <div>
                      <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                        <Zap size={11} /> Power Supplies
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {envData.psus.map((psu) => {
                          const isOk     = psu.present && psu.status === "OK";
                          const isAbsent = !psu.present || psu.status === "Absent";
                          const isFault  = !isAbsent && !isOk;
                          const dotColor = isOk ? "var(--qz-accent)" : isFault ? "var(--qz-danger)" : "var(--qz-fg-4)";
                          return (
                            <div
                              key={psu.id}
                              style={{
                                padding: "8px 12px",
                                borderRadius: "var(--qz-radius-md)",
                                background: isOk
                                  ? "color-mix(in oklab, var(--qz-accent) 10%, var(--qz-surface))"
                                  : isFault
                                  ? "color-mix(in oklab, var(--qz-danger) 12%, var(--qz-surface))"
                                  : "var(--qz-surface)",
                                border: `1px solid ${isOk ? "color-mix(in oklab, var(--qz-accent) 30%, transparent)" : isFault ? "color-mix(in oklab, var(--qz-danger) 35%, transparent)" : "var(--qz-border)"}`,
                                minWidth: 140,
                              }}
                            >
                              {/* Slot + status */}
                              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                                <div style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: dotColor }} />
                                <div>
                                  <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-3)", lineHeight: 1.2 }}>{psu.slot}</div>
                                  <div style={{ fontSize: "var(--qz-fs-xs)", fontWeight: 600, color: dotColor }}>{psu.status}</div>
                                </div>
                              </div>
                              {/* Power draw */}
                              {(psu.power_watts != null || psu.avg_power_watts != null) && (
                                <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-3)", display: "flex", flexDirection: "column", gap: 2, borderTop: "1px solid var(--qz-border)", paddingTop: 6 }}>
                                  {psu.power_watts != null && (
                                    <span><span style={{ color: "var(--qz-fg-4)" }}>Power </span><strong style={{ color: "var(--qz-fg-2)" }}>{psu.power_watts}W</strong></span>
                                  )}
                                  {psu.avg_power_watts != null && (
                                    <span><span style={{ color: "var(--qz-fg-4)" }}>Avg </span><strong style={{ color: "var(--qz-fg-2)" }}>{psu.avg_power_watts}W</strong></span>
                                  )}
                                  {psu.fan_speed_rpm != null && psu.fan_speed_rpm > 0 && (
                                    <span><span style={{ color: "var(--qz-fg-4)" }}>Fan </span><strong style={{ color: "var(--qz-fg-2)", fontFamily: "var(--qz-font-mono)" }}>{psu.fan_speed_rpm.toLocaleString()} RPM</strong></span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Fans */}
                  {envData.fans.length > 0 && (
                    <div>
                      <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                        <Wind size={11} /> Fans
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {envData.fans.map((fan) => {
                          const isOk     = fan.present && fan.status === "OK";
                          const isAbsent = !fan.present || fan.status === "Absent";
                          const isFault  = !isAbsent && !isOk;
                          const dotColor = isOk ? "var(--qz-accent)" : isFault ? "var(--qz-danger)" : "var(--qz-fg-4)";
                          const speeds   = fan.speed_rpm
                            ? fan.speed_rpm.split(",").map(Number).filter((n) => !isNaN(n) && n > 0)
                            : [];
                          return (
                            <div
                              key={fan.id}
                              style={{
                                padding: "8px 12px",
                                borderRadius: "var(--qz-radius-md)",
                                background: isOk
                                  ? "color-mix(in oklab, var(--qz-accent) 10%, var(--qz-surface))"
                                  : isFault
                                  ? "color-mix(in oklab, var(--qz-danger) 12%, var(--qz-surface))"
                                  : "var(--qz-surface)",
                                border: `1px solid ${isOk ? "color-mix(in oklab, var(--qz-accent) 30%, transparent)" : isFault ? "color-mix(in oklab, var(--qz-danger) 35%, transparent)" : "var(--qz-border)"}`,
                                minWidth: 130,
                              }}
                            >
                              {/* Slot + status */}
                              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: speeds.length > 0 ? 6 : 0 }}>
                                <div style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: dotColor }} />
                                <div>
                                  <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-3)", lineHeight: 1.2 }}>{fan.slot}</div>
                                  <div style={{ fontSize: "var(--qz-fs-xs)", fontWeight: 600, color: dotColor }}>{fan.status}</div>
                                </div>
                              </div>
                              {/* Fan speeds */}
                              {speeds.length > 0 && (
                                <div style={{ borderTop: "1px solid var(--qz-border)", paddingTop: 6, display: "flex", flexDirection: "column", gap: 1 }}>
                                  {speeds.map((rpm, i) => (
                                    <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: "var(--qz-fs-xs)" }}>
                                      <span style={{ color: "var(--qz-fg-4)" }}>Fan {i + 1}</span>
                                      <strong style={{ color: "var(--qz-fg-2)", fontFamily: "var(--qz-font-mono)" }}>{rpm.toLocaleString()} RPM</strong>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Temperatures */}
                  {(envData.temps?.length ?? 0) > 0 && (() => {
                    const SLOT_LABELS: Record<string, string> = {
                      Bcm56960:   "BCM 56960",
                      Bcm_Int:    "BCM Internal",
                      CpuOnBoard: "CPU On-Board",
                      Cpu_Int:    "CPU Internal",
                      SysInt0:    "System Int 0",
                      SysInt1:    "System Int 1",
                    };
                    const labelFor = (slot: string) =>
                      SLOT_LABELS[slot] ??
                      slot.replace(/_/g, " ").replace(/([a-z])([A-Z0-9])/g, "$1 $2");

                    const temps = envData.temps ?? [];
                    const tempColor = (c: number) =>
                      c > 65 ? "var(--qz-danger)" : c > 50 ? "var(--qz-warn)" : "var(--qz-accent)";
                    return (
                      <div>
                        <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                          <Thermometer size={11} /> Temperatures
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {temps.map((t) => (
                            <div
                              key={t.id}
                              style={{
                                padding: "8px 12px",
                                borderRadius: "var(--qz-radius-md)",
                                background: "color-mix(in oklab, " + tempColor(t.temp_c) + " 10%, var(--qz-surface))",
                                border: "1px solid color-mix(in oklab, " + tempColor(t.temp_c) + " 30%, transparent)",
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                minWidth: 118,
                              }}
                            >
                              <Thermometer size={14} style={{ color: tempColor(t.temp_c), flexShrink: 0 }} />
                              <div>
                                <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", lineHeight: 1.3 }}>
                                  {labelFor(t.slot)}
                                </div>
                                <div style={{ fontSize: "var(--qz-fs-sm)", fontWeight: 700, color: tempColor(t.temp_c), fontFamily: "var(--qz-font-mono)" }}>
                                  {t.temp_c}°C
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                </div>
              )}
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
            {selectedIfaceIds.size > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                <span style={{ fontSize: "var(--qz-fs-sm)", fontWeight: 600, color: "var(--qz-fg-1)" }}>
                  {selectedIfaceIds.size} selected
                </span>
                <button className="btn btn-sm" onClick={() => {
                  setBulkDesc(""); setBulkShutdown(""); setBulkSwitchportMode("");
                  setBulkAccessVlan(""); setBulkNativeVlan(""); setBulkTaggedVlans("");
                  setBulkConfigOpen(true);
                }}>
                  <Pencil size={12} /> Configure
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => stageBulkIfaceShutdown(selectedIfaceIds, true)}>
                  Shutdown
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => stageBulkIfaceShutdown(selectedIfaceIds, false)}>
                  Enable
                </button>
                <button className="btn btn-sm btn-ghost" style={{ marginLeft: "auto", color: "var(--qz-fg-4)" }} onClick={() => setSelectedIfaceIds(new Set())}>
                  Clear
                </button>
              </div>
            ) : (
              <>
                <span style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-3)" }}>
                  {interfaces
                    ? sortedInterfaces!.length < interfaces.length
                      ? `${sortedInterfaces!.length} of ${interfaces.length} interfaces`
                      : `${interfaces.length} interfaces`
                    : "Loading..."}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedIfaceIds(new Set()); setInterfaces(null); setVlans(null); loadTabData("interfaces"); }}>
                  Reload
                </button>
              </>
            )}
          </div>
          <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--qz-border)", display: "flex", gap: 10, alignItems: "center" }}>
            <div className="input-wrap" style={{ flex: 1 }}>
              <span className="input-icon"><Search size={13} /></span>
              <input
                className="input"
                placeholder="Search interfaces, mode, VLAN..."
                value={ifaceSearch}
                onChange={(e) => setIfaceSearch(e.target.value)}
              />
            </div>
            {canEdit && (
              <span style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", whiteSpace: "nowrap" }}>
                Click a row to edit
              </span>
            )}
          </div>
          <div className="scroll-x">
            <table className="qz-table">
              <thead>
                <tr>
                  {canEdit && (() => {
                    const all = (sortedInterfaces ?? []);
                    const allSelected = all.length > 0 && all.every((i) => selectedIfaceIds.has(i.id));
                    const someSelected = !allSelected && all.some((i) => selectedIfaceIds.has(i.id));
                    return (
                      <th style={{ width: 36, padding: "0 0 0 14px" }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          ref={(el) => { if (el) el.indeterminate = someSelected; }}
                          checked={allSelected}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIfaceIds(new Set(all.map((i) => i.id)));
                            else setSelectedIfaceIds(new Set());
                          }}
                          style={{ cursor: "pointer" }}
                        />
                      </th>
                    );
                  })()}
                  {(
                    [
                      { col: "name",        label: "Interface"   },
                      { col: "status",      label: "Status"      },
                      { col: "mode",        label: "Switchport"  },
                      { col: "speed",       label: "Speed"       },
                      { col: "duplex",      label: "Duplex"      },
                      { col: "description", label: "Description" },
                    ] as const
                  ).map(({ col, label }) => (
                    <th
                      key={col}
                      style={{
                        cursor: "pointer",
                        userSelect: "none",
                        whiteSpace: "nowrap",
                        position: "relative",
                        width: colWidths[col],
                        minWidth: 60,
                        overflow: "hidden",
                      }}
                      onClick={() => toggleIfaceSort(col)}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {label}
                        {ifaceSortCol === col
                          ? ifaceSortDir === "asc"
                            ? <ArrowUp size={11} />
                            : <ArrowDown size={11} />
                          : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />}
                      </span>
                      <span
                        style={{
                          position: "absolute",
                          right: 0,
                          top: 0,
                          bottom: 0,
                          width: 6,
                          cursor: "col-resize",
                          background: "transparent",
                        }}
                        onMouseDown={(e) => startColResize(col, e)}
                      />
                    </th>
                  ))}
                  {canEdit && <th style={{ width: colWidths["_edit"] ?? 40, minWidth: 40, position: "relative" }}>
                    <span
                      style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, cursor: "col-resize" }}
                      onMouseDown={(e) => startColResize("_edit", e)}
                    />
                  </th>}
                </tr>
              </thead>
              <tbody>
                {tabLoading || !sortedInterfaces
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}><td colSpan={canEdit ? 8 : 6}><div className="skeleton" style={{ height: 20 }} /></td></tr>
                    ))
                  : sortedInterfaces.length === 0
                  ? <tr><td colSpan={canEdit ? 8 : 6} style={{ textAlign: "center", padding: 32, color: "var(--qz-fg-4)" }}>
                      {ifaceSearch ? "No interfaces match your search." : "No interface data. Trigger a poll."}
                    </td></tr>
                  : sortedInterfaces.map((iface, idx) => {
                      const swInfo = ifaceVlanMap.get(canonicalize(iface.name));
                      const isSelected = selectedIfaceIds.has(iface.id);
                      return (
                        <tr
                          key={iface.id}
                          style={canEdit ? { cursor: "pointer", userSelect: "none", background: isSelected ? "color-mix(in oklab, var(--qz-accent) 5%, transparent)" : undefined } : undefined}
                          onMouseDown={canEdit ? (e) => {
                            if (e.button !== 0) return;
                            ifaceDragRef.current = { startIdx: idx, base: new Set(selectedIfaceIds), adding: !selectedIfaceIds.has(iface.id), moved: false };
                          } : undefined}
                          onMouseEnter={canEdit ? (e) => {
                            if (!(e.buttons & 1) || !ifaceDragRef.current) return;
                            const drag = ifaceDragRef.current;
                            drag.moved = true;
                            const [lo, hi] = [Math.min(drag.startIdx, idx), Math.max(drag.startIdx, idx)];
                            const next = new Set(drag.base);
                            sortedInterfaces.slice(lo, hi + 1).forEach((i) => drag.adding ? next.add(i.id) : next.delete(i.id));
                            setSelectedIfaceIds(next);
                          } : undefined}
                          onClick={canEdit ? (e) => {
                            if (ifaceDragRef.current?.moved) { ifaceDragRef.current = null; return; }
                            ifaceDragRef.current = null;
                            if (e.ctrlKey || e.metaKey) {
                              setSelectedIfaceIds((prev) => { const n = new Set(prev); n.has(iface.id) ? n.delete(iface.id) : n.add(iface.id); return n; });
                              return;
                            }
                            openIfaceEdit(iface);
                          } : undefined}
                        >
                          {canEdit && (
                            <td style={{ padding: "0 0 0 14px", width: 36 }} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const next = new Set(selectedIfaceIds);
                                  if (e.target.checked) next.add(iface.id); else next.delete(iface.id);
                                  setSelectedIfaceIds(next);
                                }}
                                style={{ cursor: "pointer" }}
                              />
                            </td>
                          )}
                          <td><code style={{ whiteSpace: "nowrap" }}>{iface.name}</code></td>
                          <td>
                            <span className={`badge ${iface.status.toLowerCase() === "up" ? "badge-success" : iface.status.toLowerCase() === "down" ? "badge-danger" : "badge-neutral"}`}>
                              {iface.status}
                            </span>
                          </td>
                          <td>
                            {vlans === null ? (
                              <span style={{ color: "var(--qz-fg-5)", fontSize: "var(--qz-fs-xs)" }}>…</span>
                            ) : !swInfo ? (
                              <span style={{ color: "var(--qz-fg-4)", fontSize: "var(--qz-fs-xs)" }}>—</span>
                            ) : (
                              <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5, flexWrap: "wrap" }}>
                                <span className={swInfo.mode === "access" ? "badge badge-blue" : "badge badge-accent"} style={{ flexShrink: 0 }}>
                                  {swInfo.mode === "access" ? "Access" : "Trunk"}
                                </span>
                                <span style={{ fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-3)" }}>
                                  {swInfo.mode === "access"
                                    ? String(swInfo.vlan)
                                    : swInfo.tagged.join(", ") + (swInfo.native != null ? ` · u:${swInfo.native}` : "")}
                                </span>
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-3)" }}>{formatSpeed(iface.speed)}</td>
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
                      );
                    })
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
            {selectedVlanIds.size > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                <span style={{ fontSize: "var(--qz-fs-sm)", fontWeight: 600, color: "var(--qz-fg-1)" }}>
                  {selectedVlanIds.size} selected
                </span>
                <button className="btn btn-sm btn-danger" onClick={() => stageBulkVlanDelete(selectedVlanIds)}>
                  <Trash2 size={12} /> Delete
                </button>
                <button className="btn btn-sm btn-ghost" style={{ marginLeft: "auto", color: "var(--qz-fg-4)" }} onClick={() => setSelectedVlanIds(new Set())}>
                  Clear
                </button>
              </div>
            ) : (
              <>
                <span style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-3)" }}>
                  {vlans ? `${vlans.length} VLANs` : "Loading..."}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  {canEdit && (
                    <button className="btn btn-sm" onClick={() => { setNewVlanId(""); setNewVlanName(""); setCreatingVlan(true); }}>
                      <Plus size={13} /> New VLAN
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedVlanIds(new Set()); setVlans(null); loadTabData("vlans"); }}>
                    Reload
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="scroll-x">
            <table className="qz-table">
              <thead>
                <tr>
                  {canEdit && (() => {
                    const all = vlans ?? [];
                    const allSelected = all.length > 0 && all.every((v) => selectedVlanIds.has(v.id));
                    const someSelected = !allSelected && all.some((v) => selectedVlanIds.has(v.id));
                    return (
                      <th style={{ width: 36, padding: "0 0 0 14px" }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          ref={(el) => { if (el) el.indeterminate = someSelected; }}
                          checked={allSelected}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedVlanIds(new Set(all.map((v) => v.id)));
                            else setSelectedVlanIds(new Set());
                          }}
                          style={{ cursor: "pointer" }}
                        />
                      </th>
                    );
                  })()}
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
                      <tr key={i}><td colSpan={canEdit ? 7 : 5}><div className="skeleton" style={{ height: 20 }} /></td></tr>
                    ))
                  : vlans.length === 0
                  ? <tr><td colSpan={canEdit ? 7 : 5} style={{ textAlign: "center", padding: 32, color: "var(--qz-fg-4)" }}>No VLAN data. Trigger a poll.</td></tr>
                  : vlans.map((vlan, idx) => {
                      const isSelected = selectedVlanIds.has(vlan.id);
                      return (
                        <tr
                          key={vlan.id}
                          style={{ cursor: canEdit ? "pointer" : undefined, userSelect: "none", background: isSelected ? "color-mix(in oklab, var(--qz-accent) 5%, transparent)" : undefined }}
                          onMouseDown={canEdit ? (e) => {
                            if (e.button !== 0) return;
                            vlanDragRef.current = { startIdx: idx, base: new Set(selectedVlanIds), adding: !selectedVlanIds.has(vlan.id), moved: false };
                          } : undefined}
                          onMouseEnter={canEdit ? (e) => {
                            if (!(e.buttons & 1) || !vlanDragRef.current) return;
                            const drag = vlanDragRef.current;
                            drag.moved = true;
                            const [lo, hi] = [Math.min(drag.startIdx, idx), Math.max(drag.startIdx, idx)];
                            const next = new Set(drag.base);
                            vlans.slice(lo, hi + 1).forEach((v) => drag.adding ? next.add(v.id) : next.delete(v.id));
                            setSelectedVlanIds(next);
                          } : undefined}
                          onClick={canEdit ? (e) => {
                            if (vlanDragRef.current?.moved) { vlanDragRef.current = null; return; }
                            vlanDragRef.current = null;
                            if (e.ctrlKey || e.metaKey) {
                              setSelectedVlanIds((prev) => { const n = new Set(prev); n.has(vlan.id) ? n.delete(vlan.id) : n.add(vlan.id); return n; });
                              return;
                            }
                            openVlanEdit(vlan);
                          } : undefined}
                        >
                          {canEdit && (
                            <td style={{ padding: "0 0 0 14px", width: 36 }} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const next = new Set(selectedVlanIds);
                                  if (e.target.checked) next.add(vlan.id); else next.delete(vlan.id);
                                  setSelectedVlanIds(next);
                                }}
                                style={{ cursor: "pointer" }}
                              />
                            </td>
                          )}
                          <td>
                            <span className="badge badge-accent">{vlan.vlan_id}</span>
                          </td>
                          <td style={{ fontSize: "var(--qz-fs-sm)", fontWeight: 500 }}>{vlan.name ?? ""}</td>
                          <td>
                            <span className={`badge ${vlan.status === "active" ? "badge-success" : "badge-neutral"}`}>{vlan.status}</span>
                          </td>
                          <td><span style={{ fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-3)" }}>{compressPorts(vlan.tagged_ports)}</span></td>
                          <td><span style={{ fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-3)" }}>{compressPorts(vlan.untagged_ports)}</span></td>
                          {canEdit && (
                            <td>
                              <button className="btn-icon-sm" style={{ background: "rgba(79,179,255,0.12)", color: "var(--qz-info)", border: "1px solid rgba(79,179,255,0.3)" }} onClick={(e) => { e.stopPropagation(); openVlanEdit(vlan); }}>
                                <Pencil size={11} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
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
