// Copyright (C), 2026 Quartz Systems. Some rights reserved. This work is
// licensed under the terms of the MIT license which can be found in the
// root directory of this project.

"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  Clock,
  Database,
  Network,
  Server,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { settings, type ApiSettings, type UpdateSettingsPayload } from "@/lib/api";
import { useToast } from "@/lib/toast";

function ReadRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-4)", flexShrink: 0 }}>{label}</span>
      {mono ? (
        <code>{value}</code>
      ) : (
        <span style={{ fontSize: "var(--qz-fs-sm)", fontWeight: 500, color: "var(--qz-fg-2)", textAlign: "right" }}>
          {value}
        </span>
      )}
    </div>
  );
}

function NumberField({
  label,
  desc,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  desc?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="input-wrap">
        <input
          className="input"
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step ?? 1}
          style={suffix ? { paddingRight: suffix.length * 10 + 16 } : undefined}
        />
        {suffix && (
          <span
            className="input-suffix"
            style={{ paddingRight: 10, fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", pointerEvents: "none" }}
          >
            {suffix}
          </span>
        )}
      </div>
      {desc && <div className="field-desc">{desc}</div>}
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<ApiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isAdmin = user?.role === "admin";

  const [formValues, setFormValues] = useState<UpdateSettingsPayload>({
    poll_interval_secs: 300,
    poll_concurrency:   5,
    rest_timeout_secs:  30,
    jwt_expiry_hours:   8,
  });

  useEffect(() => {
    settings
      .get()
      .then((d) => {
        setData(d);
        setFormValues({
          poll_interval_secs: d.poll_interval_secs,
          poll_concurrency:   d.poll_concurrency,
          rest_timeout_secs:  d.rest_timeout_secs,
          jwt_expiry_hours:   d.jwt_expiry_hours,
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await settings.update(formValues);
      setData(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof UpdateSettingsPayload) => (v: number) =>
    setFormValues((f) => ({ ...f, [key]: v }));

  return (
    <div style={{ padding: 28 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "var(--qz-fs-xl)", fontWeight: 700, color: "var(--qz-fg)" }}>
            Settings
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-4)" }}>
            System configuration &amp; runtime settings
          </p>
        </div>
        {isAdmin && <span className="badge badge-accent">Admin</span>}
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          <AlertCircle size={15} />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit" }}
          >
            ✕
          </button>
        </div>
      )}

      {saved && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          <Check size={15} />
          <span>Settings saved successfully.</span>
        </div>
      )}

      {!isAdmin && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <ShieldCheck size={15} />
          <span>Settings can only be changed by administrators.</span>
        </div>
      )}

      <form onSubmit={handleSave}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 16,
            marginBottom: 20,
          }}
        >
          {/* Polling */}
          <div className="card">
            <div className="card-hdr">
              <Clock size={15} style={{ color: "var(--qz-accent)" }} />
              <span style={{ fontWeight: 600, fontSize: "var(--qz-fs-sm)" }}>Polling</span>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              {loading ? (
                <>
                  <div className="skeleton" style={{ height: 56 }} />
                  <div className="skeleton" style={{ height: 56 }} />
                </>
              ) : isAdmin ? (
                <>
                  <NumberField
                    label="Poll interval"
                    desc="How often to poll all devices"
                    suffix="s"
                    min={30}
                    max={86400}
                    step={60}
                    value={formValues.poll_interval_secs ?? 300}
                    onChange={set("poll_interval_secs")}
                  />
                  <NumberField
                    label="Max concurrent REST polls"
                    desc="Limits parallel device polls"
                    min={1}
                    max={50}
                    value={formValues.poll_concurrency ?? 5}
                    onChange={set("poll_concurrency")}
                  />
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <ReadRow label="Poll interval"             value={`${data?.poll_interval_secs ?? "—"} s`} />
                  <ReadRow label="Max concurrent polls" value={String(data?.poll_concurrency ?? "—")} />
                </div>
              )}
            </div>
          </div>

          {/* REST API Timeout */}
          <div className="card">
            <div className="card-hdr">
              <Network size={15} style={{ color: "var(--qz-accent)" }} />
              <span style={{ fontWeight: 600, fontSize: "var(--qz-fs-sm)" }}>REST API Timeout</span>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              {loading ? (
                <div className="skeleton" style={{ height: 56 }} />
              ) : isAdmin ? (
                <NumberField
                  label="Request timeout"
                  desc="Seconds before a REST API call is aborted"
                  suffix="s"
                  min={5}
                  max={300}
                  value={formValues.rest_timeout_secs ?? 30}
                  onChange={set("rest_timeout_secs")}
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <ReadRow label="Request timeout" value={`${data?.rest_timeout_secs ?? "—"} s`} />
                </div>
              )}
            </div>
          </div>

          {/* Authentication */}
          <div className="card">
            <div className="card-hdr">
              <ShieldCheck size={15} style={{ color: "var(--qz-accent)" }} />
              <span style={{ fontWeight: 600, fontSize: "var(--qz-fs-sm)" }}>Authentication</span>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              {loading ? (
                <div className="skeleton" style={{ height: 56 }} />
              ) : isAdmin ? (
                <NumberField
                  label="Session token expiry"
                  desc="Hours before users must re-login"
                  suffix="h"
                  min={1}
                  max={720}
                  value={formValues.jwt_expiry_hours ?? 8}
                  onChange={set("jwt_expiry_hours")}
                />
              ) : (
                <ReadRow label="Session expiry" value={`${data?.jwt_expiry_hours ?? "—"} hours`} />
              )}
            </div>
          </div>

          {/* Server (admin read-only) */}
          {isAdmin && (
            <div className="card">
              <div className="card-hdr">
                <Server size={15} style={{ color: "var(--qz-fg-4)" }} />
                <span style={{ fontWeight: 600, fontSize: "var(--qz-fs-sm)" }}>Server</span>
              </div>
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                {loading ? (
                  <>
                    <div className="skeleton" style={{ height: 20 }} />
                    <div className="skeleton" style={{ height: 20 }} />
                  </>
                ) : (
                  <>
                    <ReadRow label="Listen address"     value={data?.listen_addr  ?? "—"} mono />
                    <ReadRow label="CORS allowed origin" value={data?.cors_origin  ?? "—"} mono />
                    <p style={{ margin: "8px 0 0", fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)" }}>
                      These values require a backend restart to change.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {isAdmin && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn" disabled={saving}>
              <Check size={14} />
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        )}
      </form>

      {/* Notes */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-hdr">
          <Database size={15} style={{ color: "var(--qz-fg-4)" }} />
          <span style={{ fontWeight: 600, fontSize: "var(--qz-fs-sm)" }}>Notes</span>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ margin: 0, fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-4)" }}>
            Poll interval and concurrency changes take effect at the next poll cycle. REST timeout changes apply immediately to the next request.
          </p>
          <p style={{ margin: 0, fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-4)" }}>
            Server address and CORS settings are read from <code>backend/.env</code> and require a backend restart.
          </p>
        </div>
      </div>
    </div>
  );
}
