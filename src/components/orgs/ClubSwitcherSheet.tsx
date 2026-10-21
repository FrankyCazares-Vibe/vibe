"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type JSX, type ReactNode } from "react";
import { Drawer } from "vaul";

import { ClubLogo } from "@/components/profile/ClubFlair";
import {
  sameHandle,
  setSwitchedClub,
  useClubsYouRun,
  useSwitchedClub,
  type ClubYouRun,
} from "@/lib/orgs/club-switch";

/**
 * "Switch to." (wave 2, WAVE2-DESIGN.md C3; board R2_Switcher_Phone): me
 * first, then every club I'm the owner or an officer of. Picking a club makes
 * the phone's Profile tab that club's page until I pick me again; only this
 * phone remembers it (club-switch.ts). Opened by holding the Profile tab
 * (MobileTabBar) or tapping my name on my own profile (ProfileMobile).
 *
 * Built like the profile's club ⋯ sheet (ClubsSection.tsx): a vaul drawer at
 * layers 10000/10001, above the tab bar (9988) and under ToastHost (12000).
 * Opening asks the route past the cache, so the "to review" numbers are fresh.
 */

export const SWITCHER_COPY = Object.freeze({
  title: "Switch to.",
  close: "Close",
  you: "You",
  now: "Now",
  eyebrow: "Clubs you run",
  owner: "Owner",
  officer: "Officer",
  toReview: "{n} to review",
  loadFailed: "Couldn't load your clubs.",
  retry: "Retry",
  empty: "When you're the owner or an officer of a club, you can switch to it here.",
  footnote:
    "Your Profile tab shows the club's page until you switch back. Chats and Board posts still show your own name and title.",
});

/** "Owner · president" / "Officer". */
export function clubRoleLine(club: Pick<ClubYouRun, "role" | "title">): string {
  const role = club.role === "owner" ? SWITCHER_COPY.owner : SWITCHER_COPY.officer;
  return club.title ? `${role} · ${club.title}` : role;
}

export function ClubSwitcherSheet(props: {
  open: boolean;
  onClose: () => void;
  /** The person's own row; when absent the row says "You" with a plain person glyph. */
  me?: { name: string; avatarUrl: string | null } | null;
}): JSX.Element | null {
  const { open, onClose, me } = props;
  const router = useRouter();
  const switched = useSwitchedClub();
  const runs = useClubsYouRun(open);
  const { refresh } = runs;

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const pickMe = () => {
    setSwitchedClub(null);
    onClose();
    router.push("/profile");
  };
  const pickClub = (club: ClubYouRun) => {
    setSwitchedClub({ handle: club.handle, name: club.name, logo_url: club.logo_url });
    onClose();
    router.push(`/orgs/${encodeURIComponent(club.handle)}`);
  };

  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay style={overlayStyle} />
        <Drawer.Content style={contentStyle} aria-describedby={undefined}>
          <Drawer.Handle style={handleStyle} />
          <div style={headerStyle}>
            <Drawer.Title style={titleStyle}>{SWITCHER_COPY.title}</Drawer.Title>
            <button type="button" onClick={onClose} aria-label={SWITCHER_COPY.close} style={closeStyle}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div style={bodyStyle}>
            <Row
              current={!switched}
              onClick={pickMe}
              picture={<MePicture name={me?.name ?? null} url={me?.avatarUrl ?? null} />}
              name={me?.name ?? SWITCHER_COPY.you}
              sub={me ? SWITCHER_COPY.you : null}
              side={!switched ? <span style={nowStyle}>{SWITCHER_COPY.now}</span> : null}
            />
            <p style={eyebrowStyle}>{SWITCHER_COPY.eyebrow}</p>
            <ClubRows runs={runs} switchedHandle={switched?.handle ?? null} onPick={pickClub} />
            <p style={footnoteStyle}>{SWITCHER_COPY.footnote}</p>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function ClubRows({
  runs,
  switchedHandle,
  onPick,
}: {
  runs: ReturnType<typeof useClubsYouRun>;
  switchedHandle: string | null;
  onPick: (club: ClubYouRun) => void;
}): JSX.Element {
  if (runs.status === "ok" && runs.clubs.length === 0) return <p style={noteStyle}>{SWITCHER_COPY.empty}</p>;
  if (runs.status === "error") {
    return (
      <div style={failStyle} role="status">
        <span>{SWITCHER_COPY.loadFailed}</span>
        <button type="button" onClick={runs.retry} style={retryStyle}>
          {SWITCHER_COPY.retry}
        </button>
      </div>
    );
  }
  if (runs.status !== "ok") {
    return (
      <div aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} style={{ ...rowStyle, cursor: "default", opacity: 0.6 }}>
            <span style={{ ...skeletonStyle, width: 40, height: 40, borderRadius: "50%" }} />
            <span style={textStyle}>
              <span style={{ ...skeletonStyle, width: "55%", height: 13 }} />
              <span style={{ ...skeletonStyle, width: "35%", height: 10, marginTop: 7 }} />
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <>
      {runs.clubs.map((club) => {
        const current = sameHandle(club.handle, switchedHandle);
        const waiting = club.requests ?? 0;
        return (
          <Row
            key={club.org_id}
            current={current}
            onClick={() => onPick(club)}
            picture={<ClubLogo name={club.name} url={club.logo_url} size={40} />}
            name={club.name}
            sub={clubRoleLine(club)}
            side={
              current ? (
                <span style={nowStyle}>{SWITCHER_COPY.now}</span>
              ) : waiting > 0 ? (
                <span style={reviewStyle}>{SWITCHER_COPY.toReview.replace("{n}", String(waiting))}</span>
              ) : null
            }
          />
        );
      })}
    </>
  );
}

function Row({
  current,
  onClick,
  picture,
  name,
  sub,
  side,
}: {
  current: boolean;
  onClick: () => void;
  picture: ReactNode;
  name: string;
  sub: string | null;
  side: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? "true" : undefined}
      style={current ? { ...rowStyle, ...rowCurrentStyle } : rowStyle}
    >
      {picture}
      <span style={textStyle}>
        <span style={nameStyle}>{name}</span>
        {sub ? <span style={subStyle}>{sub}</span> : null}
      </span>
      {side}
    </button>
  );
}

/** My photo, or a plain person glyph (no photo, or it failed to load). */
function MePicture({ name, url }: { name: string | null; url: string | null }): JSX.Element {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span aria-hidden="true" style={mePictureStyle}>
      {url && failedUrl !== url ? (
        // eslint-disable-next-line @next/next/no-img-element -- the profile's own photo URL
        <img
          src={url}
          alt=""
          onError={() => setFailedUrl(url)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : name ? (
        name.trim().charAt(0).toUpperCase()
      ) : (
        <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="7.5" r="3.4" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3.5 19c.7-3.6 3.8-5.8 7.5-5.8s6.8 2.2 7.5 5.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
// The profile ⋯ sheet's surface (ClubsSection.tsx), theme tokens only.

const overlayStyle: CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.42)", zIndex: 10000 };

const contentStyle: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  maxHeight: "88dvh",
  display: "flex",
  flexDirection: "column",
  background: "var(--cream)",
  color: "var(--charcoal)",
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
  zIndex: 10001,
  outline: "none",
};

const handleStyle: CSSProperties = {
  margin: "10px auto 4px",
  width: 38,
  height: 4,
  borderRadius: 999,
  background: "rgba(var(--scrim-rgb),0.18)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 16px 10px",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: "Fraunces, serif",
  fontSize: 24,
  fontWeight: 800,
  letterSpacing: "-0.4px",
  color: "var(--charcoal)",
};

const closeStyle: CSSProperties = {
  flexShrink: 0,
  width: 44,
  height: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  borderRadius: 999,
  border: "1px solid var(--hairline)",
  background: "transparent",
  color: "var(--charcoal)",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const bodyStyle: CSSProperties = {
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: "0 16px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  minHeight: 56,
  padding: "10px 14px",
  borderRadius: 14,
  border: "1px solid var(--hairline)",
  background: "transparent",
  color: "var(--charcoal)",
  textAlign: "left",
  cursor: "pointer",
  boxSizing: "border-box",
  WebkitTapHighlightColor: "transparent",
};

const rowCurrentStyle: CSSProperties = { background: "var(--paper)", border: "1px solid rgba(var(--scrim-rgb),0.12)" };

const textStyle: CSSProperties = { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 };

const nameStyle: CSSProperties = {
  fontFamily: "Fraunces, serif",
  fontSize: 17,
  fontWeight: 800,
  lineHeight: 1.25,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const subStyle: CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12.5,
  lineHeight: 1.35,
  color: "var(--ink-2)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const sideBase: CSSProperties = {
  flexShrink: 0,
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12.5,
  fontWeight: 700,
  whiteSpace: "nowrap",
};
const nowStyle: CSSProperties = { ...sideBase, color: "var(--ink-2)" };
const reviewStyle: CSSProperties = { ...sideBase, color: "var(--tag-ink)" };

const eyebrowStyle: CSSProperties = {
  margin: "8px 2px 0",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--ink-muted)",
};

const noteStyle: CSSProperties = {
  margin: "2px 2px 0",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13.5,
  lineHeight: 1.45,
  color: "var(--ink-2)",
};

const footnoteStyle: CSSProperties = {
  margin: "6px 2px 0",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12.5,
  lineHeight: 1.5,
  color: "var(--ink-muted)",
};

const failStyle: CSSProperties = {
  ...noteStyle,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const retryStyle: CSSProperties = {
  flexShrink: 0,
  minHeight: 44,
  padding: "0 16px",
  borderRadius: 999,
  border: "1px solid rgba(var(--scrim-rgb),0.12)",
  background: "transparent",
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const skeletonStyle: CSSProperties = {
  display: "block",
  flexShrink: 0,
  borderRadius: 6,
  background: "rgba(var(--scrim-rgb),0.08)",
};

const mePictureStyle: CSSProperties = {
  width: 40,
  height: 40,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  borderRadius: "50%",
  background: "var(--row-hover)",
  border: "1px solid var(--hairline)",
  color: "var(--ink-2)",
  fontFamily: "Fraunces, serif",
  fontSize: 18,
  fontWeight: 800,
  lineHeight: 1,
  boxSizing: "border-box",
};
