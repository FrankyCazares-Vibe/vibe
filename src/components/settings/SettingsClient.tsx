"use client";

import Link from "next/link";
import { useState } from "react";

type Profile = {
  id: string;
  name: string | null;
  handle: string | null;
  email: string | null;
  school: string | null;
  school_email: string | null;
  school_verified: boolean;
  year: number | null;
  major: string | null;
  created_at: string | null;
};

const PAGE_BG =
  "radial-gradient(120% 80% at 0% 0%, rgba(255,222,180,0.45) 0%, rgba(255,222,180,0) 60%), " +
  "radial-gradient(110% 80% at 100% 100%, rgba(255,200,170,0.35) 0%, rgba(255,200,170,0) 60%), " +
  "linear-gradient(180deg, #FAF7F2 0%, #F4EDE2 100%)";

const CARD_GLASS: React.CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,253,248,0.78) 0%, rgba(255,250,240,0.66) 100%)",
  backdropFilter: "blur(28px) saturate(180%)",
  WebkitBackdropFilter: "blur(28px) saturate(180%)",
  border: "1px solid rgba(255,255,255,0.7)",
  borderRadius: 18,
  boxShadow: [
    "inset 0 1px 0 rgba(255,255,255,0.85)",
    "inset 0 -1px 0 rgba(28,28,30,0.04)",
    "0 6px 22px rgba(180,120,60,0.08)",
  ].join(", "),
};

export function SettingsClient({ profile }: { profile: Profile }) {
  return (
    <main
      style={{
        background: PAGE_BG,
        borderRight: "1px solid rgba(28,28,30,0.08)",
        padding: "32px 28px 80px",
        minWidth: 0,
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <div
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#C84A20",
            marginBottom: 6,
          }}
        >
          Settings
        </div>
        <h1
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: "clamp(26px, 3vw, 32px)",
            fontWeight: 900,
            color: "#1C1C1E",
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          Account
        </h1>
        <p
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 14,
            color: "#5C5853",
            margin: "6px 0 0",
          }}
        >
          Manage your account, sign out, or delete everything.
        </p>
      </header>

      <AccountCard profile={profile} />
      <SignOutCard />
      <DangerZone handle={profile.handle} />
      <LegalFooter />
    </main>
  );
}

function AccountCard({ profile }: { profile: Profile }) {
  return (
    <section style={{ ...CARD_GLASS, padding: 22, marginBottom: 16 }}>
      <SectionTitle>Account info</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", rowGap: 12, columnGap: 16 }}>
        <Row label="Name" value={profile.name ?? "—"} />
        <Row label="Handle" value={profile.handle ? `@${profile.handle}` : "—"} />
        <Row label="Email" value={profile.email ?? "—"} hint="Used for sign-in." />
        <Row
          label="School email"
          value={profile.school_email ?? "—"}
          hint={
            profile.school_verified
              ? "Verified."
              : "Not yet verified — visit /auth/school-email."
          }
        />
        <Row label="School" value={profile.school ?? "—"} />
        <Row
          label="Major / Year"
          value={
            [profile.major, profile.year ? String(profile.year) : null]
              .filter(Boolean)
              .join(" · ") || "—"
          }
        />
        <Row
          label="Joined"
          value={
            profile.created_at
              ? new Date(profile.created_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : "—"
          }
        />
      </div>
      <p
        style={{
          marginTop: 16,
          fontSize: 12,
          color: "#8A8580",
          fontFamily: "DM Sans, sans-serif",
        }}
      >
        Edit your name, handle, bio, and other profile details on{" "}
        <Link href="/profile" style={{ color: "#FF5C35", fontWeight: 700, textDecoration: "none" }}>
          your profile page
        </Link>
        .
      </p>
    </section>
  );
}

function SignOutCard() {
  const [busy, setBusy] = useState(false);

  const onSignOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      // Hard reload so the cookie clear is reflected in any cached
      // bootstrap fetches and the next nav lands on /auth/login.
      window.location.href = "/auth/login";
    } catch {
      setBusy(false);
    }
  };

  return (
    <section style={{ ...CARD_GLASS, padding: 22, marginBottom: 16 }}>
      <SectionTitle>Sign out</SectionTitle>
      <p
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 14,
          color: "#5C5853",
          margin: "0 0 14px",
          maxWidth: 440,
          lineHeight: 1.5,
        }}
      >
        End your session on this browser. You can sign back in any time.
      </p>
      <button
        type="button"
        onClick={onSignOut}
        disabled={busy}
        style={{
          padding: "10px 18px",
          borderRadius: 999,
          border: "1px solid rgba(28,28,30,0.14)",
          background: "rgba(28,28,30,0.04)",
          color: "#1C1C1E",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 14,
          fontWeight: 700,
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </section>
  );
}

function DangerZone({ handle }: { handle: string | null }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expected = (handle ?? "").trim().toLowerCase();
  const matches = confirm.trim().toLowerCase() === expected && expected.length > 0;

  const onDelete = async () => {
    if (busy || !matches) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_handle: confirm }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete account");
      setBusy(false);
    }
  };

  return (
    <section
      style={{
        ...CARD_GLASS,
        padding: 22,
        marginBottom: 16,
        border: "1px solid rgba(220,60,60,0.30)",
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#B83030",
          marginBottom: 6,
        }}
      >
        Danger zone
      </div>
      <h2
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 22,
          fontWeight: 800,
          color: "#1C1C1E",
          letterSpacing: "-0.01em",
          margin: "0 0 8px",
        }}
      >
        Delete your account
      </h2>
      <p
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 14,
          color: "#5C5853",
          margin: "0 0 16px",
          maxWidth: 520,
          lineHeight: 1.5,
        }}
      >
        Permanently removes your profile, posts, comments, reactions,
        connections, RSVPs, messages, and chat reactions. This can&apos;t be undone.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            padding: "10px 18px",
            borderRadius: 999,
            border: "1px solid rgba(220,60,60,0.45)",
            background: "rgba(220,60,60,0.10)",
            color: "#B83030",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Delete account…
        </button>
      ) : (
        <div
          style={{
            padding: 16,
            borderRadius: 14,
            background: "rgba(220,60,60,0.06)",
            border: "1px solid rgba(220,60,60,0.20)",
          }}
        >
          <p
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              color: "#5C5853",
              margin: "0 0 10px",
            }}
          >
            Type your handle{" "}
            <strong style={{ color: "#1C1C1E" }}>@{expected || "handle"}</strong> to
            confirm.
          </p>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={`@${expected || "handle"}`}
            autoComplete="off"
            spellCheck={false}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(28,28,30,0.14)",
              background: "rgba(255,255,255,0.7)",
              color: "#1C1C1E",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 14,
              outline: "none",
              marginBottom: 12,
            }}
          />
          {error ? (
            <div
              style={{
                fontSize: 12,
                color: "#B83030",
                marginBottom: 10,
                fontFamily: "DM Sans, sans-serif",
              }}
            >
              {error}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onDelete}
              disabled={!matches || busy}
              style={{
                padding: "10px 18px",
                borderRadius: 999,
                border: "1px solid rgba(220,60,60,0.55)",
                background:
                  matches && !busy
                    ? "linear-gradient(180deg, #E04848 0%, #B83030 100%)"
                    : "rgba(220,60,60,0.18)",
                color: matches && !busy ? "#fff" : "#B83030",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 14,
                fontWeight: 700,
                cursor: matches && !busy ? "pointer" : "not-allowed",
                opacity: busy ? 0.7 : 1,
                boxShadow:
                  matches && !busy
                    ? "inset 0 1px 0 rgba(255,255,255,0.32), 0 4px 12px rgba(220,60,60,0.28)"
                    : "none",
              }}
            >
              {busy ? "Deleting…" : "Permanently delete"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirm("");
                setError(null);
              }}
              disabled={busy}
              style={{
                padding: "10px 18px",
                borderRadius: 999,
                border: "1px solid rgba(28,28,30,0.14)",
                background: "rgba(255,255,255,0.7)",
                color: "#1C1C1E",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 14,
                fontWeight: 700,
                cursor: busy ? "wait" : "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function LegalFooter() {
  return (
    <p
      style={{
        marginTop: 24,
        fontFamily: "DM Sans, sans-serif",
        fontSize: 13,
        color: "#8A8580",
      }}
    >
      <Link
        href="/legal/terms"
        style={{ color: "#5C5853", fontWeight: 700, textDecoration: "none" }}
      >
        Terms of Service
      </Link>
      <span style={{ margin: "0 8px" }}>·</span>
      <Link
        href="/legal/privacy"
        style={{ color: "#5C5853", fontWeight: 700, textDecoration: "none" }}
      >
        Privacy Policy
      </Link>
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: "Fraunces, serif",
        fontSize: 22,
        fontWeight: 800,
        color: "#1C1C1E",
        letterSpacing: "-0.01em",
        margin: "0 0 14px",
      }}
    >
      {children}
    </h2>
  );
}

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <>
      <div
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#8A8580",
          paddingTop: 4,
        }}
      >
        {label}
      </div>
      <div>
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 14,
            color: "#1C1C1E",
            wordBreak: "break-word",
          }}
        >
          {value}
        </div>
        {hint ? (
          <div
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              color: "#8A8580",
              marginTop: 2,
            }}
          >
            {hint}
          </div>
        ) : null}
      </div>
    </>
  );
}
