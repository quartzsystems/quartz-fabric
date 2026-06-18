"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Network, AlertCircle, User, Eye, EyeOff, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [values, setValues] = useState({ username: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  const validate = () => {
    const e: Record<string, string | null> = {};
    e.username = values.username.trim().length === 0 ? "Username is required" : null;
    e.password = values.password.length === 0 ? "Password is required" : null;
    setErrors(e);
    return Object.values(e).every((v) => v === null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setError(null);
    setLoading(true);
    try {
      await login(values.username, values.password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--qz-bg)",
        padding: "24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32, justifyContent: "center" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "var(--qz-radius-md)",
              background: "var(--qz-accent-soft)",
              border: "1px solid var(--qz-accent-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--qz-accent)",
              flexShrink: 0,
            }}
          >
            <Network size={26} />
          </div>
          <div>
            <div
              style={{
                fontSize: "var(--qz-fs-lg)",
                fontWeight: 800,
                color: "var(--qz-accent)",
                letterSpacing: "0.06em",
              }}
            >
              QUARTZ FABRIC
            </div>
            <div
              style={{
                fontSize: "var(--qz-fs-xs)",
                color: "var(--qz-fg-4)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Network Management Platform
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 28 }}>
          <h2
            style={{
              margin: "0 0 4px",
              fontSize: "var(--qz-fs-md)",
              fontWeight: 700,
              color: "var(--qz-fg)",
            }}
          >
            Sign in
          </h2>
          <p style={{ margin: "0 0 20px", fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)" }}>
            Dell OS9 Switch Management Console
          </p>

          {error && (
            <div className="alert alert-danger" style={{ marginBottom: 16 }}>
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="field-label">Username</label>
                <div className="input-wrap">
                  <span className="input-icon"><User size={14} /></span>
                  <input
                    className="input"
                    type="text"
                    placeholder="Enter your username"
                    autoComplete="username"
                    value={values.username}
                    onChange={(e) => setValues((v) => ({ ...v, username: e.target.value }))}
                  />
                </div>
                {errors.username && <div className="field-error">{errors.username}</div>}
              </div>

              <div>
                <label className="field-label">Password</label>
                <div className="input-wrap">
                  <span className="input-icon"><Lock size={14} /></span>
                  <input
                    className="input"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    value={values.password}
                    onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
                    style={{ paddingRight: 36 }}
                  />
                  <span className="input-suffix">
                    <button
                      type="button"
                      className="btn-icon btn-icon-sm"
                      onClick={() => setShowPassword((s) => !s)}
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </span>
                </div>
                {errors.password && <div className="field-error">{errors.password}</div>}
              </div>

              <button
                type="submit"
                className="btn"
                disabled={loading}
                style={{ width: "100%", justifyContent: "center", marginTop: 4, height: 40 }}
              >
                {loading ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </button>
            </div>
          </form>
        </div>

        <p
          style={{
            textAlign: "center",
            marginTop: 16,
            fontSize: "var(--qz-fs-xs)",
            color: "var(--qz-fg-4)",
          }}
        >
          &copy; {new Date().getFullYear()} Quartz Systems &mdash; All rights reserved
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
