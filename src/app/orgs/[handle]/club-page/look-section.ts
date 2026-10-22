/**
 * Edit page's Look section and Name field, the pure parts (Oct 22, 2026,
 * Franky: "the picker in the Edit page on phone and computer, and the Name
 * field"; handoffs/2026-10-22-club-tools-arc/PLAN-4.md K2, boards
 * LookDesktop and LookPhone). LookSection.tsx draws them; EditPageModal
 * (admin-actions.tsx) saves them. This file decides which swatch is on when
 * the page opens, what each one is called, where the arrow keys go, the
 * footer's one line, and exactly what Save sends.
 *
 * PURE ON PURPOSE: type imports only, so look-section.test.ts loads it under
 * plain `node --test`. The backgrounds themselves are never listed here:
 * they come in as arguments from src/lib/orgs/backdrops.ts, THE list.
 */
import type { JoinPolicy, OrgAudience } from "@/lib/orgs/join-state";

/** The route's own bounds (PATCH /api/orgs/[slug]: trimmed, 2 to 50). */
export const NAME_MIN = 2;
export const NAME_MAX = 50;

type Choice = { key: string; label: string };

/**
 * The swatch that is on when Edit page opens: the stored key when the picker
 * offers it, else the one the page paints for it (a club still on "cream",
 * or on a key this build doesn't know, shows the default). Opening and
 * closing without a tap never sends a background.
 */
export function openingBackdrop(stored: string, offered: readonly Choice[], paintedKey: string): string {
  return offered.some((b) => b.key === stored) ? stored : paintedKey;
}

/**
 * A background's name, as the line under the swatches shows it ("Dusk" and
 * "the default") and as a screen reader hears its swatch ("Dusk, the
 * default"). The selected swatch also carries a ring and a check, so the
 * choice is never told by colour alone.
 */
export function backdropName(
  choice: Choice,
  defaultKey: string,
): { name: string; tag: string | null; spoken: string } {
  const tag = choice.key === defaultKey ? "the default" : null;
  return { name: choice.label, tag, spoken: tag ? `${choice.label}, ${tag}` : choice.label };
}

/**
 * The swatch group's keys, as EventVisibilityField (campus-home.tsx) moves
 * its radios: Right and Down go on, Left and Up go back, both wrap; Home and
 * End jump to the ends. `at` is -1 when none is on (a stored key the picker
 * doesn't offer). Null for every other key, so Tab and typing pass through.
 */
export function radioStep(key: string, at: number, count: number): number | null {
  if (count <= 0) return null;
  const last = count - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return at < 0 || at >= last ? 0 : at + 1;
  if (key === "ArrowLeft" || key === "ArrowUp") return at <= 0 ? last : at - 1;
  if (key === "Home") return 0;
  if (key === "End") return last;
  return null;
}

/** Why a name can't be saved, in the officer's words, or null when it can. */
export function nameProblem(name: string): string | null {
  const length = name.trim().length;
  if (length < NAME_MIN) return "Give the club a name, 2 characters or more.";
  if (length > NAME_MAX) return "Keep the name to 50 characters.";
  return null;
}

/**
 * The footer's line on a computer (the board's "Background: Dusk to Onyx.
 * Not saved yet."). `from` and `to` are the background names when it
 * changed, else null.
 */
export function lookStatus(change: { from: string | null; to: string | null; otherChanges: boolean }): string {
  const background = change.from && change.to && change.from !== change.to;
  if (background && change.otherChanges) return `Background: ${change.from} to ${change.to}, and more. Not saved yet.`;
  if (background) return `Background: ${change.from} to ${change.to}. Not saved yet.`;
  if (change.otherChanges) return "Changes not saved yet.";
  return "No changes yet";
}

export type EditLink = { label: string; url: string };

export type EditPageDraft = {
  /** A hidden club refuses any join-field change (409 `org_hidden`). */
  hidden: boolean;
  name: string;
  initialName: string;
  /** The picked key, and the one that was on when Edit page opened. */
  backdrop: string;
  openingBackdrop: string;
  description: string;
  philanthropy: string;
  links: EditLink[];
  joinPolicy: JoinPolicy;
  initialJoinPolicy: JoinPolicy;
  audience: OrgAudience;
  initialAudience: OrgAudience;
  /** Null when the database has no meeting_time yet; else the normalized value. */
  meetingTime: { value: string; initial: string } | null;
};

/**
 * What Save sends. Description, philanthropy and links go every time, as
 * they always have (the route's word filter only judges what changed).
 * Everything else goes only when the officer changed it:
 * - who can join and open to, never on a hidden club: narrowing the
 *   audience revokes invites on the server, and a hidden club refuses them;
 * - when you meet, so a database without the column never sees it;
 * - the name, trimmed, so an untouched name is never re-judged or re-published;
 * - the background, so a club still on "cream" keeps its key until an
 *   officer picks one, and a key the database can't hold yet is never sent
 *   by a Save about something else.
 */
export function editPageBody(d: EditPageDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {
    description: d.description.trim(),
    philanthropy: d.philanthropy.trim(),
    links: d.links
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
      .filter((l) => l.label && l.url),
  };
  if (!d.hidden && d.joinPolicy !== d.initialJoinPolicy) body.join_policy = d.joinPolicy;
  if (!d.hidden && d.audience !== d.initialAudience) body.audience = d.audience;
  if (d.meetingTime && d.meetingTime.value !== d.meetingTime.initial) body.meeting_time = d.meetingTime.value;
  if (d.name.trim() !== d.initialName.trim()) body.name = d.name.trim();
  if (d.backdrop !== d.openingBackdrop) body.backdrop_preset = d.backdrop;
  return body;
}
