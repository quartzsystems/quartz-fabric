// Copyright (C), 2026 Quartz Systems. Some rights reserved. This work is
// licensed under the terms of the MIT license which can be found in the
// root directory of this project.

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  CircleHelp,
  ChevronUp,
  LayoutDashboard,
  ScrollText,
  Server,
  Users,
  Settings,
  LogOut,
  User,
  FileCode,
  Search,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/modal";
import { search as searchApi, type SearchResult } from "@/lib/api";
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
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    searchDebounce.current = setTimeout(() => {
      searchApi.query(q)
        .then((r) => { setSearchResults(r); setSearchOpen(true); })
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 250);
  }, [searchQuery]);

  const handleResultClick = useCallback((result: SearchResult) => {
    setSearchOpen(false);
    setSearchQuery("");
    const tab = result.kind === "interface" ? "interfaces" : result.kind === "vlan" ? "vlans" : "";
    router.push(`/dashboard/devices/${result.device_id}${tab ? `?tab=${tab}` : ""}`);
  }, [router]);

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
    if (q) router.push(`/dashboard/devices?q=${encodeURIComponent(q)}`);
  };

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname.startsWith(href);

  const navItems = [
    { label: "Dashboard",        href: "/dashboard",                  icon: <LayoutDashboard size={16} />, exact: true },
    { label: "Devices",          href: "/dashboard/devices",          icon: <Server size={16} /> },
    { label: "Config Templates", href: "/dashboard/config-templates", icon: <FileCode size={16} /> },
    { label: "Logs",             href: "/dashboard/logs",             icon: <ScrollText size={16} /> },
  ];

  const secondaryNav = [
    ...(user.role === "admin" ? [{ label: "Users", href: "/dashboard/users", icon: <Users size={16} /> }] : []),
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
        <div ref={searchRef} style={{ position: "relative" }}>
          <form onSubmit={handleSearch}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--qz-input-bg)",
                border: "1px solid var(--qz-border)",
                borderRadius: "var(--qz-radius-md)",
                padding: "0 10px",
                minWidth: 280,
                height: 34,
              }}
            >
              <Search size={14} style={{ color: "var(--qz-fg-4)", flexShrink: 0 }} />
              <input
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); if (!searchOpen && e.target.value.length >= 2) setSearchOpen(true); }}
                onFocus={() => { if (searchResults.length > 0) setSearchOpen(true); }}
                placeholder="Search devices, interfaces, VLANs…"
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
              {searchLoading && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--qz-fg-4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              )}
            </div>
          </form>

          {/* Dropdown */}
          {searchOpen && searchResults.length > 0 && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              right: 0,
              background: "var(--qz-surface-raised)",
              border: "1px solid var(--qz-border-strong)",
              borderRadius: "var(--qz-radius-lg)",
              boxShadow: "var(--qz-shadow-2)",
              zIndex: 300,
              overflow: "hidden",
              minWidth: 340,
            }}>
              {(["device", "interface", "vlan"] as const).map((kind) => {
                const group = searchResults.filter((r) => r.kind === kind);
                if (!group.length) return null;
                const kindLabel = kind === "device" ? "Devices" : kind === "interface" ? "Interfaces" : "VLANs";
                return (
                  <div key={kind}>
                    <div style={{ padding: "6px 12px 4px", fontSize: 10, fontWeight: 700, color: "var(--qz-fg-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {kindLabel}
                    </div>
                    {group.map((r) => (
                      <button
                        key={`${r.device_id}-${r.label}`}
                        onMouseDown={(e) => { e.preventDefault(); handleResultClick(r); }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          width: "100%",
                          padding: "7px 12px",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "background var(--qz-dur-1)",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--qz-ink-5)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--qz-fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.label}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--qz-fg-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                            {r.device_hostname}{r.sublabel ? ` — ${r.sublabel}` : ""}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Alerts */}
        <button className="btn-icon" title="Alerts" aria-label="Alerts">
          <Bell size={17} />
        </button>

        {/* About */}
        <button className="btn-icon" title="About" aria-label="About" onClick={() => setAboutOpen(true)}>
          <CircleHelp size={17} />
        </button>
      </header>

      <Modal opened={aboutOpen} onClose={() => setAboutOpen(false)} title="About Quartz Fabric">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Identity */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="Quartz" style={{ width: 48, height: 48 }} />
            <div>
              <div style={{ fontSize: "var(--qz-fs-lg)", fontWeight: 700, color: "var(--qz-fg)" }}>
                Quartz Fabric
              </div>
              <div style={{ fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-4)", marginTop: 2 }}>
                Version 0.1.0
              </div>
            </div>
          </div>

          {/* Description */}
          <p style={{ margin: 0, fontSize: "var(--qz-fs-sm)", color: "var(--qz-fg-3)", lineHeight: 1.6 }}>
            Quartz Fabric is a network fabric management platform for Dell OS9 switches.
            It provides real-time device monitoring, interface and VLAN configuration,
            environment health tracking, and a full configuration audit trail.
          </p>

          <hr style={{ border: "none", borderTop: "1px solid var(--qz-border)", margin: 0 }} />

          {/* License */}
          <div>
            <div style={{ fontSize: "var(--qz-fs-xs)", fontWeight: 600, color: "var(--qz-fg-4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              License
            </div>
            <div
              style={{
                background: "var(--qz-ink-2)",
                border: "1px solid var(--qz-border)",
                borderRadius: "var(--qz-radius-md)",
                padding: "12px 14px",
                fontSize: "var(--qz-fs-xs)",
                color: "var(--qz-fg-3)",
                fontFamily: "var(--qz-font-mono)",
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
              }}
            >
{`MIT License

Copyright (C) 2026 Quartz Systems

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`}
            </div>
          </div>
        </div>
      </Modal>

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
