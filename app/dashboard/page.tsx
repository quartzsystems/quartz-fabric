"use client";

import { useEffect, useState } from "react";
import {
  Server,
  Wifi,
  WifiOff,
  AlertTriangle,
  Users,
  Activity,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { summary, type ApiSummary } from "@/lib/api";

/* ── SVG donut chart ────────────────────────────────────────────────────────── */

interface DonutSlice {
  value: number;
  color: string;
  label: string;
}

function DonutChart({
  slices,
  size = 140,
  thickness = 14,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
}) {
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const total = slices.reduce((s, sl) => s + sl.value, 0);

  let cumulative = 0;
  const paths = slices.map((sl) => {
    const pct = total > 0 ? sl.value / total : 0;
    const dashArray = pct * circ;
    const dashOffset = -cumulative * circ;
    cumulative += pct;
    return { ...sl, dashArray, dashOffset };
  });

  const onlinePct = total > 0 ? Math.round((slices[0]?.value / total) * 1000) / 10 : 0;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {total === 0 ? (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--qz-border)"
            strokeWidth={thickness}
          />
        ) : (
          paths.map((p, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth={thickness}
              strokeDasharray={`${p.dashArray} ${circ}`}
              strokeDashoffset={p.dashOffset}
              strokeLinecap="round"
            />
          ))
        )}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontSize: "var(--qz-fs-md)",
            fontWeight: 700,
            color: "var(--qz-fg)",
          }}
        >
          {onlinePct}%
        </span>
        <span style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)" }}>Online</span>
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────── */

const SEVERITY_BADGE: Record<string, string> = {
  error:   "badge badge-danger",
  warning: "badge badge-warn",
  info:    "badge badge-info",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<ApiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    summary
      .get()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load summary"))
      .finally(() => setLoading(false));
  }, []);

  const total   = data?.total_devices   ?? 0;
  const online  = data?.online_devices  ?? 0;
  const offline = data?.offline_devices ?? 0;
  const warning = data?.warning_devices ?? 0;
  const onlinePct  = total > 0 ? Math.round((online  / total) * 1000) / 10 : 0;
  const warnPct    = total > 0 ? Math.round((warning / total) * 1000) / 10 : 0;
  const offlinePct = total > 0 ? Math.round((offline / total) * 1000) / 10 : 0;

  const statCards = [
    { label: "Total Devices",  value: total,                      icon: <Server        size={20} />, colorClass: "accent",  sub: "Dell OS9 Switches" },
    { label: "Online",         value: online,                     icon: <Wifi          size={20} />, colorClass: "success", sub: `${onlinePct}% uptime` },
    { label: "Offline",        value: offline,                    icon: <WifiOff       size={20} />, colorClass: "danger",  sub: offline  > 0 ? "Requires attention" : "All clear" },
    { label: "Warning",        value: warning,                    icon: <AlertTriangle size={20} />, colorClass: "warn",    sub: warning  > 0 ? "Needs review"        : "All clear" },
    { label: "Active Users",   value: data?.active_users  ?? 0,  icon: <Users         size={20} />, colorClass: "info",    sub: `of ${data?.total_users ?? 0} total` },
    { label: "Recent Events",  value: data?.recent_events.length ?? 0, icon: <Activity size={20} />, colorClass: "neutral", sub: "Last 20 events" },
  ];

  return (
    <div style={{ padding: 28 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: "var(--qz-fs-xl)", fontWeight: 700, color: "var(--qz-fg)" }}>
          Welcome back, {user?.display_name}
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-4)" }}>
          Network overview &mdash;{" "}
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
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
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 14,
          marginBottom: 24,
        }}
      >
        {statCards.map((s) =>
          loading ? (
            <div key={s.label} className="skeleton" style={{ height: 108 }} />
          ) : (
            <div
              key={s.label}
              className="card"
              style={{ padding: 16 }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "var(--qz-radius-md)",
                  background: `var(--qz-${s.colorClass === "neutral" ? "accent" : s.colorClass}-soft, var(--qz-accent-soft))`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: s.colorClass === "neutral" ? "var(--qz-fg-3)" : `var(--qz-${s.colorClass === "accent" ? "accent" : s.colorClass === "success" ? "success" : s.colorClass === "danger" ? "danger" : s.colorClass === "warn" ? "warn" : "info"})`,
                  marginBottom: 10,
                }}
              >
                {s.icon}
              </div>
              <div style={{ fontSize: "var(--qz-fs-xl)", fontWeight: 700, color: "var(--qz-fg)" }}>
                {s.value}
              </div>
              <div style={{ fontSize: "var(--qz-fs-sm)", fontWeight: 600, color: "var(--qz-fg-2)" }}>
                {s.label}
              </div>
              <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", marginTop: 2 }}>
                {s.sub}
              </div>
            </div>
          )
        )}
      </div>

      {/* Device Health + Status Summary row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {/* Device Health */}
        <div className="card">
          <div className="card-hdr">
            <span style={{ fontSize: "var(--qz-fs-md)", fontWeight: 600, color: "var(--qz-fg)" }}>
              Device Health
            </span>
          </div>
          <div style={{ padding: 20, display: "flex", alignItems: "center", gap: 40 }}>
            {loading ? (
              <div className="skeleton" style={{ width: 140, height: 140, borderRadius: "50%", flexShrink: 0 }} />
            ) : (
              <>
                <div style={{ flexShrink: 0 }}>
                  <DonutChart
                    size={140}
                    thickness={14}
                    slices={[
                      { value: onlinePct,  color: "var(--qz-success)", label: "Online"  },
                      { value: warnPct,    color: "var(--qz-warn)",    label: "Warning" },
                      { value: offlinePct, color: "var(--qz-danger)",  label: "Offline" },
                    ]}
                  />
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "Online",  pct: onlinePct,  color: "var(--qz-success)" },
                    { label: "Warning", pct: warnPct,    color: "var(--qz-warn)"    },
                    { label: "Offline", pct: offlinePct, color: "var(--qz-danger)"  },
                  ].map((s) => (
                    <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                        <span style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-2)" }}>{s.label}</span>
                      </div>
                      <span style={{ fontSize: "var(--qz-fs-sm)", fontWeight: 600, color: "var(--qz-fg-3)", fontFamily: "var(--qz-font-mono)" }}>
                        {s.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Status Summary */}
        <div className="card">
          <div className="card-hdr">
            <span style={{ fontSize: "var(--qz-fs-md)", fontWeight: 600, color: "var(--qz-fg)" }}>
              Status Summary
            </span>
          </div>
          <div style={{ padding: 20 }}>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 24 }} />
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { label: "Total Devices",  value: total },
                  { label: "Online",         value: online },
                  { label: "Offline",        value: offline },
                  { label: "Total Users",    value: data?.total_users  ?? 0 },
                  { label: "Active Users",   value: data?.active_users ?? 0 },
                ].map((r) => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-3)" }}>{r.label}</span>
                    <span style={{ fontSize: "var(--qz-fs-sm)", fontWeight: 700, color: "var(--qz-accent)", fontFamily: "var(--qz-font-mono)" }}>
                      {r.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Events — full width */}
      <div className="card">
        <div className="card-hdr" style={{ justifyContent: "space-between" }}>
          <span style={{ fontSize: "var(--qz-fs-md)", fontWeight: 600, color: "var(--qz-fg)" }}>
            Recent Events
          </span>
          <span className="badge badge-accent">Live</span>
        </div>
        {loading ? (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 32 }} />
            ))}
          </div>
        ) : (data?.recent_events.length ?? 0) === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-4)" }}>
            No recent events
          </div>
        ) : (
          <div className="scroll-x">
            <table className="qz-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Device</th>
                  <th>Event</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {data!.recent_events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <span style={{ fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)" }}>
                        {new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "var(--qz-fs-sm)", fontWeight: 500, fontFamily: "var(--qz-font-mono)" }}>
                        {event.device_id}
                      </span>
                    </td>
                    <td style={{ fontSize: "var(--qz-fs-sm)" }}>{event.message}</td>
                    <td>
                      <span className={SEVERITY_BADGE[event.severity] ?? "badge badge-neutral"}>
                        {event.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
