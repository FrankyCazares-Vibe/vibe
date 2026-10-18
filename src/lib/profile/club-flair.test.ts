/**
 * Tests for `club-flair.ts` (club model spec D; Franky's calls, Oct 16): the
 * title rules, member-since, the public "Member of" list and the chips. The
 * routes that read the database are pinned as TEXT at the bottom (the
 * `hidden-fields.test.ts` pattern), because they import the Supabase clients.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/profile/club-flair.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const specifier = "./club-flair.ts";
const {
  CLUB_TITLE_MAX,
  buildPublicProfileClubs,
  clubFlairLabel,
  flairChips,
  memberSinceMonth,
  normalizeClubTitle,
  parseProfileRank,
} = (await import(specifier)) as typeof import("./club-flair");

test("a title keeps its capitals and loses extra spaces", () => {
  assert.deepEqual(normalizeClubTitle("  Vice   President "), { ok: true, title: "Vice President" });
  assert.deepEqual(normalizeClubTitle("Rush Chair"), { ok: true, title: "Rush Chair" });
});

test("null, empty and blank titles clear it", () => {
  for (const raw of [null, "", "   ", "\u200B"]) {
    assert.deepEqual(normalizeClubTitle(raw), { ok: true, title: null });
  }
});

test("a title is one line of plain text", () => {
  for (const raw of ["Line one\nLine two", "Tab\there", 42, {}, undefined]) {
    const r = normalizeClubTitle(raw);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "title_invalid");
  }
});

test("hidden marks and direction overrides are dropped", () => {
  assert.deepEqual(normalizeClubTitle("Pres\u200Bident\u202E"), { ok: true, title: "President" });
  assert.deepEqual(normalizeClubTitle("\u2066Rush\u00A0Chair\u2069"), { ok: true, title: "Rush Chair" });
});

test("the length counts characters, the way the CHECK does", () => {
  const max = "a".repeat(CLUB_TITLE_MAX);
  assert.deepEqual(normalizeClubTitle(max), { ok: true, title: max });
  const over = normalizeClubTitle(`${max}a`);
  assert.equal(over.ok, false);
  if (!over.ok) assert.equal(over.code, "title_too_long");
  // 32 emoji are 64 UTF-16 units but 32 characters.
  assert.equal(normalizeClubTitle("🦁".repeat(CLUB_TITLE_MAX)).ok, true);
});

test("reserved words are refused as whole words, any case or accent", () => {
  for (const raw of ["Vibe Rep", "ADMIN", "Club Moderator", "Vérified", "Official Photographer", "admin-chair"]) {
    const r = normalizeClubTitle(raw);
    assert.equal(r.ok, false, raw);
    if (!r.ok) assert.equal(r.code, "title_reserved");
  }
  for (const raw of ["Vibes Chair", "Administration Lead", "Moderation"]) {
    assert.equal(normalizeClubTitle(raw).ok, true, raw);
  }
});

test("profile_rank is null or a whole number from 0 to 50", () => {
  assert.deepEqual(parseProfileRank(null), { ok: true, rank: null });
  assert.deepEqual(parseProfileRank(0), { ok: true, rank: 0 });
  assert.deepEqual(parseProfileRank(50), { ok: true, rank: 50 });
  for (const raw of [-1, 51, 1.5, "2", undefined, Number.NaN]) {
    assert.deepEqual(parseProfileRank(raw), { ok: false });
  }
});

test("member since is the month in campus time", () => {
  assert.equal(memberSinceMonth("2026-09-14T15:00:00+00:00"), "2026-09");
  // 1 a.m. UTC on Oct 1 is still Sept 30 in Indianapolis.
  assert.equal(memberSinceMonth("2026-10-01T01:00:00+00:00"), "2026-09");
  assert.equal(memberSinceMonth("not a date"), null);
  assert.equal(memberSinceMonth(null), null);
});

test("the chip reads title · club, or just the club", () => {
  assert.equal(clubFlairLabel("SAE", "President"), "President · SAE");
  assert.equal(clubFlairLabel("SAE", null), "SAE");
  assert.equal(clubFlairLabel("SAE", "  "), "SAE");
});

const card = (handle: string, name = handle.toUpperCase()) => ({
  handle,
  name,
  logo_url: null,
  verified: false,
});

test("the public list drops hidden clubs and keeps the person's order", () => {
  const cards = new Map([
    ["o1", card("chess")],
    ["o2", card("sae")],
    ["o3", card("film")],
  ]);
  const rows = [
    { org_id: "o1", title: null, profile_rank: null, joined_at: "2026-09-01T12:00:00Z" },
    { org_id: "o2", title: "President", profile_rank: 1, joined_at: "2026-09-20T12:00:00Z" },
    { org_id: "o3", title: "Treasurer", show_title: false, profile_rank: null, joined_at: "2026-08-01T12:00:00Z" },
    { org_id: "hidden", title: "Treasurer", profile_rank: 0, joined_at: "2026-01-01T12:00:00Z" },
  ];
  const list = buildPublicProfileClubs(rows, cards);
  assert.deepEqual(list.map((c) => c.handle), ["sae", "film", "chess"]);
  assert.deepEqual(list[0], {
    handle: "sae",
    name: "SAE",
    logo_url: null,
    verified: false,
    title: "President",
    since: "2026-09",
  });
  // No role word, no ids, no exact join time.
  assert.deepEqual(Object.keys(list[0]).sort(), ["handle", "logo_url", "name", "since", "title", "verified"]);
  // A title the member hid stays off the profile.
  assert.equal(list[1].title, null);
  assert.equal(buildPublicProfileClubs(rows, cards, 1).length, 1);
});

test("chips put titled clubs first and stop at three", () => {
  const clubs = [
    { handle: "a", title: null },
    { handle: "b", title: "Rush Chair" },
    { handle: "c", title: null },
    { handle: "d", title: "President" },
    { handle: "e", title: null },
  ];
  assert.deepEqual(flairChips(clubs).map((c) => c.handle), ["b", "d", "a"]);
});

// ── The routes, pinned as text ──────────────────────────────────────────────

const REPO_ROOT = new URL("../../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, REPO_ROOT), "utf8");

test("the public loader reads only shown clubs, and only on ?clubs=1", () => {
  const src = read("src/app/api/users/[handle]/bootstrap/route.ts");
  assert.match(src, /\.eq\("show_on_profile", true\)/);
  assert.match(src, /loadVisibleOrgCards\(/);
  assert.match(src, /searchParams\.get\("clubs"\) === "1"/);
  assert.doesNotMatch(src, /org_followers/);
});

test("my clubs read my own rows only", () => {
  const src = read("src/app/api/me/clubs/route.ts");
  for (const table of ["org_members", "org_followers", "org_post_mutes"]) {
    const at = src.indexOf(`.from("${table}")`);
    assert.ok(at > 0, table);
    assert.match(src.slice(at, at + 200), /\.eq\("user_id", user\.id\)/, table);
  }
});

test("my club settings write my own membership row, and never a title", () => {
  const src = read("src/app/api/me/clubs/[orgId]/route.ts");
  const at = src.indexOf('.from("org_members")');
  assert.ok(at > 0);
  assert.match(src.slice(at, at + 200), /\.eq\("user_id", user\.id\)/);
  assert.match(src, /limitFor\("prefs", user\.id\)/);
  assert.match(src, /Only the club's officers can give a title/);
});

test("officer titles pass the shape rules, the word filter and the role reach", () => {
  const src = read("src/app/api/orgs/[slug]/members/[userId]/route.ts");
  assert.match(src, /normalizeClubTitle\(raw\)/);
  assert.match(src, /checkChangedText\(checked\.title/);
  assert.match(src, /\.in\("role", \[\.\.\.reach\]\)/);
  assert.match(src, /title_set_by: actorId/);
});

test("the followed-clubs page reads my mutes on my own client", () => {
  const src = read("src/app/api/me/followed-orgs/route.ts");
  const at = src.indexOf('.from("org_post_mutes")');
  assert.ok(at > 0);
  assert.match(src.slice(at - 40, at), /supabase\s*$/);
  assert.match(src.slice(at, at + 120), /\.eq\("user_id", user\.id\)/);
});
