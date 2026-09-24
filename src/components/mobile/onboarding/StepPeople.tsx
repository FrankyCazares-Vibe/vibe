"use client";

import {
  useEffect,
  useState,
  type CSSProperties,
  type Dispatch,
  type JSX,
  type SetStateAction,
} from "react";

import { LoadFailed, asLoadFailure, type LoadFailure } from "@/components/feedback/LoadFailed";
import { copyText, vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import type { SchoolSystem } from "@/lib/iu/campuses";
import { nativeShare } from "@/lib/native/bridge";
import { appShellOnClient } from "@/lib/native/detect";
import {
  groupPeople,
  listState,
  parseSuggestions,
  type SuggestionInput,
} from "@/lib/onboarding/social-steps";

import { ONB_COPY, fillCampus } from "./onb-copy";
import { COLORS, h2Style, subIntroStyle } from "./onb-theme";

/**
 * Onboarding step 6, "follow a few people" (wave plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §8 B12S item 5;
 * critic `critic-W3.md` L1, L2, L3, M6).
 *
 * Suggestions from `GET /api/me/suggested-connections?limit=25`, grouped by
 * the server's `reason_v2` (`groupPeople`: From your clubs, At {campus}, Same
 * major, Elsewhere at {system}, More people on Vibe).
 *
 * PERSON FOLLOWS ARE OPTIMISTIC (plan §2.4 item 5), unlike club controls: the
 * button flips at once, then `POST`/`DELETE /api/me/follow`. A refusal rolls
 * it back and toasts, except a 403 without `terms_required`, which is a block
 * in either direction: that row just disappears, with no toast that would
 * tell the student someone blocked them. Replay flips locally and sends
 * nothing.
 *
 * ANY FAILED READ IS `LoadFailed`, NEVER A LIST OR THE EMPTY STATE (critic M6:
 * a suggestions read that can't check blocks must fail, not show people). The
 * route answers 500 when its block/mute read or its profile read fails, and a
 * 500 lands here as `failed`.
 *
 * STATE LIVES IN THE PARENT (`OnboardingMobile`, B12), which caches it for the
 * session and resets it to {@link initialPeopleState} when the saved campus
 * or university changes. The root is a fragment starting at the `h2` (no
 * `<section>`, no Otto orb), and the Finish button is the parent's footer.
 */

export type PeopleState = {
  status: "idle" | "loading" | "ready" | "failed";
  people: SuggestionInput[];
  failure: LoadFailure | null;
  followed: Record<string, boolean>;
  busy: Record<string, boolean>;
  removed: Record<string, boolean>;
};

export const initialPeopleState: PeopleState = {
  status: "idle",
  people: [],
  failure: null,
  followed: {},
  busy: {},
  removed: {},
};

/** Same newest-load-wins guard as `StepClubs`. */
let loadSeq = 0;

export function StepPeople(p: {
  replay: boolean;
  campusShortName: string | null;
  campusShared: boolean;
  system: SchoolSystem | null;
  state: PeopleState;
  setState: Dispatch<SetStateAction<PeopleState>>;
}): JSX.Element {
  const { replay, campusShortName, campusShared, system, state, setState } = p;
  const copy = ONB_COPY.people;

  useEffect(() => {
    if (state.status !== "idle") return;
    const seq = ++loadSeq;
    void (async () => {
      setState((s) => (s.status === "idle" ? { ...s, status: "loading", failure: null } : s));
      const r = await vibeRequest<{ suggestions?: unknown }>(
        "/api/me/suggested-connections?limit=25",
        { cache: "no-store", quiet: true, failure: copy.loadFailed },
      );
      setState((s) => {
        if (seq !== loadSeq || s.status !== "loading") return s;
        // A 2xx without the list is a failed read, never "no one to follow yet".
        if (r.ok && Array.isArray(r.data.suggestions)) {
          return { ...s, status: "ready", people: parseSuggestions(r.data.suggestions), failure: null };
        }
        return { ...s, status: "failed", failure: asLoadFailure(r, copy.loadFailed) };
      });
    })();
  }, [state.status, setState, copy.loadFailed]);

  const retry = () => setState((s) => ({ ...s, status: "idle", failure: null }));

  const toggle = async (person: SuggestionInput) => {
    const id = person.id;
    if (state.busy[id]) return;
    const was = state.followed[id] === true;
    setState((s) => ({
      ...s,
      followed: { ...s.followed, [id]: !was },
      busy: replay ? s.busy : { ...s.busy, [id]: true },
    }));
    if (replay) return;

    const r = await vibeRequest("/api/me/follow", {
      method: was ? "DELETE" : "POST",
      json: { target_id: id },
      quiet: true,
      failure: was ? copy.unfollowFailed : copy.followFailed,
    });
    // A 403 that isn't the Terms gate is a block, in either direction.
    const blocked = !r.ok && r.status === 403 && r.code !== "terms_required";
    setState((s) => {
      const busy = { ...s.busy };
      delete busy[id];
      if (r.ok) return { ...s, busy };
      const followed = { ...s.followed, [id]: was };
      return blocked
        ? { ...s, busy, followed, removed: { ...s.removed, [id]: true } }
        : { ...s, busy, followed };
    });
    if (!r.ok && !blocked) toast({ message: r.message, tone: "error", action: r.action });
  };

  const share = async () => {
    const url = window.location.origin;
    // In the store apps, the native share sheet first: Android's web view has
    // no `navigator.share` (plan §6 S2D). It counts as done once the sheet
    // opens, even if the student then cancels. Browsers skip it and keep the
    // tap's gesture for the web share sheet.
    if (appShellOnClient() !== null && (await nativeShare({ title: "Vibe", url }))) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Vibe", url });
        return;
      } catch (err) {
        // The student closed the share sheet: nothing to say.
        if ((err as { name?: unknown } | null)?.name === "AbortError") return;
      }
    }
    await copyText(url, { success: copy.copied });
  };

  const otto =
    campusShortName === null
      ? copy.ottoNoCampus
      : fillCampus(campusShared ? copy.ottoShared : copy.ottoSingle, campusShortName, copy.ottoNoCampus);

  return (
    <>
      <h2 style={h2Style}>{copy.title}</h2>
      <p style={subIntroStyle}>{otto}</p>
      <PeopleBody
        state={state}
        campusShortName={campusShortName}
        system={system}
        onRetry={retry}
        onToggle={(person) => void toggle(person)}
        onShare={() => void share()}
      />
    </>
  );
}

function PeopleBody({
  state,
  campusShortName,
  system,
  onRetry,
  onToggle,
  onShare,
}: {
  state: PeopleState;
  campusShortName: string | null;
  system: SchoolSystem | null;
  onRetry: () => void;
  onToggle: (person: SuggestionInput) => void;
  onShare: () => void;
}): JSX.Element {
  const copy = ONB_COPY.people;
  if (state.status === "failed") {
    return (
      <LoadFailed
        tone="dark"
        failure={state.failure ?? { message: copy.loadFailed }}
        onRetry={onRetry}
      />
    );
  }
  if (state.status !== "ready") return <PeopleSkeleton />;

  const visible = state.people.filter((person) => !state.removed[person.id]);
  const shape = listState(visible.length);
  if (shape === "empty") {
    return (
      <div style={emptyBoxStyle}>
        <p style={emptyTitleStyle}>{copy.emptyTitle}</p>
        <p style={{ ...subIntroStyle, marginBottom: 16, marginLeft: "auto", marginRight: "auto" }}>
          {fillCampus(copy.emptyBody, campusShortName, copy.emptyBodyNoCampus)}
        </p>
        <ShareButton onShare={onShare} />
      </div>
    );
  }

  return (
    <div style={listWrapStyle}>
      {shape === "sparse" ? (
        <div style={sparseBoxStyle}>
          <p style={{ ...subIntroStyle, marginBottom: 12, marginLeft: "auto", marginRight: "auto" }}>
            {copy.sparse}
          </p>
          <ShareButton onShare={onShare} />
        </div>
      ) : null}
      {groupPeople(visible, { system, campusShortName }).map((group) => (
        <div key={group.key} role="group" aria-label={group.label} style={groupStyle}>
          <h3 style={groupLabelStyle}>{group.label}</h3>
          <ul style={listStyle}>
            {group.people.map((person) => (
              <PersonPickRow
                key={person.id}
                person={person}
                following={state.followed[person.id] === true}
                busy={state.busy[person.id] === true}
                onToggle={onToggle}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** One person: avatar, name, "@handle · major", and Follow / Following ✓. */
function PersonPickRow({
  person,
  following,
  busy,
  onToggle,
}: {
  person: SuggestionInput;
  following: boolean;
  busy: boolean;
  onToggle: (person: SuggestionInput) => void;
}): JSX.Element {
  const copy = ONB_COPY.people;
  const handle = person.handle ? "@" + person.handle : null;
  const title = person.name ?? handle ?? "";
  const meta = [handle, person.major].filter(Boolean).join(" · ");
  const initial = title.replace(/^@/, "").trim().charAt(0).toUpperCase() || "?";
  // A dead avatar URL falls back to the initial, like `OrgLogo` in StepClubs.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const avatarUrl = person.avatar_url;

  return (
    <li style={rowStyle}>
      <div aria-hidden="true" style={avatarStyle}>
        {avatarUrl && failedUrl !== avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase storage URLs
          <img
            src={avatarUrl}
            alt=""
            loading="lazy"
            onError={() => setFailedUrl(avatarUrl)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          initial
        )}
      </div>
      <div style={rowTextStyle}>
        <span style={nameStyle}>{title}</span>
        {meta ? <span style={metaStyle}>{meta}</span> : null}
      </div>
      <button
        type="button"
        aria-pressed={following}
        aria-busy={busy || undefined}
        onClick={() => onToggle(person)}
        style={following ? followingButtonStyle : followButtonStyle}
      >
        {following ? copy.following : copy.follow}
      </button>
    </li>
  );
}

function ShareButton({ onShare }: { onShare: () => void }): JSX.Element {
  return (
    <button type="button" onClick={onShare} style={shareButtonStyle}>
      {ONB_COPY.people.share}
    </button>
  );
}

function PeopleSkeleton(): JSX.Element {
  return (
    <ul aria-hidden="true" style={{ ...listStyle, width: "100%" }}>
      {[0, 1, 2].map((i) => (
        <li key={i} style={{ ...rowStyle, opacity: 0.6 }}>
          <div style={{ ...avatarStyle, background: "rgba(255,255,255,.06)" }} />
          <div style={rowTextStyle}>
            <div style={{ ...skeletonBarStyle, width: "50%", height: 14 }} />
            <div style={{ ...skeletonBarStyle, width: "35%", height: 11, marginTop: 6 }} />
          </div>
          <div style={{ ...skeletonBarStyle, width: 84, height: 44, borderRadius: 999 }} />
        </li>
      ))}
    </ul>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
// The same charcoal cards as `StepClubs`, with a 44px Follow pill.

const listWrapStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: 18,
  textAlign: "left",
};

const groupStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const groupLabelStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,.5)",
};

const listStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  textAlign: "left",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px 10px 14px",
  borderRadius: 14,
  background: COLORS.fieldBg,
  border: `1px solid ${COLORS.fieldBorder}`,
  color: "white",
  minWidth: 0,
};

const avatarStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  flexShrink: 0,
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: COLORS.charcoalSoft,
  border: `1px solid ${COLORS.faintBorder}`,
  color: "rgba(255,255,255,.85)",
  fontSize: 16,
  fontWeight: 700,
};

const rowTextStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const nameStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.3,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const metaStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.4,
  color: COLORS.mutedText,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const pillBase: CSSProperties = {
  flexShrink: 0,
  minHeight: 44,
  padding: "0 16px",
  borderRadius: 999,
  fontFamily: "inherit",
  fontSize: 13.5,
  fontWeight: 700,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const followButtonStyle: CSSProperties = {
  ...pillBase,
  color: "#fff",
  background: COLORS.accent,
  border: `1px solid ${COLORS.accent}`,
};

const followingButtonStyle: CSSProperties = {
  ...pillBase,
  color: "rgba(255,255,255,.85)",
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.12)",
};

const shareButtonStyle: CSSProperties = {
  ...pillBase,
  color: "#fff",
  background: "transparent",
  border: "1px solid rgba(255,255,255,.28)",
};

const sparseBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
};

const emptyBoxStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "22px 18px",
  borderRadius: 16,
  border: "1px dashed rgba(255,255,255,.14)",
  textAlign: "center",
};

const emptyTitleStyle: CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif",
  fontSize: 18,
  fontWeight: 900,
  color: "white",
  margin: "0 0 8px",
};

const skeletonBarStyle: CSSProperties = {
  flexShrink: 0,
  borderRadius: 6,
  background: "rgba(255,255,255,.08)",
};
