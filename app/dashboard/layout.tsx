"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  CircleHelp,
  ChevronUp,
  LayoutDashboard,
  Server,
  Users,
  Settings,
  LogOut,
  User,
  FileCode,
  Search,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import type { ReactNode } from "react";

const ROLE_BADGE: Record<string, string> = {
  admin:    "badge badge-accent",
  operator: "badge badge-blue",
  viewer:   "badge badge-neutral",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (isLoading || !user) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--qz-bg)" }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--qz-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      router.push(`/dashboard/devices?q=${encodeURIComponent(q)}`);
    }
  };

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname.startsWith(href);

  const navItems = [
    { label: "Dashboard",        href: "/dashboard",                  icon: <LayoutDashboard size={16} />, exact: true },
    { label: "Devices",          href: "/dashboard/devices",          icon: <Server size={16} /> },
    { label: "Config Templates", href: "/dashboard/config-templates", icon: <FileCode size={16} /> },
    ...(user.role === "admin" ? [{ label: "Users", href: "/dashboard/users", icon: <Users size={16} /> }] : []),
  ];

  const secondaryNav = [
    { label: "Settings", href: "/dashboard/settings", icon: <Settings size={16} /> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>

      {/* ── Top bar ─────────────────────────────────────────── */}
      <header
        style={{
          height: 56,
          background: "var(--qz-ink-0)",
          borderBottom: "1px solid var(--qz-border)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 18px",
          flexShrink: 0,
          position: "fixed",
          top: 0, left: 0, right: 0,
          zIndex: 200,
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="Quartz" style={{ width: 28, height: 28 }} />
          <span style={{ fontWeight: 700, color: "var(--qz-fg-1)", letterSpacing: "-0.01em", fontSize: 15 }}>
            Quartz Fabric
          </span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Global search */}
        <form onSubmit={handleSearch} style={{ display: "contents" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--qz-input-bg)",
              border: "1px solid var(--qz-border)",
              borderRadius: "var(--qz-radius-md)",
              padding: "0 10px",
              minWidth: 240,
              height: 34,
            }}
          >
            <Search size={14} style={{ color: "var(--qz-fg-4)", flexShrink: 0 }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 13,
                color: "var(--qz-fg-1)",
                fontFamily: "var(--qz-font-sans)",
              }}
            />
            <span
              style={{
                fontFamily: "var(--qz-font-mono)",
                fontSize: 10,
                color: "var(--qz-fg-4)",
                border: "1px solid var(--qz-border)",
                padding: "1px 5px",
                borderRadius: "var(--qz-radius-sm)",
                flexShrink: 0,
              }}
            >
              ⌘K
            </span>
          </div>
        </form>

        {/* Alerts */}
        <button className="btn-icon" title="Alerts" aria-label="Alerts" style={{ width: 34, height: 34 }}>
          <Bell size={17} />
        </button>

        {/* Help */}
        <button className="btn-icon" title="Help" aria-label="Help" style={{ width: 34, height: 34 }}>
          <CircleHelp size={17} />
        </button>
      </header>

      {/* ── Body: sidebar + main ─────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, marginTop: 56 }}>

        {/* Sidebar */}
        <nav
          style={{
            width: 240,
            background: "var(--qz-ink-0)",
            borderRight: "1px solid var(--qz-border)",
            display: "flex",
            flexDirection: "column",
            padding: "10px 8px 0",
            position: "fixed",
            top: 56, left: 0, bottom: 0,
            zIndex: 100,
          }}
        >
          {/* Nav items */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link${isActive(item.href, item.exact) ? " active" : ""}`}
              >
                <span className="nav-link-icon">{item.icon}</span>
                {item.label}
              </Link>
            ))}

            <hr className="divider" style={{ margin: "6px 2px" }} />

            {secondaryNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link${isActive(item.href) ? " active" : ""}`}
              >
                <span className="nav-link-icon">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>

          {/* User section */}
          <div
            ref={menuRef}
            style={{
              borderTop: "1px solid var(--qz-border)",
              padding: "8px 0",
              position: "relative",
              flexShrink: 0,
            }}
          >
            {/* Upward popover */}
            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  background: "var(--qz-surface-raised)",
                  border: "1px solid var(--qz-border-strong)",
                  borderRadius: "var(--qz-radius-lg)",
                  boxShadow: "var(--qz-shadow-2)",
                  overflow: "hidden",
                  zIndex: 10,
                }}
              >
                <div className="dropdown-label" style={{ paddingTop: 8 }}>{user.email}</div>
                <div className="dropdown-divider" />
                <Link href="/dashboard/profile" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                  <User size={14} /> My Profile
                </Link>
                <Link href="/dashboard/settings" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                  <Settings size={14} /> Settings
                </Link>
                <div className="dropdown-divider" />
                <button className="dropdown-item danger" onClick={handleLogout}>
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
            )}

            {/* User row button */}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                background: menuOpen ? "color-mix(in oklab, white 4%, transparent)" : "transparent",
                border: "none",
                cursor: "pointer",
                padding: "8px 10px",
                borderRadius: "var(--qz-radius-md)",
                textAlign: "left",
                transition: "background var(--qz-dur-1)",
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, var(--qz-green-700), var(--qz-green-500))",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--qz-fg-on-accent)",
                  fontWeight: 700,
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                {user.display_name.charAt(0).toUpperCase()}
              </div>
              {/* Name + role */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--qz-fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.display_name}
                </div>
                <span className={ROLE_BADGE[user.role] ?? "badge badge-neutral"} style={{ marginTop: 2 }}>
                  {user.role}
                </span>
              </div>
              {/* Chevron */}
              <ChevronUp
                size={13}
                style={{
                  color: "var(--qz-fg-4)",
                  flexShrink: 0,
                  transform: menuOpen ? "none" : "rotate(180deg)",
                  transition: `transform var(--qz-dur-2)`,
                }}
              />
            </button>
          </div>
        </nav>

        {/* Main content */}
        <main
          style={{
            marginLeft: 240,
            width: "calc(100% - 240px)",
            background: "var(--qz-bg)",
            minHeight: "calc(100vh - 56px)",
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {children}
        </main>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
