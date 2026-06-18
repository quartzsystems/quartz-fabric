"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Network,
  LayoutDashboard,
  Server,
  Users,
  Settings,
  LogOut,
  User,
  ShieldCheck,
  FileCode,
  ChevronDown,
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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  // Close dropdown on outside click
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "var(--qz-bg)",
        }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--qz-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ animation: "spin 1s linear infinite" }}
        >
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

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname.startsWith(href);

  const navItems = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: <LayoutDashboard size={16} />,
      exact: true,
    },
    {
      label: "Devices",
      href: "/dashboard/devices",
      icon: <Server size={16} />,
    },
    {
      label: "Config Templates",
      href: "/dashboard/config-templates",
      icon: <FileCode size={16} />,
    },
    ...(user.role === "admin"
      ? [{ label: "Users", href: "/dashboard/users", icon: <Users size={16} /> }]
      : []),
  ];

  const secondaryNav = [
    { label: "Settings", href: "/dashboard/settings", icon: <Settings size={16} /> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Top bar */}
      <header
        style={{
          height: 56,
          background: "var(--qz-surface)",
          borderBottom: "1px solid var(--qz-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          flexShrink: 0,
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "var(--qz-radius-sm)",
              background: "var(--qz-accent-soft)",
              border: "1px solid var(--qz-accent-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--qz-accent)",
              flexShrink: 0,
            }}
          >
            <Network size={17} />
          </div>
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: "var(--qz-accent)",
                letterSpacing: "0.05em",
                lineHeight: 1.1,
              }}
            >
              QUARTZ FABRIC
            </div>
            <div
              style={{
                fontSize: 9,
                color: "var(--qz-fg-4)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Network Management
            </div>
          </div>
        </div>

        {/* User menu */}
        <div className="dropdown" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: "var(--qz-radius-md)",
              color: "var(--qz-fg-2)",
              transition: "background var(--qz-dur-1)",
            }}
          >
            <span className="avatar avatar-sm">{user.display_name.charAt(0)}</span>
            <span
              style={{
                fontSize: "var(--qz-fs-sm)",
                fontWeight: 500,
                color: "var(--qz-fg)",
              }}
            >
              {user.display_name}
            </span>
            <span className={ROLE_BADGE[user.role] ?? "badge badge-neutral"}>{user.role}</span>
            <ChevronDown size={13} style={{ color: "var(--qz-fg-4)" }} />
          </button>

          {menuOpen && (
            <div className="dropdown-menu">
              <div className="dropdown-label">{user.email}</div>
              <div className="dropdown-divider" />
              <Link
                href="/dashboard/profile"
                className="dropdown-item"
                onClick={() => setMenuOpen(false)}
              >
                <User size={14} />
                My Profile
              </Link>
              <Link
                href="/dashboard/settings"
                className="dropdown-item"
                onClick={() => setMenuOpen(false)}
              >
                <Settings size={14} />
                Settings
              </Link>
              <div className="dropdown-divider" />
              <button className="dropdown-item danger" onClick={handleLogout}>
                <LogOut size={14} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div style={{ display: "flex", flex: 1, marginTop: 56 }}>
        {/* Sidebar */}
        <nav
          style={{
            width: 240,
            background: "var(--qz-surface)",
            borderRight: "1px solid var(--qz-border)",
            display: "flex",
            flexDirection: "column",
            padding: "10px 8px",
            position: "fixed",
            top: 56,
            left: 0,
            bottom: 0,
            overflowY: "auto",
            zIndex: 100,
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
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

          <div
            style={{
              paddingTop: 12,
              borderTop: "1px solid var(--qz-border)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 4px",
            }}
          >
            <ShieldCheck size={13} style={{ color: "var(--qz-success)" }} />
            <span style={{ fontSize: "var(--qz-fs-xs)", color: "var(--qz-fg-4)" }}>
              Secure session active
            </span>
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
