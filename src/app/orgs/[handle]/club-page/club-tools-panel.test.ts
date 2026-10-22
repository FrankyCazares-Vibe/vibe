/**
 * Tests for `club-tools-panel.ts` (Club tools open in place; Oct 22, 2026):
 * the panel's width, what ← does from each screen, the words at the top, and
 * the planet's bloom covering the panel from the open planet's centre.
 *
 * Run with (from the folder: `node --test` reads a path as a pattern, and
 * `[handle]` would be a character class):
 *   cd "src/app/orgs/[handle]/club-page" && node --test club-tools-panel.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./club-tools-panel.ts";
const panel = (await import(specifier)) as typeof import("./club-tools-panel");

test("the panel is 560px wide and always leaves the page 280px", () => {
  assert.equal(panel.panelWidth(1440), 560);
  assert.equal(panel.panelWidth(900), 560);
  assert.equal(panel.panelWidth(800), 520);
  assert.equal(panel.panelWidth(200), 0);
});

test("a card opens the panel at its screen; All Club tools stacks the next screen; the same screen twice changes nothing", () => {
  const a = panel.openPanelAt(null, { screen: "requests" }, "requests");
  assert.deepEqual(a, { stack: [{ screen: "requests" }], from: "requests" });
  assert.equal(panel.openPanelAt(a, { screen: "requests" }, "members"), a);

  const index = panel.openPanelAt(null, { screen: "index" }, "invite");
  const members = panel.openPanelAt(index, { screen: "members" }, null);
  assert.deepEqual(members.stack.map((e) => e.screen), ["index", "members"]);
  // The card that opened it stays the one ← brings back.
  assert.equal(members.from, "invite");
  assert.equal(panel.panelTop(members).screen, "members");
});

test("← goes to the screen underneath, and from the first one back to the arc", () => {
  const index = panel.openPanelAt(null, { screen: "index" }, "invite");
  const settings = panel.openPanelAt(index, { screen: "settings" }, null);
  const back = panel.panelBack(settings);
  assert.ok(back);
  assert.deepEqual(back.stack, [{ screen: "index" }]);
  assert.equal(panel.panelBack(back), null);
});

test("the back button names where it goes", () => {
  const index = panel.openPanelAt(null, { screen: "index" }, "invite");
  assert.equal(panel.panelBackLabel(index, false), "Club tools");
  const link = panel.openPanelAt(index, { screen: "setup", step: "members_link" }, null);
  assert.equal(panel.panelBackLabel(link, false), "All Club tools");
});

test("each screen's heading is the phone page's", () => {
  assert.deepEqual(panel.panelHeading({ screen: "requests" }, false), { title: "Join requests", sub: "Approve or deny each one" });
  assert.equal(panel.panelHeading({ screen: "officers" }, false).title, "Officers and titles");
  assert.equal(panel.panelHeading({ screen: "index" }, false).title, "All Club tools");
  // A club with no setup list: the screen is its members' link alone.
  assert.equal(panel.panelHeading({ screen: "setup", step: "members_link" }, false).title, "Members' link");
  assert.equal(panel.panelHeading({ screen: "setup", step: "members_link" }, true).title, "Club setup");
});

test("screens with a step have their own key", () => {
  assert.equal(panel.panelKey({ screen: "members" }), "members");
  assert.equal(panel.panelKey({ screen: "setup", step: "members_link" }), "setup:members_link");
});

/** Every corner of the clip box sits inside the bloom's circle. */
function covers(b: ReturnType<typeof panel.panelBloom>): boolean {
  const r = b.size / 2;
  const cx = b.left + r;
  const cy = b.top + r;
  const corners = [
    [0, 0],
    [b.clip.width, 0],
    [0, b.clip.height],
    [b.clip.width, b.clip.height],
  ];
  return corners.every(([x, y]) => Math.hypot(x - cx, y - cy) <= r);
}

test("the bloom is centred on the open planet and reaches every corner of the panel", () => {
  const hub = { x: 1404, y: 450 };
  const b = panel.panelBloom(1440, 900, hub, 103);
  assert.deepEqual(b.clip, { left: 880, width: 560, height: 900 });
  // Its centre, back in the window, is the planet's.
  assert.equal(b.clip.left + b.left + b.size / 2, hub.x);
  assert.equal(b.top + b.size / 2, hub.y);
  assert.ok(covers(b));
  // It starts the open planet's size.
  assert.ok(Math.abs(b.size * b.from - 103) < 0.5);
});

test("the bloom covers the panel in a short window and a tall one too", () => {
  for (const [w, h] of [
    [900, 600],
    [1280, 800],
    [2560, 1440],
  ]) {
    const b = panel.panelBloom(w, h, { x: w - 36, y: h / 2 }, 103);
    assert.ok(covers(b), `${w}×${h}`);
    assert.ok(b.from > 0 && b.from < 1, `${w}×${h} from ${b.from}`);
  }
});
