"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { AFTER_DELETE } from "@/app/account/suspended/suspended-actions";
import {
  asLoadFailure,
  LoadFailed,
  type LoadFailure,
} from "@/components/feedback/LoadFailed";
import { AppearanceCard } from "@/components/settings/AppearanceCard";
import { NotificationsCard } from "@/components/settings/NotificationsCard";
import { PersonalEmailRow } from "@/components/settings/PersonalEmail";
import { SessionsCard } from "@/components/settings/SessionsCard";
import type { NotificationPrefs } from "@/components/settings/notifications-card-view";
import { vibeRequest } from "@/lib/feedback/request";
import { clearDraft } from "@/lib/onboarding/draft";
import {
  CAMPUS_CONFIRM_LOCK_COPY,
  CAMPUS_SAVE_FAILURE_COPY,
  campusPickStep,
  campusSaveFailure,
  nextAvailableAfterWrite,
  settingsCampusCardView,
  type SettingsCampusInput,
} from "@/lib/profile/settings-campus-card";
import { pushLogoutBody } from "@/lib/pwa/device-push";
import { leaveDeviceClean } from "@/lib/pwa/leave-device-clean";
import type { ThemePref } from "@/lib/theme/theme";
import { MOBILE_BREAKPOINT_PX } from "@/lib/use-is-mobile";

type Profile = {
  id: string;
  name: string | null;
  handle: string | null;
  /** Last time the user changed their handle, ISO timestamp.
   *  Drives the 14-day cooldown countdown in HandleCard. NULL =
   *  first-time claim, no cooldown applies. */
  handle_changed_at: string | null;
  email: string | null;
  school_email: string | null;
  school_verified: boolean;
  year: number | null;
  major: string | null;
  created_at: string | null;
};

// The campus feed's backdrop (contracts C0): cream with a coral bloom in
// Light, near-black with the bloom in Night. One token, so Settings and the
// feed can't drift apart.
const PAGE_BG = "var(--feed-backdrop)";

// Glass cards read the C0 tokens so they flip with data-theme (S67 wave 3):
// the white tint becomes Night's rgba(22,21,21,0.86), the bright rim and the
// warm shadow their dark counterparts.
const CARD_GLASS: React.CSSProperties = {
  background: "var(--glass)",
  backdropFilter: "blur(28px) saturate(180%)",
  WebkitBackdropFilter: "blur(28px) saturate(180%)",
  border: "1px solid var(--glass-border)",
  borderRadius: 18,
  boxShadow: "var(--card-shadow)",
};

export function SettingsClient({
  profile,
  campus,
  pushPrefs,
  themePref,
  renderedAt,
}: {
  profile: Profile;
  /** Derived on the server (settings/page.tsx); null when the read failed. */
  campus: SettingsCampusInput | null;
  /** "What to send" for the Notifications card (settings/page.tsx); null when the read failed. */
  pushPrefs: NotificationPrefs | null;
  /** The saved otto_settings.theme for the Appearance card (settings/page.tsx); null when the read failed. */
  themePref: ThemePref | null;
  /** Server ms taken before the page's read; lets the Appearance card spot a render reused on Back. */
  renderedAt: number;
}) {
  return (
    <main
      className="vibe-settings-main"
      style={{
        background: PAGE_BG,
        borderRight: "1px solid var(--hairline)",
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
            color: "var(--eyebrow-ink)",
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
            color: "var(--charcoal)",
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
            color: "var(--ink-2)",
            margin: "6px 0 0",
          }}
        >
          Manage your account, sign out, or delete everything.
        </p>
      </header>

      <AccountCard profile={profile} />
      <AppearanceCard
        initial={themePref}
        renderedAt={renderedAt}
        cardStyle={CARD_GLASS}
        title={<SectionTitle>How Vibe looks</SectionTitle>}
      />
      <CampusCard initial={campus} />
      <HandleCard
        currentHandle={profile.handle}
        handleChangedAt={profile.handle_changed_at}
      />
      <CampusTourCard handle={profile.handle} />
      {/* Renders nothing unless push is available for this account (plan §8 W2). */}
      <NotificationsCard
        pushPrefs={pushPrefs}
        cardStyle={CARD_GLASS}
        title={<SectionTitle>Notifications</SectionTitle>}
      />
      <BlockedUsersCard />
      <HelpAndSafetyCard />
      <SessionsCard />
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
    // Phones go straight to /profile (no handle): it's the owner view the
    // mobile tour runs on, while /profile/<handle> is the share-link route.
    // Desktop keeps the handle route, which carries ?welcome=1 into the
    // static profile page.
    const mobile = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`).matches;
    const dest = handle && !mobile ? `/profile/${handle}?welcome=1` : "/profile?welcome=1";
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
          color: "var(--ink-2)",
          lineHeight: 1.55,
        }}
      >
        Walk through vibe again with Otto. Takes about a minute.
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
          // Dark words on coral (6.3:1); cream on coral was 2.9:1.
          color: "var(--on-coral, #160A06)",
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
  // A failed read is not an empty block list: it renders as the failure
  // line, never "You haven't blocked anyone."
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await vibeRequest<{ users?: BlockedUser[] }>("/api/me/block", {
        cache: "no-store",
        quiet: true,
        failure: "Couldn't load your blocked list.",
      });
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.users)) {
        setLoadErr(null);
        setUsers(r.data.users);
      } else {
        setLoadErr(asLoadFailure(r, "Couldn't load your blocked list."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadKey]);

  const unblock = async (u: BlockedUser) => {
    if (unblocking) return;
    setUnblocking(u.id);
    try {
      // A refusal toasts (feature report 3, #13); vibeRequest never throws.
      const r = await vibeRequest("/api/me/block", { method: "DELETE", json: { target_id: u.id }, failure: "Couldn't unblock them." });
      if (r.ok) {
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
          color: "var(--ink-2)",
          margin: "0 0 14px",
          maxWidth: 520,
          lineHeight: 1.5,
        }}
      >
        While they are signed in, blocked users can&apos;t see your posts or
        message you. Unblock anyone here.
      </p>

      {users === null && loadErr ? (
        <LoadFailed
          failure={loadErr}
          onRetry={() => {
            setLoadErr(null);
            setLoadKey((k) => k + 1);
          }}
        />
      ) : users === null ? (
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            color: "var(--ink-muted)",
          }}
        >
          Loading…
        </div>
      ) : users.length === 0 ? (
        <div
          style={{
            padding: "16px",
            borderRadius: 12,
            background: "rgba(var(--scrim-rgb),0.03)",
            border: "1px dashed rgba(var(--scrim-rgb),0.12)",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            color: "var(--ink-muted)",
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
        background: "color-mix(in srgb, var(--paper) 55%, transparent)",
        border: "1px solid rgba(var(--scrim-rgb),0.06)",
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
            color: "var(--charcoal)",
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
                color: "var(--ink-muted)",
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
              color: "var(--ink-2)",
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
          border: "1px solid rgba(var(--scrim-rgb),0.14)",
          background: "rgba(var(--scrim-rgb),0.04)",
          color: "var(--charcoal)",
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
            profile.school_verified ? (
              "Verified."
            ) : (
              <>
                Not yet verified.{" "}
                <Link
                  href="/auth/school-email"
                  style={{ color: "var(--tag-ink)", fontWeight: 700, textDecoration: "none" }}
                >
                  Verify now →
                </Link>
              </>
            )
          }
        />
        {/* School email first (S75): the address that outlives a closed
            school inbox. Renders nothing until the step exists. */}
        <PersonalEmailRow labelStyle={ROW_LABEL} />
        {/* Campus deliberately isn't mirrored here — it's editable in the
            card directly below, and a read-only copy rendered from the
            server prop would go stale the moment the user changes it. */}
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
          color: "var(--ink-muted)",
          fontFamily: "DM Sans, sans-serif",
        }}
      >
        Edit your name, bio, and other profile details on{" "}
        <Link href="/profile" style={{ color: "var(--tag-ink)", fontWeight: 700, textDecoration: "none" }}>
          your profile page
        </Link>
        . Change your handle in the section below.
      </p>
    </section>
  );
}

// Campus: the community whose clubs, events and map the app shows first.
// It's chosen within the university the student's verified school email
// proved (IU or Purdue), and Indianapolis is one community for both. The
// rules and the option labels live in src/lib/profile/settings-campus-card.ts,
// shared with the phone profile editor.
//
// Writes `campus_id` through PATCH /api/me/profile, which checks the
// university's allowed set and the 45-day rule and stamps `campus_set_at`.
// Once onboarding is done every save starts the 45-day rule, so a pick in the
// select is only staged behind "Switch to {campus}? You can't change your
// campus again for 45 days." with Yes / Cancel (campusPickStep); before that
// a pick saves straight away. "Yes" on the confirm callout re-sends the
// campus already on the row, which stamps it: that is the confirmation, and it
// starts the 45-day rule (the callout says so).
//
// The card's mode always comes from the SAVED row. A staged or in-flight pick
// only changes what the select shows, so picking a campus never flips the
// card into "Confirm your campus" while the request runs.
function CampusCard({ initial }: { initial: SettingsCampusInput | null }) {
  const [campus, setCampus] = useState<SettingsCampusInput | null>(initial);
  const [now] = useState(() => Date.now());
  // A campus picked in the select and not saved yet: waiting on the prompt's
  // Yes (title/body set), or in flight. Null = the select shows the saved row.
  const [pending, setPending] = useState<{
    id: string;
    title: string | null;
    body: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<{
    text: string;
    action?: { label: string; href: string };
  } | null>(null);
  // The server refused a change as too soon. vibeRequest drops `availableAt`,
  // so this locks the select without a date; the error line carries the
  // server's dated sentence.
  const [refusedTooSoon, setRefusedTooSoon] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  const view = campus ? settingsCampusCardView(campus, now) : null;
  const locked = Boolean(view?.locked) || refusedTooSoon;
  const shownValue = pending?.id ?? view?.value ?? "";
  // The sub-line follows what the select shows, staged pick included.
  const shownSub =
    campus && pending
      ? settingsCampusCardView({ ...campus, campusId: pending.id, campusConfirmed: true }, now).sub
      : (view?.sub ?? null);

  const save = async (next: string) => {
    if (!campus || saving || !next) return;
    const prev = campus;
    setSaving(true);
    setSaved(false);
    setError(null);
    const r = await vibeRequest("/api/me/profile", {
      method: "PATCH",
      json: { campus_id: next },
      quiet: true,
      failure: CAMPUS_SAVE_FAILURE_COPY,
    });
    if (r.ok) {
      setCampus({
        ...prev,
        campusId: next,
        campusConfirmed: true,
        campusChangeAvailableAt: nextAvailableAfterWrite(prev.onboarded),
      });
      setSaved(true);
    } else {
      const failure = campusSaveFailure(r);
      setError(failure.action ? { text: failure.text, action: failure.action } : { text: failure.text });
      if (failure.locked) setRefusedTooSoon(true);
    }
    // Either way the select goes back to the saved row: the new campus on
    // success, the old one on failure, so the card never claims a campus the
    // server didn't take.
    setPending(null);
    setSaving(false);
  };

  const onPick = (next: string) => {
    if (!view || !campus || saving || locked) return;
    const step = campusPickStep(view, campus.onboarded, next);
    if (step.kind === "ignore") return;
    if (step.kind === "unstage") {
      setPending(null);
      return;
    }
    setSaved(false);
    setError(null);
    if (step.kind === "save") {
      setPending({ id: next, title: null, body: null });
      void save(next);
      return;
    }
    setPending({ id: next, title: step.title, body: step.body });
  };

  // "Change" on the confirm callout. Phones don't open a native picker on a
  // programmatic focus, so ask for the picker where the browser has one.
  const openPicker = () => {
    const el = selectRef.current;
    if (!el) return;
    el.focus();
    try {
      (el as HTMLSelectElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      // Not supported or not allowed here: the focused select is the fallback.
    }
  };

  const hintStyle: React.CSSProperties = {
    fontFamily: "DM Sans, sans-serif",
    fontSize: 12,
    color: "var(--ink-muted)",
    marginTop: 8,
    lineHeight: 1.5,
  };
  // 44px tall: these are phone tap targets too.
  const pillStyle: React.CSSProperties = {
    minHeight: 44,
    padding: "10px 20px",
    borderRadius: 999,
    fontFamily: "DM Sans, sans-serif",
    fontSize: 13,
    fontWeight: 700,
  };
  const yesStyle: React.CSSProperties = {
    ...pillStyle,
    appearance: "none",
    border: "none",
    background: "#FF5C35",
    color: "var(--on-coral, #160A06)",
    cursor: saving ? "wait" : "pointer",
    opacity: saving ? 0.7 : 1,
  };
  const secondaryStyle: React.CSSProperties = {
    ...pillStyle,
    border: "1px solid rgba(var(--scrim-rgb),0.14)",
    background: "rgba(var(--scrim-rgb),0.04)",
    color: "var(--charcoal)",
    cursor: saving ? "default" : "pointer",
  };
  const calloutStyle: React.CSSProperties = {
    padding: "14px 16px",
    borderRadius: 14,
    background: "rgba(255,92,53,0.07)",
    border: "1px solid rgba(255,92,53,0.22)",
  };

  return (
    <section id="campus" style={{ ...CARD_GLASS, padding: 22, marginBottom: 16, scrollMarginTop: 24 }}>
      <SectionTitle>Campus</SectionTitle>
      <p
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 13.5,
          color: "var(--ink-2)",
          margin: "8px 0 14px",
          lineHeight: 1.55,
        }}
      >
        {"Your campus community: its clubs, events and map. Indianapolis is one community for IU and Purdue students."}
      </p>

      {!view ? (
        <LoadFailed compact failure={{ message: "Couldn't load your campus. Try again." }} />
      ) : view.mode === "unverified" ? (
        <p
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13.5,
            color: "var(--charcoal)",
            margin: 0,
            lineHeight: 1.55,
          }}
        >
          {"Verify your school email to pick your campus."}{" "}
          <Link
            href="/auth/school-email"
            style={{ color: "var(--tag-ink)", fontWeight: 700, textDecoration: "none" }}
          >
            Verify now →
          </Link>
        </p>
      ) : (
        <>
          {view.mode === "confirm" && !pending ? (
            <div
              role="group"
              aria-label="Confirm your campus"
              style={{ ...calloutStyle, marginBottom: 14 }}
            >
              <div
                style={{
                  fontFamily: "Fraunces, serif",
                  fontSize: 15,
                  fontWeight: 800,
                  color: "var(--charcoal)",
                }}
              >
                Confirm your campus
              </div>
              <p
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 13.5,
                  color: "var(--ink-2)",
                  margin: "4px 0 12px",
                  lineHeight: 1.5,
                }}
              >
                Is {view.shortName} still right?
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => void save(view.value)}
                  disabled={saving}
                  style={yesStyle}
                >
                  Yes
                </button>
                <button type="button" onClick={openPicker} disabled={saving} style={secondaryStyle}>
                  Change
                </button>
              </div>
              <div style={{ ...hintStyle, marginTop: 10 }}>{CAMPUS_CONFIRM_LOCK_COPY}</div>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select
              ref={selectRef}
              value={shownValue}
              onChange={(e) => onPick(e.target.value)}
              disabled={saving || locked}
              aria-label="Campus"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(var(--scrim-rgb),0.12)",
                background: "var(--paper)",
                outline: "none",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--charcoal)",
                minWidth: 240,
                maxWidth: "100%",
                opacity: saving || locked ? 0.6 : 1,
              }}
            >
              {view.value === "" ? (
                <option value="" disabled>
                  Pick your campus
                </option>
              ) : null}
              {view.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12 }}>
              {saving ? (
                <span style={{ color: "var(--ink-muted)" }}>Saving…</span>
              ) : saved ? (
                <span style={{ color: "var(--ok-ink)", fontWeight: 700 }}>Saved ✓</span>
              ) : null}
            </span>
          </div>

          {shownSub ? <div style={hintStyle}>{shownSub}</div> : null}

          {pending?.title ? (
            <div
              role="group"
              aria-label={pending.title}
              style={{ ...calloutStyle, marginTop: 12 }}
            >
              <div
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--charcoal)",
                }}
              >
                {pending.title}
              </div>
              <p
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 13,
                  color: "var(--ink-2)",
                  margin: "4px 0 12px",
                  lineHeight: 1.5,
                }}
              >
                {pending.body}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => void save(pending.id)}
                  disabled={saving}
                  style={yesStyle}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  disabled={saving}
                  style={secondaryStyle}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {view.note && view.note !== error?.text ? <div style={hintStyle}>{view.note}</div> : null}
        </>
      )}

      {error ? (
        <div
          role="alert"
          style={{
            marginTop: 10,
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            color: "var(--error-ink)",
          }}
        >
          {error.text}
          {error.action ? (
            <>
              {" "}
              <Link
                href={error.action.href}
                style={{ color: "var(--tag-ink)", fontWeight: 700, textDecoration: "none" }}
              >
                {error.action.label} →
              </Link>
            </>
          ) : null}
        </div>
      ) : null}
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
    // Quiet: the line shows under the field, next to what it refused.
    // vibeRequest never throws, so there is nothing to catch.
    const r = await vibeRequest<{ handle?: string; handle_changed_at?: string | null }>(
      "/api/me/handle",
      {
        method: "PATCH",
        json: { handle: normalized },
        quiet: true,
        failure: "Couldn't change your handle.",
      },
    );
    if (r.ok && typeof r.data.handle === "string") {
      setSavedHandle(r.data.handle);
      setSavedAt(r.data.handle_changed_at ?? new Date().toISOString());
      setValue(r.data.handle);
      setNetworkCheck(null);
    } else if (r.ok) {
      // A 2xx that doesn't carry the saved handle isn't a save.
      setError("Couldn't change your handle. Try again.");
    } else if (r.status === 429 && r.error?.startsWith("You can change your handle again")) {
      // The 14-day rule answers 429, the same status as going too fast, and
      // vibeRequest would say "Try again in a minute". The server's own line
      // has the day count ("You can change your handle again in 5 days").
      setError(/[.!?]$/.test(r.error) ? r.error : `${r.error}.`);
    } else if (r.status === 409) {
      // "Taken": someone claimed it after the live check above said it was free.
      setError("That handle was just taken. Try another one.");
    } else {
      setError(r.message);
    }
    setSaving(false);
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
          color: "var(--ink-2)",
          margin: "8px 0 14px",
          lineHeight: 1.55,
        }}
      >
        Your @handle is how people find you and tag you in posts.{" "}
        <strong style={{ color: "var(--charcoal)", fontWeight: 700 }}>
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
            border: "1px solid rgba(var(--scrim-rgb),0.12)",
            background: onCooldown ? "rgba(var(--scrim-rgb),0.04)" : "var(--paper)",
            flex: 1,
            opacity: onCooldown ? 0.55 : 1,
          }}
        >
          <span
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 14,
              color: "var(--ink-muted)",
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
              color: "var(--charcoal)",
            }}
          />
          <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, padding: "0 10px" }}>
            {(() => {
              if (onCooldown || !value.trim() || value.trim().toLowerCase() === (savedHandle ?? "")) return null;
              if (check.state === "checking")
                return <span style={{ color: "var(--ink-muted)" }}>Checking…</span>;
              if (check.state === "available")
                return <span style={{ color: "var(--ok-ink)", fontWeight: 700 }}>Available ✓</span>;
              if (check.state === "taken")
                return (
                  <span style={{ color: "var(--error-ink)", fontWeight: 700 }}>
                    {check.reason ?? "Taken"}
                  </span>
                );
              if (check.state === "invalid")
                return (
                  <span style={{ color: "var(--error-ink)", fontWeight: 700 }}>
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
            background: canSave ? "#FF5C35" : "rgba(var(--scrim-rgb),0.10)",
            color: canSave ? "var(--on-coral, #160A06)" : "var(--ink-muted)",
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
            color: "var(--error-ink)",
          }}
        >
          {error}
        </div>
      ) : null}
    </section>
  );
}

/**
 * leaveDeviceClean behind our own guard (the suspended page's helper,
 * src/app/account/suspended/suspended-actions.tsx). It promises never to
 * throw and to be done within ~3 s; this makes sure, so a push clean-up
 * problem can't strand a student on a busy Sign out or Delete button: any
 * error is dropped, and after 4 s we move on whatever it's still doing.
 */
function leaveDeviceSafely(opts: { serverDelete: boolean }): Promise<void> {
  return Promise.race([
    Promise.resolve()
      .then(() => leaveDeviceClean(opts))
      .catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, 4000)),
  ]);
}

function SignOutCard() {
  const [busy, setBusy] = useState(false);

  const onSignOut = async () => {
    if (busy) return;
    setBusy(true);
    // `push_address` names this device's notification address, so the route
    // drops that row even when it was registered to someone else (plan §8 W7).
    const r = await vibeRequest("/api/auth/logout", {
      method: "POST",
      json: pushLogoutBody(),
      failure: "Couldn't sign you out. Try again.",
    });
    if (!r.ok) {
      // Stay put: heading to /auth/login anyway could leave a live
      // session behind a page that looks signed out.
      setBusy(false);
      return;
    }
    // Drop every onboarding draft on this browser (no id: the next person
    // to sign in here must not inherit this one's half-typed answers).
    clearDraft();
    // Only after the logout succeeded (W7): unsubscribe this device, clear
    // its shown notifications, badge and per-account storage. The route
    // already deleted the rows, hence no server delete.
    await leaveDeviceSafely({ serverDelete: false });
    // Hard reload so the cookie clear is reflected in any cached
    // bootstrap fetches and the next nav lands on /auth/login.
    window.location.href = "/auth/login";
  };

  return (
    <section style={{ ...CARD_GLASS, padding: 22, marginBottom: 16 }}>
      <SectionTitle>Sign out</SectionTitle>
      <p
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 14,
          color: "var(--ink-2)",
          margin: "0 0 14px",
          maxWidth: 440,
          lineHeight: 1.5,
        }}
      >
        End your session on every device. Another device can stay signed in
        for about an hour more. You can sign back in any time.
      </p>
      <button
        type="button"
        onClick={onSignOut}
        disabled={busy}
        style={{
          padding: "10px 18px",
          borderRadius: 999,
          border: "1px solid rgba(var(--scrim-rgb),0.14)",
          background: "rgba(var(--scrim-rgb),0.04)",
          color: "var(--charcoal)",
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
    // Quiet: the line shows above the buttons. vibeRequest never throws, so
    // there is nothing to catch.
    const r = await vibeRequest<{ ok?: boolean }>("/api/me", {
      method: "DELETE",
      json: { confirm_handle: confirm },
      quiet: true,
      failure: "Couldn't delete your account.",
    });
    // Deleted only when the route says so. A 2xx with any other body (a page
    // some network put in the way) must not sign this device out.
    if (r.ok && r.data.ok !== true) {
      setError("Couldn't delete your account. Try again.");
      setBusy(false);
      return;
    }
    if (!r.ok) {
      if (r.status >= 500 && r.error && /[.!?]$/.test(r.error.trim())) {
        // The route writes whole sentences for a deletion that stopped part
        // way ("Your Vibe+ subscription is canceled, but ... your account is
        // still here.", src/app/api/me/route.ts). They say how far it got,
        // which the general line can't, so they show as written. Its short
        // answers for developers ("Request failed") have no full stop and
        // get vibeRequest's line below.
        setError(r.error.trim());
      } else if (r.status === 400) {
        // The typed handle isn't the one on the account, which can only
        // happen when this page is showing an old handle.
        setError("That handle didn't match. Reload the page and try again.");
      } else {
        setError(r.message);
      }
      setBusy(false);
      return;
    }
    // The account is gone, so nothing from here on may read as a failed
    // delete (it sits after the refusal check on purpose). Drop every
    // onboarding draft on this browser, then land on sign-up rather than the
    // marketing page, the same place the suspended and verify-your-campus
    // screens send a deleted account.
    clearDraft();
    // The rows went with the account (FK cascade); this device's own
    // subscription or token, shown notifications and storage go here
    // (plan §8 W7).
    await leaveDeviceSafely({ serverDelete: false });
    window.location.href = AFTER_DELETE;
  };

  return (
    <section
      id="delete-account"
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
          color: "var(--danger-ink)",
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
          color: "var(--charcoal)",
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
          color: "var(--ink-2)",
          margin: "0 0 16px",
          maxWidth: 520,
          lineHeight: 1.5,
        }}
      >
        Permanently deletes your profile, posts, comments, reactions,
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
            color: "var(--danger-ink)",
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
              color: "var(--ink-2)",
              margin: "0 0 10px",
            }}
          >
            Type your handle{" "}
            <strong style={{ color: "var(--charcoal)" }}>@{expected || "handle"}</strong> to
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
              border: "1px solid rgba(var(--scrim-rgb),0.14)",
              background: "color-mix(in srgb, var(--paper) 70%, transparent)",
              color: "var(--charcoal)",
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
                color: "var(--danger-ink)",
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
                color: matches && !busy ? "#fff" : "var(--danger-ink)",
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
                border: "1px solid rgba(var(--scrim-rgb),0.14)",
                background: "color-mix(in srgb, var(--paper) 70%, transparent)",
                color: "var(--charcoal)",
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

/** The rules, the child-safety page, and a human to write to. Its own
 *  section rather than three more items in LegalFooter's one-line <p>:
 *  at 375px that paragraph is already close to wrapping. It sits above
 *  sign-out and the danger zone so a student looking for "how do I report
 *  this" doesn't have to scroll past the delete-account card to find it.
 *  `id` so a moderation notice can send someone to /settings#help-safety. */
function HelpAndSafetyCard() {
  return (
    <section
      id="help-safety"
      style={{ ...CARD_GLASS, padding: 22, marginBottom: 16, scrollMarginTop: 24 }}
    >
      <SectionTitle>Help &amp; safety</SectionTitle>
      <p
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 14,
          color: "var(--ink-2)",
          margin: "0 0 14px",
          maxWidth: 440,
          lineHeight: 1.5,
        }}
      >
        What belongs on Vibe, what happens when you report something, and how
        to reach us.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        <HelpLink
          href="/legal/community"
          label="Community Guidelines"
          hint="What isn't allowed, and what happens after a report."
        />
        <HelpLink
          href="/legal/child-safety"
          label="Child safety"
          hint="Our zero-tolerance standard, and how to report it."
        />
        <HelpLink
          href="mailto:help@connectvibe.app"
          external
          label="Email help@connectvibe.app"
          hint="Questions, appeals, or anything we got wrong."
        />
      </div>
    </section>
  );
}

function HelpLink({
  href,
  label,
  hint,
  external,
}: {
  href: string;
  label: string;
  hint: string;
  /** mailto: and other non-app addresses — next/link is for routes. */
  external?: boolean;
}) {
  const body = (
    <>
      <span
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 14,
          fontWeight: 700,
          color: "var(--charcoal)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 13,
          color: "var(--ink-muted)",
          lineHeight: 1.45,
        }}
      >
        {hint}
      </span>
    </>
  );
  const style: React.CSSProperties = {
    display: "grid",
    gap: 2,
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid rgba(var(--scrim-rgb),0.10)",
    background: "color-mix(in srgb, var(--paper) 55%, transparent)",
    textDecoration: "none",
  };
  if (external) {
    return (
      <a href={href} style={style}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} style={style}>
      {body}
    </Link>
  );
}

function LegalFooter() {
  return (
    <p
      style={{
        marginTop: 24,
        fontFamily: "DM Sans, sans-serif",
        fontSize: 13,
        color: "var(--ink-muted)",
      }}
    >
      <Link
        href="/legal/terms"
        style={{ color: "var(--ink-2)", fontWeight: 700, textDecoration: "none" }}
      >
        Terms of Service
      </Link>
      <span style={{ margin: "0 8px" }}>·</span>
      <Link
        href="/legal/privacy"
        style={{ color: "var(--ink-2)", fontWeight: 700, textDecoration: "none" }}
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
        color: "var(--charcoal)",
        letterSpacing: "-0.01em",
        margin: "0 0 14px",
      }}
    >
      {children}
    </h2>
  );
}

/** A row's label cell, shared with rows that draw themselves (PersonalEmailRow). */
const ROW_LABEL: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--ink-muted)",
  paddingTop: 4,
};

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
}) {
  return (
    <>
      <div style={ROW_LABEL}>{label}</div>
      <div>
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 14,
            color: "var(--charcoal)",
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
              color: "var(--ink-muted)",
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
