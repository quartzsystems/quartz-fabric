"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  Search,
  Users,
  ShieldCheck,
  User,
  Eye,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { users as usersApi, type ApiUser } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/lib/toast";

type Role = "admin" | "operator" | "viewer";

const ROLE_META: Record<Role, { badgeClass: string; icon: React.ReactNode }> = {
  admin:    { badgeClass: "badge badge-accent",  icon: <ShieldCheck size={10} /> },
  operator: { badgeClass: "badge badge-blue",    icon: <User        size={10} /> },
  viewer:   { badgeClass: "badge badge-neutral", icon: <Eye         size={10} /> },
};

const ROLE_OPTIONS = [
  { label: "Admin - Full access",    value: "admin"    },
  { label: "Operator - Read & write",value: "operator" },
  { label: "Viewer - Read only",     value: "viewer"   },
];

function Field({
  label, children, error,
}: { label: string; children: React.ReactNode; error?: string | null }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

function PwField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
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
          {show ? <Eye size={13} /> : <Eye size={13} />}
        </button>
      </span>
    </div>
  );
}

type CreateForm = { display_name: string; username: string; email: string; password: string; role: Role };
type EditForm   = { display_name: string; email: string; role: Role; status: "active" | "inactive"; password: string; confirm_password: string };

const EMPTY_CREATE: CreateForm = { display_name: "", username: "", email: "", password: "", role: "viewer" };

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const isAdmin = currentUser?.role === "admin";

  const [userList, setUserList] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<ApiUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiUser | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen]     = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [createErrors, setCreateErrors] = useState<Partial<Record<keyof CreateForm, string>>>({});

  const [editForm, setEditForm] = useState<EditForm>({
    display_name: "", email: "", role: "viewer", status: "active", password: "", confirm_password: "",
  });
  const [editErrors, setEditErrors] = useState<Partial<Record<keyof EditForm, string>>>({});

  const loadUsers = useCallback(async () => {
    setError(null);
    try {
      const data = await usersApi.list();
      setUserList(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const validateCreate = () => {
    const e: Partial<Record<keyof CreateForm, string>> = {};
    if (createForm.display_name.trim().length < 2) e.display_name = "Display name too short";
    if (createForm.username.trim().length < 3) e.username = "Username must be at least 3 characters";
    else if (userList.some((u) => u.username === createForm.username.trim())) e.username = "Username already taken";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email)) e.email = "Invalid email address";
    if (createForm.password.length < 8) e.password = "Password must be at least 8 characters";
    setCreateErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateEdit = () => {
    const e: Partial<Record<keyof EditForm, string>> = {};
    if (editForm.display_name.trim().length < 2) e.display_name = "Display name too short";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email)) e.email = "Invalid email address";
    if (editForm.password.length > 0 && editForm.password.length < 8) e.password = "Must be at least 8 characters";
    if (editForm.password.length > 0 && editForm.confirm_password !== editForm.password) e.confirm_password = "Passwords do not match";
    setEditErrors(e);
    return Object.keys(e).length === 0;
  };

  const filtered = userList.filter(
    (u) =>
      u.display_name.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCreate()) return;
    setSubmitting(true);
    try {
      await usersApi.create({
        display_name: createForm.display_name,
        username: createForm.username,
        email: createForm.email,
        password: createForm.password,
        role: createForm.role,
      });
      setCreateForm(EMPTY_CREATE);
      setCreateOpen(false);
      toast({ title: "User created", message: `${createForm.display_name} has been added.`, type: "success" });
      loadUsers();
    } catch (err) {
      toast({ title: "Error", message: err instanceof Error ? err.message : "Failed to create user", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditOpen = (u: ApiUser) => {
    setEditTarget(u);
    setEditForm({
      display_name: u.display_name,
      email: u.email,
      role: u.role as Role,
      status: u.status as "active" | "inactive",
      password: "",
      confirm_password: "",
    });
    setEditErrors({});
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || !validateEdit()) return;
    setSubmitting(true);
    try {
      const payload: Parameters<typeof usersApi.update>[1] = {
        display_name: editForm.display_name,
        email: editForm.email,
        role: editForm.role,
        status: editForm.status,
      };
      if (editForm.password) payload.password = editForm.password;
      await usersApi.update(editTarget.id, payload);
      setEditOpen(false);
      toast({ title: "User updated", message: `${editForm.display_name} has been updated.`, type: "info" });
      loadUsers();
    } catch (err) {
      toast({ title: "Error", message: err instanceof Error ? err.message : "Failed to update user", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await usersApi.delete(deleteTarget.id);
      setDeleteOpen(false);
      toast({ title: "User removed", message: `${deleteTarget.display_name} has been removed.`, type: "warn" });
      loadUsers();
    } catch (err) {
      toast({ title: "Error", message: err instanceof Error ? err.message : "Failed to delete user", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const stats = {
    total:  userList.length,
    active: userList.filter((u) => u.status === "active").length,
    admins: userList.filter((u) => u.role === "admin").length,
  };

  return (
    <div style={{ padding: 28 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "var(--qz-fs-xl)", fontWeight: 700, color: "var(--qz-fg)" }}>
            User Management
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-4)" }}>
            Manage platform users and access roles
          </p>
        </div>
        {isAdmin && (
          <button className="btn" onClick={() => { setCreateForm(EMPTY_CREATE); setCreateErrors({}); setCreateOpen(true); }}>
            <Plus size={15} /> Add User
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
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton" style={{ flex: 1, minWidth: 120, height: 72 }} />)
          : [
              { label: "Total Users", value: stats.total,  color: "var(--qz-accent)",  icon: <Users size={15} /> },
              { label: "Active",      value: stats.active, color: "var(--qz-success)", icon: <User  size={15} /> },
              { label: "Admins",      value: stats.admins, color: "var(--qz-info)",    icon: <ShieldCheck size={15} /> },
            ].map((s) => (
              <div key={s.label} className="card" style={{ flex: 1, minWidth: 140, padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "var(--qz-radius-sm)",
                      background: `color-mix(in oklab, ${s.color} 14%, transparent)`,
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
                    <div style={{ fontSize: "var(--qz-fs-xl)", fontWeight: 700 }}>{s.value}</div>
                    <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)" }}>{s.label}</div>
                  </div>
                </div>
              </div>
            ))
        }
      </div>

      {/* Table card */}
      <div className="card">
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--qz-border)" }}>
          <div className="input-wrap" style={{ maxWidth: 360 }}>
            <span className="input-icon"><Search size={14} /></span>
            <input
              className="input"
              placeholder="Search users by name, username, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="scroll-x">
          <table className="qz-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                {isAdmin && <th style={{ textAlign: "right" }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}><td colSpan={isAdmin ? 6 : 5}><div className="skeleton" style={{ height: 24 }} /></td></tr>
                  ))
                : filtered.length === 0
                ? (
                    <tr>
                      <td colSpan={isAdmin ? 6 : 5} style={{ textAlign: "center", padding: "40px", color: "var(--qz-fg-4)" }}>
                        {search ? "No users match your search" : "No users found"}
                      </td>
                    </tr>
                  )
                : filtered.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="avatar avatar-sm">{u.display_name.charAt(0)}</span>
                          <div>
                            <div style={{ fontSize: "var(--qz-fs-sm)", fontWeight: 500, color: "var(--qz-fg)" }}>
                              {u.display_name}
                            </div>
                            <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)" }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-sm)" }}>
                          {u.username}
                        </span>
                      </td>
                      <td>
                        <span className={ROLE_META[u.role as Role]?.badgeClass ?? "badge badge-neutral"}>
                          {ROLE_META[u.role as Role]?.icon}
                          {u.role}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${u.status === "active" ? "badge-success" : "badge-neutral"}`}>
                          {u.status}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: "var(--qz-font-mono)", fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)" }}>
                          {u.last_login
                            ? new Date(u.last_login).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
                            : "Never"}
                        </span>
                      </td>
                      {isAdmin && (
                        <td>
                          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                            <button
                              className="btn-icon-sm"
                              style={{ background: "rgba(79,179,255,0.12)", color: "var(--qz-info)", border: "1px solid rgba(79,179,255,0.3)" }}
                              title="Edit user"
                              onClick={() => handleEditOpen(u)}
                              disabled={u.id === currentUser?.id}
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              className="btn-icon-sm danger"
                              title="Delete user"
                              onClick={() => { setDeleteTarget(u); setDeleteOpen(true); }}
                              disabled={u.id === currentUser?.id}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Add New User">
        <form onSubmit={handleCreate}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Display Name" error={createErrors.display_name}>
              <input className="input" placeholder="John Smith" value={createForm.display_name} onChange={(e) => setCreateForm((f) => ({ ...f, display_name: e.target.value }))} />
            </Field>
            <Field label="Username" error={createErrors.username}>
              <input className="input" placeholder="jsmith" value={createForm.username} onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))} />
            </Field>
            <Field label="Email" error={createErrors.email}>
              <input className="input" type="email" placeholder="jsmith@quartz.systems" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>
            <Field label="Password" error={createErrors.password}>
              <PwField value={createForm.password} onChange={(v) => setCreateForm((f) => ({ ...f, password: v }))} placeholder="Minimum 8 characters" />
            </Field>
            <Field label="Role">
              <select className="input" value={createForm.role} onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as Role }))}>
                {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)} disabled={submitting}>Cancel</button>
              <button type="submit" className="btn" disabled={submitting}>{submitting ? "Creating..." : "Create User"}</button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        opened={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit User${editTarget ? " — " + editTarget.username : ""}`}
        size="md"
      >
        <form onSubmit={handleEdit}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Display Name" error={editErrors.display_name}>
              <input className="input" value={editForm.display_name} onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))} />
            </Field>
            <Field label="Email" error={editErrors.email}>
              <input className="input" type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>
            <Field label="Role">
              <select className="input" value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as Role }))}>
                {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>

            <div className="divider-label">Reset Password (optional)</div>

            <Field label="New Password" error={editErrors.password}>
              <PwField value={editForm.password} onChange={(v) => setEditForm((f) => ({ ...f, password: v }))} placeholder="Leave blank to keep current password" />
            </Field>
            <Field label="Confirm Password" error={editErrors.confirm_password}>
              <PwField value={editForm.confirm_password} onChange={(v) => setEditForm((f) => ({ ...f, confirm_password: v }))} placeholder="Repeat new password" />
            </Field>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setEditOpen(false)} disabled={submitting}>Cancel</button>
              <button type="submit" className="btn" disabled={submitting}>{submitting ? "Saving..." : "Save Changes"}</button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal opened={deleteOpen} onClose={() => setDeleteOpen(false)} title="Remove User" size="sm">
        <p style={{ margin: "0 0 20px", fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-2)" }}>
          Are you sure you want to remove <strong>{deleteTarget?.display_name}</strong>? This action cannot be undone.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setDeleteOpen(false)} disabled={submitting}>Cancel</button>
          <button className="btn btn-danger" onClick={handleDelete} disabled={submitting}>{submitting ? "Removing..." : "Remove User"}</button>
        </div>
      </Modal>
    </div>
  );
}
