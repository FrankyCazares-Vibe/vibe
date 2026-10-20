"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { vibeRequest } from "@/lib/feedback/request";
import { Reveal } from "@/lib/motion/Reveal";
import {
  CONNECTED_MEANING,
  followButtonFor,
  followFailureLine,
  followStateAfterTap,
  personName,
  type PersonFollowState,
} from "@/lib/people/follow-label";
import { repostersCopy, type NamedReposter, type RepostersAnswer, type RepostersResponse } from "@/lib/posts/reposters";

/**
 * The inside of "Reposted by" (Oct 19, 2026, decision 1a), shared by the
 * phone sheet (RepostersSheet.tsx) and the desktop pop-up
 * (RepostersPopover.tsx) so the two can never word or count it differently.
 * It names only the people you follow, each with their follow button, and
 * says everyone else as a number: the route decides who that is
 * (src/app/api/posts/[id]/reposters/route.ts) and src/lib/posts/reposters.ts
 * holds the words.
 *
 * Theme tokens only, so it reads right in Light and in Night.
 *
 * Why not NetworkMobile's UserRow, which MutualsSheet reuses (review of B2,
 * Oct 19, 2026): its colours are fixed Light ones (a #FFD3C2 face, a white
 * Following ✓ pill), which glow in Night, and its link pieces aren't
 * exported. What must match does: the four button words, the Unfollow
 * confirm for a mutual and the follow call all come from
 * src/lib/people/follow-label.ts, and the links are next/link, as there.
 */

const FAILURE = "Couldn't load who reposted this.";

export type RepostersState =
  | { phase: "loading" }
  | { phase: "failed"; failure: LoadFailure }
  | { phase: "ready"; data: RepostersAnswer };

/**
 * Reads the list each time `open` turns true (a fresh answer per open: a
 * follow or a repost may have changed it since). Nothing is fetched while
 * closed. A refused read is never "no reposts": it is the failed phase.
 */
export function useReposters(postId: string, open: boolean): { state: RepostersState; retry: () => void } {
  // Each open is a new session (set while rendering, React's "adjust state
  // when a prop changes" pattern), and each Retry a new tick. An answer is
  // kept with the key it was asked under, so one that belongs to an earlier
  // open or another post reads as loading, never as this list.
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((s) => s + 1);
  }
  const [tick, setTick] = useState(0);
  const key = `${postId}|${session}|${tick}`;
  const [result, setResult] = useState<{ key: string; state: RepostersState } | null>(null);
  useEffect(() => {
    if (!open || !postId) return;
    let cancelled = false;
    void vibeRequest<RepostersResponse>(`/api/posts/${encodeURIComponent(postId)}/reposters`, {
      cache: "no-store",
      quiet: true,
      failure: FAILURE,
    }).then((r) => {
      if (cancelled) return;
      setResult({
        key,
        state:
          r.ok && Array.isArray(r.data.followed)
            ? { phase: "ready", data: r.data }
            : { phase: "failed", failure: asLoadFailure(r, FAILURE) },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [postId, open, key]);
  const retry = useCallback(() => setTick((t) => t + 1), []);
  return { state: result && result.key === key ? result.state : LOADING, retry };
}

const LOADING: RepostersState = { phase: "loading" };

/** The list, its lines and its loading and failed states. */
export function RepostersBody({ state, onRetry }: { state: RepostersState; onRetry: () => void }) {
  if (state.phase === "loading") return <RowsSkeleton />;
  if (state.phase === "failed") return <LoadFailed failure={state.failure} onRetry={onRetry} />;
  const copy = repostersCopy(state.data);
  return (
    <Reveal rise={false}>
      <style>{ROW_CSS}</style>
      {copy.empty ? <p style={lineStyle}>{copy.empty}</p> : null}
      {copy.you ? (
        <p style={{ ...lineStyle, display: "flex", alignItems: "center", gap: 8, color: "var(--ink-2)" }}>
          <RepostGlyph />
          {copy.you}
        </p>
      ) : null}
      {state.data.followed.length > 0 ? (
        <ul style={listStyle}>
          {state.data.followed.map((p) => (
            <ReposterRow key={p.id} person={p} />
          ))}
        </ul>
      ) : null}
      {copy.others ? <p style={{ ...lineStyle, fontWeight: 700, color: "var(--ink-2)" }}>{copy.others}</p> : null}
      {copy.note ? <p style={{ ...lineStyle, fontSize: 12.5, paddingTop: 0 }}>{copy.note}</p> : null}
    </Reveal>
  );
}

/** One named person: photo (or initials), name, @handle and the follow button. */
function ReposterRow({ person }: { person: NamedReposter }) {
  const [state, setState] = useState<PersonFollowState>(person.follows_you ? "connected" : "following");
  const [busy, setBusy] = useState(false);
  const copy = followButtonFor(state);
  const href = person.handle ? `/profile/${encodeURIComponent(person.handle)}` : null;
  const name = person.name?.trim() || (person.handle ? `@${person.handle}` : "Someone");
  // With no name the name line already says @handle; a second @handle line
  // under it would just repeat it.
  const nameIsHandle = !person.name?.trim();

  const toggle = async () => {
    if (busy || !person.handle) return;
    // Dropping a mutual asks first, as every other follow list does (UserRow).
    if (copy.state === "connected" && !window.confirm(`Unfollow @${person.handle}?`)) return;
    const before = state;
    setBusy(true);
    setState(followStateAfterTap(before));
    // vibeRequest never throws; a refusal shows its toast and the button goes back.
    const r = await vibeRequest<{ ok?: boolean }>("/api/me/follow", {
      method: copy.tap === "unfollow" ? "DELETE" : "POST",
      json: { target_handle: person.handle },
      failure: followFailureLine(copy.tap, personName(person)),
    });
    if (!r.ok || r.data?.ok !== true) setState(before);
    setBusy(false);
  };

  const tone =
    copy.tone === "quiet"
      ? { background: "transparent", color: "var(--charcoal)", border: "1px solid rgba(var(--scrim-rgb),0.16)" }
      : copy.tone === "back"
        ? { background: "var(--coral)", color: "var(--on-coral)", border: "1px solid transparent" }
        : { background: "var(--charcoal)", color: "var(--cream)", border: "1px solid transparent" };

  return (
    <li className="vibe-rp-row" style={rowStyle}>
      {/* next/link, as every other people list (UserRow, MutualsSheet): a
          tap is a client-side move that keeps the feed's place, not a full
          page load (Oct 19, 2026, review of B2). No prefetch: a list of up
          to 100 names would fetch 100 profiles the moment it opened. */}
      {href ? (
        <Link href={href} prefetch={false} className="vibe-rp-link" style={personLinkStyle}>
          <Face person={person} />
          <PersonText name={name} handle={nameIsHandle ? null : person.handle} />
        </Link>
      ) : (
        <span style={personLinkStyle}>
          <Face person={person} />
          <PersonText name={name} handle={nameIsHandle ? null : person.handle} />
        </span>
      )}
      {person.handle ? (
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          // Said without the check mark ("Following, Maya Okafor"), which a
          // screen reader would read out as a word.
          aria-label={copy.state === "connected" ? `Connected. ${CONNECTED_MEANING} Unfollow ${name}` : `${copy.label.replace(/ ✓$/, "")}, ${name}`}
          className="vibe-press vibe-rp-follow"
          style={{ ...followStyle, ...tone, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}
        >
          {copy.label}
        </button>
      ) : null}
    </li>
  );
}

function PersonText({ name, handle }: { name: string; handle: string | null }) {
  return (
    <span style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
      <span style={nameStyle}>{name}</span>
      {handle ? <span style={handleStyle}>@{handle}</span> : null}
    </span>
  );
}

/** The photo, or initials on the tag wash when there's none or it won't load. */
function Face({ person }: { person: NamedReposter }) {
  const [broken, setBroken] = useState(false);
  const initials = (person.name ?? person.handle ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span aria-hidden style={faceStyle}>
      {person.avatar_url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- a 40px face from storage; next/image adds nothing here
        <img src={person.avatar_url} alt="" width={40} height={40} loading="lazy" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        initials || "?"
      )}
    </span>
  );
}

/** Vibe's own two-arrow repost mark (the phone viewer's RepostIcon), never an emoji. */
function RepostGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, color: "var(--ok-ink-2)" }}>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

/** Three placeholder rows while the read is in flight, the rows' own geometry. */
function RowsSkeleton() {
  return (
    <ul style={listStyle} aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} style={rowStyle}>
          <span style={{ ...faceStyle, background: "rgba(var(--scrim-rgb),0.06)" }} />
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", width: "45%", height: 13, borderRadius: 6, background: "rgba(var(--scrim-rgb),0.08)", marginBottom: 6 }} />
            <span style={{ display: "block", width: "30%", height: 11, borderRadius: 5, background: "rgba(var(--scrim-rgb),0.05)" }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

const ROW_CSS = `
.vibe-rp-row { transition: background-color 120ms ease; }
@media (hover: hover) { .vibe-rp-row:hover { background: var(--row-hover); } }
.vibe-rp-link:focus-visible, .vibe-rp-follow:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .vibe-rp-row { transition: none; } }
`;

const listStyle: React.CSSProperties = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 };
const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "8px 8px", borderRadius: 14, minHeight: 56, boxSizing: "border-box" };
const personLinkStyle: React.CSSProperties = { flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12, color: "inherit", textDecoration: "none", borderRadius: 10 };
const faceStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  flexShrink: 0,
  borderRadius: 999,
  overflow: "hidden",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--tag-bg)",
  color: "var(--tag-ink)",
  fontFamily: "var(--font-display)",
  fontWeight: 800,
  fontSize: 15,
};
const nameStyle: React.CSSProperties = { fontFamily: "var(--font-body)", fontSize: 14.5, fontWeight: 700, color: "var(--charcoal)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const handleStyle: React.CSSProperties = { fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--ink-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const followStyle: React.CSSProperties = {
  flexShrink: 0,
  minHeight: 32,
  padding: "6px 14px",
  borderRadius: 999,
  fontFamily: "var(--font-body)",
  fontSize: 12.5,
  fontWeight: 700,
  whiteSpace: "nowrap",
  WebkitTapHighlightColor: "transparent",
};
const lineStyle: React.CSSProperties = { margin: 0, padding: "10px 8px", fontFamily: "var(--font-body)", fontSize: 13.5, lineHeight: 1.45, color: "var(--ink-muted)" };
