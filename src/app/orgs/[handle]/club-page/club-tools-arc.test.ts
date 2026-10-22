/**
 * Tests for `club-tools-arc.ts` (Club tools, the Arc; Oct 22, 2026): the
 * arc's geometry in a real window, the words on its bubbles and cards, and
 * the people lines the Members and Officers cards show.
 *
 * Run with:
 *   node --test "src/app/orgs/[handle]/club-page/club-tools-arc.test.ts"
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./club-tools-arc.ts";
const arc = (await import(specifier)) as typeof import("./club-tools-arc");
const { ARC, ARC_TOOLS } = arc;

test("seven tools in the board's order, Join requests the one hot bubble in the middle", () => {
  assert.deepEqual(
    ARC_TOOLS.map((t) => t.id),
    ["invite", "members", "followers", "requests", "officers", "events", "settings"],
  );
  assert.deepEqual(ARC_TOOLS.filter((t) => t.hot).map((t) => t.id), ["requests"]);
  assert.equal(ARC_TOOLS[3].id, "requests");
});

test("a tall window draws the board's arc: radius 236 round the planet 36px in from the right edge", () => {
  const l = arc.arcLayout(1440, 900);
  assert.deepEqual(l.hub, { x: 1404, y: 450 });
  assert.equal(l.radius, 236);
  // Join requests sits straight left of the planet, 76px across.
  const hot = l.bubbles[3];
  assert.equal(hot.size, 76);
  assert.equal(hot.left + hot.size / 2, 1404 - 236);
  assert.equal(hot.top + hot.size / 2, 450);
  // The top and bottom bubbles mirror each other across the planet's line.
  const top = l.bubbles[0];
  const bottom = l.bubbles[6];
  assert.equal(top.left, bottom.left);
  assert.equal(450 - (top.top + top.size / 2), bottom.top + bottom.size / 2 - 450);
  assert.ok(top.top < bottom.top, "Invite and share is on top");
});

test("every bubble springs out from the planet's centre", () => {
  const l = arc.arcLayout(1280, 800);
  for (const b of l.bubbles) {
    assert.ok(Math.abs(b.left + b.size / 2 + b.fromX - l.hub.x) <= 1, `${b.id} x`);
    assert.ok(Math.abs(b.top + b.size / 2 + b.fromY - l.hub.y) <= 1, `${b.id} y`);
  }
});

test("the arc stays inside the window, bob and margin included, down to a short laptop window", () => {
  for (const height of [900, 720, 600, 520, 460, 400]) {
    const l = arc.arcLayout(1280, height);
    for (const b of l.bubbles) {
      assert.ok(b.top - ARC.bob >= ARC.margin - 1, `${height}px: ${b.id} clears the top (${b.top})`);
      assert.ok(b.top + b.size + ARC.bob <= height - ARC.margin + 1, `${height}px: ${b.id} clears the bottom`);
    }
  }
});

test("neighbouring bubbles never overlap, and never shrink under 48px", () => {
  for (const height of [900, 600, 460, 400, 340]) {
    const l = arc.arcLayout(1280, height);
    for (const b of l.bubbles) assert.ok(b.size >= ARC.minBubble, `${height}px: ${b.id} is ${b.size}px`);
    for (let i = 1; i < l.bubbles.length; i += 1) {
      const a = l.bubbles[i - 1];
      const b = l.bubbles[i];
      const d = Math.hypot(a.left + a.size / 2 - (b.left + b.size / 2), a.top + a.size / 2 - (b.top + b.size / 2));
      assert.ok(d >= (a.size + b.size) / 2 - 2, `${height}px: ${a.id} and ${b.id} are ${d.toFixed(1)}px apart`);
    }
  }
});

test("the card sits left of the arc with the board's 42px gap, 372 wide, clear of the left menu when it can be", () => {
  const l = arc.arcLayout(1440, 900, arc.FRAME_MENU_WIDTH + ARC.margin);
  const hot = l.bubbles[3];
  assert.equal(l.card.width, 372);
  assert.equal(hot.left - (l.card.left + l.card.width), 42);
  // At 900px the card narrows to stay off the 200px menu, but no narrower than 300.
  const narrow = arc.arcLayout(900, 800, arc.FRAME_MENU_WIDTH + ARC.margin);
  assert.ok(narrow.card.left >= arc.FRAME_MENU_WIDTH + ARC.margin);
  assert.ok(narrow.card.width >= ARC.cardMinWidth && narrow.card.width <= 372);
  // Too narrow for both: the card keeps its width and gives the menu up.
  const tight = arc.arcLayout(700, 800, arc.FRAME_MENU_WIDTH + ARC.margin);
  assert.ok(tight.card.left >= ARC.margin);
  assert.ok(tight.card.width > 0);
});

test("the close target covers the open planet", () => {
  const l = arc.arcLayout(1280, 800);
  assert.equal(l.closeSpot.size, Math.round(92 * 1.12));
  assert.ok(Math.abs(l.closeSpot.left + l.closeSpot.size / 2 - l.hub.x) <= 0.5);
  assert.ok(Math.abs(l.closeSpot.top + l.closeSpot.size / 2 - l.hub.y) <= 0.5);
});

test("counts on the bubbles and the planet", () => {
  assert.equal(arc.chipText(null), null);
  assert.equal(arc.chipText(0), null);
  assert.equal(arc.chipText(4), "4");
  assert.equal(arc.chipText(120), "99+");
  assert.equal(arc.planetCount(0), null);
  assert.equal(arc.planetCount(3), "3");
  assert.equal(arc.planetCount(12), "9+");
  assert.equal(arc.planetLabel(null), "Club tools");
  assert.equal(arc.planetLabel(0), "Club tools");
  assert.equal(arc.planetLabel(1), "Club tools, 1 wants to join");
  assert.equal(arc.planetLabel(2), "Club tools, 2 want to join");
});

test("each bubble's name, said and shown", () => {
  const counts = { requests: 1, members: 4, followers: 1200 };
  assert.equal(arc.bubbleLabel("requests", counts), "Join requests, 1 waiting");
  assert.equal(arc.bubbleLabel("members", counts), "Members, 4");
  assert.equal(arc.bubbleLabel("followers", counts), "Followers, 1,200");
  assert.equal(arc.bubbleLabel("events", counts), "Past events, who came");
  assert.equal(arc.bubbleLabel("settings", counts), "Club settings");
  assert.equal(arc.bubbleLabel("requests", { requests: 0, members: null, followers: null }), "Join requests, no one waiting");
  // A failed read says nothing rather than a zero.
  assert.equal(arc.bubbleLabel("requests", { requests: null, members: null, followers: null }), "Join requests");
  assert.equal(arc.bubbleLabel("members", { requests: null, members: null, followers: null }), "Members");
});

test("the cards' first lines", () => {
  assert.equal(arc.requestsSub(0), "No one is waiting");
  assert.equal(arc.requestsSub(1), "1 person is waiting on you");
  assert.equal(arc.requestsSub(3), "3 people are waiting on you");
  assert.equal(arc.membersSub(4), "4 in the club");
  assert.equal(arc.membersSub(null), "Who's in the club");
  assert.equal(arc.followersSub(1), "1 follows the club");
  assert.equal(arc.followersSub(6), "6 follow the club");
  assert.equal(arc.followersSub(null), "People who follow the club");
});

const roster = [
  { user_id: "m2", role: "member", joined_at: "2026-10-03", title: null, name: "Casey Purdue", handle: "casey", avatar_url: null },
  { user_id: "o1", role: "admin", joined_at: "2026-10-02", title: null, name: "Maya Okafor", handle: "maya", avatar_url: null },
  { user_id: "m1", role: "member", joined_at: "2026-10-02", title: "Social chair", name: "Blake Student", handle: "blake", avatar_url: null },
  { user_id: "own", role: "owner", joined_at: "2026-10-01", title: null, name: "Priya Raman", handle: "priya", avatar_url: "https://x/p.png" },
];

test("the Members card: the route's order, a title or the handle under the name, the role as the chip", () => {
  const rows = arc.memberPreview(roster, "o1");
  assert.deepEqual(rows.map((r) => r.id), ["own", "o1", "m1", "m2"]);
  assert.deepEqual(rows[0], { id: "own", name: "Priya Raman", handle: "priya", avatarUrl: "https://x/p.png", line: "@priya", tag: "Owner" });
  assert.equal(rows[1].line, "@maya · you");
  assert.equal(rows[1].tag, "Officer");
  assert.equal(rows[2].line, "Social chair");
  assert.equal(rows[2].tag, null);
  assert.equal(arc.memberPreview(roster, null, 2).length, 2);
});

test("Officers and titles: the owner, the officers and titled members, a title before a role", () => {
  const rows = arc.officerLines(roster, "own");
  assert.deepEqual(rows.map((r) => r.id), ["own", "o1", "m1"]);
  assert.equal(rows[0].line, "Runs the club · you");
  assert.equal(rows[0].tag, "Owner");
  assert.equal(rows[1].line, "Helps run the club");
  assert.equal(rows[2].line, "A member with a title");
  assert.equal(rows[2].tag, "Social chair");
});

test("names, initials and the avatar tint", () => {
  assert.equal(arc.displayName("  ", "maya"), "@maya");
  assert.equal(arc.displayName(null, null), "Someone");
  assert.equal(arc.initials("Maya Okafor", "maya"), "MO");
  assert.equal(arc.initials(null, "maya"), "M");
  assert.equal(arc.avatarTint("abc"), arc.avatarTint("abc"));
  for (const id of ["a", "b", "own", "df5ab44e"]) assert.ok(arc.avatarTint(id) >= 0 && arc.avatarTint(id) < 4);
  assert.equal(arc.arcRoleWord("admin"), "Officer");
  assert.equal(arc.arcRoleWord("weird"), "Member");
});
