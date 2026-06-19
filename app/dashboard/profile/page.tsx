// Copyright (C), 2026 Quartz Systems. Some rights reserved. This work is
// licensed under the terms of the MIT license which can be found in the
// root directory of this project.

"use client";

import { useState } from "react";
import { AlertCircle, Check, Lock, User, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { auth } from "@/lib/api";
import { useToast } from "@/lib/toast";

const ROLE_BADGE: Record<string, string> = {
  admin:    "badge badge-accent",
  operator: "badge badge-blue",
  viewer:   "badge badge-neutral",
};

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
        <button type="button" className="btn-icon btn-icon-sm" onClick={() => setShow((s) => !s)} tabIndex={-1} aria-label={show ? "Hide" : "Show"}>
          {show ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </span>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const toast = useToast();
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [profileForm, setProfileForm] = useState({
    display_name: user?.display_name ?? "",
    email: user?.email ?? "",
  });
  const [profileErrors, setProfileErrors] = useState<Record<string, string | null>>({});

  const [passwordForm, setPasswordForm] = useState({ password: "", confirm: "" });
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string | null>>({});

  if (!user) return null;

  const validateProfile = () => {
    const e: Record<string, string | null> = {};
    if (profileForm.display_name.trim().length < 2) e.display_name = "Display name too short";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileForm.email)) e.email = "Invalid email";
    setProfileErrors(e);
    return Object.values(e).every((v) => v === null);
  };

  const validatePassword = () => {
    const e: Record<string, string | null> = {};
    if (passwordForm.password.length < 8) e.password = "Must be at least 8 characters";
    if (passwordForm.confirm !== passwordForm.password) e.confirm = "Passwords do not match";
    setPasswordErrors(e);
    return Object.values(e).every((v) => v === null);
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateProfile()) return;
    setProfileError(null);
    setProfileLoading(true);
    try {
      await auth.updateMe({ display_name: profileForm.display_name, email: profileForm.email });
      toast({ title: "Profile updated", message: "Your profile has been saved.", type: "success" });
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePassword()) return;
    setPasswordError(null);
    setPasswordLoading(true);
    try {
      await auth.updateMe({ password: passwordForm.password });
      setPasswordForm({ password: "", confirm: "" });
      toast({ title: "Password changed", message: "Your password has been updated.", type: "success" });
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div style={{ padding: 28, maxWidth: 680 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: "var(--qz-fs-xl)", fontWeight: 700, color: "var(--qz-fg)" }}>
          My Profile
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-4)" }}>
          Manage your account information and password
        </p>
      </div>

      {/* Identity card */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 16 }}>
          <span className="avatar avatar-xl">{user.display_name.charAt(0).toUpperCase()}</span>
          <div>
            <div style={{ fontSize: "var(--qz-fs-lg)", fontWeight: 700, color: "var(--qz-fg)" }}>
              {user.display_name}
            </div>
            <div style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-4)", marginBottom: 6 }}>
              @{user.username}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <span className={ROLE_BADGE[user.role] ?? "badge badge-neutral"}>{user.role}</span>
              <span className={`badge ${user.status === "active" ? "badge-success" : "badge-neutral"}`}>
                {user.status}
              </span>
            </div>
          </div>
        </div>

        <hr className="divider" style={{ marginBottom: 16 }} />

        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", marginBottom: 2 }}>Member since</div>
            <div style={{ fontSize: "var(--qz-fs-sm)", fontWeight: 500 }}>
              {new Date(user.created_at).toLocaleDateString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", marginBottom: 2 }}>Last login</div>
            <div style={{ fontSize: "var(--qz-fs-sm)", fontWeight: 500 }}>
              {user.last_login
                ? new Date(user.last_login).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
                : "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)", marginBottom: 2 }}>Username</div>
            <code>{user.username}</code>
          </div>
        </div>
      </div>

      {/* Profile info edit */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <User size={16} style={{ color: "var(--qz-fg-3)" }} />
          <span style={{ fontWeight: 600, fontSize: "var(--qz-fs-md)", color: "var(--qz-fg)" }}>
            Profile Information
          </span>
        </div>

        {profileError && (
          <div className="alert alert-danger" style={{ marginBottom: 16 }}>
            <AlertCircle size={14} />
            <span>{profileError}</span>
          </div>
        )}

        <form onSubmit={handleProfileSave}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Display Name" error={profileErrors.display_name}>
              <input
                className="input"
                value={profileForm.display_name}
                onChange={(e) => setProfileForm((f) => ({ ...f, display_name: e.target.value }))}
              />
            </Field>
            <Field label="Email Address" error={profileErrors.email}>
              <input
                className="input"
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>
            <Field label="Username" desc="Username cannot be changed">
              <input className="input" value={user.username} disabled />
            </Field>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" className="btn" disabled={profileLoading}>
                <Check size={13} />
                {profileLoading ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Change password */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Lock size={16} style={{ color: "var(--qz-fg-3)" }} />
          <span style={{ fontWeight: 600, fontSize: "var(--qz-fs-md)", color: "var(--qz-fg)" }}>
            Change Password
          </span>
        </div>

        {passwordError && (
          <div className="alert alert-danger" style={{ marginBottom: 16 }}>
            <AlertCircle size={14} />
            <span>{passwordError}</span>
          </div>
        )}

        <form onSubmit={handlePasswordSave}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="New Password" error={passwordErrors.password}>
              <PwField
                value={passwordForm.password}
                onChange={(v) => setPasswordForm((f) => ({ ...f, password: v }))}
                placeholder="Minimum 8 characters"
              />
            </Field>
            <Field label="Confirm New Password" error={passwordErrors.confirm}>
              <PwField
                value={passwordForm.confirm}
                onChange={(v) => setPasswordForm((f) => ({ ...f, confirm: v }))}
                placeholder="Repeat new password"
              />
            </Field>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { setPasswordForm({ password: "", confirm: "" }); setPasswordErrors({}); }}
                disabled={passwordLoading}
              >
                Cancel
              </button>
              <button type="submit" className="btn" disabled={passwordLoading}>
                <Lock size={13} />
                {passwordLoading ? "Changing..." : "Change Password"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
