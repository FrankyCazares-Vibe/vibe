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
import { OrgJoinControl } from "@/components/orgs/OrgJoinControl";
import { vibeRequest } from "@/lib/feedback/request";
import {
  listState,
  orderClubRows,
  parseClubRows,
  relationFor,
  type ClubLocal,
  type ClubRowInput,
} from "@/lib/onboarding/social-steps";
import { inviteSubText, orgRowView } from "@/lib/orgs/join-copy";

import { ONB_COPY, fillCampus } from "./onb-copy";
import { COLORS, h2Style, inputStyle, subIntroStyle } from "./onb-theme";

/**
 * Onboarding step 5, "Follow clubs" (wave plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §8 B12S item 4;
 * critic `critic-W3.md` L1, L2, M7).
 *
 * The student's campus clubs from `GET /api/orgs?filter=discover`, Follow
 * first. Which buttons a row shows, and every word on them, come from F5a:
 * `orgRowView(rel, "onboarding")` and `<OrgJoinControl variant="onboarding">`
 * (so an open club shows Follow and Join together, invite-only shows Follow
 * plus "Officers can see who follows this club.", and onboarding never shows
 * Request). This file only lays the rows out.
 *
 * STATE LIVES IN THE PARENT (`OnboardingMobile`, B12): it passes `state` /
 * `setState`, caches the list across Back/Continue, and resets it to
 * {@link initialClubsState} when the saved campus changes. An `idle` state
 * loads; Retry sets `idle` again. Replay loads too (reads are allowed), and
 * the control itself sends nothing in replay.
 *
 * The root is a fragment starting at the `h2`: no `<section>` and no Otto orb
 * (the parent renders both). The footer button is the parent's too.
 */

export type ClubsState = {
  status: "idle" | "loading" | "ready" | "failed";
  rows: ClubRowInput[];
  failure: LoadFailure | null;
  local: Record<string, ClubLocal>;
};

export const initialClubsState: ClubsState = {
  status: "idle",
  rows: [],
  failure: null,
  local: {},
};

/** More rows than this and a name/handle filter appears. */
const SEARCH_THRESHOLD = 8;

/**
 * Bumps on every load this module starts. A response applies only while it is
 * still the newest load AND the parent's state still says `loading`, so a
 * list for the old campus never lands after the parent reset for a new one,
 * even when the step unmounted and remounted in between.
 */
let loadSeq = 0;

export function StepClubs(p: {
  replay: boolean;
  campusShortName: string | null;
  state: ClubsState;
  setState: Dispatch<SetStateAction<ClubsState>>;
}): JSX.Element {
  const { replay, campusShortName, state, setState } = p;
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (state.status !== "idle") return;
    const seq = ++loadSeq;
    const failure = ONB_COPY.clubs.loadFailed;
    void (async () => {
      setState((s) => (s.status === "idle" ? { ...s, status: "loading", failure: null } : s));
      // Never `q`: discover's search widens to the whole university.
      const r = await vibeRequest<{ orgs?: unknown }>("/api/orgs?filter=discover", {
        cache: "no-store",
        quiet: true,
        failure,
      });
      setState((s) => {
        if (seq !== loadSeq || s.status !== "loading") return s;
        // A 2xx without the list is a failed read, never "no clubs here yet".
        if (r.ok && Array.isArray(r.data.orgs)) {
          return { ...s, status: "ready", rows: orderClubRows(parseClubRows(r.data.orgs)), failure: null };
        }
        return { ...s, status: "failed", failure: asLoadFailure(r, failure) };
      });
    })();
  }, [state.status, setState]);

  const retry = () => setState((s) => ({ ...s, status: "idle", failure: null }));
  const onLocal = (id: string, next: ClubLocal) =>
    setState((s) => ({ ...s, local: { ...s.local, [id]: next } }));

  let body: JSX.Element;
  if (state.status === "failed") {
    body = (
      <LoadFailed
        tone="dark"
        failure={state.failure ?? { message: ONB_COPY.clubs.loadFailed }}
        onRetry={retry}
      />
    );
  } else if (state.status !== "ready") {
    body = <ClubSkeleton />;
  } else if (state.rows.length === 0) {
    body = (
      <div style={emptyBoxStyle}>
        <p style={emptyTitleStyle}>{ONB_COPY.clubs.emptyTitle}</p>
        <p style={{ ...subIntroStyle, marginBottom: 0, marginLeft: "auto", marginRight: "auto" }}>
          {fillCampus(ONB_COPY.clubs.emptyBody, campusShortName, ONB_COPY.clubs.emptyBodyNoCampus)}
        </p>
      </div>
    );
  } else {
    const searchable = state.rows.length > SEARCH_THRESHOLD;
    const needle = searchable ? query.trim().toLowerCase().replace(/^@/, "") : "";
    const shown = needle
      ? state.rows.filter(
          (r) => r.name.toLowerCase().includes(needle) || r.handle.toLowerCase().includes(needle),
        )
      : state.rows;
    body = (
      <div style={listWrapStyle}>
        {listState(state.rows.length) === "sparse" ? (
          <p style={sparseStyle}>
            {fillCampus(ONB_COPY.clubs.sparse, campusShortName, ONB_COPY.clubs.sparseNoCampus)}
          </p>
        ) : null}
        {searchable ? (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ONB_COPY.clubs.search}
            aria-label={ONB_COPY.clubs.search}
            autoComplete="off"
            enterKeyHint="search"
            style={{ ...inputStyle, marginBottom: 12 }}
          />
        ) : null}
        <ul style={listStyle}>
          {shown.map((row) => (
            <OrgPickRow
              key={row.id}
              row={row}
              local={state.local[row.id]}
              replay={replay}
              onLocal={onLocal}
            />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <>
      <h2 style={h2Style}>{ONB_COPY.clubs.title}</h2>
      <p style={subIntroStyle}>{ONB_COPY.clubs.sub}</p>
      {body}
    </>
  );
}

/** "Franky" from "Franky Cazares"; null when there's no name to show. */
function firstWord(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim();
  return trimmed ? (trimmed.split(/\s+/)[0] ?? null) : null;
}

/**
 * One club. The body is not a link: onboarding keeps the student on the step,
 * and the only taps are the control's. `layout: "line"` (an open club) puts
 * Follow and Join on their own full-width row under the text.
 */
function OrgPickRow({
  row,
  local,
  replay,
  onLocal,
}: {
  row: ClubRowInput;
  local: ClubLocal | undefined;
  replay: boolean;
  onLocal: (id: string, next: ClubLocal) => void;
}): JSX.Element {
  const rel = relationFor(row, local);
  const view = orgRowView(rel, "onboarding");
  const sub =
    view.sub ??
    (rel.state === "invited" && row.pending_invite
      ? inviteSubText(firstWord(row.pending_invite.invited_by_name), row.pending_invite.expires_at)
      : null);
  const meta = ["@" + row.handle, ...view.meta].join(" · ");
  const control = (
    <OrgJoinControl
      variant="onboarding"
      source="onboarding"
      replay={replay}
      relation={rel}
      pendingInviteId={row.pending_invite?.id ?? null}
      onChange={(n) => onLocal(row.id, { state: n.state, following: n.following, role: n.role })}
    />
  );

  return (
    <li style={rowStyle}>
      <div style={rowTopStyle}>
        <OrgLogo name={row.name} url={row.logo_url} />
        <div style={rowTextStyle}>
          <div style={nameLineStyle}>
            <span style={nameStyle}>{row.name}</span>
            {row.verified ? (
              <span aria-label="Verified" title="Verified" style={verifiedStyle}>
                ✓
              </span>
            ) : null}
            {view.chip ? <span style={chipStyle}>{view.chip}</span> : null}
          </div>
          <div style={metaStyle}>{meta}</div>
          {sub ? <div style={subStyle}>{sub}</div> : null}
          {view.disclosure ? <div style={disclosureStyle}>{view.disclosure}</div> : null}
        </div>
        {view.layout === "slot" ? control : null}
      </div>
      {view.layout === "line" ? control : null}
    </li>
  );
}

/** 40px round logo; the name's first letter when there's no logo or it fails to load. */
function OrgLogo({ name, url }: { name: string; url: string | null }): JSX.Element {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div aria-hidden="true" style={logoStyle}>
      {url && failedUrl !== url ? (
        // eslint-disable-next-line @next/next/no-img-element -- org asset proxy URLs
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={() => setFailedUrl(url)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        initial
      )}
    </div>
  );
}

function ClubSkeleton(): JSX.Element {
  return (
    <ul aria-hidden="true" style={listStyle}>
      {[0, 1, 2].map((i) => (
        <li key={i} style={{ ...rowStyle, opacity: 0.6 }}>
          <div style={rowTopStyle}>
            <div style={{ ...logoStyle, background: "rgba(255,255,255,.06)" }} />
            <div style={rowTextStyle}>
              <div style={{ ...skeletonBarStyle, width: "55%", height: 14 }} />
              <div style={{ ...skeletonBarStyle, width: "35%", height: 11, marginTop: 8 }} />
            </div>
            <div style={{ ...skeletonBarStyle, width: 84, height: 44, borderRadius: 999 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
// Charcoal cards that match the campus radio cards (`OnboardingMobile.tsx`),
// left-aligned inside the centred step. Controls are OrgJoinControl's own
// 44px pills.

const listWrapStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
};

const listStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  textAlign: "left",
};

const rowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "12px 14px",
  borderRadius: 14,
  background: COLORS.fieldBg,
  border: `1px solid ${COLORS.fieldBorder}`,
  color: "white",
};

const rowTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  minWidth: 0,
};

const logoStyle: CSSProperties = {
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
  fontFamily: "'Fraunces', Georgia, serif",
  fontSize: 17,
  fontWeight: 800,
};

const rowTextStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 3,
};

const nameLineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
};

const nameStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.3,
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const verifiedStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: 14,
  height: 14,
  borderRadius: "50%",
  background: COLORS.green,
  color: "#fff",
  fontSize: 9,
  fontWeight: 900,
};

const chipStyle: CSSProperties = {
  flexShrink: 0,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  borderRadius: 999,
  padding: "2px 7px",
  whiteSpace: "nowrap",
  color: COLORS.lavender,
  background: "rgba(200,184,255,.12)",
  border: "1px solid rgba(200,184,255,.30)",
};

const metaStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.4,
  color: COLORS.mutedText,
  overflowWrap: "anywhere",
};

const subStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.4,
  color: "rgba(255,255,255,.7)",
};

const disclosureStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.4,
  color: "rgba(255,255,255,.45)",
};

const sparseStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: "rgba(255,255,255,.6)",
  margin: "0 0 14px",
  textAlign: "center",
};

const emptyBoxStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
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
