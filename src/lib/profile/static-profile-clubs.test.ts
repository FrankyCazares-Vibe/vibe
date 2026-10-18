/**
 * The static desktop profile's clubs (club model wave 3A) pinned to the phone's
 * rules. public/html/profile.html hand-copies `clubs-model.ts` and the flair
 * helpers of `club-flair.ts` between `// clubs-twin:start` and
 * `// clubs-twin:end`; this file runs that block beside the React helpers on
 * the same inputs, so a rule changed on one side fails here until the other
 * side is copied. The drawing code (`// clubs-ui:start` … `end`) and the
 * page's CSS are pinned as text.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/profile/static-profile-clubs.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";
import vm from "node:vm";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("static-profile-clubs.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    return nextResolve(specifier, context);
  },
});

const modelSpecifier = "../../components/profile/clubs-model.ts";
const model = (await import(modelSpecifier)) as typeof import("../../components/profile/clubs-model");
const flairSpecifier = "./club-flair.ts";
const flair = (await import(flairSpecifier)) as typeof import("./club-flair");

type Member = import("../../components/profile/clubs-model").MyMemberClub;
type Fn = (...args: never[]) => unknown;

const REPO_ROOT = new URL("../../../", import.meta.url);
const html = readFileSync(new URL("public/html/profile.html", REPO_ROOT), "utf8");

/** The text between two markers that each appear exactly once. */
function region(start: string, end: string): string {
  assert.equal(html.split(start).length - 1, 1, `${start} must appear once in profile.html`);
  assert.equal(html.split(end).length - 1, 1, `${end} must appear once in profile.html`);
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  assert.ok(b > a, `${end} comes before ${start}`);
  return html.slice(a + start.length, b);
}

const twinSource = region("// clubs-twin:start", "// clubs-twin:end");
const uiSource = region("// clubs-ui:start", "// clubs-ui:end");
const cssSource = region("/* clubs-css:start */", "/* clubs-css:end */");

const TWIN_NAMES = [
  "VIBE_CLUBS_COPY",
  "VIBE_FLAIR_CHIP_MAX",
  "VIBE_CLUB_RANK_MAX",
  "vibeFillClubCopy",
  "vibeReadPublicClubs",
  "vibeReadMyClubs",
  "vibeReadFollowedPage",
  "vibeShownFromMine",
  "vibeMemberSinceText",
  "vibeClubFlairLabel",
  "vibeFlairChips",
  "vibePatchMember",
  "vibeCanMoveClub",
  "vibeMoveClub",
  "vibeClubMenuActions",
  "vibeClubTitleIsNew",
  "vibeShowsNewTitleMark",
  "vibeMyClubSubline",
  "vibeShownClubSubline",
] as const;
const twin = new Function(`${twinSource}\nreturn { ${TWIN_NAMES.join(", ")} };`)() as Record<string, unknown> & {
  [K in Exclude<(typeof TWIN_NAMES)[number], "VIBE_CLUBS_COPY" | "VIBE_FLAIR_CHIP_MAX" | "VIBE_CLUB_RANK_MAX">]: Fn;
};

/** The twin and the React helper give the same answer for every input. */
function same(name: string, twinFn: Fn, reactFn: Fn, inputs: readonly unknown[][]): void {
  for (const args of inputs) {
    const label = `${name}(${JSON.stringify(args, (_k, v) => (v instanceof Set ? [...v] : v))})`;
    assert.deepEqual(
      (twinFn as (...a: unknown[]) => unknown)(...args),
      (reactFn as (...a: unknown[]) => unknown)(...args),
      label,
    );
  }
}

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

// ── The copy and the numbers ────────────────────────────────────────────────

test("the copy is CLUBS_COPY, character for character", () => {
  assert.deepEqual({ ...(twin.VIBE_CLUBS_COPY as object) }, { ...model.CLUBS_COPY });
  assert.ok(Object.isFrozen(twin.VIBE_CLUBS_COPY));
});

test("the chip cap and the rank cap match", () => {
  assert.equal(twin.VIBE_FLAIR_CHIP_MAX, flair.FLAIR_CHIP_MAX);
  assert.equal(twin.VIBE_CLUB_RANK_MAX, model.RANK_MAX);
  assert.equal(twin.VIBE_CLUB_RANK_MAX, flair.PROFILE_RANK_MAX);
});

test("filling a line: one pass, unknown keys left alone", () => {
  same("fill", twin.vibeFillClubCopy, model.fillClubCopy as Fn, [
    [model.CLUBS_COPY.unfollowed, { org: "SAE" }],
    [model.CLUBS_COPY.options, { org: "{org} Club" }],
    [model.CLUBS_COPY.memberSince, {}],
    ["{a}{b}{a}", { a: "1" }],
  ]);
});

// ── Reading the routes ──────────────────────────────────────────────────────

const PUBLIC_BODIES: unknown[][] = [
  [undefined],
  [null],
  [{}],
  ["clubs"],
  [[]],
  [[
    { handle: "sae", name: "SAE", logo_url: "/x.png", verified: true, title: " President ", since: "2026-09" },
    { handle: "", name: "No handle" },
    { handle: "chess", name: "Chess", title: "", since: "Sep 2026" },
    { handle: "sae", name: "SAE again" },
    { handle: "film", name: " Film ", logo_url: "  ", verified: "true", title: 5, since: "2026-13", role: "owner" },
    "junk",
    null,
    [],
  ]],
];

test("the public list reads the same", () => {
  same("readPublicClubs", twin.vibeReadPublicClubs, model.readPublicClubs as Fn, PUBLIC_BODIES);
});

const MY_BODY = {
  ok: true,
  member_of: [
    { org_id: "a", handle: "sae", name: "SAE", logo_url: "/l.png", verified: true, role: "owner", title: "President", show_title: false, since: "2026-09", show_on_profile: true, profile_rank: 0, muted: false },
    { org_id: "b", handle: "chess", name: "Chess", title: null, since: "bad", show_on_profile: false, profile_rank: 1.5, muted: true },
    { org_id: "", handle: "x", name: "X" },
    { org_id: "z", handle: "zed", name: "Zed", show_title: "no", show_on_profile: 0, profile_rank: 3 },
    "junk",
  ],
  following: [
    { org_id: "a", handle: "sae", name: "SAE" },
    { org_id: "c", handle: "film", name: "Film", muted: true, followed_at: "2026-10-01T00:00:00Z" },
    { org_id: "d", handle: "", name: "No handle" },
  ],
  following_next_cursor: " cur ",
  muted_only: [
    { org_id: "c", handle: "film", name: "Film" },
    { org_id: "e", handle: "run", name: "Run", muted: false },
  ],
};

test("my clubs read the same", () => {
  same("readMyClubs", twin.vibeReadMyClubs, model.readMyClubs as Fn, [
    [MY_BODY],
    [{ ...MY_BODY, muted_only: undefined, following_next_cursor: "" }],
    [{ member_of: [], following: [] }],
    [{ member_of: [] }],
    [{ member_of: {}, following: [] }],
    [null],
    [[]],
  ]);
});

test("one more page of Following reads the same", () => {
  const page = {
    orgs: [
      { id: "f", handle: "f", name: "F", muted: true },
      { id: "g", handle: "g", name: "G", member_role: "member" },
      { id: "f", handle: "f", name: "F twice" },
      { id: "h", handle: "h", name: "H" },
      { id: "", handle: "i", name: "I" },
    ],
    next_cursor: "n",
  };
  same("readFollowedPage", twin.vibeReadFollowedPage, model.readFollowedPage as Fn, [
    [page, new Set<string>()],
    [page, new Set(["h"])],
    [{ ...page, next_cursor: null }, new Set<string>()],
    [{ orgs: null }, new Set<string>()],
    [null, new Set<string>()],
  ]);
});

// ── What shows ──────────────────────────────────────────────────────────────

const MINE = model.readMyClubs(MY_BODY)!.member_of;
const MEMBERS: Member[] = [
  ...MINE,
  member("t", { title: "Treasurer", show_title: true, since: null }),
  member("u", { title: "Chair", show_title: false, show_on_profile: false }),
];

test("what a visitor sees of mine, and each row's second line, read the same", () => {
  same("shownFromMine", twin.vibeShownFromMine, model.shownFromMine as Fn, [[MEMBERS], [[]]]);
  same("myClubSubline", twin.vibeMyClubSubline, model.myClubSubline as Fn, MEMBERS.map((m) => [m]));
  const shown = model.shownFromMine(MEMBERS);
  same("shownClubSubline", twin.vibeShownClubSubline, model.shownClubSubline as Fn, [
    ...shown.map((c) => [c]),
    [{ handle: "x", name: "X", logo_url: null, verified: false, title: null, since: null }],
  ]);
});

test("'Member since' reads the same", () => {
  same(
    "memberSinceText",
    twin.vibeMemberSinceText,
    model.memberSinceText as Fn,
    ["2026-09", "2026-01", "2026-12", "2026-13", "2026-00", "2026-9", "Sep 2026", "", null, undefined, 202609].map((v) => [v]),
  );
});

test("the chips read the same: up to three, titled first, no dates", () => {
  same("clubFlairLabel", twin.vibeClubFlairLabel, flair.clubFlairLabel as Fn, [
    ["SAE", "President"],
    ["SAE", " Pres "],
    ["SAE", "  "],
    ["SAE", null],
    ["SAE", undefined],
  ]);
  const clubs = [
    { name: "A", title: null },
    { name: "B", title: "Pres" },
    { name: "C", title: "  " },
    { name: "D", title: "VP" },
    { name: "E", title: null },
  ];
  same("flairChips", twin.vibeFlairChips, flair.flairChips as Fn, [
    [clubs],
    [clubs, undefined],
    [clubs, 0],
    [clubs, -1],
    [clubs, 2],
    [clubs, 10],
    [[]],
  ]);
});

// ── My changes ──────────────────────────────────────────────────────────────

function list(n: number): Member[] {
  return Array.from({ length: n }, (_, i) => member(`m${i}`, { profile_rank: i % 3 === 0 ? i : null }));
}

test("moving a club, and whether it can move, read the same (the 50 cap included)", () => {
  for (const l of [list(1), list(3), list(52)]) {
    const cases: unknown[][] = [];
    for (const m of [...l, member("missing")]) for (const dir of [-1, 1]) cases.push([l, m.org_id, dir]);
    same("canMove", twin.vibeCanMoveClub, model.canMove as Fn, cases);
    same("moveClub", twin.vibeMoveClub, model.moveClub as Fn, cases);
  }
});

test("each ⋯ menu offers the sheet's rows, in its order", () => {
  const l = [member("a", { title: "President" }), member("b"), member("c", { title: "VP" })];
  const cases: unknown[][] = [];
  for (const standing of ["member", "following", "muted"]) {
    for (const id of ["a", "b", "c", "missing"]) cases.push([l, id, standing]);
  }
  same("clubSheetActions", twin.vibeClubMenuActions, model.clubSheetActions as Fn, cases);
  same("patchMember", twin.vibePatchMember, model.patchMember as Fn, [
    [l, "b", { show_on_profile: false, muted: true }],
    [l, "missing", { muted: true }],
  ]);
  same("titleIsNew", twin.vibeClubTitleIsNew, model.titleIsNew as Fn, [
    [{ org_id: "a", title: "President" }, {}],
    [{ org_id: "a", title: "President" }, { a: "President" }],
    [{ org_id: "a", title: "President" }, { a: "VP" }],
    [{ org_id: "a", title: null }, {}],
  ]);
  // Wave-3 review, finding 6: no "New title · shows on your profile" on a
  // club I hid, or on a title I hid.
  const mark = (show_on_profile: boolean, show_title: boolean, title: string | null, seen: Record<string, string> = {}) => [
    { org_id: "a", title, show_title, show_on_profile },
    seen,
  ];
  same("showsNewTitleMark", twin.vibeShowsNewTitleMark, model.showsNewTitleMark as Fn, [
    mark(true, true, "President"),
    mark(false, true, "President"),
    mark(true, false, "President"),
    mark(false, false, "President"),
    mark(true, true, "President", { a: "President" }),
    mark(true, true, null),
  ]);
});

// ── The drawing code, as text ───────────────────────────────────────────────

test("every inline script on the page still parses, as a script", () => {
  // One lost brace in this 12 000-line page stops every script on it, so the
  // clubs code is checked in place, not only on its own.
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(blocks.length >= 5);
  for (const [i, code] of blocks.entries()) {
    assert.doesNotThrow(() => new vm.Script(code, { filename: `profile.html <script> #${i}` }));
  }
  const main = blocks.find((b) => b.includes("// clubs-twin:start")) ?? "";
  assert.ok(main.includes("(function initProfilePage(){"), "initProfilePage left the clubs' script");
  assert.ok(main.indexOf("// clubs-ui:end") < main.indexOf("(function initProfilePage(){"), "the clubs code must sit above initProfilePage");
});

test("the page reads the same routes the phone does", () => {
  assert.ok(html.includes("/bootstrap?clubs=1`"), "the visitor bootstrap no longer asks for clubs");
  assert.ok(html.includes("_pclubsSetVisitor(r.data.clubs);"), "the visitor's clubs are not drawn");
  assert.ok(html.includes("if (user._appShell) _pclubsLoadMine();"), "your own clubs are not loaded");
  assert.match(uiSource, /vibeRequest\('\/api\/me\/clubs', \{ quiet: true/);
  assert.match(uiSource, /'\/api\/me\/clubs\/' \+ encodeURIComponent\(orgId\)/);
  assert.match(uiSource, /method: 'PATCH', json: body/);
  assert.match(uiSource, /'\/api\/me\/followed-orgs\?cursor=' \+ encodeURIComponent\(cursor\)/);
  assert.match(uiSource, /'\/api\/orgs\/' \+ encodeURIComponent\(club\.handle\) \+ '\/follow', \{\s*method: 'DELETE'/);
  // "View as visitor" redraws the card as a visitor gets it.
  const toggle = /function toggleViewerMode\(\) \{[\s\S]*?\n\}/.exec(html)?.[0] ?? "";
  assert.ok(toggle.includes("_pclubsOnPreviewToggle()"), "toggleViewerMode no longer redraws the clubs");
});

test("no role word reaches the page, and every line comes from the copy table", () => {
  assert.doesNotMatch(uiSource, /\.role\b|member_role/, "the drawing code reads a club role");
  for (const [key, line] of Object.entries(model.CLUBS_COPY)) {
    for (const q of ["'", '"']) {
      assert.ok(!uiSource.includes(`${q}${line}${q}`), `CLUBS_COPY.${key} is typed in the drawing code`);
    }
  }
  for (const word of ["Owner", "Officer", "Admin", "Mod"]) {
    assert.ok(!new RegExp(`['"\`]${word}\\b`).test(uiSource), `the drawing code types "${word}"`);
  }
});

test("the chips carry no dates", () => {
  const paintFlair = /function _pclubsPaintFlair\(\) \{[\s\S]*?\n\}/.exec(uiSource)?.[0] ?? "";
  assert.ok(paintFlair.includes("vibeFlairChips(_pclubsShown())"), "the chips are not vibeFlairChips");
  assert.ok(paintFlair.includes("vibeClubFlairLabel(club.name, club.title)"));
  assert.doesNotMatch(paintFlair, /since|MemberSince/i);
});

test("the markup: chips under the @handle, the card a side widget at the top of the side column", () => {
  const handleRow = html.indexOf('id="profileHandleRow"');
  const flairRow = html.indexOf('<ul class="pclub-flair" id="profileFlairRow"');
  const tagline = html.indexOf('<p class="profile-tagline"');
  assert.ok(handleRow > 0 && flairRow > handleRow && tagline > flairRow, "the flair row moved");
  const card = /<section class="([^"]*)" id="profileClubs"[^>]*>/.exec(html);
  assert.ok(card, "the Clubs card is missing");
  const classes = (card[1] ?? "").split(/\s+/);
  for (const c of ["stat-card", "pclubs", "pclubs-off"]) assert.ok(classes.includes(c), `the Clubs card lost .${c}`);
  assert.ok(card[0].includes('data-widget="clubs"'), "the Clubs card is not a widget (the layout can't move or hide it)");
  assert.doesNotMatch(card[0], /\shidden[\s>=]/, "`hidden` is the layout's eye, not the card's own switch (.pclubs-off)");
  assert.equal(html.split('id="profileClubs"').length - 1, 1);
  // Oct 18 2026: inside the side column, first (the default order), before
  // Resume and "Currently working on"; never above the grid any more.
  const grid = html.indexOf('<div class="profile-grid">');
  const right = html.indexOf('<div class="profile-right">');
  const rightEnd = html.indexOf("</div><!-- /profile-right -->");
  const resume = html.indexOf('data-widget="resume"');
  const workingOn = html.indexOf('data-widget="working_on"');
  assert.ok(grid > 0 && right > grid, "the side column is missing");
  assert.ok(card.index > right && card.index < rightEnd, "the Clubs card is not in the side column");
  assert.ok(card.index < resume && resume < workingOn, "the Clubs card does not lead the side column");
  assert.ok(html.slice(right, card.index).indexOf("data-widget=") < 0, "a widget sits above Clubs in the markup");
});

test("the card's own switch never touches `hidden`, and its eye takes the chips with it", () => {
  assert.doesNotMatch(uiSource, /section\.hidden\s*=/, "_pclubsPaint sets `hidden`, which the layout's eye owns");
  assert.match(uiSource, /section\.classList\.toggle\('pclubs-off', clubs\.length === 0\)/);
  assert.match(cssSource, /#profileClubs\.pclubs-off \{ display:none !important; \}/);
  const shown = /function _pclubsShown\(\) \{[\s\S]*?\n\}/.exec(uiSource)?.[0] ?? "";
  const visitorLine = shown.indexOf("if (window.viewingRealUser) return _pclubs.visitor || [];");
  const eyeLine = shown.indexOf("card.classList.contains('widget-hidden')) return [];");
  assert.ok(visitorLine > 0 && eyeLine > visitorLine, "my chips don't follow the Clubs eye");
  const apply = /function applyProfileLayout\(raw\) \{[\s\S]*?\n\}/.exec(html)?.[0] ?? "";
  assert.ok(apply.includes("_pclubsPaintFlair()"), "hiding Clubs doesn't repaint the chips");
});

// ── The widget layout: the page's mirror of profile-layout.ts ──────────────

const layoutSpecifier = "./profile-layout.ts";
const layoutTs = (await import(layoutSpecifier)) as typeof import("./profile-layout");
const layoutSource = region("// Mirror of src/lib/profile/profile-layout.ts. Keep in sync.", "// Any arrange-mode change:");

type FakeCard = { dataset: { widget: string }; classList: { contains: (c: string) => boolean } };
/** The page's layout code over a stand-in document: two columns of cards.
 *  `last`: the layout applyProfileLayout last painted, if any. */
function pageLayout(left: string[], right: string[], hidden: string[] = [], last: unknown = null) {
  const card = (id: string): FakeCard => ({
    dataset: { widget: id },
    classList: { contains: (c: string) => c === "widget-hidden" && hidden.includes(id) },
  });
  const document = {
    querySelectorAll(sel: string): FakeCard[] {
      if (sel === ".profile-left > [data-widget]") return left.map(card);
      if (sel === ".profile-right > [data-widget]") return right.map(card);
      if (sel === "[data-widget].widget-hidden") return hidden.map(card);
      throw new Error(`unexpected selector ${sel}`);
    },
  };
  return new Function(
    "document",
    "__last",
    `${layoutSource}\n_profileLayoutLast = __last ? _sanitizeProfileLayout(__last) : null;\nreturn { _WIDGET_IDS, _WIDGET_SIDE_IDS, _sanitizeProfileLayout, _readProfileLayoutFromDom };`,
  )(document, last) as {
    _WIDGET_IDS: string[];
    _WIDGET_SIDE_IDS: string[];
    _sanitizeProfileLayout: (raw: unknown) => unknown;
    _readProfileLayoutFromDom: () => { order: string[]; hidden: string[]; bioSide: boolean };
  };
}

test("the page's layout sanitizer is profile-layout.ts's, clubs included", () => {
  const page = pageLayout([], []);
  assert.deepEqual(page._WIDGET_IDS, [...layoutTs.WIDGET_IDS]);
  assert.deepEqual(page._WIDGET_SIDE_IDS, ["clubs", "resume", "working_on"]);
  const OLD = ["bio", "experience", "skills", "posts", "resume", "working_on"];
  for (const raw of [
    undefined,
    null,
    {},
    { v: 1, order: OLD, hidden: [], bioSide: false },
    { v: 1, order: ["posts", "working_on", "bio", "resume", "skills", "experience"], hidden: ["resume", "posts"], bioSide: true },
    { order: ["bio", "resume", "clubs", "x"], hidden: ["clubs", "clubs"] },
    { order: "clubs", hidden: "clubs" },
  ]) {
    assert.deepEqual(page._sanitizeProfileLayout(raw), layoutTs.sanitizeProfileLayout(raw), JSON.stringify(raw));
  }
});

test("saving from the page: Clubs at the top of the side column leads the order, so the phone keeps it first", () => {
  const LEFT = ["bio", "experience", "skills", "posts"];
  const top = pageLayout(LEFT, ["clubs", "resume", "working_on"])._readProfileLayoutFromDom();
  assert.deepEqual(top.order, [...layoutTs.WIDGET_IDS]);
  assert.equal(layoutTs.isDefaultLayout(layoutTs.sanitizeProfileLayout(top)), true, "an untouched page saves the default");
  // Docked bio: bio first, then clubs.
  const docked = pageLayout(["experience", "skills", "posts"], ["bio", "clubs", "resume", "working_on"])._readProfileLayoutFromDom();
  assert.deepEqual(docked.order, ["bio", "clubs", "experience", "skills", "posts", "resume", "working_on"]);
  assert.equal(docked.bioSide, true);
  // Dragged under "Currently working on": after the main column, like the others.
  const low = pageLayout(LEFT, ["resume", "working_on", "clubs"], ["clubs"])._readProfileLayoutFromDom();
  assert.deepEqual(low.order, ["bio", "experience", "skills", "posts", "resume", "working_on", "clubs"]);
  assert.deepEqual(low.hidden, ["clubs"]);
});

test("saving from the page keeps a side card's slot from the phone while the side column's order holds", () => {
  // The phone put Clubs after Experience; the page paints it top of the side column.
  const PHONE = { v: 1, order: ["bio", "experience", "clubs", "skills", "posts", "resume", "working_on"], hidden: [], bioSide: false };
  const SIDE = ["clubs", "resume", "working_on"];
  // Hiding Skills on the desktop: Clubs stays after Experience.
  const eye = pageLayout(["bio", "experience", "skills", "posts"], SIDE, ["skills"], PHONE)._readProfileLayoutFromDom();
  assert.deepEqual(eye.order, PHONE.order);
  assert.deepEqual(eye.hidden, ["skills"]);
  // A main-column move keeps the slot too (the third place).
  const moved = pageLayout(["skills", "bio", "experience", "posts"], SIDE, [], PHONE)._readProfileLayoutFromDom();
  assert.deepEqual(moved.order, ["skills", "bio", "clubs", "experience", "posts", "resume", "working_on"]);
  // Docking the bio: bio leads, the rest keep their slots.
  const docked = pageLayout(["experience", "skills", "posts"], ["bio", ...SIDE], [], PHONE)._readProfileLayoutFromDom();
  assert.deepEqual(docked.order, ["bio", "experience", "clubs", "skills", "posts", "resume", "working_on"]);
  assert.equal(docked.bioSide, true);
  // Reordering the side column itself is a new choice: the column decides again.
  const dragged = pageLayout(["bio", "experience", "skills", "posts"], ["resume", "clubs", "working_on"], [], PHONE)._readProfileLayoutFromDom();
  assert.deepEqual(dragged.order, ["bio", "experience", "skills", "posts", "resume", "clubs", "working_on"]);
  const top = pageLayout(["bio", "experience", "skills", "posts"], SIDE, [], { ...PHONE, order: [...PHONE.order.filter((id) => id !== "clubs"), "clubs"] })._readProfileLayoutFromDom();
  assert.deepEqual(top.order, [...layoutTs.WIDGET_IDS], "dragged to the top of the side column, Clubs leads again");
  // Right after a paint, reading the page gives back what was painted.
  const same = pageLayout(["bio", "experience", "skills", "posts"], SIDE, [], PHONE)._readProfileLayoutFromDom();
  assert.deepEqual(same, layoutTs.sanitizeProfileLayout(PHONE));
});

/** The values a token gets in the first `selector {` block of the page. */
function tokenBlock(selector: string): string {
  const at = html.indexOf(`${selector} {`);
  assert.ok(at > 0, `${selector} is missing`);
  return html.slice(at, html.indexOf("}", at));
}

test("the CSS uses tokens only, each defined for Light and for Night", () => {
  assert.doesNotMatch(cssSource, /#[0-9a-f]{3,8}\b/i, "a hex colour in the clubs CSS");
  assert.doesNotMatch(cssSource, /rgba?\((?!var\()/, "a literal rgb colour in the clubs CSS");
  const light = tokenBlock(":root");
  const night = tokenBlock(':root[data-theme="dark"]');
  // Coral is the same in both looks (the Night block says so).
  const SAME_IN_BOTH = new Set(["--accent"]);
  const used = new Set([...cssSource.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
  assert.ok(used.size > 5);
  for (const name of used) {
    assert.ok(light.includes(`${name}:`), `${name} has no Light value`);
    if (!SAME_IN_BOTH.has(name)) assert.ok(night.includes(`${name}:`), `${name} has no Night value`);
  }
});
