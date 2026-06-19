// Copyright (C), 2026 Quartz Systems. Some rights reserved. This work is
// licensed under the terms of the MIT license which can be found in the
// root directory of this project.

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  FileCode,
  AlertCircle,
  Send,
  Check,
  X,
  Tag,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  templates as templatesApi,
  devices as devicesApi,
  type ApiTemplate,
  type ApiDevice,
  type TemplateVariable,
  type PushResult,
} from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/lib/toast";

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

function parseVars(raw: string): TemplateVariable[] {
  try { return JSON.parse(raw); } catch { return []; }
}

type TplForm = {
  name: string;
  description: string;
  content: string;
  variables: TemplateVariable[];
};

const EMPTY_FORM: TplForm = { name: "", description: "", content: "", variables: [] };

export default function ConfigTemplatesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = user?.role !== "viewer";

  const [templateList, setTemplateList] = useState<ApiTemplate[]>([]);
  const [deviceList, setDeviceList]     = useState<ApiDevice[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [submitting, setSubmitting]     = useState(false);

  const [createOpen, setCreateOpen]   = useState(false);
  const [editOpen, setEditOpen]       = useState(false);
  const [deleteOpen, setDeleteOpen]   = useState(false);
  const [pushOpen, setPushOpen]       = useState(false);

  const [editTarget, setEditTarget]     = useState<ApiTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiTemplate | null>(null);
  const [pushTarget, setPushTarget]     = useState<ApiTemplate | null>(null);

  const [createForm, setCreateForm] = useState<TplForm>(EMPTY_FORM);
  const [editForm, setEditForm]     = useState<TplForm>(EMPTY_FORM);
  const [createErrors, setCreateErrors] = useState<Partial<Record<keyof TplForm, string>>>({});

  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [varValues, setVarValues]             = useState<Record<string, string>>({});
  const [pushResults, setPushResults]         = useState<PushResult[] | null>(null);
  const [pushing, setPushing]                 = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [tpls, devs] = await Promise.all([templatesApi.list(), devicesApi.list()]);
      setTemplateList(tpls);
      setDeviceList(devs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const validateCreate = (f: TplForm) => {
    const e: Partial<Record<keyof TplForm, string>> = {};
    if (f.name.trim().length < 2) e.name = "Name required";
    if (f.content.trim().length < 2) e.content = "Content required";
    setCreateErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCreate(createForm)) return;
    setSubmitting(true);
    try {
      await templatesApi.create({
        name: createForm.name,
        description: createForm.description || undefined,
        content: createForm.content,
        variables: JSON.stringify(createForm.variables),
      });
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
      toast({ title: "Template created", message: createForm.name + " added.", type: "success" });
      load();
    } catch (err) {
      toast({ title: "Error", message: err instanceof Error ? err.message : "Failed to create", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditOpen = (t: ApiTemplate) => {
    setEditTarget(t);
    setEditForm({ name: t.name, description: t.description ?? "", content: t.content, variables: parseVars(t.variables) });
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSubmitting(true);
    try {
      await templatesApi.update(editTarget.id, {
        name: editForm.name,
        description: editForm.description || undefined,
        content: editForm.content,
        variables: JSON.stringify(editForm.variables),
      });
      setEditOpen(false);
      toast({ title: "Template updated", message: editForm.name + " saved.", type: "info" });
      load();
    } catch (err) {
      toast({ title: "Error", message: err instanceof Error ? err.message : "Failed to update", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await templatesApi.delete(deleteTarget.id);
      setDeleteOpen(false);
      toast({ title: "Template deleted", message: deleteTarget.name + " removed.", type: "warn" });
      load();
    } catch (err) {
      toast({ title: "Error", message: err instanceof Error ? err.message : "Failed to delete", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const openPush = (t: ApiTemplate) => {
    setPushTarget(t);
    setSelectedDevices(new Set());
    const vars = parseVars(t.variables);
    const init: Record<string, string> = {};
    vars.forEach((v) => { init[v.key] = ""; });
    setVarValues(init);
    setPushResults(null);
    setPushOpen(true);
  };

  const handlePush = async () => {
    if (!pushTarget || selectedDevices.size === 0) return;
    setPushing(true);
    try {
      const res = await templatesApi.push(pushTarget.id, {
        device_ids: Array.from(selectedDevices),
        variables: varValues,
      });
      setPushResults(res.results);
      toast({ title: "Push complete", message: "Pushed to " + res.results.length + " device(s).", type: "info" });
    } catch (err) {
      toast({ title: "Error", message: err instanceof Error ? err.message : "Push failed", type: "error" });
    } finally {
      setPushing(false);
    }
  };

  const previewContent = (content: string, vars: Record<string, string>) => {
    let out = content;
    Object.entries(vars).forEach(([k, v]) => {
      out = out.split("{{" + k + "}}").join(v || "{{" + k + "}}");
    });
    return out;
  };

  const addVar = (setter: React.Dispatch<React.SetStateAction<TplForm>>) =>
    setter((f) => ({ ...f, variables: [...f.variables, { key: "", label: "", placeholder: "" }] }));
  const updateVar = (setter: React.Dispatch<React.SetStateAction<TplForm>>, idx: number, field: keyof TemplateVariable, val: string) =>
    setter((f) => { const vars = [...f.variables]; vars[idx] = { ...vars[idx], [field]: val }; return { ...f, variables: vars }; });
  const removeVar = (setter: React.Dispatch<React.SetStateAction<TplForm>>, idx: number) =>
    setter((f) => ({ ...f, variables: f.variables.filter((_, i) => i !== idx) }));

  function TemplateFormFields({ form, setForm, errors }: { form: TplForm; setForm: React.Dispatch<React.SetStateAction<TplForm>>; errors?: Partial<Record<keyof TplForm, string>> }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Template Name" error={errors?.name}>
          <input className="input" placeholder="VLAN Config" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Description">
          <input className="input" placeholder="Optional description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        <Field label="Template Content" error={errors?.content} desc="Use {{variable_key}} for dynamic values">
          <textarea className="input" rows={8} placeholder={"vlan {{vlan_id}}\n name {{vlan_name}}"} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} style={{ fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-xs)", lineHeight: 1.6, resize: "vertical" }} />
        </Field>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span className="field-label" style={{ marginBottom: 0 }}>Variables</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => addVar(setForm)}><Plus size={12} /> Add Variable</button>
          </div>
          {form.variables.length === 0 ? (
            <p style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", margin: 0 }}>No variables defined.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {form.variables.map((v, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <input className="input" placeholder="Key (e.g. vlan_id)" value={v.key} onChange={(e) => updateVar(setForm, i, "key", e.target.value)} style={{ flex: 1 }} />
                  <input className="input" placeholder="Label" value={v.label} onChange={(e) => updateVar(setForm, i, "label", e.target.value)} style={{ flex: 1 }} />
                  <input className="input" placeholder="Placeholder" value={v.placeholder ?? ""} onChange={(e) => updateVar(setForm, i, "placeholder", e.target.value)} style={{ flex: 1 }} />
                  <button type="button" className="btn-icon-sm danger" onClick={() => removeVar(setForm, i)} style={{ flexShrink: 0, marginTop: 2 }}><X size={11} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "var(--qz-fs-xl)", fontWeight: 700, color: "var(--qz-fg)" }}>Config Templates</h2>
          <p style={{ margin: "4px 0 0", fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-4)" }}>Manage and push configuration templates to switches</p>
        </div>
        {canEdit && (
          <button className="btn" onClick={() => { setCreateForm(EMPTY_FORM); setCreateErrors({}); setCreateOpen(true); }}>
            <Plus size={15} /> New Template
          </button>
        )}
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: 20 }}><AlertCircle size={15} /><span>{error}</span></div>}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 80 }} />)}
        </div>
      ) : templateList.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <FileCode size={36} style={{ color: "var(--qz-fg-4)", marginBottom: 12 }} />
          <p style={{ margin: 0, color: "var(--qz-fg-4)", fontSize: "var(--qz-fs-sm)" }}>No templates yet. Create your first configuration template.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {templateList.map((t) => {
            const vars = parseVars(t.variables);
            return (
              <div key={t.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <FileCode size={15} style={{ color: "var(--qz-accent)" }} />
                      <span style={{ fontSize: "var(--qz-fs-md)", fontWeight: 700, color: "var(--qz-fg)" }}>{t.name}</span>
                      {vars.length > 0 && <span className="badge badge-neutral"><Tag size={10} />{vars.length} var{vars.length !== 1 ? "s" : ""}</span>}
                    </div>
                    {t.description && <p style={{ margin: "0 0 8px", fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-3)" }}>{t.description}</p>}
                    <p style={{ margin: 0, fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)" }}>Updated {new Date(t.updated_at).toLocaleDateString()}</p>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openPush(t)}><Send size={13} /> Push</button>
                    {canEdit && (
                      <>
                        <button className="btn-icon-sm" style={{ background: "rgba(79,179,255,0.12)", color: "var(--qz-info)", border: "1px solid rgba(79,179,255,0.3)" }} onClick={() => handleEditOpen(t)}><Pencil size={12} /></button>
                        <button className="btn-icon-sm danger" onClick={() => { setDeleteTarget(t); setDeleteOpen(true); }}><Trash2 size={12} /></button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New Template" size="lg">
        <form onSubmit={handleCreate}>
          <TemplateFormFields form={createForm} setForm={setCreateForm} errors={createErrors} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn" disabled={submitting}>{submitting ? "Creating..." : "Create Template"}</button>
          </div>
        </form>
      </Modal>

      <Modal opened={editOpen} onClose={() => setEditOpen(false)} title={"Edit Template — " + (editTarget?.name ?? "")} size="lg">
        <form onSubmit={handleEdit}>
          <TemplateFormFields form={editForm} setForm={setEditForm} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setEditOpen(false)} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn" disabled={submitting}>{submitting ? "Saving..." : "Save Changes"}</button>
          </div>
        </form>
      </Modal>

      <Modal opened={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Template" size="sm">
        <p style={{ margin: "0 0 20px", fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-2)" }}>
          Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setDeleteOpen(false)} disabled={submitting}>Cancel</button>
          <button className="btn btn-danger" onClick={handleDelete} disabled={submitting}>{submitting ? "Deleting..." : "Delete Template"}</button>
        </div>
      </Modal>

      <Modal opened={pushOpen} onClose={() => setPushOpen(false)} title={"Push — " + (pushTarget?.name ?? "")} size="xl">
        {pushTarget && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label className="field-label">Select Devices ({selectedDevices.size} selected)</label>
              <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--qz-border)", borderRadius: "var(--qz-radius-md)", background: "var(--qz-surface-sunken)" }}>
                {deviceList.map((d) => (
                  <label key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid var(--qz-border-subtle)" }}>
                    <input type="checkbox" checked={selectedDevices.has(d.id)} onChange={(e) => { setSelectedDevices((prev) => { const next = new Set(prev); if (e.target.checked) next.add(d.id); else next.delete(d.id); return next; }); }} style={{ accentColor: "var(--qz-accent)" }} />
                    <span style={{ fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-sm)", fontWeight: 500 }}>{d.hostname}</span>
                    <span style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)" }}>{d.ip_address} &mdash; {d.location}</span>
                    <span className={"badge " + (d.status === "online" ? "badge-success" : d.status === "offline" ? "badge-danger" : "badge-neutral")} style={{ marginLeft: "auto" }}>{d.status}</span>
                  </label>
                ))}
              </div>
            </div>

            {parseVars(pushTarget.variables).length > 0 && (
              <div>
                <label className="field-label">Variable Values</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {parseVars(pushTarget.variables).map((v) => (
                    <Field key={v.key} label={v.label || v.key}>
                      <input className="input" placeholder={v.placeholder ?? v.key} value={varValues[v.key] ?? ""} onChange={(e) => setVarValues((prev) => ({ ...prev, [v.key]: e.target.value }))} />
                    </Field>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="field-label">Command Preview</label>
              <div style={{ background: "var(--qz-surface-sunken)", border: "1px solid var(--qz-border)", borderRadius: "var(--qz-radius-md)", padding: "12px 14px", fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-xs)", color: "var(--qz-accent)", whiteSpace: "pre-wrap", lineHeight: 1.7, maxHeight: 160, overflowY: "auto" }}>
                {previewContent(pushTarget.content, varValues)}
              </div>
            </div>

            {pushResults && (
              <div>
                <label className="field-label">Push Results</label>
                <table className="qz-table">
                  <thead><tr><th>Device</th><th>Result</th><th>Output / Error</th></tr></thead>
                  <tbody>
                    {pushResults.map((r) => (
                      <tr key={r.device_id}>
                        <td><span style={{ fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-sm)" }}>{r.hostname}</span></td>
                        <td><span className={"badge " + (r.success ? "badge-success" : "badge-danger")}>{r.success ? <Check size={10} /> : <X size={10} />}{r.success ? "OK" : "Error"}</span></td>
                        <td><span style={{ fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-3)" }}>{r.error ?? r.output ?? "—"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="alert alert-warn">
              <ShieldAlert size={14} />
              <span>Commands are pushed to live switches immediately. Verify variable values before pushing.</span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setPushOpen(false)} disabled={pushing}>Close</button>
              <button className="btn" onClick={handlePush} disabled={pushing || selectedDevices.size === 0}>
                <Send size={13} />
                {pushing ? "Pushing..." : "Push to " + selectedDevices.size + " device" + (selectedDevices.size !== 1 ? "s" : "")}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
