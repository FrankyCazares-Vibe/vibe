/**
 * The static post viewer's "Mute <club>'s posts" row (wave-3 review, finding
 * 5), pinned to the phone's. public/html/_postViewer.js hand-copies the club
 * helpers of `feed-actions.ts` between `// club-mute-twin:start` and
 * `// club-mute-twin:end`; this file runs that block beside the React helpers
 * on the same inputs, and pins the menu row and the handler as text.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/posts/static-post-viewer-club-mute.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("static-post-viewer-club-mute.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    return nextResolve(specifier, context);
  },
});

const specifier = "./feed-actions.ts";
const m = (await import(specifier)) as typeof import("./feed-actions");
type FeedClub = import("./feed-actions").FeedClub;

const viewer = readFileSync(new URL("../../../public/html/_postViewer.js", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../../../public/html/_persistence.js", import.meta.url), "utf8");

function region(start: string, end: string): string {
  assert.equal(viewer.split(start).length - 1, 1, `${start} must appear once in _postViewer.js`);
  assert.equal(viewer.split(end).length - 1, 1, `${end} must appear once in _postViewer.js`);
  return viewer.slice(viewer.indexOf(start) + start.length, viewer.indexOf(end));
}

type Twin = {
  VPV_CLUB_MUTE_COPY: Record<string, string | number>;
  vpvClubOf: (org: unknown) => FeedClub | null;
  vpvClubMuteUrl: (handle: string) => string;
  vpvMuteClubRowLabel: (club: FeedClub) => string;
  vpvClubLine: (line: string, club: FeedClub) => string;
};
const twin = new Function(
  `${region("// club-mute-twin:start", "// club-mute-twin:end")}\nreturn { VPV_CLUB_MUTE_COPY, vpvClubOf, vpvClubMuteUrl, vpvMuteClubRowLabel, vpvClubLine };`,
)() as Twin;

const CLUBS: unknown[] = [
  { handle: "chess_club", name: "Chess Club" },
  { handle: "  sae ", name: "  Sigma Alpha Epsilon " },
  { handle: "no_name", name: "" },
  { handle: "no_name", name: null },
  { handle: "dollar", name: "$1 Club {org}" },
  { handle: "", name: "Nobody" },
  { handle: 7, name: "Number" },
  null,
  undefined,
];

test("which club a post's answer names, the same both sides", () => {
  for (const org of CLUBS) {
    assert.deepEqual(twin.vpvClubOf(org), m.feedClubOf(org as Parameters<typeof m.feedClubOf>[0]), JSON.stringify(org));
  }
});

test("the row, the URL and the four toasts read the same words", () => {
  const C = twin.VPV_CLUB_MUTE_COPY;
  for (const org of CLUBS) {
    const club = m.feedClubOf(org as Parameters<typeof m.feedClubOf>[0]);
    if (!club) continue;
    assert.equal(twin.vpvMuteClubRowLabel(club), m.muteClubRowLabel(club));
    assert.equal(twin.vpvClubMuteUrl(club.handle), m.clubMuteUrl(club.handle));
    assert.equal(twin.vpvClubLine(String(C.muted), club), m.clubMutedLine(club));
    assert.equal(twin.vpvClubLine(String(C.unmuted), club), m.clubUnmutedLine(club));
    assert.equal(twin.vpvClubLine(String(C.muteFailed), club), m.muteFailureLine(club));
    assert.equal(twin.vpvClubLine(String(C.unmuteFailed), club), m.unmuteFailureLine(club));
  }
  assert.equal(C.undo, m.MUTE_UNDO_LABEL);
  assert.equal(C.undoMs, m.MUTE_UNDO_MS);
});

test("the row is someone else's club post's only, and the handler mutes with Undo", () => {
  // Built in the non-owner branch, before Report post, from the server's club.
  const owner = viewer.indexOf("if (isOwner) {");
  const row = viewer.indexOf("const muteClubBtn = state.club");
  const report = viewer.indexOf(">Report post</button>");
  assert.ok(owner > 0 && row > owner && report > row, "the row sits in the non-owner menu, before Report");
  assert.ok(viewer.includes("state.club = vpvClubOf(j.club);"), "the club comes from GET /api/posts/[id]");
  assert.equal(viewer.split("state.club = null;").length - 1, 2, "both resets forget the last post's club");
  assert.ok(viewer.includes("esc(vpvMuteClubRowLabel(state.club))"), "the club's name is escaped");
  const handler = viewer.slice(viewer.indexOf("window.__vpvMuteClub = async function"));
  assert.match(handler, /method: "POST",\s*failure: vpvClubLine\(C\.muteFailed, club\)/);
  assert.match(handler, /durationMs: C\.undoMs,/);
  assert.match(handler, /method: "DELETE",\s*failure: vpvClubLine\(C\.unmuteFailed, club\),\s*success: vpvClubLine\(C\.unmuted, club\)/);
  // The toast's button can act on the page (Undo), not only leave it.
  assert.ok(persistence.includes("typeof o.action.onPress === 'function'"));
  assert.ok(persistence.includes("if (typeof action.onPress === 'function') { action.onPress(); return; }"));
});
