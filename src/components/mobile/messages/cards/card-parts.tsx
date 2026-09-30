"use client";

import type { OrgRef, Person, VoteResponse } from "@/lib/chat/types";
import { vibeRequest, type VibeResult } from "@/lib/feedback/request";

import { clubGradient, personColor } from "../avatar";
import { initialsOf } from "../format";
import { SERIF } from "../v2-tokens";

/**
 * The small parts the three card renderers share (wave-2 contract 11.8;
 * mockup W0_Cards): the vote request, the discs, the marks, the spinners
 * and the footer icons. Inline styles only; every icon and avatar is
 * `aria-hidden` (the name lives in the row's label, 11.0).
 */

/** `PUT /api/me/threads/[id]/cards/[messageId]/vote` (4.3). */
export function voteUrl(roomId: string, messageId: string): string {
  return `/api/me/threads/${encodeURIComponent(roomId)}/cards/${encodeURIComponent(messageId)}/vote`;
}

/** The fallback line for a failure that carries no chat code (a network failure, a 5xx); every refusal shows its own sentence. */
export const VOTE_FAILURE = "Couldn't save your vote.";

/** One vote, on or off, quiet: the caller matches the code (1.3) and toasts through `toastSendFailure`. */
export function castVote(roomId: string, messageId: string, optionId: string, on: boolean): Promise<VibeResult<VoteResponse>> {
  return vibeRequest<VoteResponse>(voteUrl(roomId, messageId), {
    method: "PUT",
    json: { option_id: optionId, on },
    failure: VOTE_FAILURE,
    quiet: true,
  });
}

/** A person's disc: their avatar, else initials on their colour (avatar.ts). */
export function PersonDisc({ person, size, fontSize }: { person: Person; size: number; fontSize: number }) {
  const disc = personColor(person.id);
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 999,
        background: person.avatar_url ? `url(${person.avatar_url}) center/cover` : disc.bg,
        color: disc.ink,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize,
        fontWeight: 700,
      }}
    >
      {person.avatar_url ? null : initialsOf(person.name || person.handle || "?")}
    </span>
  );
}

/** The club's disc: its logo, else initials on its gradient (the Event card's band, 22px with the pale ring). */
export function ClubDisc({ org, size, fontSize, ring }: { org: Pick<OrgRef, "id" | "name" | "logo_url">; size: number; fontSize: number; ring?: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        boxSizing: "border-box",
        borderRadius: 999,
        border: ring,
        background: org.logo_url ? `url(${org.logo_url}) center/cover` : clubGradient(org.id),
        color: "#FAF7F2",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: SERIF,
        fontWeight: 800,
        fontSize,
      }}
    >
      {org.logo_url ? null : initialsOf(org.name)}
    </span>
  );
}

/** The picked mark: a coral disc with a check (a dot instead when `dot`). */
export function CoralDisc({ size = 18, dot = false }: { size?: number; dot?: boolean }) {
  return (
    <span aria-hidden style={{ position: "relative", width: size, height: size, flexShrink: 0, borderRadius: 999, background: "#FF5C35", color: "#140806", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {dot ? (
        <span style={{ width: Math.round(size / 3), height: Math.round(size / 3), borderRadius: 999, background: "currentColor", display: "block" }} />
      ) : (
        <svg width={Math.round(size * 0.61)} height={Math.round(size * 0.61)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      )}
    </span>
  );
}

/** The unpicked mark: the grey ring. */
export function Ring({ size = 18, color, dashed = false }: { size?: number; color: string; dashed?: boolean }) {
  return <span aria-hidden style={{ position: "relative", width: size, height: size, flexShrink: 0, boxSizing: "border-box", borderRadius: 999, border: dashed ? `1.5px dashed ${color}` : `2px solid ${color}` }} />;
}

function SpinPath({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" aria-hidden>
      <path d="M12 3a9 9 0 1 1-6.36 2.64">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

/**
 * The 36px spinner in the mark's place while a vote is in flight (11.8):
 * a 36×36 box with −9px margins, so it takes the 18px mark's slot and
 * moves nothing. SVG SMIL, since the screens carry no stylesheet keyframe.
 */
export function VoteSpinner({ color }: { color: string }) {
  return (
    <span aria-hidden style={{ position: "relative", width: 36, height: 36, margin: -9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <SpinPath size={22} color={color} />
    </span>
  );
}

/** The 16px spinner inside a pill (`Take a spot`, `Leave`, an RSVP pill). */
export function PillSpinner({ color }: { color: string }) {
  return (
    <span aria-hidden style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16 }}>
      <SpinPath size={16} color={color} />
    </span>
  );
}

export function Eye({ color }: { color: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

export function EyeOff({ color }: { color: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M4 4l16 16" />
      <path d="M9.5 6A9.5 9.5 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-2.7 3.5" />
      <path d="M6.2 7.7A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9.5 9.5 0 0 0 3.8-.8" />
    </svg>
  );
}

export function Chevron({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}
