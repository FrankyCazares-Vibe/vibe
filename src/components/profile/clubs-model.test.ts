/**
 * Tests for `clubs-model.ts` (batch 2E; club model spec D; Franky's rules,
 * Oct 18 2026): reading the two routes, what a visitor sees of my clubs,
 * "Member since", reordering and the ⋯ sheet's rows. The components are
 * pinned as TEXT at the bottom, because they import React and the app.
 *
 * Run with:
 *   node --test --experimental-strip-types src/components/profile/clubs-model.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("clubs-model.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    return nextResolve(specifier, context);
  },
});

const specifier = "./clubs-model.ts";
const {
  CLUBS_COPY,
  canMove,
  clubSheetActions,
  memberSinceText,
  moveClub,
  myClubSubline,
  patchMember,
  readFollowedPage,
  readMyClubs,
  readPublicClubs,
  shownClubSubline,
  shownFromMine,
  showsNewTitleMark,
  titleIsNew,
} = (await import(specifier)) as typeof import("./clubs-model");

type Member = import("./clubs-model").MyMemberClub;

function member(id: string, extra: Partial<Member> = {}): Member {
  return {
    org_id: id,
    handle: id,
    name: id.toUpperCase(),
    logo_url: null,
    verified: false,
    title: null,
    show_title: true,
    since: "2026-09",
    show_on_profile: true,
    profile_rank: null,
    muted: false,
    ...extra,
  };
}

test("the public list keeps good rows, drops broken ones, and is null when absent", () => {
  assert.equal(readPublicClubs(undefined), null);
  assert.equal(readPublicClubs(null), null);
  assert.deepEqual(readPublicClubs([]), []);
  const out = readPublicClubs([
    { handle: "sae", name: "SAE", logo_url: "/x.png", verified: true, title: " President ", since: "2026-09" },
    { handle: "", name: "No handle" },
    { handle: "chess", name: "Chess", title: "", since: "Sep 2026" },
    { handle: "sae", name: "SAE again" },
    "junk",
  ]);
  assert.deepEqual(out, [
    { handle: "sae", name: "SAE", logo_url: "/x.png", verified: true, title: "President", since: "2026-09" },
    { handle: "chess", name: "Chess", logo_url: null, verified: false, title: null, since: null },
  ]);
});

test("my clubs: defaults read as shown, and a club I'm in never sits in Following", () => {
  assert.equal(readMyClubs({ ok: true }), null);
  const mine = readMyClubs({
    member_of: [
      { org_id: "a", handle: "sae", name: "SAE", title: "President", since: "2026-09", profile_rank: 2 },
      { org_id: "b", handle: "chess", name: "Chess", show_on_profile: false, show_title: false, muted: true },
      { handle: "noid", name: "No id" },
    ],
    following: [
      { org_id: "a", handle: "sae", name: "SAE" },
      { org_id: "c", handle: "film", name: "Film", muted: true },
    ],
    following_next_cursor: "abc",
  });
  assert.ok(mine);
  assert.deepEqual(mine.member_of.map((m) => [m.org_id, m.show_on_profile, m.show_title, m.profile_rank, m.muted]), [
    ["a", true, true, 2, false],
    ["b", false, false, null, true],
  ]);
  assert.deepEqual(mine.following.map((f) => [f.org_id, f.muted]), [["c", true]]);
  assert.equal(mine.next_cursor, "abc");
  assert.deepEqual(mine.muted_only, [], "an older server sends no muted list");
  const withMuted = readMyClubs({
    member_of: [{ org_id: "a", handle: "sae", name: "SAE" }],
    following: [{ org_id: "c", handle: "film", name: "Film" }],
    muted_only: [{ org_id: "a", handle: "sae", name: "SAE" }, { org_id: "m", handle: "chess", name: "Chess" }, { org_id: "c", handle: "film", name: "Film" }],
  });
  assert.deepEqual(withMuted?.muted_only.map((f) => [f.org_id, f.muted]), [["m", true]], "a club already listed is never listed twice");
});

test("more Following drops clubs I'm in and ones already listed", () => {
  const page = readFollowedPage(
    {
      orgs: [
        { id: "a", handle: "sae", name: "SAE", member_role: "member" },
        { id: "c", handle: "film", name: "Film" },
        { id: "d", handle: "run", name: "Run Club", muted: true },
        { id: "d", handle: "run", name: "Run Club" },
      ],
      next_cursor: null,
    },
    new Set(["c"]),
  );
  assert.deepEqual(page, {
    following: [{ org_id: "d", handle: "run", name: "Run Club", logo_url: null, verified: false, muted: true }],
    next_cursor: null,
  });
  assert.equal(readFollowedPage({ nope: 1 }, new Set()), null);
});

test("what visitors see of my clubs: hidden clubs out, hidden titles blank, order kept", () => {
  const shown = shownFromMine([
    member("a", { title: "President" }),
    member("b", { show_on_profile: false, title: "Treasurer" }),
    member("c", { title: "Rush Chair", show_title: false }),
  ]);
  assert.deepEqual(shown.map((s) => [s.handle, s.title]), [
    ["a", "President"],
    ["c", null],
  ]);
  assert.equal("show_on_profile" in shown[0], false, "no settings leak into the public shape");
});

test("Member since reads the month, and nothing for a bad one", () => {
  assert.equal(memberSinceText("2026-09"), "Member since Sep 2026");
  assert.equal(memberSinceText("2027-01"), "Member since Jan 2027");
  assert.equal(memberSinceText("2026-13"), "");
  assert.equal(memberSinceText(null), "");
  assert.equal(shownClubSubline({ handle: "a", name: "A", logo_url: null, verified: false, title: "President", since: "2026-09" }), "President · Member since Sep 2026");
  assert.equal(shownClubSubline({ handle: "a", name: "A", logo_url: null, verified: false, title: null, since: null }), "");
  assert.equal(myClubSubline(member("a", { title: "President", show_title: false })), "President (hidden) · Member since Sep 2026");
});

test("moving a club numbers the list once, then touches two", () => {
  const list = [member("a"), member("b"), member("c")];
  assert.equal(moveClub(list, "a", -1), null);
  assert.equal(moveClub(list, "c", 1), null);
  assert.equal(moveClub(list, "zz", 1), null);
  const first = moveClub(list, "c", -1);
  assert.ok(first);
  assert.deepEqual(first.list.map((m) => [m.org_id, m.profile_rank]), [["a", 0], ["c", 1], ["b", 2]]);
  assert.deepEqual(first.writes, [
    { org_id: "a", profile_rank: 0 },
    { org_id: "c", profile_rank: 1 },
    { org_id: "b", profile_rank: 2 },
  ]);
  const second = moveClub(first.list, "c", -1);
  assert.ok(second);
  assert.deepEqual(second.writes, [
    { org_id: "c", profile_rank: 0 },
    { org_id: "a", profile_rank: 1 },
  ]);
  assert.deepEqual(list.map((m) => m.profile_rank), [null, null, null], "the input is never changed");
});

test("no move past the 51st club, where a rank can't follow", () => {
  const many = Array.from({ length: 53 }, (_, i) => member(`m${i}`));
  assert.equal(canMove(many, "m50", -1), true);
  assert.equal(canMove(many, "m50", 1), false);
  assert.equal(canMove(many, "m52", -1), false);
});

test("the ⋯ sheet: members get every choice that applies, followers only mute and the page", () => {
  const list = [member("a", { title: "President" }), member("b")];
  assert.deepEqual(clubSheetActions(list, "a", "member"), ["toggle_show", "toggle_title", "move_down", "toggle_mute", "open"]);
  assert.deepEqual(clubSheetActions(list, "b", "member"), ["toggle_show", "move_up", "toggle_mute", "open"]);
  assert.deepEqual(clubSheetActions([member("a")], "a", "member"), ["toggle_show", "toggle_mute", "open"]);
  assert.deepEqual(clubSheetActions(list, "x", "following"), ["toggle_mute", "unfollow", "open"]);
  assert.deepEqual(clubSheetActions(list, "x", "muted"), ["toggle_mute", "open"], "a muted club I don't follow: Unmute has a home");
  const patched = patchMember(list, "b", { show_on_profile: false, muted: true });
  assert.deepEqual(patched.map((m) => [m.show_on_profile, m.muted]), [[true, false], [false, true]]);
});

test("the copy never names a role, and Following says who sees it", () => {
  const all = Object.values(CLUBS_COPY).join(" ");
  assert.doesNotMatch(all, /\b(Owner|Officer|Mod|Admin)\b/);
  assert.equal(CLUBS_COPY.onlyYou, "Only you see this");
});

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the profile asks the bootstrap for clubs and reads mine from /api/me/clubs", () => {
  const profile = read("../mobile/ProfileMobile.tsx");
  assert.match(profile, /\/bootstrap\?clubs=1`/);
  assert.match(profile, /readPublicClubs\(r\.data\.clubs\)/);
  assert.match(profile, /useMyClubs\(!isVisitor\)/);
  // My own chips follow the Clubs eye, read first: on my own /profile/<handle>
  // the phone is in visitor mode but the bootstrap answers me as the owner.
  // (A real visitor's `hidden` is always [], so for them it changes nothing.)
  assert.match(profile, /<ClubFlairChips clubs=\{clubsHidden \? \[\] : isVisitor \? \(visitorClubs \?\? \[\]\) : myClubs\.shown\} \/>/);
  assert.match(profile, /const clubsHidden = layout\.hidden\.includes\("clubs"\);/);
  const section = read("./ClubsSection.tsx");
  assert.match(section, /"\/api\/me\/clubs"/);
  assert.match(section, /\/api\/me\/followed-orgs\?cursor=/);
  assert.match(section, /method: "PATCH"/);
  assert.doesNotMatch(section, /\btitle:\s*(?!CLUBS_COPY)[a-z]/, "a member never sends a title");
});

test("the phone draws Clubs in the Portfolio tab only, as its first movable sub-section (Oct 18 2026)", () => {
  const profile = read("../mobile/ProfileMobile.tsx");
  // Both uses sit inside <PortfolioPane …>'s `clubs` prop: nothing above the
  // tab strip, so the Posts tab no longer shows it.
  const uses = [...profile.matchAll(/<ClubsSection\b/g)].map((m) => m.index ?? -1);
  assert.equal(uses.length, 2, "one for visitors, one for the owner");
  const pane = profile.indexOf("<PortfolioPane");
  const paneProps = profile.indexOf("currentProjects={currentProjects}", pane);
  const clubsProp = profile.indexOf("clubs={", pane);
  assert.ok(pane > 0 && clubsProp > pane && clubsProp < paneProps, "PortfolioPane has no clubs prop");
  for (const at of uses) assert.ok(at > clubsProp && at < paneProps, "a ClubsSection is drawn outside the Portfolio tab");
  assert.ok(profile.indexOf("<ProfileTabs") < pane, "the Portfolio pane comes after the tab strip");
  // The visitor gets only what the bootstrap sent; the owner gets the store,
  // and a note while the section is hidden (it still draws for them).
  assert.match(profile, /<ClubsSection mode="visitor" clubs=\{visitorClubs\} \/>/);
  assert.match(profile, /<ClubsSection\s+mode="owner"\s+store=\{myClubs\}\s+note=\{clubsHidden \? "Hidden · only you see it" : undefined\}\s*\/>/);
  assert.match(profile, /order=\{portfolioWidgetOrder\(layout, !isVisitor\)\}/, "the owner's hidden Clubs keeps its slot");
  assert.match(profile, /\(!layout\.hidden\.includes\(id\) \|\| \(keepClubs && id === "clubs"\)\)/);
  // The owner's section is never blank, so it always counts; the empty
  // prompt goes under it.
  assert.match(profile, /isVisitor \? \(visitorClubs\?\.length \?\? 0\) : 1/);
  assert.match(profile, /const rest = isVisitor \? order : order\.filter\(\(id\) => id !== "clubs"\);/);
  // The pager is as tall as the open tab, not the taller one.
  assert.match(profile, /alignItems: "flex-start",\s*overflowX: "auto",/);
  assert.match(profile, /pager\.style\.height = `\$\{pane\.offsetHeight\}px`;/);
  assert.match(profile, /ref=\{setPostsPaneEl\}/);
  assert.match(profile, /ref=\{setPortfolioPaneEl\}/);
  // A movable, hideable sub-section like the others, first by default.
  assert.match(profile, /const PORTFOLIO_WIDGET_IDS: readonly PortfolioWidgetId\[\] = \[\s*"clubs",/);
  assert.match(profile, /const sections: Record<PortfolioWidgetId, React\.ReactNode> = \{\s*clubs,/);
  assert.match(profile, /sectionCount: Record<PortfolioWidgetId, number> = \{\s*clubs: clubsCount,/);
  assert.match(profile, /counts=\{\{\s*clubs: myClubs\.shown\.length,/);
});

test("the chips carry no dates", () => {
  const flair = read("./ClubFlair.tsx");
  assert.doesNotMatch(flair, /\.since\b|memberSince(Text|Label|Month)/);
});

test("a title I haven't opened is marked new, until I open that club's sheet", () => {
  assert.equal(titleIsNew({ org_id: "a", title: "President" }, {}), true);
  assert.equal(titleIsNew({ org_id: "a", title: "President" }, { a: "President" }), false);
  assert.equal(titleIsNew({ org_id: "a", title: "Rush Chair" }, { a: "President" }), true, "a changed title is new again");
  assert.equal(titleIsNew({ org_id: "a", title: null }, {}), false);
  // Wave-3 review, finding 6: the mark says the title shows on my profile,
  // so a hidden club or a hidden title never carries it.
  const club = { org_id: "a", title: "President", show_title: true, show_on_profile: true };
  assert.equal(showsNewTitleMark(club, {}), true);
  assert.equal(showsNewTitleMark({ ...club, show_on_profile: false }, {}), false, "a club I hid");
  assert.equal(showsNewTitleMark({ ...club, show_title: false }, {}), false, "a title I hid");
  assert.equal(showsNewTitleMark(club, { a: "President" }), false, "already seen");
  assert.doesNotMatch(CLUBS_COPY.newTitleTag, /\b(Owner|Officer|Mod|Admin)\b/);
});
