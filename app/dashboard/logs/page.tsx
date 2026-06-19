// Copyright (C), 2026 Quartz Systems. Some rights reserved. This work is
// licensed under the terms of the MIT license which can be found in the
// root directory of this project.

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  RefreshCw,
  ScrollText,
  Search,
} from "lucide-react";
import Link from "next/link";
import { logs, settings, type GlobalEvent, type AuditLogEntry } from "@/lib/api";

type Tab = "events" | "changelog";

type EventSortCol   = "created_at" | "device_hostname" | "severity" | "message";
type AuditSortCol   = "created_at" | "username"        | "device_hostname" | "details";
type SortDir        = "asc" | "desc";

const SEV_BADGE: Record<string, string> = {
  error:   "badge badge-danger",
  warning: "badge badge-warn",
  info:    "badge badge-info",
};

const TIMEZONES = [
  "UTC",
  "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "America/Phoenix", "America/Anchorage",
  "Pacific/Honolulu", "America/Toronto", "America/Vancouver",
  "Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin",
  "Europe/Amsterdam", "Europe/Stockholm", "Europe/Helsinki", "Europe/Moscow",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok",
  "Asia/Singapore", "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul",
  "Australia/Perth", "Australia/Sydney", "Pacific/Auckland",
];

function fmtTs(ts: string, tz: string): string {
  const normalized = ts.includes("T") ? ts : ts.replace(" ", "T") + "Z";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    }).format(new Date(normalized));
  } catch {
    return ts;
  }
}

function SortIcon({ col, sortCol, sortDir }: { col: string; sortCol: string; sortDir: SortDir }) {
  if (col !== sortCol) return <ArrowUpDown size={11} style={{ opacity: 0.35 }} />;
  return sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />;
}

function SortTh({
  col, label, sortCol, sortDir, onSort, style,
}: {
  col: string; label: string; sortCol: string; sortDir: SortDir;
  onSort: (col: string) => void; style?: React.CSSProperties;
}) {
  return (
    <th
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", ...style }}
      onClick={() => onSort(col)}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
      </span>
    </th>
  );
}

export default function LogsPage() {
  const [tab, setTab]           = useState<Tab>("events");
  const [events, setEvents]     = useState<GlobalEvent[] | null>(null);
  const [audit, setAudit]       = useState<AuditLogEntry[] | null>(null);
  const [tz, setTz]             = useState("UTC");
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // Events tab state
  const [evSearch, setEvSearch]     = useState("");
  const [evSevFilter, setEvSevFilter] = useState<string>("");
  const [evSortCol, setEvSortCol]   = useState<EventSortCol>("created_at");
  const [evSortDir, setEvSortDir]   = useState<SortDir>("desc");

  // Changelog tab state
  const [alSearch, setAlSearch]     = useState("");
  const [alSortCol, setAlSortCol]   = useState<AuditSortCol>("created_at");
  const [alSortDir, setAlSortDir]   = useState<SortDir>("desc");
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([logs.events(1000), logs.auditLog(1000), settings.get()])
      .then(([ev, al, cfg]) => {
        setEvents(ev);
        setAudit(al);
        setTz(cfg.display_timezone || "UTC");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load logs"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggleEvSort = (col: string) => {
    const c = col as EventSortCol;
    if (evSortCol === c) setEvSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setEvSortCol(c); setEvSortDir("desc"); }
  };

  const toggleAlSort = (col: string) => {
    const c = col as AuditSortCol;
    if (alSortCol === c) setAlSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setAlSortCol(c); setAlSortDir("desc"); }
  };

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const filteredEvents = useMemo(() => {
    if (!events) return null;
    const q = evSearch.toLowerCase();
    return [...events]
      .filter((ev) =>
        (!evSevFilter || ev.severity === evSevFilter) &&
        (!q || ev.device_hostname.toLowerCase().includes(q) || ev.message.toLowerCase().includes(q) || ev.severity.includes(q))
      )
      .sort((a, b) => {
        let cmp = 0;
        if      (evSortCol === "created_at")      cmp = a.created_at.localeCompare(b.created_at);
        else if (evSortCol === "device_hostname")  cmp = a.device_hostname.localeCompare(b.device_hostname);
        else if (evSortCol === "severity")         cmp = a.severity.localeCompare(b.severity);
        else                                       cmp = a.message.localeCompare(b.message);
        return evSortDir === "asc" ? cmp : -cmp;
      });
  }, [events, evSearch, evSevFilter, evSortCol, evSortDir]);

  const filteredAudit = useMemo(() => {
    if (!audit) return null;
    const q = alSearch.toLowerCase();
    return [...audit]
      .filter((al) =>
        !q ||
        al.username.toLowerCase().includes(q) ||
        al.device_hostname.toLowerCase().includes(q) ||
        (al.details ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) => {
        let cmp = 0;
        if      (alSortCol === "created_at")     cmp = a.created_at.localeCompare(b.created_at);
        else if (alSortCol === "username")        cmp = a.username.localeCompare(b.username);
        else if (alSortCol === "device_hostname") cmp = a.device_hostname.localeCompare(b.device_hostname);
        else                                      cmp = (a.details ?? "").localeCompare(b.details ?? "");
        return alSortDir === "asc" ? cmp : -cmp;
      });
  }, [audit, alSearch, alSortCol, alSortDir]);

  return (
    <div style={{ padding: 28 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "var(--qz-fs-xl)", fontWeight: 700, color: "var(--qz-fg)" }}>
            Logs
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-4)" }}>
            Device event log and configuration changelog
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <select
            className="input"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            style={{ fontSize: "var(--qz-fs-xs)", height: 30, padding: "0 8px" }}
            title="Display timezone"
          >
            {TIMEZONES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={13} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          <AlertCircle size={15} /><span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "1px solid var(--qz-border)" }}>
        {(["events", "changelog"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "8px 16px",
              fontSize: "var(--qz-fs-sm)",
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "var(--qz-fg-1)" : "var(--qz-fg-4)",
              borderBottom: tab === t ? "2px solid var(--qz-accent)" : "2px solid transparent",
              marginBottom: -1,
              transition: "color var(--qz-dur-1)",
            }}
          >
            {t === "events" ? "Device Events" : "Changelog"}
            {!loading && (
              <span className="badge badge-neutral" style={{ marginLeft: 6 }}>
                {t === "events" ? (filteredEvents?.length ?? 0) : (filteredAudit?.length ?? 0)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Events tab ───────────────────────────────────────────────────── */}
      {tab === "events" && (
        <div className="card">
          <div className="card-hdr" style={{ justifyContent: "space-between" }}>
            <span style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-3)" }}>
              {loading
                ? "Loading…"
                : filteredEvents!.length < (events?.length ?? 0)
                  ? `${filteredEvents!.length} of ${events!.length} events`
                  : `${events!.length} events`}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>Reload</button>
          </div>

          {/* Search + filter bar */}
          <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--qz-border)", display: "flex", gap: 8, alignItems: "center" }}>
            <div className="input-wrap" style={{ flex: 1 }}>
              <span className="input-icon"><Search size={13} /></span>
              <input
                className="input"
                placeholder="Search device or message…"
                value={evSearch}
                onChange={(e) => setEvSearch(e.target.value)}
              />
            </div>
            <select
              className="input"
              value={evSevFilter}
              onChange={(e) => setEvSevFilter(e.target.value)}
              style={{ width: 130, flexShrink: 0 }}
            >
              <option value="">All severities</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>

          <div className="scroll-x">
            <table className="qz-table">
              <thead>
                <tr>
                  <SortTh col="created_at"     label="Time"     sortCol={evSortCol} sortDir={evSortDir} onSort={toggleEvSort} style={{ width: 180 }} />
                  <SortTh col="device_hostname" label="Device"   sortCol={evSortCol} sortDir={evSortDir} onSort={toggleEvSort} style={{ width: 160 }} />
                  <SortTh col="message"         label="Event"    sortCol={evSortCol} sortDir={evSortDir} onSort={toggleEvSort} />
                  <SortTh col="severity"        label="Severity" sortCol={evSortCol} sortDir={evSortDir} onSort={toggleEvSort} style={{ width: 100 }} />
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}><td colSpan={4}><div className="skeleton" style={{ height: 20 }} /></td></tr>
                    ))
                  : filteredEvents!.length === 0
                  ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", padding: 32, color: "var(--qz-fg-4)" }}>
                        <ScrollText size={24} style={{ opacity: 0.3, display: "block", margin: "0 auto 8px" }} />
                        {evSearch || evSevFilter ? "No events match your filter." : "No events recorded."}
                      </td>
                    </tr>
                  )
                  : filteredEvents!.map((ev) => (
                    <tr key={ev.id}>
                      <td>
                        <span style={{ fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)" }}>
                          {fmtTs(ev.created_at, tz)}
                        </span>
                      </td>
                      <td>
                        <Link
                          href={`/dashboard/devices/${ev.device_id}`}
                          style={{ fontWeight: 500, fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-1)", textDecoration: "none" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {ev.device_hostname}
                        </Link>
                      </td>
                      <td style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-2)" }}>{ev.message}</td>
                      <td>
                        <span className={SEV_BADGE[ev.severity] ?? "badge badge-neutral"}>
                          {ev.severity}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Changelog tab ─────────────────────────────────────────────────── */}
      {tab === "changelog" && (
        <div className="card">
          <div className="card-hdr" style={{ justifyContent: "space-between" }}>
            <span style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-3)" }}>
              {loading
                ? "Loading…"
                : filteredAudit!.length < (audit?.length ?? 0)
                  ? `${filteredAudit!.length} of ${audit!.length} changes`
                  : `${audit!.length} changes`}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>Reload</button>
          </div>

          <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--qz-border)", display: "flex", gap: 8, alignItems: "center" }}>
            <div className="input-wrap" style={{ flex: 1 }}>
              <span className="input-icon"><Search size={13} /></span>
              <input
                className="input"
                placeholder="Search user, device or details…"
                value={alSearch}
                onChange={(e) => setAlSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="scroll-x">
            <table className="qz-table">
              <thead>
                <tr>
                  <SortTh col="created_at"     label="Time"    sortCol={alSortCol} sortDir={alSortDir} onSort={toggleAlSort} style={{ width: 180 }} />
                  <SortTh col="username"        label="User"    sortCol={alSortCol} sortDir={alSortDir} onSort={toggleAlSort} style={{ width: 140 }} />
                  <SortTh col="device_hostname" label="Device"  sortCol={alSortCol} sortDir={alSortDir} onSort={toggleAlSort} style={{ width: 160 }} />
                  <SortTh col="details"         label="Changes" sortCol={alSortCol} sortDir={alSortDir} onSort={toggleAlSort} />
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}><td colSpan={4}><div className="skeleton" style={{ height: 20 }} /></td></tr>
                    ))
                  : filteredAudit!.length === 0
                  ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", padding: 32, color: "var(--qz-fg-4)" }}>
                        <ScrollText size={24} style={{ opacity: 0.3, display: "block", margin: "0 auto 8px" }} />
                        {alSearch ? "No changes match your search." : "No configuration changes recorded."}
                      </td>
                    </tr>
                  )
                  : filteredAudit!.map((entry) => {
                      const lines = entry.details?.split("\n").filter(Boolean) ?? [];
                      const isExpanded = expanded.has(entry.id);
                      const preview = lines.slice(0, 3);
                      const hasMore = lines.length > 3;
                      return (
                        <tr key={entry.id}>
                          <td>
                            <span style={{ fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)" }}>
                              {fmtTs(entry.created_at, tz)}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 500, fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-1)" }}>
                              {entry.username}
                            </span>
                          </td>
                          <td>
                            <Link
                              href={`/dashboard/devices/${entry.device_id}`}
                              style={{ fontWeight: 500, fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-1)", textDecoration: "none" }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {entry.device_hostname}
                            </Link>
                          </td>
                          <td style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-3)", fontFamily: "var(--qz-font-mono)" }}>
                            {lines.length === 0 ? (
                              <span style={{ color: "var(--qz-fg-4)" }}>—</span>
                            ) : (
                              <>
                                {(isExpanded ? lines : preview).map((line, i) => (
                                  <div key={i} style={{ lineHeight: 1.7 }}>{line}</div>
                                ))}
                                {hasMore && (
                                  <button
                                    onClick={() => toggleExpanded(entry.id)}
                                    style={{
                                      background: "none", border: "none", cursor: "pointer",
                                      color: "var(--qz-accent)", fontSize: "var(--qz-fs-xs)",
                                      padding: "2px 0", marginTop: 2,
                                    }}
                                  >
                                    {isExpanded ? "Show less" : `+${lines.length - 3} more`}
                                  </button>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
