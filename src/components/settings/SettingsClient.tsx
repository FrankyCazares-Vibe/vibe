"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Profile = {
  id: string;
  name: string | null;
  handle: string | null;
  /** Last time the user changed their handle, ISO timestamp.
   *  Drives the 14-day cooldown countdown in HandleCard. NULL =
   *  first-time claim, no cooldown applies. */
  handle_changed_at: string | null;
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
      className="vibe-settings-main"
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
      <HandleCard
        currentHandle={profile.handle}
        handleChangedAt={profile.handle_changed_at}
      />
      <CampusTourCard handle={profile.handle} />
      <BlockedUsersCard />
      <SignOutCard />
      <DangerZone handle={profile.handle} />
      <LegalFooter />
    </main>
  );
}

function CampusTourCard({ handle }: { handle: string | null }) {
  const onReplay = () => {
    // Clear the three "seen" gates so each leg of the tour fires again, and
    // set a `pending` flag the static profile page reads on load. The flag
    // is the actual trigger — `?welcome=1` is just a backup that can get
    // stripped by intermediate redirects.
    try {
      localStorage.removeItem("vibe_profile_tour_seen_v1");
      localStorage.removeItem("vibe_campus_tour_seen_v1");
      localStorage.removeItem("vibe_network_tour_seen_v1");
      localStorage.setItem("vibe_tour_pending", "profile");
    } catch {
      /* localStorage may be unavailable — tour will still try via the param */
    }
    const dest = handle ? `/profile/${handle}?welcome=1` : "/profile?welcome=1";
    window.location.assign(dest);
  };

  return (
    <section style={{ ...CARD_GLASS, padding: 22, marginBottom: 16 }}>
      <SectionTitle>Campus tour</SectionTitle>
      <p
        style={{
          margin: "8px 0 16px",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 13.5,
          color: "#5C5853",
          lineHeight: 1.55,
        }}
      >
        Walk through vibe again with Otto — profile, campus, and network in
        order. Takes about a minute.
      </p>
      <button
        type="button"
        onClick={onReplay}
        style={{
          appearance: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.08em",
          padding: "10px 18px",
          borderRadius: 999,
          background: "#FF5C35",
          color: "#FAF7F2",
          boxShadow:
            "0 6px 18px rgba(255, 92, 53, 0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
        }}
      >
        Replay tour <span aria-hidden style={{ marginLeft: 6 }}>→</span>
      </button>
    </section>
  );
}

type BlockedUser = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  major: string | null;
  year: number | null;
  blocked_at: string | null;
};

function BlockedUsersCard() {
  const [users, setUsers] = useState<BlockedUser[] | null>(null);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/block", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data?.ok && Array.isArray(data.users)) {
          setUsers(data.users as BlockedUser[]);
        } else {
          setUsers([]);
        }
      } catch {
        if (!cancelled) setUsers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const unblock = async (u: BlockedUser) => {
    if (unblocking) return;
    setUnblocking(u.id);
    try {
      const res = await fetch("/api/me/block", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: u.id }),
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        setUsers((prev) => (prev ?? []).filter((x) => x.id !== u.id));
      }
    } finally {
      setUnblocking(null);
    }
  };

  return (
    <section style={{ ...CARD_GLASS, padding: 22, marginBottom: 16 }}>
      <SectionTitle>Blocked users</SectionTitle>
      <p
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 14,
          color: "#5C5853",
          margin: "0 0 14px",
          maxWidth: 520,
          lineHeight: 1.5,
        }}
      >
        Blocked users can&apos;t see your posts, message you, or react to
        anything you post. Unblock anyone here.
      </p>

      {users === null ? (
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            color: "#8A8580",
          }}
        >
          Loading…
        </div>
      ) : users.length === 0 ? (
        <div
          style={{
            padding: "16px",
            borderRadius: 12,
            background: "rgba(28,28,30,0.03)",
            border: "1px dashed rgba(28,28,30,0.12)",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            color: "#8A8580",
            textAlign: "center",
          }}
        >
          You haven&apos;t blocked anyone.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {users.map((u) => (
            <BlockedRow
              key={u.id}
              user={u}
              busy={unblocking === u.id}
              onUnblock={() => unblock(u)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function BlockedRow({
  user,
  busy,
  onUnblock,
}: {
  user: BlockedUser;
  busy: boolean;
  onUnblock: () => void;
}) {
  const initials = (user.name ?? user.handle ?? "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!)
    .join("")
    .toUpperCase();
  const meta = [user.major, user.year ? String(user.year) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.55)",
        border: "1px solid rgba(28,28,30,0.06)",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          background: user.avatar_url
            ? `url(${user.avatar_url}) center/cover`
            : "linear-gradient(180deg, #FFD8B8 0%, #FFB890 100%)",
          color: "#7A3A18",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Fraunces, serif",
          fontWeight: 700,
          fontSize: 13,
          border: "1px solid rgba(255,255,255,0.92)",
        }}
      >
        {!user.avatar_url ? initials : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 14,
            fontWeight: 800,
            color: "#1C1C1E",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {user.name || user.handle || "Member"}
          {user.handle ? (
            <span
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontWeight: 500,
                fontSize: 12,
                color: "#8A8580",
                marginLeft: 6,
              }}
            >
              @{user.handle}
            </span>
          ) : null}
        </div>
        {meta ? (
          <div
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 11.5,
              color: "#5C5853",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {meta}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onUnblock}
        disabled={busy}
        style={{
          padding: "7px 14px",
          borderRadius: 999,
          border: "1px solid rgba(28,28,30,0.14)",
          background: "rgba(28,28,30,0.04)",
          color: "#1C1C1E",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 12,
          fontWeight: 700,
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.7 : 1,
          flexShrink: 0,
        }}
      >
        {busy ? "Unblocking…" : "Unblock"}
      </button>
    </div>
  );
}

function AccountCard({ profile }: { profile: Profile }) {
  return (
    <section style={{ ...CARD_GLASS, padding: 22, marginBottom: 16 }}>
      <SectionTitle>Account info</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", rowGap: 12, columnGap: 16 }}>
        <Row label="Name" value={profile.name ?? "—"} />
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
        Edit your name, bio, and other profile details on{" "}
        <Link href="/profile" style={{ color: "#FF5C35", fontWeight: 700, textDecoration: "none" }}>
          your profile page
        </Link>
        . Change your handle in the section below.
      </p>
    </section>
  );
}

// Handle change with the 14-day cooldown + live availability check.
// Source of truth for cooldown math lives in lib/profile/handle.ts;
// we keep the formula client-side here too so the countdown updates
// without an extra API call. NULL `handle_changed_at` means a free
// first claim (matches the PATCH endpoint behavior).
const HANDLE_COOLDOWN_DAYS = 14;
const HANDLE_COOLDOWN_MS = HANDLE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

function HandleCard({
  currentHandle,
  handleChangedAt,
}: {
  currentHandle: string | null;
  handleChangedAt: string | null;
}) {
  const [value, setValue] = useState(currentHandle ?? "");
  // `networkCheck` only carries states the server can produce
  // (checking / available / taken). Synchronous validation
  // (idle / invalid) is computed via `localValidation` and merged
  // into `check` below — keeps the effect from doing setState for
  // states it doesn't actually own.
  const [networkCheck, setNetworkCheck] = useState<{
    state: "checking" | "available" | "taken";
    reason?: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedHandle, setSavedHandle] = useState<string | null>(currentHandle);
  const [savedAt, setSavedAt] = useState<string | null>(handleChangedAt);
  const [error, setError] = useState<string | null>(null);

  // 14-day cooldown countdown. `now` ticks once per minute so the copy
  // doesn't go stale if the user lingers on the page. Anchored via
  // useState init so render stays pure (lint-clean).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const cooldownDaysLeft = savedAt
    ? Math.max(
        0,
        Math.ceil(
          (HANDLE_COOLDOWN_MS - (now - new Date(savedAt).getTime())) /
            (24 * 60 * 60 * 1000),
        ),
      )
    : 0;
  const onCooldown = cooldownDaysLeft > 0;

  // Synchronous validation derived from the input — empty / unchanged /
  // bad format states resolve here without hitting the network.
  type Check =
    | { state: "idle" }
    | { state: "checking" }
    | { state: "available" }
    | { state: "taken"; reason?: string | null }
    | { state: "invalid"; reason: string };
  const localValidation = useMemo<Check | null>(() => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === (savedHandle ?? "")) {
      return { state: "idle" };
    }
    if (!HANDLE_RE.test(normalized)) {
      return {
        state: "invalid",
        reason:
          normalized.length < 3
            ? "Too short — 3 characters minimum"
            : normalized.length > 20
              ? "Too long — 20 characters max"
              : "Letters, numbers, and underscore only",
      };
    }
    // Network check needed — handled by the effect below.
    return null;
  }, [value, savedHandle]);

  // Live availability check — debounced 300ms after the last keystroke.
  // Skipped entirely when localValidation resolves the case (idle /
  // invalid) — the effect only does the actual fetch + result write.
  useEffect(() => {
    if (localValidation) return; // local case; no network needed
    const normalized = value.trim().toLowerCase();
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setNetworkCheck({ state: "checking" });
      try {
        const r = await fetch(
          `/api/handle/check?h=${encodeURIComponent(normalized)}`,
          { cache: "no-store" },
        );
        const j = await r.json();
        if (cancelled) return;
        if (j?.available) {
          setNetworkCheck({ state: "available" });
        } else {
          setNetworkCheck({
            state: "taken",
            reason: j?.reason ?? "Not available",
          });
        }
      } catch {
        if (!cancelled) setNetworkCheck(null);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [localValidation, value]);

  // Merged check state shown in the UI. localValidation wins when
  // present (idle / invalid); otherwise we show whatever the network
  // is reporting (or a fallback "checking" before the first response).
  const check: Check = localValidation
    ? localValidation
    : networkCheck ?? { state: "checking" };

  const submit = async () => {
    const normalized = value.trim().toLowerCase();
    if (saving || onCooldown) return;
    if (!normalized || normalized === (savedHandle ?? "")) return;
    if (check.state !== "available") return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/me/handle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: normalized }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      setSavedHandle(j.handle as string);
      setSavedAt((j.handle_changed_at as string | undefined) ?? new Date().toISOString());
      setValue(j.handle as string);
      setNetworkCheck(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    !saving &&
    !onCooldown &&
    check.state === "available" &&
    value.trim().toLowerCase() !== (savedHandle ?? "");

  return (
    <section style={{ ...CARD_GLASS, padding: 22, marginBottom: 16 }}>
      <SectionTitle>Handle</SectionTitle>
      <p
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 13.5,
          color: "#5C5853",
          margin: "8px 0 14px",
          lineHeight: 1.55,
        }}
      >
        Your @handle is how people find you and tag you in posts.{" "}
        <strong style={{ color: "#1C1C1E", fontWeight: 700 }}>
          You can change it once every 2 weeks
        </strong>
        , so pick something you&apos;ll want to keep.
      </p>

      {onCooldown ? (
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            color: "#8A6118",
            background: "rgba(245, 200, 66, 0.12)",
            border: "1px solid rgba(245, 200, 66, 0.45)",
            borderRadius: 10,
            padding: "10px 12px",
            marginBottom: 14,
          }}
        >
          Locked for {cooldownDaysLeft} more day{cooldownDaysLeft === 1 ? "" : "s"}.
          You changed your handle on{" "}
          {savedAt
            ? new Date(savedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
            : "—"}
          .
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            paddingLeft: 12,
            paddingRight: 4,
            borderRadius: 10,
            border: "1px solid rgba(28,28,30,0.12)",
            background: onCooldown ? "rgba(28,28,30,0.04)" : "#fff",
            flex: 1,
            opacity: onCooldown ? 0.55 : 1,
          }}
        >
          <span
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 14,
              color: "#8A8580",
              fontWeight: 600,
              marginRight: 2,
            }}
          >
            @
          </span>
          <input
            value={value}
            onChange={(e) =>
              setValue(
                e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20),
              )
            }
            disabled={onCooldown || saving}
            placeholder="your_handle"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            style={{
              flex: 1,
              minWidth: 0,
              padding: "10px 8px",
              border: "none",
              background: "transparent",
              outline: "none",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 14,
              fontWeight: 600,
              color: "#1C1C1E",
            }}
          />
          <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, padding: "0 10px" }}>
            {(() => {
              if (onCooldown || !value.trim() || value.trim().toLowerCase() === (savedHandle ?? "")) return null;
              if (check.state === "checking")
                return <span style={{ color: "#8A8580" }}>Checking…</span>;
              if (check.state === "available")
                return <span style={{ color: "#1A9E5B", fontWeight: 700 }}>Available ✓</span>;
              if (check.state === "taken")
                return (
                  <span style={{ color: "#C0392B", fontWeight: 700 }}>
                    {check.reason ?? "Taken"}
                  </span>
                );
              if (check.state === "invalid")
                return (
                  <span style={{ color: "#C0392B", fontWeight: 700 }}>
                    {check.reason ?? "Invalid"}
                  </span>
                );
              return null;
            })()}
          </span>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!canSave}
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "none",
            background: canSave ? "#FF5C35" : "rgba(28,28,30,0.10)",
            color: canSave ? "#fff" : "#8A8580",
            fontFamily: "DM Sans, sans-serif",
            fontWeight: 700,
            fontSize: 13,
            cursor: canSave ? "pointer" : "default",
            boxShadow: canSave ? "0 4px 14px rgba(255,92,53,0.32)" : "none",
            whiteSpace: "nowrap",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {error ? (
        <div
          style={{
            marginTop: 10,
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            color: "#C0392B",
          }}
        >
          {error}
        </div>
      ) : null}
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
