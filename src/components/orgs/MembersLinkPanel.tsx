"use client";

/**
 * The club's members' link, for its owner and officers (the club's view,
 * wave 1; DECISIONS.md, Round 1 call 2). One per checked club: anyone with
 * the link and a school email gets past the closed waitlist and is asked to
 * join the club. It ends 3 weeks after it was made, after 150 sign-ups, or
 * when an officer turns it off.
 *
 * Officers see ONE number: how many joined through it. Never who.
 *
 * GET / POST /api/orgs/[slug]/members-link. The panel carries
 * id="members-link", so `/orgs/<h>/setup#members-link` lands on it.
 */
import { useEffect, useState } from "react";

import { campusLongDay } from "@/components/campus/tonight/campus-time";
import { QrCode } from "@/components/events/checkin/QrCode";
import { LoadFailed, asLoadFailure, type LoadFailure } from "@/components/feedback/LoadFailed";
import { copyText, vibeRequest } from "@/lib/feedback/request";
import { nativeShare } from "@/lib/native/bridge";
import { appShellOnClient } from "@/lib/native/detect";

import {
  busyStyle,
  lineStyle,
  pillStyle,
  primaryButtonStyle,
  quietStyle,
} from "./club-tool-styles";

type LinkView = {
  url: string;
  state: "live" | "expired" | "off";
  expires_at: string;
  joined: number;
  max_signups: number;
  full: boolean;
};

type Answer = { checked: boolean; link: LinkView | null };

type Action = "make" | "off" | "on" | "new";

const LOAD_FAILED = "Couldn't load the members' link.";
const ACTION_FAILED: Record<Action, string> = {
  make: "Couldn't make the link.",
  off: "Couldn't turn the link off.",
  on: "Couldn't turn the link back on.",
  new: "Couldn't make a new link.",
};

/** The route's answer, or null when it isn't the shape the panel draws. */
function parseAnswer(data: unknown): Answer | null {
  const d = data as { checked?: unknown; link?: unknown } | null;
  if (!d || typeof d.checked !== "boolean") return null;
  if (d.link === null || d.link === undefined) return { checked: d.checked, link: null };
  const l = d.link as Partial<LinkView>;
  if (typeof l.url !== "string" || typeof l.expires_at !== "string") return null;
  if (l.state !== "live" && l.state !== "expired" && l.state !== "off") return null;
  return {
    checked: d.checked,
    link: {
      url: l.url,
      state: l.state,
      expires_at: l.expires_at,
      joined: typeof l.joined === "number" ? l.joined : 0,
      max_signups: typeof l.max_signups === "number" ? l.max_signups : 150,
      full: l.full === true,
    },
  };
}

/** "Thursday, Nov 5" in campus time; "" for a date that doesn't parse. */
function dayOf(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? campusLongDay(ms) : "";
}

export function MembersLinkPanel({
  handle,
  clubName,
  onChange,
}: {
  handle: string;
  clubName: string;
  /** After the link is made: the setup list re-reads its steps. */
  onChange?: () => void;
}) {
  const api = `/api/orgs/${encodeURIComponent(handle)}/members-link`;
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [busy, setBusy] = useState<Action | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const r = await vibeRequest<unknown>(api, { quiet: true, failure: LOAD_FAILED, signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      const parsed = r.ok ? parseAnswer(r.data) : null;
      if (parsed) setAnswer(parsed);
      else setLoadErr(asLoadFailure(r, LOAD_FAILED));
    })();
    return () => ctrl.abort();
  }, [api, loadKey]);

  const act = async (action: Action) => {
    if (busy) return;
    setBusy(action);
    const r = await vibeRequest<unknown>(api, { method: "POST", json: { action }, failure: ACTION_FAILED[action] });
    setBusy(null);
    if (!r.ok) return;
    const parsed = parseAnswer(r.data);
    if (parsed) setAnswer(parsed);
    else setLoadKey((k) => k + 1);
    if (action === "make") onChange?.();
  };

  let body: React.ReactNode;
  if (loadErr) {
    body = (
      <LoadFailed
        compact
        failure={loadErr}
        onRetry={() => {
          setLoadErr(null);
          setLoadKey((k) => k + 1);
        }}
      />
    );
  } else if (!answer) {
    body = <p style={quietStyle}>Loading the link…</p>;
  } else if (!answer.checked) {
    body = <p style={lineStyle}>Your club needs to be checked by Vibe before it gets a members&rsquo; link.</p>;
  } else if (!answer.link) {
    body = (
      <button
        type="button"
        className="vibe-press"
        disabled={busy !== null}
        onClick={() => void act("make")}
        style={{ ...primaryButtonStyle, ...busyStyle(busy !== null) }}
      >
        {busy === "make" ? "Making the link…" : "Make the members’ link"}
      </button>
    );
  } else {
    body = <LinkBody link={answer.link} clubName={clubName} busy={busy} onAction={(a) => void act(a)} />;
  }

  return (
    <section id="members-link" aria-label="Members’ link" style={{ display: "flex", flexDirection: "column", gap: 12, scrollMarginTop: 24 }}>
      {body}
      {answer?.checked ? (
        <p style={quietStyle}>
          Anyone with this link and a school email can get on Vibe and join {clubName}. It ends 3 weeks after you
          made it, after 150 sign-ups, or when you turn it off.
        </p>
      ) : null}
    </section>
  );
}

function LinkBody({
  link,
  clubName,
  busy,
  onAction,
}: {
  link: LinkView;
  clubName: string;
  busy: Action | null;
  onAction: (action: Action) => void;
}) {
  const live = link.state === "live";
  const day = dayOf(link.expires_at);

  const share = async () => {
    const title = `Join ${clubName} on Vibe`;
    // In the store apps, the phone's own share sheet first (Android's web
    // view has no navigator.share); it counts once the sheet opens. A browser
    // keeps the tap's gesture for its own sheet, and Copy is the last resort.
    if (appShellOnClient() !== null && (await nativeShare({ title, url: link.url }))) return;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url: link.url });
        return;
      } catch (err) {
        // They closed the sheet: nothing to say.
        if ((err as { name?: unknown } | null)?.name === "AbortError") return;
      }
    }
    await copyText(link.url);
  };

  return (
    <>
      {live ? (
        <>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--hairline)",
              background: "rgba(var(--scrim-rgb),0.03)",
              fontFamily: "var(--font-code)",
              fontSize: 13,
              lineHeight: 1.45,
              color: "var(--charcoal)",
              overflowWrap: "anywhere",
              userSelect: "all",
            }}
          >
            {link.url}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="vibe-press" onClick={() => void copyText(link.url)} style={{ ...pillStyle, flex: "1 1 120px" }}>
              Copy
            </button>
            <button type="button" className="vibe-press" onClick={() => void share()} style={{ ...pillStyle, flex: "1 1 120px" }}>
              Share
            </button>
          </div>
          {/* Dark on white in every theme, Night included (QrCode.tsx): many
              phone cameras misread an inverted code. */}
          <div style={{ alignSelf: "center", padding: 12, borderRadius: 18, background: "#fff", border: "1px solid var(--hairline)" }}>
            <QrCode text={link.url} size="180px" label={`QR code for ${clubName}'s members' link`} />
          </div>
        </>
      ) : (
        <p style={lineStyle}>
          {link.state === "off"
            ? "The link is off. Nobody can use it until you turn it back on."
            : `This link ended${day ? ` on ${day}` : ""}. Nobody can use it any more.`}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <p style={{ ...lineStyle, color: "var(--charcoal)", fontWeight: 700 }}>
          {link.joined} joined through it
        </p>
        {link.state !== "expired" && day ? <p style={quietStyle}>Ends {day}</p> : null}
        {link.full ? <p style={quietStyle}>Full: {link.max_signups} people signed up through it</p> : null}
      </div>

      {link.state === "expired" ? null : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            className="vibe-press"
            disabled={busy !== null}
            onClick={() => onAction(live ? "off" : "on")}
            style={{ ...pillStyle, ...busyStyle(busy !== null) }}
          >
            {busy === "off" ? "Turning off…" : busy === "on" ? "Turning on…" : live ? "Turn off" : "Turn on"}
          </button>
          {/* A link that went somewhere it shouldn't: a new one, the old one dead. */}
          <button
            type="button"
            className="vibe-press"
            disabled={busy !== null}
            onClick={() => {
              if (window.confirm("Make a new link? The old link stops working. People who already joined stay.")) {
                onAction("new");
              }
            }}
            style={{ ...pillStyle, ...busyStyle(busy !== null) }}
          >
            {busy === "new" ? "Making…" : "New link"}
          </button>
        </div>
      )}
    </>
  );
}
