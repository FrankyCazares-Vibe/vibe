"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type AdminOrgRow = {
  id: string;
  handle: string;
  name: string;
  description: string;
  logo_url: string | null;
  is_public: boolean;
  verified: boolean;
  last_activity_at: string | null;
  created_at: string;
  member_count: number;
  dormant: boolean;
};

type FilterKey = "all" | "verified" | "community" | "dormant";

const COLORS = {
  bg: "#0F0D17",
  text: "#F5F1E9",
  muted: "rgba(245,241,233,0.6)",
  faint: "rgba(245,241,233,0.4)",
  panel: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.1)",
  accent: "#FF5C35",
  verified: "#F0C84A",
  warn: "#E84D4D",
};

function fmtRelative(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(mo / 12);
  return `${yr}y ago`;
}

export function AdminOrgsClient({
  initialOrgs,
  adminName,
}: {
  initialOrgs: AdminOrgRow[];
  adminName: string;
}) {
  const [orgs, setOrgs] = useState<AdminOrgRow[]>(initialOrgs);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [busyHandle, setBusyHandle] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orgs.filter((o) => {
      if (filter === "verified" && !o.verified) return false;
      if (filter === "community" && (o.verified || o.dormant)) return false;
      if (filter === "dormant" && !o.dormant) return false;
      if (q && !o.name.toLowerCase().includes(q) && !o.handle.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [orgs, filter, search]);

  const counts = useMemo(
    () => ({
      all: orgs.length,
      verified: orgs.filter((o) => o.verified).length,
      community: orgs.filter((o) => !o.verified && !o.dormant).length,
      dormant: orgs.filter((o) => o.dormant).length,
    }),
    [orgs]
  );

  const toggleVerified = async (org: AdminOrgRow) => {
    setBusyHandle(org.handle);
    setErr(null);
    const next = !org.verified;
    setOrgs((prev) =>
      prev.map((o) =>
        o.id === org.id
          ? { ...o, verified: next, dormant: next ? false : o.dormant }
          : o
      )
    );
    try {
      const res = await fetch(`/api/admin/orgs/${org.handle}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verified: next }),
      });
      const data = await res.json();
      if (!data?.ok) {
        // Roll back.
        setOrgs((prev) =>
          prev.map((o) =>
            o.id === org.id ? { ...o, verified: org.verified, dormant: org.dormant } : o
          )
        );
        setErr(data?.error || "Failed to update");
      }
    } catch (e) {
      console.error("[admin] toggle verified", e);
      setErr("Network error");
      setOrgs((prev) =>
        prev.map((o) =>
          o.id === org.id ? { ...o, verified: org.verified, dormant: org.dormant } : o
        )
      );
    } finally {
      setBusyHandle(null);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(120% 80% at 0% 0%, rgba(40,30,60,0.55) 0%, rgba(40,30,60,0) 60%), " +
          "linear-gradient(180deg, #0F0D17 0%, #14111E 50%, #0F0D17 100%)",
        color: COLORS.text,
        fontFamily: "DM Sans, sans-serif",
        padding: "32px 24px",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#FFB89C",
              marginBottom: 6,
            }}
          >
            Platform admin · {adminName}
          </div>
          <h1
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: "-1px",
              margin: 0,
            }}
          >
            Org review
          </h1>
          <p style={{ marginTop: 6, color: COLORS.muted, fontSize: 14, lineHeight: 1.55 }}>
            Verify legit orgs to surface them above community-created ones in
            Discover. Verified orgs are exempt from dormancy decay.
          </p>
        </header>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or handle…"
            style={{
              flex: 1,
              minWidth: 220,
              padding: "10px 14px",
              borderRadius: 10,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.panel,
              color: COLORS.text,
              fontFamily: "inherit",
              fontSize: 14,
              outline: "none",
            }}
          />
          {(["all", "verified", "community", "dormant"] as FilterKey[]).map((k) => {
            const on = filter === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: on
                    ? "1px solid rgba(255,180,150,0.55)"
                    : `1px solid ${COLORS.border}`,
                  background: on
                    ? "linear-gradient(180deg, rgba(255,92,53,0.32) 0%, rgba(255,92,53,0.14) 100%)"
                    : COLORS.panel,
                  color: COLORS.text,
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: on ? 700 : 500,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {k} ({counts[k]})
              </button>
            );
          })}
        </div>

        {err ? (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              background: "rgba(232,77,77,0.18)",
              border: "1px solid rgba(232,77,77,0.4)",
              color: "#FFD0CC",
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            {err}
          </div>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: 28,
                background: COLORS.panel,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 14,
                color: COLORS.muted,
                textAlign: "center",
              }}
            >
              No orgs match.
            </div>
          ) : (
            filtered.map((o) => (
              <div
                key={o.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: 14,
                  borderRadius: 14,
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.border}`,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: o.logo_url
                      ? `url(${o.logo_url}) center/cover`
                      : "rgba(255,255,255,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "Fraunces, serif",
                    fontWeight: 800,
                    fontSize: 15,
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  {!o.logo_url
                    ? o.name
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((s) => s[0])
                        .join("")
                        .toUpperCase()
                    : null}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Link
                      href={`/orgs/${o.handle}`}
                      style={{
                        fontFamily: "Fraunces, serif",
                        fontWeight: 800,
                        fontSize: 16,
                        color: "#fff",
                        textDecoration: "none",
                      }}
                    >
                      {o.name}
                    </Link>
                    {o.verified ? <Badge color={COLORS.verified}>verified</Badge> : null}
                    {!o.is_public ? <Badge color="#9B7BFF">private</Badge> : null}
                    {o.dormant ? <Badge color={COLORS.warn}>dormant</Badge> : null}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: COLORS.muted,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 2,
                    }}
                  >
                    <span>@{o.handle}</span>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>
                      {o.member_count} {o.member_count === 1 ? "member" : "members"}
                    </span>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>active {fmtRelative(o.last_activity_at)}</span>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>created {fmtRelative(o.created_at)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busyHandle === o.handle}
                  onClick={() => toggleVerified(o)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 10,
                    border: `1px solid ${
                      o.verified ? "rgba(240,200,74,0.5)" : "rgba(255,255,255,0.14)"
                    }`,
                    background: o.verified
                      ? "linear-gradient(180deg, rgba(240,200,74,0.3) 0%, rgba(240,200,74,0.12) 100%)"
                      : COLORS.panel,
                    color: o.verified ? "#FFE8A8" : COLORS.text,
                    fontFamily: "inherit",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                    opacity: busyHandle === o.handle ? 0.6 : 1,
                    flexShrink: 0,
                  }}
                >
                  {o.verified ? "Unverify" : "Verify"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color,
        background: hexToRgbaLite(color, 0.18),
        border: `1px solid ${hexToRgbaLite(color, 0.4)}`,
      }}
    >
      {children}
    </span>
  );
}

function hexToRgbaLite(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
