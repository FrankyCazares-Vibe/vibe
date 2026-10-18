/**
 * Tests for `follow-label.ts`: the four words on every follow button for a
 * person (Follow / Following ✓ / Follow back / Connected ✓), and the static
 * desktop profile's twin of them in public/html/profile.html.
 *
 * Run with:
 *   node --test src/lib/people/follow-label.test.ts
 *
 * The subject loads through a variable specifier: a literal ".ts" import
 * breaks `tsc` (TS5097), and the module has no imports, so no resolve hook
 * is needed.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const specifier = "./follow-label.ts";
const mod = (await import(specifier)) as typeof import("./follow-label");
const {
  CONNECTED_MEANING,
  FOLLOW_LABELS,
  asPersonFollowState,
  followButton,
  followButtonFor,
  followFactsOf,
  followFailureLine,
  followStateAfterTap,
  followStateOf,
  personName,
} = mod;

const STATES = ["none", "following", "followed_by", "connected"] as const;
const repoFile = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
// The source without its whole-line comments, which quote the labels freely.
const codeLines = (source: string) =>
  source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*|<!--|\{\/\*)/.test(line))
    .join("\n");
// A label in any kind of quotes: 'x', "x" or `x`.
const quoted = (label: string) => new RegExp(`(['"\`])${label}\\1`, "g");
// The body of one top-level function in a static page.
const staticFunction = (source: string, name: string) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} is missing`);
  const end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end > start ? end : undefined);
};

test("the four words, one per meaning", () => {
  assert.deepEqual(
    { ...FOLLOW_LABELS },
    { none: "Follow", following: "Following ✓", followed_by: "Follow back", connected: "Connected ✓" },
  );
  assert.ok(Object.isFrozen(FOLLOW_LABELS));
  assert.equal(CONNECTED_MEANING, "You follow each other. DMs go straight to the inbox.");
});

test("the state comes from the two facts", () => {
  assert.equal(followStateOf({ iFollow: false, followsMe: false }), "none");
  assert.equal(followStateOf({ iFollow: true, followsMe: false }), "following");
  assert.equal(followStateOf({ iFollow: false, followsMe: true }), "followed_by");
  assert.equal(followStateOf({ iFollow: true, followsMe: true }), "connected");
  for (const s of STATES) assert.equal(followStateOf(followFactsOf(s)), s);
});

test("label, tone and tap for each state", () => {
  const seen = STATES.map((s) => {
    const b = followButton(followFactsOf(s));
    return [b.state, b.label, b.tone, b.tap];
  });
  assert.deepEqual(seen, [
    ["none", "Follow", "follow", "follow"],
    ["following", "Following ✓", "quiet", "unfollow"],
    ["followed_by", "Follow back", "back", "follow"],
    ["connected", "Connected ✓", "quiet", "unfollow"],
  ]);
});

test("a server state outside the four reads as Follow", () => {
  for (const s of ["self", "", "pending", null, undefined]) {
    assert.equal(asPersonFollowState(s), "none");
    assert.equal(followButtonFor(s).label, "Follow");
  }
  for (const s of STATES) assert.equal(followButtonFor(s).label, FOLLOW_LABELS[s]);
});

test("a tap changes only my side", () => {
  assert.equal(followStateAfterTap("none"), "following");
  assert.equal(followStateAfterTap("following"), "none");
  assert.equal(followStateAfterTap("followed_by"), "connected");
  assert.equal(followStateAfterTap("connected"), "followed_by");
  for (const s of STATES) assert.equal(followStateAfterTap(followStateAfterTap(s)), s);
});

test("failure lines use follow words, never connect", () => {
  assert.equal(followFailureLine("follow", "Sam Lee"), "Couldn't follow Sam Lee.");
  assert.equal(followFailureLine("unfollow", "@sam"), "Couldn't unfollow @sam.");
  assert.equal(followFailureLine("follow", "  "), "Couldn't follow them.");
  assert.equal(followFailureLine("follow", null), "Couldn't follow them.");
  assert.equal(personName({ name: " Sam ", handle: "sam" }), "Sam");
  assert.equal(personName({ name: null, handle: "sam" }), "@sam");
  assert.equal(personName({ name: "", handle: null }), null);
});

// ── The static profile's twin ───────────────────────────────────────────────

const profileHtml = repoFile("public/html/profile.html");

test("profile.html keeps the same four labels and meaning", () => {
  const block = /const VIBE_FOLLOW_LABELS = Object\.freeze\(\{([\s\S]*?)\}\);/.exec(profileHtml);
  assert.ok(block, "VIBE_FOLLOW_LABELS is missing from profile.html");
  const pairs = Object.fromEntries([...block[1].matchAll(/(\w+):\s*'([^']*)'/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(pairs, { ...FOLLOW_LABELS });
  const meaning = /const VIBE_CONNECTED_MEANING = '([^']*)';/.exec(profileHtml);
  assert.equal(meaning?.[1], CONNECTED_MEANING);
  // Every label on the page is read from that block, not typed again, in
  // any quotes ('Follow' is also the search pill for a kind that isn't a
  // person).
  const code = codeLines(profileHtml);
  for (const label of [FOLLOW_LABELS.following, FOLLOW_LABELS.followed_by, FOLLOW_LABELS.connected]) {
    assert.equal(code.match(quoted(label))?.length ?? 0, 1, `${label} typed outside VIBE_FOLLOW_LABELS`);
  }
  // The old words, without the ✓, are gone as labels too. One exception, in
  // the open: the Clubs section's heading over the clubs you follow
  // (VIBE_CLUBS_COPY.following, a twin of CLUBS_COPY.following), never a
  // person's button. It is the block's only 'Following', and the block is
  // left out of the count below.
  const clubsCopy = /const VIBE_CLUBS_COPY = Object\.freeze\(\{[\s\S]*?\n\}\);/.exec(code);
  assert.ok(clubsCopy, "VIBE_CLUBS_COPY is missing from profile.html");
  assert.equal(clubsCopy[0].match(quoted("Following"))?.length ?? 0, 1);
  assert.match(clubsCopy[0], /\n {2}following: 'Following',\n/);
  const outsideClubsCopy = code.replace(clubsCopy[0], "");
  assert.equal(outsideClubsCopy.match(quoted("Following"))?.length ?? 0, 0, "a bare 'Following' label in profile.html");
  assert.equal(code.match(quoted("Connected"))?.length ?? 0, 0, "a bare 'Connected' label in profile.html");
});

test("profile.html paints the header and the search pill from VIBE_FOLLOW_LABELS", () => {
  const header = staticFunction(profileHtml, "setVibeRelState");
  for (const ref of ["VIBE_FOLLOW_LABELS[state]", "VIBE_FOLLOW_LABELS.following", "VIBE_FOLLOW_LABELS.connected"]) {
    assert.ok(header.includes(ref), `setVibeRelState no longer reads ${ref}`);
  }
  const pill = staticFunction(profileHtml, "renderProfSR");
  assert.ok(pill.includes("VIBE_FOLLOW_LABELS[vibeFollowStateOf(r.rel)]"), "renderProfSR types its own person label");
  for (const word of ["Message", "Following", "Connect", "Pending"]) {
    assert.ok(!quoted(word).test(codeLines(pill)), `renderProfSR types '${word}'`);
  }
});

test("profile.html moves between states the same way", () => {
  const start = profileHtml.indexOf("function vibeFollowStateOf(");
  const end = profileHtml.indexOf("let vibeRelState");
  assert.ok(start > 0 && end > start, "the static state helpers moved");
  const make = new Function(
    `${profileHtml.slice(start, end)}\nreturn { vibeFollowStateOf, vibeFollowStateAfterTap };`,
  ) as () => { vibeFollowStateOf: (s: unknown) => string; vibeFollowStateAfterTap: (s: unknown) => string };
  const twin = make();
  for (const s of [...STATES, "self", "pending", undefined]) {
    assert.equal(twin.vibeFollowStateOf(s), asPersonFollowState(s as string | undefined), String(s));
    assert.equal(twin.vibeFollowStateAfterTap(s), followStateAfterTap(s as string | undefined), String(s));
  }
});

// ── No approval words left on a people button ───────────────────────────────

const PEOPLE_SITES = [
  "src/components/mobile/ProfileMobile.tsx",
  "src/components/mobile/NetworkMobile.tsx",
  "src/components/mobile/MutualsSheet.tsx",
  "src/components/mobile/PostAudienceSheet.tsx",
  "src/components/mobile/OttoMobile.tsx",
  "src/components/network/UserCard.tsx",
  "src/components/otto/OttoRequests.tsx",
  "src/components/otto/OttoPageClient.tsx",
  "src/app/campus/campus-home.tsx",
  "public/html/profile.html",
  "public/html/messages.html",
];

const RETIRED: Array<[string, RegExp]> = [
  ["Connect (as a label)", /["'`>]\s*\+?\s*Connect\s*["'`<]/],
  ["Connect back", /Connect back/],
  ["Pending (as a label)", /["'`]Pending["'`]/],
  ["the hourglass", /⌛|&#8987;/],
  ["Follow instead", /Follow instead/],
  ["connection request", /connection request/i],
  ["Connection pending", /Connection pending/],
  ["wants to connect", /wants to connect/],
  ["Connect again", /Connect again/],
  ["Couldn't connect with them", /Couldn't connect with them/],
  ["connect with (someone)", /\bconnect with\b/i],
  ["once you connect", /once you connect/i],
  ["connection removed", /connection removed/i],
];

for (const path of PEOPLE_SITES) {
  test(`${path} has no approval words`, () => {
    const source = repoFile(path);
    for (const [name, re] of RETIRED) assert.ok(!re.test(source), `${name} in ${path}`);
  });
}

test("the React sites read the labels from follow-label.ts", () => {
  for (const path of PEOPLE_SITES.filter((p) => p.endsWith(".tsx"))) {
    const code = codeLines(repoFile(path));
    for (const label of ["Following ✓", "Follow back", "Connected ✓"]) {
      assert.ok(!quoted(label).test(code), `"${label}" typed in ${path}`);
    }
    // The old "Following" (no ✓) as a button label. A tab or a section
    // called Following (label: "Following", title="Following") is fine.
    assert.ok(!/(?<!label:\s*|title=)(["'`])Following\1/.test(code), `a bare "Following" label in ${path}`);
  }
});
