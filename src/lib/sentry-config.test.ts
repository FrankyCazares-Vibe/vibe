/**
 * Tests for `sentry-config.ts`: the handle scrub added for the store privacy
 * forms (handoffs/wave-plan-pwa/critic-s1.md item 18), next to the auth-token
 * scrub it runs after, and the Privacy Policy's row 14: no request body, no
 * cookie, no header but the browser's name, and no value from the address of
 * a database call on an error or speed report. Then section 3d: no label of
 * a page element ("Photo posted by Jane Doe") and no account ID from an
 * element's id on a speed report, on the span the browser sends on its own,
 * or in the trace header next to it; the same scrub on the report the kit
 * sends about a failure of its own; and the three setup files, read as text,
 * to check each hands the kit the integration that does those last two. At
 * the end, the two errors from other people's software that are kept off
 * the reports.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/sentry-config.test.ts
 *
 * The module has only an `import type` line, which type stripping erases, so
 * it loads through a dynamic import of its ".ts" path, the same pattern as
 * `src/lib/mentions.test.ts`. The specifier goes through a variable because
 * tsc refuses a literal ".ts" specifier.
 *
 * Nothing is sent. No DSN is set, and the tests that run the installed kit
 * give it a transport that only records, with a DSN on the reserved
 * `.invalid` domain.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The function the browser kit names an element with, for a tap, the largest
// paint and a layout shift (metrics/inp.js, lcp.js, cls.js, browserMetrics.js).
import { htmlTreeAsString } from "@sentry/browser-utils";
import {
  Scope,
  SentrySpan,
  ServerRuntimeClient,
  eventFiltersIntegration,
  getIsolationScope,
  httpHeadersToSpanAttributes,
  httpRequestToRequestData,
  requestDataIntegration,
  stringMatchesSomePattern,
  withScope,
} from "@sentry/core";

const specifier = "./sentry-config.ts";
const {
  redactHandles,
  redactAuthTokens,
  redactClubLinks,
  redactDbCallValues,
  redactElementIds,
  redactElementLabels,
  scrubAuthTokensFromEvent,
  scrubSpan,
  scrubTraceHeader,
  reportScrubIntegration,
  REPORT_SCRUB_INTEGRATION_NAME,
  getSentryInitOptions,
} = (await import(specifier)) as typeof import("./sentry-config");

type AnyEvent = Parameters<typeof scrubAuthTokensFromEvent>[0];

/** Loose view of an event for assertions. */
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Runs the scrubber on a hand-built event and hands back a loose view. */
function scrub(event: unknown): Loose {
  return scrubAuthTokensFromEvent(event as AnyEvent) as unknown as Loose;
}

const ME = "5c1e0f2a-0000-4000-8000-000000000009";
const OTHER = "7d2f1a3b-1111-4111-8111-111111111111";
const DB = "https://abcd.supabase.co";

const PLACEHOLDER = "u" + "3f2a9c".padEnd(32, "0");

test("a profile path loses its handle and keeps the rest of the URL", () => {
  assert.equal(
    redactHandles("https://www.connectvibe.app/profile/franky_c?post=abc&welcome=1"),
    "https://www.connectvibe.app/profile/:handle?post=abc&welcome=1",
  );
  assert.equal(redactHandles("/profile/Franky"), "/profile/:handle");
  assert.equal(redactHandles("/profile/franky/"), "/profile/:handle/");
  assert.equal(redactHandles("/profile/franky#posts"), "/profile/:handle#posts");
  assert.equal(
    redactHandles("Navigated to /profile/franky from /campus"),
    "Navigated to /profile/:handle from /campus",
  );
});

test("the unclaimed placeholder handle is redacted too", () => {
  assert.equal(redactHandles(`/profile/${PLACEHOLDER}`), "/profile/:handle");
  assert.equal(redactHandles(`/api/users/${PLACEHOLDER}/posts`), "/api/users/:handle/posts");
});

test("per-handle API routes lose the handle", () => {
  assert.equal(
    redactHandles("/api/users/franky/posts?limit=20"),
    "/api/users/:handle/posts?limit=20",
  );
  assert.equal(redactHandles("GET /api/users/franky/bootstrap"), "GET /api/users/:handle/bootstrap");
});

test("search and by-id are routes, not handles", () => {
  for (const url of [
    "/api/users/search?q=fra",
    "/api/users/search",
    "/api/users/by-id/5c1e0f2a-0000-4000-8000-000000000009",
  ]) {
    assert.equal(redactHandles(url), url);
  }
});

test("chunk and source paths in stack frames are untouched", () => {
  for (const path of [
    "https://www.connectvibe.app/_next/static/chunks/app/profile/page-3f2a1b9c.js",
    "/_next/static/chunks/app/profile/%5Bhandle%5D/page-0a1b2c.js",
    "app:///_next/server/app/profile/[handle]/page.js",
    "webpack-internal:///(app-pages-browser)/./src/app/profile/profile-html-bridge.tsx",
    "./src/app/profile/ProfileSwitch.tsx",
    "/var/task/.next/server/app/api/users/[handle]/posts/route.js",
    "/html/profile.html?app=1",
  ]) {
    assert.equal(redactHandles(path), path);
  }
});

test("an encoded next= is redacted, once and twice encoded", () => {
  assert.equal(
    redactHandles("/auth/login?next=%2Fprofile%2Ffranky%3Fpost%3Dabc"),
    "/auth/login?next=%2Fprofile%2F:handle%3Fpost%3Dabc",
  );
  assert.equal(
    redactHandles("/auth/confirm?next=%252Fprofile%252Ffranky"),
    "/auth/confirm?next=%252Fprofile%252F:handle",
  );
  assert.equal(
    redactHandles("/auth/login?next=%2fapi%2fusers%2ffranky%2fposts"),
    "/auth/login?next=%2fapi%2fusers%2f:handle%2fposts",
  );
});

test("handle= and user= link values are redacted", () => {
  assert.equal(
    redactHandles("/html/profile.html?app=1&handle=franky&post=abc"),
    "/html/profile.html?app=1&handle=[redacted]&post=abc",
  );
  assert.equal(redactHandles("/html/profile.html?user=franky"), "/html/profile.html?user=[redacted]");
  assert.equal(redactHandles("/x?handle="), "/x?handle=");
  // Only those exact keys: user_id and handles= are other things.
  assert.equal(redactHandles("/rest/v1/posts?user_id=eq.1"), "/rest/v1/posts?user_id=eq.1");
});

test("tokens and handles in one link are both redacted", () => {
  const url = "/auth/confirm?token_hash=abc123&next=%2Fprofile%2Ffranky";
  assert.equal(
    redactHandles(redactAuthTokens(url)),
    "/auth/confirm?token_hash=[redacted]&next=%2Fprofile%2F:handle",
  );
});

test("a waitlist access code is redacted in a link and an encoded next=, and the body that held it is gone", () => {
  assert.equal(
    redactAuthTokens("https://www.connectvibe.app/auth/signup?access_code=VIBE-7KQ2-M9XD&src=mail"),
    "https://www.connectvibe.app/auth/signup?access_code=[redacted]&src=mail",
  );
  assert.equal(
    redactAuthTokens("/auth/login?next=%2Fauth%2Fsignup%3Faccess_code%3DVIBE-7KQ2-M9XD"),
    "/auth/login?next=%2Fauth%2Fsignup%3Faccess_code%3D[redacted]",
  );
  // The waitlist's manage link (?token=) was already covered; still is.
  assert.equal(
    redactAuthTokens("/waitlist/confirm?token=abcDEF_123-xyz&leave=1"),
    "/waitlist/confirm?token=[redacted]&leave=1",
  );
  // Only the exact key: a different name that ends in "code" is untouched.
  assert.equal(redactAuthTokens("/x?zip_code=46202"), "/x?zip_code=46202");

  const out = scrub({
    request: {
      url: "https://www.connectvibe.app/auth/signup?access_code=VIBE-7KQ2-M9XD",
      data: '{"email":"x","options":{"data":{"access_code":"VIBE-7KQ2-M9XD"}}}',
    },
  });
  assert.deepEqual(out.request, {
    url: "https://www.connectvibe.app/auth/signup?access_code=[redacted]",
  });
  assert.equal(JSON.stringify(out).includes("VIBE-7KQ2-M9XD"), false);
});

test("an event check-in link loses its token, in the address and in an encoded next=; the school-email check is untouched", () => {
  // The door screen's QR link (contract 2026-10-19 D5): the token checks
  // someone in for up to two minutes, so it never reaches a report.
  const event = "4f9c2b1e-3a7d-4c5e-9b8a-1d2e3f4a5b6c";
  const token = "UVxxReBJ3ewsgZRtrv3ISQ";
  assert.equal(
    redactAuthTokens(`https://www.connectvibe.app/campus/checkin/${event}?checkin=${token}`),
    `https://www.connectvibe.app/campus/checkin/${event}?checkin=[redacted]`,
  );
  // Signed out, the login page carries the page in next=; the page itself
  // drops the token first (contract 3.7), and this covers a link that kept it.
  const next = encodeURIComponent(`/campus/checkin/${event}?checkin=${token}`);
  assert.equal(
    redactAuthTokens(`/auth/login?next=${next}`),
    `/auth/login?next=${encodeURIComponent(`/campus/checkin/${event}`)}%3Fcheckin%3D[redacted]`,
  );
  assert.equal(
    redactAuthTokens(`/auth/login?next=${encodeURIComponent(`/auth/login?next=${next}`)}`).includes(token),
    false,
  );
  // "Check-in" also names the yearly school-email check; its route has no
  // `checkin=` parameter and stays as it was.
  assert.equal(redactAuthTokens("/api/me/school-checkin"), "/api/me/school-checkin");
  assert.equal(
    redactAuthTokens("https://www.connectvibe.app/api/me/school-checkin?x=1"),
    "https://www.connectvibe.app/api/me/school-checkin?x=1",
  );
  const out = scrub({ request: { url: `https://www.connectvibe.app/campus/checkin/${event}?checkin=${token}` } });
  assert.equal(JSON.stringify(out).includes(token), false);
});

test("the event scrub reaches urls and breadcrumbs but not frames, and drops the body", () => {
  const frame = "https://www.connectvibe.app/_next/static/chunks/app/profile/page-3f2a1b9c.js";
  const event = {
    transaction: "/profile/franky",
    request: {
      url: "https://www.connectvibe.app/profile/franky?post=abc",
      data: '{"handle":"franky","name":"Franky"}',
    },
    breadcrumbs: [
      { category: "navigation", data: { from: "/campus", to: "/html/profile.html?app=1&handle=franky" } },
      { category: "fetch", data: { url: "/api/users/franky/posts" } },
    ],
    exception: { values: [{ stacktrace: { frames: [{ filename: frame, abs_path: frame }] } }] },
  } as unknown as AnyEvent;

  const out = scrubAuthTokensFromEvent(event) as unknown as {
    transaction: string;
    request: { url: string; data?: string };
    breadcrumbs: Array<{ data: Record<string, string> }>;
    exception: { values: Array<{ stacktrace: { frames: Array<{ filename: string; abs_path: string }> } }> };
  };
  assert.equal(out.transaction, "/profile/:handle");
  assert.equal(out.request.url, "https://www.connectvibe.app/profile/:handle?post=abc");
  assert.equal("data" in out.request, false);
  assert.equal(out.breadcrumbs[0].data.to, "/html/profile.html?app=1&handle=[redacted]");
  assert.equal(out.breadcrumbs[1].data.url, "/api/users/:handle/posts");
  assert.equal(out.exception.values[0].stacktrace.frames[0].filename, frame);
  assert.equal(out.exception.values[0].stacktrace.frames[0].abs_path, frame);
});

test("the request body is dropped whatever its shape: JSON text, a form, an object, a list", () => {
  for (const data of [
    '{"text":"see you at the library at nine"}',
    "handle=franky&bio=hi",
    { handle: "franky", bio: "hi", access_code: "VIBE-7KQ2-M9XD" },
    ["see you at nine"],
    "",
    null,
  ]) {
    const out = scrub({ request: { url: "https://www.connectvibe.app/api/posts", method: "POST", data } });
    assert.deepEqual(out.request, { url: "https://www.connectvibe.app/api/posts", method: "POST" });
  }
});

// ── The address of a database call ──────────────────────────────────────────

test("row 14's example: users?email=eq.<address> loses the address", () => {
  assert.equal(redactDbCallValues("users?email=eq.someone@iu.edu"), "users?email=eq.[redacted]");
  // The way the database client really writes it (URLSearchParams encodes the @).
  assert.equal(
    redactDbCallValues(`${DB}/rest/v1/users?select=id&email=eq.someone%40iu.edu`),
    `${DB}/rest/v1/users?select=id&email=eq.[redacted]`,
  );
});

test("eq, neq, in, like, ilike and cs lose their value; table, column and operator stay", () => {
  const cases: Array<[string, string]> = [
    [`/rest/v1/users?id=eq.${ME}`, "/rest/v1/users?id=eq.[redacted]"],
    [`/rest/v1/users?select=id&id=neq.${ME}`, "/rest/v1/users?select=id&id=neq.[redacted]"],
    [`/rest/v1/users?id=in.%28${ME}%2C${OTHER}%29&limit=2`, "/rest/v1/users?id=in.[redacted]&limit=2"],
    [`/rest/v1/users?id=in.(${ME},${OTHER})`, "/rest/v1/users?id=in.[redacted]"],
    ["/rest/v1/users?school_email=like.%25%40iu.edu", "/rest/v1/users?school_email=like.[redacted]"],
    ["/rest/v1/users?email=ilike.Someone%40IU.edu&select=id", "/rest/v1/users?email=ilike.[redacted]&select=id"],
    [`/rest/v1/threads?member_ids=cs.%7B${ME}%7D`, "/rest/v1/threads?member_ids=cs.[redacted]"],
    // Two filters in one address, and an upper-case operator.
    [
      `/rest/v1/users?select=id&school_email=eq.someone%40iu.edu&id=neq.${ME}`,
      "/rest/v1/users?select=id&school_email=eq.[redacted]&id=neq.[redacted]",
    ],
    [`/rest/v1/users?id=EQ.${ME}`, "/rest/v1/users?id=EQ.[redacted]"],
  ];
  for (const [input, expected] of cases) assert.equal(redactDbCallValues(input), expected);
});

test("the client's other operators, not., brackets, joined tables and JSON paths are covered too", () => {
  const cases: Array<[string, string]> = [
    [`/rest/v1/posts?author_id=not.in.%28${ME}%2C${OTHER}%29`, "/rest/v1/posts?author_id=not.in.[redacted]"],
    [`/rest/v1/posts?author_id=not.eq.${ME}`, "/rest/v1/posts?author_id=not.eq.[redacted]"],
    ["/rest/v1/posts?created_at=lt.2026-10-04T12%3A00%3A00Z", "/rest/v1/posts?created_at=lt.[redacted]"],
    [`/rest/v1/posts?id=gte.${ME}&order=id.asc`, "/rest/v1/posts?id=gte.[redacted]&order=id.asc"],
    ["/rest/v1/posts?removed_at=is.null", "/rest/v1/posts?removed_at=is.[redacted]"],
    ["/rest/v1/users?name=fts%28english%29.sam+lee", "/rest/v1/users?name=fts%28english%29.[redacted]"],
    ["/rest/v1/users?name=wfts(english).sam", "/rest/v1/users?name=wfts(english).[redacted]"],
    ["/rest/v1/users?name=ilike%28any%29.%7Bsam%25%2Clee%25%7D", "/rest/v1/users?name=ilike%28any%29.[redacted]"],
    [`/rest/v1/posts?tags=ov.%7B${ME}%7D`, "/rest/v1/posts?tags=ov.[redacted]"],
    [`/rest/v1/posts?creator.campus_id=in.%28${ME}%29`, "/rest/v1/posts?creator.campus_id=in.[redacted]"],
    [`/rest/v1/actions?meta-%3E%3Eorg_id=eq.${ME}`, "/rest/v1/actions?meta-%3E%3Eorg_id=eq.[redacted]"],
  ];
  for (const [input, expected] of cases) assert.equal(redactDbCallValues(input), expected);
});

test("a whole or=( … ) and and=( … ) is taken out, negated or on a joined table as well", () => {
  const blocks = `%28blocker_id.eq.${ME}%2Cblocked_id.eq.${ME}%29`;
  const cases: Array<[string, string]> = [
    [`/rest/v1/blocks?select=blocker_id&or=${blocks}`, "/rest/v1/blocks?select=blocker_id&or=[redacted]"],
    [`/rest/v1/blocks?or=(blocker_id.eq.${ME},blocked_id.eq.${ME})&limit=1`, "/rest/v1/blocks?or=[redacted]&limit=1"],
    ["/rest/v1/users?or=%28email.ilike.%25sam%25%2Chandle.ilike.%25sam%25%29", "/rest/v1/users?or=[redacted]"],
    [`/rest/v1/blocks?and=${blocks}`, "/rest/v1/blocks?and=[redacted]"],
    [`/rest/v1/blocks?not.or=${blocks}`, "/rest/v1/blocks?not.or=[redacted]"],
    [`/rest/v1/threads?select=id&members.or=${blocks}`, "/rest/v1/threads?select=id&members.or=[redacted]"],
  ];
  for (const [input, expected] of cases) assert.equal(redactDbCallValues(input), expected);
});

test("an ID in the path of a sign-in or storage call becomes :id, plain or encoded", () => {
  const cases: Array<[string, string]> = [
    [`DELETE ${DB}/auth/v1/admin/users/${ME}`, `DELETE ${DB}/auth/v1/admin/users/:id`],
    [`${DB}/auth/v1/admin/users/${ME}/factors/${OTHER}`, `${DB}/auth/v1/admin/users/:id/factors/:id`],
    [`${DB}/storage/v1/object/profiles/${ME}/avatar.jpg`, `${DB}/storage/v1/object/profiles/:id/avatar.jpg`],
    [
      `${DB}/storage/v1/object/sign/resumes/${ME}/cv.pdf?token=abc.def&download=1`,
      `${DB}/storage/v1/object/sign/resumes/:id/cv.pdf?token=abc.def&download=1`,
    ],
    [
      `/_next/image?url=https%3A%2F%2Fabcd.supabase.co%2Fstorage%2Fv1%2Fobject%2Fpublic%2Fprofiles%2F${ME}%2Fa.jpg&w=640`,
      "/_next/image?url=https%3A%2F%2Fabcd.supabase.co%2Fstorage%2Fv1%2Fobject%2Fpublic%2Fprofiles%2F:id%2Fa.jpg&w=640",
    ],
  ];
  for (const [input, expected] of cases) assert.equal(redactDbCallValues(input), expected);
});

test("what is not a filter value is left alone", () => {
  for (const same of [
    // The rest of a database call.
    `${DB}/rest/v1/posts?select=id%2Cauthor%3Ausers%28id%2Cname%29&order=created_at.desc&limit=20&offset=40`,
    `${DB}/rest/v1/users?on_conflict=email&columns=%22email%22`,
    `${DB}/rest/v1/rpc/feed_page`,
    `${DB}/auth/v1/token?grant_type=refresh_token`,
    `${DB}/auth/v1/admin/users?page=1&per_page=50`,
    // The app's own addresses: a post or chat ID is not an account's sign-in.
    "/auth/login?next=%2Fcampus",
    `/api/users/by-id/${ME}`,
    `/api/me/threads/${OTHER}/messages`,
    "/campus?tab=is&sort=in",
    "/x?zip_code=46202&v=eq",
    // Stack frames: rewriting these would stop them matching the source maps.
    "https://www.connectvibe.app/_next/static/chunks/app/profile/page-3f2a1b9c.js",
    "/var/task/.next/server/app/api/users/[handle]/posts/route.js",
    "./src/lib/profile/storage-upload.ts",
    "webpack-internal:///(app-pages-browser)/./src/lib/supabase/storage.ts?eq=1",
    // No `?` or `&` in front: the keyed pass in the event scrub handles these.
    "email=eq.someone%40iu.edu",
  ]) {
    assert.equal(redactDbCallValues(same), same);
  }
});

test("a very long run of ? & and = is scrubbed quickly", () => {
  const long = `${"?&=".repeat(20000)}?email=eq.someone%40iu.edu`;
  const started = Date.now();
  const out = redactDbCallValues(long);
  assert.equal(out.endsWith("?email=eq.[redacted]"), true);
  assert.equal(Date.now() - started < 1000, true);
});

// ── The name the kit gives a page element ──────────────────────────────────
//
// To say which element was painted largest, which one moved and which one
// was tapped, the kit writes the element as a selector with the text of its
// labels. The strings here have the shape the installed kit writes
// (htmlTreeAsString in @sentry/browser-utils): elements joined by " > ",
// attributes in the order aria-label, type, name, title, alt, and a label
// copied as it is, quotes and brackets included.

const JANE_PHOTO = 'button[type="button"] > div[aria-label="Photo posted by Jane Doe"]';
const JANE_ROW = `a.row[aria-label="Open Jane Doe's profile"][type="button"] > img.avatar[alt="Jane Doe"]`;

test("a label is blanked and the attribute's name stays, for each of the four", () => {
  const cases: Array<[string, string]> = [
    [JANE_PHOTO, 'button[type="button"] > div[aria-label=""]'],
    ['a.card > img.w-full[alt="Photo posted by Jane Doe"]', 'a.card > img.w-full[alt=""]'],
    [`li > span.chip[title="Jane Doe — Kelley '27"]`, 'li > span.chip[title=""]'],
    ['form#new > input.field[type="text"][name="jane_doe"]', 'form#new > input.field[type="text"][name=""]'],
    // The kit writes these names in lower case; any other case is cut as well.
    ['IMG[ALT="Jane Doe"]', 'IMG[ALT=""]'],
  ];
  for (const [input, expected] of cases) assert.equal(redactElementLabels(input), expected);
});

test("what stands in front of the first label survives: type=\"button\" and a data-sentry-element name", () => {
  assert.equal(
    redactElementLabels('PostCard > button.like[type="button"] > img.w-full[alt="Photo posted by Jane Doe"]'),
    'PostCard > button.like[type="button"] > img.w-full[alt=""]',
  );
  // The kit prints only the name for an element that carries data-sentry-element.
  assert.equal(
    redactElementLabels('FeedList > PostPhoto > span.badge[title="Jane Doe"]'),
    'FeedList > PostPhoto > span.badge[title=""]',
  );
});

test("a string with no label comes back unchanged", () => {
  for (const same of [
    'button[type="button"]',
    'PostCard > button.like[type="submit"]',
    "FeedList > PostCard > PostPhoto",
    "div#post-42.card.rounded-xl > span.text-[13px]",
    'input.field[type="email"]',
    // Another attribute whose name only ends like one of the four.
    'a[data-title="x"][data-name="y"]',
    "<unknown>",
    "",
    // Not selectors at all.
    "https://www.connectvibe.app/_next/static/chunks/app/orgs/[handle]/page-3f2a1b9c.js",
    "/var/task/.next/server/app/[name]/page.js",
    '{"name":"x","title":["a","b"],"alt":"c"}',
    "/x?filter[name]=jane&alt=1",
    '<img alt="Photo" title="x" name="y">',
    "Cannot read properties of undefined (reading 'title')",
  ]) {
    assert.equal(redactElementLabels(same), same);
  }
});

test("a label holding a double quote, a ] and a > leaves nothing of itself behind", () => {
  const label = 'Jane "JD" Doe] said "hi"] > img.me[alt="x"] > b.Doe';
  const out = redactElementLabels(`ul.list > li > a.row[aria-label="${label}"][type="button"] > span.name`);
  assert.equal(out, 'ul.list > li > a.row[aria-label=""]');
  for (const gone of ["Jane", "JD", "Doe", "said", "hi", "img.me"]) assert.equal(out.includes(gone), false, gone);

  const cases: Array<[string, string]> = [
    // In the app today: the title of the empty search result holds what was typed, in quotes.
    ['p.empty[title="No matches for "jane doe""]', 'p.empty[title=""]'],
    // A label that is nothing but the two characters that would end one.
    ['img[alt=""]"]', 'img[alt=""]'],
    // A line break, an emoji and a joined emoji.
    ['img[alt="Jane\nDoe 🎉 👩‍💻"]', 'img[alt=""]'],
    // Text that reads as a second, unlabelled element.
    ['img[alt="Jane"] > Doe.is.here', 'img[alt=""]'],
  ];
  for (const [input, expected] of cases) assert.equal(redactElementLabels(input), expected);
});

test("two labelled elements in one selector: both labels go, and the selector ends at the first", () => {
  assert.equal(redactElementLabels(JANE_ROW), 'a.row[aria-label=""]');
  // Two labels on one element.
  assert.equal(redactElementLabels('img.avatar[title="Jane Doe"][alt="Photo of Jane"]'), 'img.avatar[title=""]');
  // A type written after the label is past the point of trust, so it goes too.
  assert.equal(redactElementLabels('button[aria-label="Message Jane"][type="button"]'), 'button[aria-label=""]');
});

test("a selector cut short, inside a longer line, or copied into JSON text is blanked from its first label on", () => {
  const cases: Array<[string, string]> = [
    ['img.w-full[alt="Photo posted by Jane Do', 'img.w-full[alt=""]'],
    ['img.w-full[alt="Jane "JD"] Doe and fri...', 'img.w-full[alt=""]'],
    ['img.w-full[alt="', 'img.w-full[alt=""]'],
    ['[HTMLElement: div.x[aria-label="Jane Doe"]] was not attached', '[HTMLElement: div.x[aria-label=""]'],
    ['{"target":"img[alt=\\"Jane Doe\\"]","n":1}', '{"target":"img[alt=""]'],
  ];
  for (const [input, expected] of cases) assert.equal(redactElementLabels(input), expected);
});

test("the label scrub gives the same result the second time", () => {
  for (const input of [
    JANE_PHOTO,
    JANE_ROW,
    'p.empty[title="No matches for "jane doe""]',
    'img[alt=""]"]',
    'img.w-full[alt="',
    'button[type="button"]',
    "FeedList > PostPhoto",
  ]) {
    const once = redactElementLabels(input);
    assert.equal(redactElementLabels(once), once, input);
  }
});

test("a very long run of [ and a very long label are scrubbed quickly", () => {
  const started = Date.now();
  assert.equal(redactElementLabels(`${"[name=".repeat(20000)}img[alt="Jane Doe"]`).endsWith('img[alt=""]'), true);
  assert.equal(redactElementLabels(`img[alt="${'Jane "] > '.repeat(20000)}"]`), 'img[alt=""]');
  assert.equal(Date.now() - started < 1000, true);
});

// ── The id in the name the kit gives a page element ────────────────────────
//
// The kit writes an element's id in front of its labels, so the label scrub
// leaves it standing. On the founders' admin pages an id holds another
// person's account ID (src/app/admin/users-client.tsx: `${user.id}-days`).

/** The box a founder types a suspension's length into, as the kit names it. */
const ADMIN_BOX = `div.adm-card > input#${OTHER}-days[type="number"]`;

test("an account ID in an element's id becomes :id, and the rest of the id and the selector stay", () => {
  const cases: Array<[string, string]> = [
    [ADMIN_BOX, 'div.adm-card > input#:id-days[type="number"]'],
    [`textarea#${OTHER}-note.adm-input`, "textarea#:id-note.adm-input"],
    // The reports page: `<kind>:<ID>-reason`, and an id on more than one element.
    [`li#user:${OTHER}-row > select#user:${OTHER}-reason`, "li#user::id-row > select#user::id-reason"],
    // Any ID of that shape goes, a post's too: nothing in the string says whose it is.
    [`article#post-${ME}.card > PostPhoto`, "article#post-:id.card > PostPhoto"],
    // Two in one id, one in capitals, and one in an id that holds a bracket.
    [`div#${ME}_${OTHER}`, "div#:id_:id"],
    [`div#row-${OTHER.toUpperCase()}`, "div#row-:id"],
    [`div#row[${OTHER}].card`, "div#row[:id].card"],
    // With a label after it: both scrubs apply.
    [`div#${OTHER}-card > img.w-full[alt="Photo posted by Jane Doe"]`, 'div#:id-card > img.w-full[alt=""]'],
    // The `#…` end of a web address follows the same rule.
    [`https://www.connectvibe.app/campus?tab=is#post-${ME}`, "https://www.connectvibe.app/campus?tab=is#post-:id"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(redactElementLabels(redactElementIds(input)), expected);
    // The order of the two scrubs does not matter.
    assert.equal(redactElementIds(redactElementLabels(input)), expected);
  }
});

test("what is not an ID in an element's id comes back unchanged", () => {
  for (const same of [
    "div#post-42.card.rounded-xl > span.text-[13px]",
    "section#section-3 > h2",
    "span.bg-[#0b0b0f].text-[#fafafa]",
    'input#email.field[type="email"]',
    // A trace ID has no dashes, and React's own ids are short.
    "div#df9a3e8b36484e26b52be63852389361",
    "label#«r1»-label",
    // No `#` in front: not an element's id. The other scrubbers decide about these.
    `/api/users/by-id/${ME}`,
    `/api/me/threads/${OTHER}/messages`,
    `{"debug_id":"${ME}"}`,
    // A space ends the id: the kit puts one before the next element.
    `div#x > ${ME}`,
    "#",
    "",
  ]) {
    assert.equal(redactElementIds(same), same);
  }
});

test("the id scrub gives the same result the second time, and a very long run of # is scrubbed quickly", () => {
  for (const input of [ADMIN_BOX, `li#user:${OTHER}-row > select#user:${OTHER}-reason`, "div#post-42", "#"]) {
    const once = redactElementIds(input);
    assert.equal(redactElementIds(once), once, input);
  }
  const started = Date.now();
  assert.equal(redactElementIds(`${"#".repeat(60000)}${OTHER}`), `${"#".repeat(60000)}:id`);
  assert.equal(redactElementIds(`${"#0a1b2c3d-".repeat(20000)} input#${OTHER}`).endsWith(" input#:id"), true);
  assert.equal(Date.now() - started < 1000, true);
});

/** A stand-in for a page element, with what the kit's namer reads from one: tag, id, classes, attributes, parent. */
function pageElement(
  tag: string,
  parts: { id?: string; className?: string; attrs?: Record<string, string>; parent?: unknown } = {},
) {
  const attrs = parts.attrs ?? {};
  return {
    tagName: tag.toUpperCase(),
    id: parts.id ?? "",
    className: parts.className ?? "",
    parentNode: parts.parent ?? null,
    getAttribute: (name: string): string | null => attrs[name] ?? null,
  };
}

test("an element named by the installed kit's own namer loses its labels and the account ID in its id", () => {
  const card = pageElement("div", { className: "adm-card" });
  // The admin box as it is in the app: an id and a type, no label.
  const box = pageElement("input", { id: `${OTHER}-days`, attrs: { type: "number" }, parent: card });
  // If these two fail the kit changed how it writes an element: read it again before trusting the tests above.
  assert.equal(htmlTreeAsString(box), ADMIN_BOX);
  const label = 'Open Jane "JD" Doe] > x profile';
  const row = pageElement("a", {
    id: `${OTHER}-row`,
    className: "row big",
    attrs: { "aria-label": label, type: "button", name: "jane_doe", title: "Jane Doe", alt: "Jane" },
    parent: card,
  });
  // The element itself is always written whole; a parent is left off once the name would pass 80 characters.
  assert.equal(
    htmlTreeAsString(row),
    `a#${OTHER}-row.row.big[aria-label="${label}"][type="button"][name="jane_doe"][title="Jane Doe"][alt="Jane"]`,
  );

  const span = scrubSpan({ description: htmlTreeAsString(row), data: { "lcp.element": htmlTreeAsString(box) } });
  assert.deepEqual(span, {
    description: 'a#:id-row.row.big[aria-label=""]',
    data: { "lcp.element": 'div.adm-card > input#:id-days[type="number"]' },
  });
});

// ── The request record ─────────────────────────────────────────────────────

/** What the kit puts on a report about a server request (read off a local run of the kit). */
function serverRequest() {
  return {
    headers: {
      host: "www.connectvibe.app",
      "content-type": "application/json",
      cookie: "sb-abcd-auth-token=base64-eyJhY2Nlc3M; theme=night",
      authorization: "Bearer eyJhbGciOi",
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      "x-vercel-ip-city": "Indianapolis",
      "x-vercel-ip-latitude": "39.77",
      "x-vercel-proxied-for": "203.0.113.9",
      "x-real-ip": "203.0.113.9",
      referer: "https://www.connectvibe.app/profile/franky",
      "content-length": "62",
    },
    method: "POST",
    url: "https://www.connectvibe.app/api/me/threads/t1/messages?token_hash=abc123&x=1",
    cookies: { "sb-abcd-auth-token": "base64-eyJhY2Nlc3M", theme: "night" },
    query_string: "token_hash=abc123&x=1",
    data: '{"text":"see you at the library at nine"}',
  };
}

test("a server request record keeps only the address, the method and the browser's name", () => {
  const out = scrub({ request: { ...serverRequest(), env: { REMOTE_ADDR: "203.0.113.9" }, fragment: "x" } });
  assert.deepEqual(out.request, {
    headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" },
    method: "POST",
    url: "https://www.connectvibe.app/api/me/threads/t1/messages?token_hash=[redacted]&x=1",
  });
  const text = JSON.stringify(out);
  for (const gone of ["library", "eyJhY2Nlc3M", "sb-abcd", "eyJhbGciOi", "Indianapolis", "39.77", "203.0.113.9", "franky"]) {
    assert.equal(text.includes(gone), false, gone);
  }
});

test("the browser's request record keeps User-Agent, in its own spelling, and loses Referer", () => {
  const out = scrub({
    request: {
      url: "https://www.connectvibe.app/campus",
      headers: { Referer: "https://www.connectvibe.app/profile/franky", "User-Agent": "Mozilla/5.0 Safari" },
    },
  });
  assert.deepEqual(out.request, {
    url: "https://www.connectvibe.app/campus",
    headers: { "User-Agent": "Mozilla/5.0 Safari" },
  });
});

test("headers with no user-agent, or in a shape that is not a plain record, are dropped whole", () => {
  assert.deepEqual(scrub({ request: { url: "/x", headers: { cookie: "a=b" } } }).request, { url: "/x" });
  assert.deepEqual(scrub({ request: { url: "/x", headers: [["cookie", "a=b"]] } }).request, { url: "/x" });
  assert.deepEqual(scrub({ request: { url: "/x", headers: "cookie: a=b" } }).request, { url: "/x" });
  assert.deepEqual(scrub({ request: { url: "/x", headers: { "user-agent": 7 } } }).request, { url: "/x" });
  // The kit builds headers on a record with no prototype (headersToDict).
  const bare = Object.assign(Object.create(null) as Record<string, string>, { cookie: "a=b", "user-agent": "UA" });
  assert.deepEqual(scrub({ request: { url: "/x", headers: bare } }).request, { url: "/x", headers: { "user-agent": "UA" } });
});

test("a request that is not a plain record is dropped, and an event without one gains none", () => {
  for (const request of ["POST /api/posts", ["cookie", "a=b"], new Map([["cookie", "a=b"]])]) {
    assert.equal("request" in scrub({ message: "x", request }), false);
  }
  assert.deepEqual(scrub({ message: "x" }), { message: "x" });
  assert.deepEqual(scrub({ message: "x", request: undefined }), { message: "x", request: undefined });
  assert.deepEqual(scrub({ message: "x", request: null }), { message: "x", request: null });
});

// ── The copies: trace context, spans, trail ─────────────────────────────────

/** The root span of a server request, as the kit writes it into `contexts.trace.data`. */
function serverTraceData() {
  return {
    "sentry.op": "http.server",
    "http.method": "POST",
    "http.target": "/api/me/threads/t1/messages?token_hash=abc123&x=1",
    "http.url": "https://www.connectvibe.app/api/me/threads/t1/messages?token_hash=abc123&x=1",
    "http.query": "token_hash=abc123&x=1",
    "http.user_agent": "Mozilla/5.0 (iPhone)",
    "http.client_ip": "203.0.113.9",
    "user.ip_address": "203.0.113.9",
    "http.request.body.data": '{"text":"see you at the library at nine"}',
    "http.request.header.cookie.sb_abcd_auth_token": "[Filtered]",
    "http.request.header.cookie.theme": "night",
    "http.request.header.cookie": "[Filtered]",
    "http.request.header.authorization": "[Filtered]",
    "http.request.header.user_agent": "Mozilla/5.0 (iPhone)",
    "http.request.header.x_vercel_ip_city": "[Filtered]",
    "http.request.header.x_vercel_proxied_for": "203.0.113.9",
    "http.request.header.referer": "https://www.connectvibe.app/profile/franky",
    "http.request.header.content_length": "62",
    "http.response.header.set_cookie.sb_abcd_auth_token": "base64-eyJhY2Nlc3M",
    "http.response.header.content_type": "application/json",
    "http.response.status_code": 500,
  };
}

test("the trace context loses the body, every header but user_agent, the cookies and the IP address", () => {
  const out = scrub({ type: "transaction", contexts: { trace: { op: "http.server", data: serverTraceData() } } });
  assert.deepEqual(out.contexts.trace.data, {
    "sentry.op": "http.server",
    "http.method": "POST",
    "http.target": "/api/me/threads/t1/messages?token_hash=[redacted]&x=1",
    "http.url": "https://www.connectvibe.app/api/me/threads/t1/messages?token_hash=[redacted]&x=1",
    // No `?` in front of the first pair: the kit cuts it off.
    "http.query": "token_hash=[redacted]&x=1",
    "http.user_agent": "Mozilla/5.0 (iPhone)",
    "http.request.header.user_agent": "Mozilla/5.0 (iPhone)",
    "http.response.header.content_type": "application/json",
    "http.response.status_code": 500,
  });
  assert.equal(out.contexts.trace.op, "http.server");
});

/** One database call as a span of a speed report (read off a local run of the kit). */
function dbSpan(path: string, query: string) {
  return {
    span_id: "a6b523075f48d198",
    op: "http.client",
    description: `GET ${DB}${path}`,
    data: {
      "sentry.origin": "auto.http.otel.node_fetch",
      "url.full": `${DB}${path}${query ? `?${query}` : ""}`,
      "url.path": path,
      "url.query": query ? `?${query}` : "",
      url: `${DB}${path}`,
      "http.query": query,
      "http.request.header.authorization": ["Bearer service-key"],
      "http.request.body.data": '{"email":"someone@iu.edu"}',
      "http.response.status_code": 200,
    },
  };
}

test("each span loses the same keys, and a database call's address loses its values", () => {
  const out = scrub({
    type: "transaction",
    spans: [
      dbSpan("/rest/v1/users", `email=eq.someone%40iu.edu&select=id&id=neq.${ME}`),
      dbSpan("/rest/v1/blocks", `or=%28blocker_id.eq.${ME}%2Cblocked_id.eq.${ME}%29&select=blocker_id`),
      dbSpan(`/auth/v1/admin/users/${ME}`, ""),
      dbSpan(`/storage/v1/object/profiles/${ME}/avatar.jpg`, ""),
    ],
  });
  assert.deepEqual(out.spans[0], {
    span_id: "a6b523075f48d198",
    op: "http.client",
    description: `GET ${DB}/rest/v1/users`,
    data: {
      "sentry.origin": "auto.http.otel.node_fetch",
      "url.full": `${DB}/rest/v1/users?email=eq.[redacted]&select=id&id=neq.[redacted]`,
      "url.path": "/rest/v1/users",
      "url.query": "?email=eq.[redacted]&select=id&id=neq.[redacted]",
      url: `${DB}/rest/v1/users`,
      "http.query": "email=eq.[redacted]&select=id&id=neq.[redacted]",
      "http.response.status_code": 200,
    },
  });
  assert.equal(out.spans[1].data["url.full"], `${DB}/rest/v1/blocks?or=[redacted]&select=blocker_id`);
  assert.equal(out.spans[1].data["http.query"], "or=[redacted]&select=blocker_id");
  assert.equal(out.spans[2].description, `GET ${DB}/auth/v1/admin/users/:id`);
  assert.equal(out.spans[2].data["url.path"], "/auth/v1/admin/users/:id");
  assert.equal(out.spans[2].data["http.query"], "");
  assert.equal(out.spans[3].description, `GET ${DB}/storage/v1/object/profiles/:id/avatar.jpg`);
  const text = JSON.stringify(out);
  for (const gone of [ME, "someone", "service-key"]) assert.equal(text.includes(gone), false, gone);
});

test("the trail loses the same things: database calls, log lines and copied keys", () => {
  const out = scrub({
    breadcrumbs: [
      {
        category: "http",
        type: "http",
        data: {
          status_code: 200,
          url: `${DB}/rest/v1/users`,
          "http.method": "GET",
          "http.query": `?select=id&school_email=eq.someone%40iu.edu&id=neq.${ME}`,
        },
      },
      { category: "http", data: { url: `${DB}/auth/v1/admin/users/${ME}`, "http.method": "DELETE" } },
      {
        category: "console",
        message: `waitlist lookup /rest/v1/waitlist?email_key=eq.someone@iu.edu failed for /profile/franky`,
        data: { arguments: ["waitlist lookup", `/rest/v1/waitlist?email_key=eq.someone@iu.edu`], logger: "console" },
      },
      { category: "fetch", data: { method: "POST", url: "/api/posts", "http.request.body.data": "hello" } },
      // A fragment the kit stores with its `#` cut off.
      { category: "navigation", data: { "http.fragment": "access_token=abc&refresh_token=def&type=recovery" } },
    ],
  });
  assert.equal(out.breadcrumbs[0].data["http.query"], "?select=id&school_email=eq.[redacted]&id=neq.[redacted]");
  assert.equal(out.breadcrumbs[0].data.status_code, 200);
  assert.equal(out.breadcrumbs[1].data.url, `${DB}/auth/v1/admin/users/:id`);
  assert.equal(
    out.breadcrumbs[2].message,
    "waitlist lookup /rest/v1/waitlist?email_key=eq.[redacted] failed for /profile/:handle",
  );
  assert.deepEqual(out.breadcrumbs[2].data.arguments, ["waitlist lookup", "/rest/v1/waitlist?email_key=eq.[redacted]"]);
  assert.deepEqual(out.breadcrumbs[3].data, { method: "POST", url: "/api/posts" });
  assert.equal(
    out.breadcrumbs[4].data["http.fragment"],
    "access_token=[redacted]&refresh_token=[redacted]&type=recovery",
  );
});

// ── The report is always sent ──────────────────────────────────────────────

test("both hooks hand back the same event, cleaned, never null", () => {
  const options = getSentryInitOptions();
  assert.equal(options.sendDefaultPii, false);
  const hint = {};
  const error = { request: serverRequest(), exception: { values: [{ type: "Error", value: "send failed" }] } };
  const sentError = options.beforeSend?.(error as never, hint);
  assert.equal(sentError, error);
  assert.deepEqual(Object.keys(error.request).sort(), ["headers", "method", "url"]);

  const speed = { type: "transaction", request: serverRequest(), spans: [], contexts: { trace: { data: serverTraceData() } } };
  const sentSpeed = options.beforeSendTransaction?.(speed as never, hint);
  assert.equal(sentSpeed, speed);
  assert.deepEqual(Object.keys(speed.request).sort(), ["headers", "method", "url"]);
  assert.equal("http.request.body.data" in speed.contexts.trace.data, false);
});

test("the kit's own working data is left for the kit", () => {
  const metadata = { normalizedRequest: serverRequest(), spanCountBeforeProcessing: 3 };
  const out = scrub({ message: "x", sdkProcessingMetadata: metadata });
  assert.equal(out.sdkProcessingMetadata, metadata);
  assert.deepEqual(out.sdkProcessingMetadata.normalizedRequest, serverRequest());
});

test("a value that throws when read does not stop the report or the rest of the cleaning", () => {
  const extra = { ok: "/profile/franky" } as Record<string, unknown>;
  Object.defineProperty(extra, "boom", {
    enumerable: true,
    get() {
      throw new Error("unreadable");
    },
  });
  const list = ["/profile/franky"];
  Object.defineProperty(list, 1, {
    enumerable: true,
    get() {
      throw new Error("unreadable");
    },
  });
  const event = {
    request: serverRequest(),
    extra,
    tags: list,
    transaction: "/profile/franky",
    breadcrumbs: [{ data: { url: "/api/users/franky/posts" } }],
  };
  const out = scrub(event);
  assert.equal(out, event);
  assert.deepEqual(Object.keys(out.request).sort(), ["headers", "method", "url"]);
  assert.equal(out.extra.ok, "/profile/:handle");
  assert.equal(out.tags[0], "/profile/:handle");
  assert.equal(out.transaction, "/profile/:handle");
  assert.equal(out.breadcrumbs[0].data.url, "/api/users/:handle/posts");
});

test("a request record that cannot be edited is dropped whole, and the report still goes", () => {
  const event = { request: Object.freeze(serverRequest()), transaction: "/profile/franky" };
  const out = scrub(event);
  assert.equal(out, event);
  assert.equal("request" in out, false);
  assert.equal(out.transaction, "/profile/:handle");
});

test("an event that cannot be edited at all comes back as it was, with no throw", () => {
  const frozen = Object.freeze({ request: Object.freeze({ data: "x" }), transaction: "/profile/franky" });
  assert.equal(scrub(frozen), frozen);
  for (const odd of [null, undefined, "text", 7]) {
    assert.equal(scrubAuthTokensFromEvent(odd as unknown as AnyEvent), odd);
  }
});

test("a loop in the data and very deep data both end", () => {
  const loop: Loose = { url: "/profile/franky" };
  loop.self = loop;
  loop.list = [loop, "/profile/franky"];
  const out = scrub({ extra: loop });
  assert.equal(out.extra.url, "/profile/:handle");
  assert.equal(out.extra.list[1], "/profile/:handle");

  let deep: Loose = { url: "/profile/franky" };
  for (let i = 0; i < 40; i++) deep = { next: deep };
  assert.doesNotThrow(() => scrub({ extra: deep }));
});

test("class-shaped values are left alone", () => {
  class Box {
    url = "/profile/franky";
  }
  const box = new Box();
  const when = new Date(0);
  const out = scrub({ extra: { box, when } });
  assert.equal(out.extra.box, box);
  assert.equal(box.url, "/profile/franky");
  assert.equal(out.extra.when, when);
});

// ── Element names on a speed report, and the span sent on its own ──────────

/**
 * A page-load speed report with the element names the browser kit puts on it
 * (key names read off @sentry/browser-utils metrics/browserMetrics.js:
 * `lcp.element`, `cls.source.N`, and a tap's span named after its element).
 */
function pageLoadReport() {
  return {
    type: "transaction",
    transaction: "/campus",
    contexts: {
      trace: {
        op: "pageload",
        data: {
          "sentry.op": "pageload",
          "lcp.element": 'PostCard > img.w-full[alt="Photo posted by Jane Doe"]',
          "lcp.size": 120000,
          "cls.source.1": `main > a.row[aria-label="Open Jane Doe's profile"][type="button"]`,
          "cls.source.2": "div.feed > PostPhoto",
        },
      },
    },
    spans: [
      {
        span_id: "a6b523075f48d198",
        op: "ui.interaction.click",
        description: `button.like[aria-label="Like Jane Doe's post"][type="button"] > svg`,
        data: { "sentry.origin": "auto.ui.browser.metrics", "ui.component_name": "LikeButton" },
      },
    ],
  };
}

test("a speed report loses the label in lcp.element, in cls.source.1 and in a tap span's description", () => {
  const report = pageLoadReport();
  const sent = getSentryInitOptions().beforeSendTransaction?.(report as never, {});
  assert.equal(sent, report);
  assert.deepEqual(report.contexts.trace.data, {
    "sentry.op": "pageload",
    "lcp.element": 'PostCard > img.w-full[alt=""]',
    "lcp.size": 120000,
    "cls.source.1": 'main > a.row[aria-label=""]',
    "cls.source.2": "div.feed > PostPhoto",
  });
  assert.equal(report.spans[0].description, 'button.like[aria-label=""]');
  assert.equal(report.spans[0].data["ui.component_name"], "LikeButton");
  const text = JSON.stringify(report);
  for (const gone of ["Jane", "Doe", "Photo posted"]) assert.equal(text.includes(gone), false, gone);

  // An error report carries the same strings when a page element is among its data.
  const error = scrub({ extra: { target: `[HTMLElement: ${JANE_PHOTO}]` }, breadcrumbs: [{ category: "ui.click", message: JANE_ROW }] });
  assert.equal(error.extra.target, '[HTMLElement: button[type="button"] > div[aria-label=""]');
  assert.equal(error.breadcrumbs[0].message, 'a.row[aria-label=""]');
});

test("a speed report loses the account ID in lcp.id, in lcp.element, in cls.source.1 and in a tap span's description", () => {
  // `lcp.id` is the element's id alone, with no `#` in front (browserMetrics.js).
  const report = {
    type: "transaction",
    transaction: "/admin",
    contexts: {
      trace: {
        op: "pageload",
        data: {
          "lcp.element": ADMIN_BOX,
          "lcp.id": `${OTHER}-days`,
          "lcp.size": 9000,
          "cls.source.1": `div.adm-card > textarea#${OTHER}-note`,
          // Another key with an ID in it is not an element's id, and is left alone.
          thread: ME,
        },
      },
    },
    spans: [{ span_id: "a6b523075f48d198", op: "ui.interaction.press", description: ADMIN_BOX, data: {} }],
  };
  const sent = getSentryInitOptions().beforeSendTransaction?.(report as never, {});
  assert.equal(sent, report);
  assert.deepEqual(report.contexts.trace.data, {
    "lcp.element": 'div.adm-card > input#:id-days[type="number"]',
    "lcp.id": ":id-days",
    "lcp.size": 9000,
    "cls.source.1": "div.adm-card > textarea#:id-note",
    thread: ME,
  });
  assert.equal(report.spans[0].description, 'div.adm-card > input#:id-days[type="number"]');
  assert.equal(JSON.stringify(report).includes(OTHER), false);

  // The same key on the span the kit can send on its own, under both of its names.
  const lone = scrubSpan({ data: { "lcp.id": `${OTHER}-days`, "browser.web_vital.lcp.id": `row-${OTHER}` } });
  assert.deepEqual(lone.data, { "lcp.id": ":id-days", "browser.web_vital.lcp.id": "row-:id" });
});

test("the whole event scrub gives the same result the second time", () => {
  const once = JSON.stringify(scrub(pageLoadReport()));
  assert.equal(JSON.stringify(scrub(scrub(pageLoadReport()))), once);
  const admin = () => ({ contexts: { trace: { data: { "lcp.element": ADMIN_BOX, "lcp.id": `${OTHER}-days` } } } });
  assert.equal(JSON.stringify(scrub(scrub(admin()))), JSON.stringify(scrub(admin())));
});

/**
 * The tap measurement (INP) as the installed kit builds it and sends it on
 * its own: _onInp in @sentry/browser-utils metrics/inp.js, with the data
 * startStandaloneWebVitalSpan (metrics/utils.js) adds.
 */
function tapSpan() {
  return {
    data: {
      "sentry.origin": "auto.http.browser.inp",
      "sentry.op": "ui.interaction.click",
      "sentry.exclusive_time": 184,
      environment: "production",
      transaction: "/profile/franky",
      "user_agent.original": "Mozilla/5.0 (iPhone)",
    },
    description: JANE_ROW,
    op: "ui.interaction.click",
    span_id: "8bbd0bb579cf1a7e",
    start_timestamp: 1791824018.35,
    timestamp: 1791824018.53,
    trace_id: "df9a3e8b36484e26b52be63852389361",
    origin: "auto.http.browser.inp",
    exclusive_time: 184,
    measurements: { inp: { value: 184, unit: "millisecond" } },
    is_segment: true,
    segment_id: "8bbd0bb579cf1a7e",
  };
}

test("a span sent on its own goes through beforeSendSpan: the same span back, the label and the handle gone", () => {
  const span = tapSpan();
  const sent = getSentryInitOptions().beforeSendSpan?.(span as never);
  assert.equal(sent, span);
  assert.deepEqual(span, {
    ...tapSpan(),
    description: 'a.row[aria-label=""]',
    data: { ...tapSpan().data, transaction: "/profile/:handle" },
  });
});

test("the LCP and CLS spans the kit can send the same way lose their labels too", () => {
  // Off today (_experiments.enableStandaloneLcpSpans / enableStandaloneClsSpans); key names from metrics/lcp.js and cls.js.
  const lcp = scrubSpan({
    description: 'img.w-full[alt="Photo posted by Jane Doe"]',
    data: { "sentry.op": "ui.webvital.lcp", "lcp.element": 'img.w-full[alt="Photo posted by Jane Doe"]', "lcp.size": 120000 },
  });
  assert.deepEqual(lcp, {
    description: 'img.w-full[alt=""]',
    data: { "sentry.op": "ui.webvital.lcp", "lcp.element": 'img.w-full[alt=""]', "lcp.size": 120000 },
  });
  const cls = scrubSpan({ description: JANE_PHOTO, data: { "cls.source.1": JANE_PHOTO, "cls.source.2": JANE_ROW } });
  assert.equal(JSON.stringify(cls).includes("Jane"), false);
  assert.equal(cls.data["cls.source.2"], 'a.row[aria-label=""]');
});

test("the span hook hands back whatever it was given and never throws", () => {
  const hook = getSentryInitOptions().beforeSendSpan as unknown as (span: unknown) => unknown;
  for (const odd of [null, undefined, "text", 7]) assert.equal(hook(odd), odd);

  // A value that throws when read: the rest of the span is still cleaned.
  const data = { ok: JANE_PHOTO } as Record<string, unknown>;
  Object.defineProperty(data, "boom", {
    enumerable: true,
    get() {
      throw new Error("unreadable");
    },
  });
  const span = { description: JANE_ROW, data };
  assert.equal(hook(span), span);
  assert.equal(span.description, 'a.row[aria-label=""]');
  assert.equal(data.ok, 'button[type="button"] > div[aria-label=""]');

  // A span that cannot be edited comes back as it was. The kit never builds one like that.
  const frozen = Object.freeze({ description: JANE_ROW, data: Object.freeze({ "lcp.element": JANE_PHOTO }) });
  assert.equal(hook(frozen), frozen);

  const loop: Loose = { description: JANE_ROW };
  loop.data = { self: loop, name: JANE_PHOTO };
  assert.equal(hook(loop), loop);
  assert.equal(loop.data.name, 'button[type="button"] > div[aria-label=""]');
});

test("the trace header loses a label in its transaction name and keeps the rest", () => {
  const header = {
    trace_id: "df9a3e8b36484e26b52be63852389361",
    public_key: "public",
    environment: "production",
    sample_rate: "0.1",
    sampled: "true",
    transaction: JANE_ROW,
  };
  assert.equal(scrubTraceHeader(header), header);
  assert.deepEqual(header, {
    trace_id: "df9a3e8b36484e26b52be63852389361",
    public_key: "public",
    environment: "production",
    sample_rate: "0.1",
    sampled: "true",
    transaction: 'a.row[aria-label=""]',
  });
  // A route name is left as it is.
  assert.deepEqual(scrubTraceHeader({ transaction: "/orgs/:handle", sampled: "true" }), {
    transaction: "/orgs/:handle",
    sampled: "true",
  });
  for (const odd of [null, undefined, "text"]) assert.equal(scrubTraceHeader(odd), odd);
});

// ── Through the installed kit ──────────────────────────────────────────────
//
// The tests above feed the scrubber events typed by hand. These let the
// installed kit build the report itself, from a request like the one a phone
// sends with a chat message, and read what the kit would put on the wire.

/** A chat message arriving at the server, as Node hands it to the kit. */
const INCOMING = {
  method: "POST",
  url: "/api/me/threads/t1/messages?token_hash=abc123&x=1",
  headers: {
    host: "www.connectvibe.app",
    "x-forwarded-proto": "https",
    "content-type": "application/json",
    cookie: "sb-abcd-auth-token=base64-eyJhY2Nlc3M; theme=night",
    authorization: "Bearer eyJhbGciOi",
    "user-agent": "Mozilla/5.0 (iPhone)",
    "x-vercel-ip-city": "Bloomington",
    "x-vercel-proxied-for": "203.0.113.9",
  },
};
const BODY = '{"text":"see you at the library at nine"}';
const SECRETS = ["library", "eyJhY2Nlc3M", "sb-abcd", "eyJhbGciOi", "Bloomington", "203.0.113.9", "abc123", "someone", ME, "Jane"];

/**
 * The integrations the shared options hand the kit. The server and edge setup
 * files pass the options on whole, so this is the list those two run with.
 */
function ourIntegrations() {
  const list = getSentryInitOptions().integrations;
  assert.ok(Array.isArray(list), "the shared options carry a list of integrations");
  return list;
}

/**
 * Sends one error report and one speed report through the kit; returns what
 * it would have sent. "hooks" is the three `beforeSend…` options alone; "all"
 * adds the integrations the shared options carry, which is what the setup
 * files run.
 */
async function throughKit(ours: "none" | "hooks" | "all"): Promise<string[]> {
  const sent: string[] = [];
  const options = getSentryInitOptions();
  const withHooks = ours !== "none";
  const client = new ServerRuntimeClient({
    dsn: "https://public@o0.ingest.sentry.invalid/1",
    sendDefaultPii: options.sendDefaultPii,
    beforeSend: withHooks ? options.beforeSend : undefined,
    beforeSendTransaction: withHooks ? options.beforeSendTransaction : undefined,
    beforeSendSpan: withHooks ? options.beforeSendSpan : undefined,
    integrations: [requestDataIntegration(), ...(ours === "all" ? ourIntegrations() : [])],
    stackParser: () => [],
    // Records and sends nothing.
    transport: () => ({
      send: async (envelope: unknown) => {
        sent.push(JSON.stringify(envelope));
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  } as unknown as ConstructorParameters<typeof ServerRuntimeClient>[0]);
  client.init();

  // The two writes the kit makes for a server request: the request line,
  // headers and cookies when it arrives (httpRequestToRequestData), then the
  // body once it has been read (patchRequestToCaptureBody).
  const forRequest = () => {
    const isolationScope = new Scope();
    isolationScope.setSDKProcessingMetadata({ normalizedRequest: httpRequestToRequestData(INCOMING) });
    isolationScope.setSDKProcessingMetadata({ normalizedRequest: { data: BODY } });
    return { capturedSpanScope: new Scope(), capturedSpanIsolationScope: isolationScope };
  };
  client.captureEvent({
    exception: { values: [{ type: "Error", value: "send failed" }] },
    breadcrumbs: [
      { category: "http", data: { url: `${DB}/rest/v1/users`, "http.query": `?id=eq.${ME}&email=eq.someone%40iu.edu` } },
    ],
    sdkProcessingMetadata: forRequest(),
  });
  client.captureEvent({
    type: "transaction",
    transaction: "POST /api/me/threads/[id]/messages",
    contexts: {
      trace: {
        trace_id: "ad769f85f10942a3bf7e6e7342454981",
        span_id: "91adf8cd17635e0a",
        op: "http.server",
        data: {
          "http.target": INCOMING.url,
          // The call @sentry/nextjs makes for the root span (addHeadersAsAttributes).
          ...httpHeadersToSpanAttributes(INCOMING.headers, client.getDataCollectionOptions()),
          // Only a browser writes this one; here it rides the same report.
          "lcp.element": JANE_PHOTO,
        },
      },
    },
    spans: [
      dbSpan("/rest/v1/users", `id=eq.${ME}&email=eq.someone%40iu.edu`),
      { span_id: "b7c634186059e2a9", op: "ui.interaction.click", description: JANE_ROW, data: {} },
    ] as never,
    sdkProcessingMetadata: forRequest(),
  });
  await client.flush(2000);
  await client.close(2000);
  return sent;
}

test("control: without the scrubber the installed kit does copy the body, the cookie and the headers", async () => {
  const sent = await throughKit("none");
  const text = sent.join("\n");
  // If this fails the kit changed what it copies: read it again before trusting the test below.
  for (const present of ["library", "eyJhY2Nlc3M", "203.0.113.9", "abc123", "Photo posted by Jane Doe", "Open Jane Doe's profile"]) {
    assert.equal(text.includes(present), true, present);
  }
});

test("with the scrubber both reports are still sent, and none of it is in them", async () => {
  const sent = await throughKit("all");
  const error = sent.find((envelope) => envelope.includes('"type":"event"'));
  const speed = sent.find((envelope) => envelope.includes('"type":"transaction"'));
  assert.ok(error, "the error report was sent");
  assert.ok(speed, "the speed report was sent");
  for (const envelope of [error, speed]) {
    for (const secret of SECRETS) assert.equal(envelope.includes(secret), false, secret);
    assert.equal(envelope.includes("Mozilla/5.0 (iPhone)"), true);
    assert.equal(envelope.includes('"data":"{'), false);
    assert.equal(envelope.includes('"cookies"'), false);
  }
  assert.equal(error.includes("send failed"), true);
  assert.equal(speed.includes("token_hash=[redacted]"), true);
  assert.equal(speed.includes("email=eq.[redacted]"), true);
  // The element names are still there, with the attribute's name and no label (as JSON text).
  assert.equal(speed.includes('button[type=\\"button\\"] > div[aria-label=\\"\\"]'), true);
  assert.equal(speed.includes('"description":"a.row[aria-label=\\"\\"]"'), true);
});

// The span the browser sends on its own. The kit's tap measurement starts a
// span marked "standalone" and ends it at once (startStandaloneWebVitalSpan);
// ending it is what sends it, in an envelope that holds only that span.
// These do the same with the installed kit's own span class.

/** One envelope the kit would have sent: its header and the first item's payload. */
function openEnvelope(envelope: string): { header: Loose; type: string; item: Loose } {
  const [header, items] = JSON.parse(envelope) as [Loose, Array<[Loose, Loose]>];
  return { header, type: items[0][0].type, item: items[0][1] };
}

/**
 * Ends one lone span named after a tapped element; returns what the kit would
 * have sent. "hooks" is the three `beforeSend…` options alone; "all" adds the
 * integrations the shared options carry, which is what the setup files run.
 */
async function tapThroughKit(ours: "none" | "hooks" | "all", name: string = JANE_ROW): Promise<string[]> {
  const sent: string[] = [];
  const options = getSentryInitOptions();
  const withHooks = ours !== "none";
  const client = new ServerRuntimeClient({
    dsn: "https://public@o0.ingest.sentry.invalid/1",
    tracesSampleRate: 1,
    beforeSend: withHooks ? options.beforeSend : undefined,
    beforeSendTransaction: withHooks ? options.beforeSendTransaction : undefined,
    beforeSendSpan: withHooks ? options.beforeSendSpan : undefined,
    integrations: ours === "all" ? ourIntegrations() : [],
    stackParser: () => [],
    // Records and sends nothing.
    transport: () => ({
      send: async (envelope: unknown) => {
        sent.push(JSON.stringify(envelope));
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  } as unknown as ConstructorParameters<typeof ServerRuntimeClient>[0]);
  client.init();

  const span = new SentrySpan({
    name,
    attributes: {
      "sentry.origin": "auto.http.browser.inp",
      "sentry.op": "ui.interaction.click",
      transaction: "/profile/franky",
    },
    isStandalone: true,
    sampled: true,
  });
  // The kit looks up the client on the current scope when the span ends.
  withScope((scope) => {
    scope.setClient(client);
    span.end();
  });
  await client.flush(2000);
  await client.close(2000);
  return sent;
}

test("control: without the hooks the installed kit sends a lone span with its label, in the span and in the trace header", async () => {
  const sent = await tapThroughKit("none");
  assert.equal(sent.length, 1);
  const { header, type, item } = openEnvelope(sent[0]);
  // If this fails the kit changed how it sends such a span: read it again before trusting the tests below.
  assert.equal(type, "span");
  assert.equal(item.description, JANE_ROW);
  assert.equal(header.trace.transaction, JANE_ROW);
});

test("control: the three hooks alone clean the lone span and leave the label in the trace header", async () => {
  const sent = await tapThroughKit("hooks");
  assert.equal(sent.length, 1);
  const { header, item } = openEnvelope(sent[0]);
  assert.equal(item.description, 'a.row[aria-label=""]');
  // If this fails the kit now cleans the header itself, or builds it another way: read it again.
  assert.equal(header.trace.transaction, JANE_ROW);
});

test("with the shared options' hooks and integrations the lone span is still sent, and the label is in neither place", async () => {
  const sent = await tapThroughKit("all");
  assert.equal(sent.length, 1);
  const { header, type, item } = openEnvelope(sent[0]);
  assert.equal(type, "span");
  assert.equal(item.description, 'a.row[aria-label=""]');
  assert.equal(item.op, "ui.interaction.click");
  assert.equal(item.data.transaction, "/profile/:handle");
  assert.equal(header.trace.transaction, 'a.row[aria-label=""]');
  for (const gone of ["Jane", "Doe", "franky"]) assert.equal(sent[0].includes(gone), false, gone);
});

test("a tap in the admin box, named by the kit's own namer, leaves with no account ID in the span or the header", async () => {
  const card = pageElement("div", { className: "adm-card" });
  const box = pageElement("input", { id: `${OTHER}-days`, attrs: { type: "number" }, parent: card });
  const named = htmlTreeAsString(box);

  const before = await tapThroughKit("none", named);
  assert.equal(before[0].includes(OTHER), true);

  const sent = await tapThroughKit("all", named);
  assert.equal(sent.length, 1);
  const { header, item } = openEnvelope(sent[0]);
  assert.equal(item.description, 'div.adm-card > input#:id-days[type="number"]');
  assert.equal(header.trace.transaction, 'div.adm-card > input#:id-days[type="number"]');
  assert.equal(sent[0].includes(OTHER), false);
});

// The report the kit sends about a failure of its own. When a step of its
// event pipeline throws, the kit drops the event it was working on and sends
// the failure as a new event, which skips `beforeSend` (_processEvent in
// @sentry/core client.js) and the kit's own steps (prepareEvent.js). The new
// event is built from the same scope, so it carries the trail and the page's
// name. The step that copies the request record is one of those skipped.

/** Makes the kit fail once while it prepares an error report; returns what it would have sent. */
async function ownFailureThroughKit(ours: "hooks" | "all"): Promise<{ sent: string[]; beforeSendCalls: number }> {
  const sent: string[] = [];
  let beforeSendCalls = 0;
  const options = getSentryInitOptions();
  const client = new ServerRuntimeClient({
    dsn: "https://public@o0.ingest.sentry.invalid/1",
    sendDefaultPii: options.sendDefaultPii,
    beforeSend: (event: never, hint: never) => {
      beforeSendCalls += 1;
      return options.beforeSend?.(event, hint) ?? null;
    },
    beforeSendTransaction: options.beforeSendTransaction,
    beforeSendSpan: options.beforeSendSpan,
    integrations: [requestDataIntegration(), ...(ours === "all" ? ourIntegrations() : [])],
    stackParser: () => [],
    // Records and sends nothing.
    transport: () => ({
      send: async (envelope: unknown) => {
        sent.push(JSON.stringify(envelope));
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  } as unknown as ConstructorParameters<typeof ServerRuntimeClient>[0]);
  client.init();
  // One step that throws the first time it runs, the way a bug in the kit would.
  let failed = false;
  client.addEventProcessor((event) => {
    if (failed) return event;
    failed = true;
    throw new Error("a step of the kit broke");
  });

  // What a request leaves on the scope both events are built from.
  const scope = getIsolationScope();
  try {
    scope.addBreadcrumb({ category: "navigation", data: { from: "/campus", to: "/profile/franky?token_hash=abc123" } });
    scope.addBreadcrumb({ category: "ui.click", message: JANE_ROW });
    scope.setTransactionName("/profile/franky");
    scope.setSDKProcessingMetadata({ normalizedRequest: { ...httpRequestToRequestData(INCOMING), data: BODY } });
    client.captureEvent({ exception: { values: [{ type: "Error", value: "send failed" }] } });
    await client.flush(2000);
  } finally {
    // The scope is shared by every test in this file: leave it as it was found.
    scope.clear();
    scope.setSDKProcessingMetadata({ normalizedRequest: undefined });
    await client.close(2000);
  }
  return { sent, beforeSendCalls };
}

test("control: the kit's report about its own failure skips beforeSend, and leaves with the trail and the page's name as they were", async () => {
  const { sent, beforeSendCalls } = await ownFailureThroughKit("hooks");
  // If any of this fails the kit changed how it reports its own failures: read it again before trusting the test below.
  assert.equal(sent.length, 1);
  assert.equal(beforeSendCalls, 0);
  const { type, item } = openEnvelope(sent[0]);
  assert.equal(type, "event");
  assert.equal(sent[0].includes("a step of the kit broke"), true);
  assert.equal(sent[0].includes("send failed"), false);
  assert.equal(item.transaction, "/profile/franky");
  assert.equal(item.breadcrumbs[0].data.to, "/profile/franky?token_hash=abc123");
  assert.equal(item.breadcrumbs[1].message, JANE_ROW);
  // The request record is not copied onto this one: no cookie, no body.
  assert.equal("request" in item, false);
  for (const absent of ["eyJhY2Nlc3M", "library", "203.0.113.9"]) assert.equal(sent[0].includes(absent), false, absent);
});

test("with the shared options' integrations that report is still sent, and none of it is in it", async () => {
  const { sent, beforeSendCalls } = await ownFailureThroughKit("all");
  assert.equal(sent.length, 1);
  assert.equal(beforeSendCalls, 0);
  const { type, item } = openEnvelope(sent[0]);
  assert.equal(type, "event");
  assert.equal(sent[0].includes("a step of the kit broke"), true);
  for (const secret of [...SECRETS, "franky", "Doe"]) assert.equal(sent[0].includes(secret), false, secret);
  assert.equal(item.transaction, "/profile/:handle");
  assert.equal(item.breadcrumbs[0].data.to, "/profile/:handle?token_hash=[redacted]");
  assert.equal(item.breadcrumbs[1].message, 'a.row[aria-label=""]');
  // The scope the two runs borrowed is clean again.
  assert.deepEqual(getIsolationScope().getScopeData().breadcrumbs, []);
});

test("an ordinary report passes both the hook and the integration, and comes out the same as from the hook alone", async () => {
  const strip = (envelope: string) => {
    const { item } = openEnvelope(envelope);
    // Different on every run, and the list of integrations differs by the one under test.
    delete item.event_id;
    delete item.timestamp;
    delete item.sdk;
    delete item.contexts?.trace;
    return item;
  };
  const hooksOnly = await throughKit("hooks");
  const both = await throughKit("all");
  assert.equal(both.length, hooksOnly.length);
  for (const type of ['"type":"event"', '"type":"transaction"']) {
    const one = hooksOnly.find((envelope) => envelope.includes(type));
    const two = both.find((envelope) => envelope.includes(type));
    assert.ok(one && two, type);
    assert.deepEqual(strip(two), strip(one), type);
  }
});

// ── The three setup files ──────────────────────────────────────────────────
//
// The scrub of the trace header and of the kit's own failure report only runs
// if the kit is handed reportScrubIntegration. The shared options list it;
// a setup file that writes its own `integrations` replaces that list. These
// read the three files as text, since they cannot be loaded here (each one
// starts the kit).

/** Source text without its comments (a `//` inside a web address stays). */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

/** A source file, by its path from this one, without its comments. */
function setupFile(path: string): string {
  return withoutComments(readFileSync(new URL(path, import.meta.url), "utf8"));
}

/** What stands between the brackets of a file's own `integrations: [ … ]`, if it has one written that way. */
function ownIntegrationsList(source: string): string | undefined {
  const opening = /\bintegrations\s*:\s*\[/.exec(source);
  if (!opening) return undefined;
  const from = opening.index + opening[0].length;
  let depth = 1;
  for (let i = from; i < source.length; i++) {
    if (source[i] === "[") depth += 1;
    else if (source[i] === "]" && --depth === 0) return source.slice(from, i);
  }
  return undefined;
}

/** Does this setup file start the kit with the shared options, and with the report scrub among its integrations? */
function handsKitTheReportScrub(text: string): boolean {
  const source = withoutComments(text);
  if (!/Sentry\.init\(/.test(source) || !/getSentryInitOptions\(\)/.test(source)) return false;
  // No list of its own: the one in the shared options stands.
  if (!/\bintegrations\b/.test(source)) return true;
  // A list of its own replaces the shared one, so it has to name the scrub. Written any other way, a person has to look.
  const list = ownIntegrationsList(source);
  return list !== undefined && /\breportScrubIntegration\(\)/.test(list);
}

test("the shared options list the report scrub, and each of the three setup files hands it to the kit", () => {
  assert.deepEqual(ourIntegrations().map((integration) => integration.name), [REPORT_SCRUB_INTEGRATION_NAME]);
  assert.equal(reportScrubIntegration().name, REPORT_SCRUB_INTEGRATION_NAME);
  for (const path of ["../instrumentation-client.ts", "../sentry.server.config.ts", "../sentry.edge.config.ts"]) {
    assert.equal(handsKitTheReportScrub(setupFile(path)), true, path);
  }
  // The browser's file keeps the tap trail off as well (Privacy Policy 3d).
  assert.match(setupFile("../instrumentation-client.ts"), /Sentry\.breadcrumbsIntegration\(\{\s*dom:\s*false\s*\}\)/);

  // The check itself: these are the ways a setup file would lose the scrub.
  const lost = [
    // The browser's file as it was before: a list of its own, without ours.
    "Sentry.init({\n  ...getSentryInitOptions(),\n  integrations: [Sentry.breadcrumbsIntegration({ dom: false })],\n});\n",
    // Named, but outside the list, in a comment, or in some other list.
    "Sentry.init({\n  ...getSentryInitOptions(),\n  integrations: [\n    Sentry.breadcrumbsIntegration({ dom: false }),\n  ],\n});\nreportScrubIntegration();\n",
    "Sentry.init({\n  ...getSentryInitOptions(),\n  integrations: [\n    // reportScrubIntegration(),\n    other(), // reportScrubIntegration()\n  ],\n});\n",
    "Sentry.init({ ...getSentryInitOptions(), integrations: [other()], ignoreErrors: [\n  reportScrubIntegration(),\n],\n});\n",
    // Not a plain list, or not the shared options at all.
    "Sentry.init({ ...getSentryInitOptions(), integrations: (defaults) => defaults });\n",
    "Sentry.init({ dsn });\n",
  ];
  for (const source of lost) assert.equal(handsKitTheReportScrub(source), false, source);
  assert.equal(handsKitTheReportScrub("Sentry.init(getSentryInitOptions());\n"), true);
  assert.equal(
    handsKitTheReportScrub("Sentry.init({\n  ...getSentryInitOptions(),\n  integrations: [other([1, 2]), reportScrubIntegration()],\n});\n"),
    true,
  );
});

test("the integration never throws, whatever it is handed", () => {
  const integration = reportScrubIntegration();
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const client = { on: (hook: string, listener: (...args: unknown[]) => void) => void listeners.set(hook, listener) };
  integration.setup?.(client as never);
  assert.deepEqual([...listeners.keys()].sort(), ["beforeSendEvent", "createDsc"]);
  const frozen = Object.freeze({ transaction: JANE_ROW, request: Object.freeze({ data: "x" }) });
  for (const odd of [null, undefined, "text", 7, frozen]) {
    assert.doesNotThrow(() => listeners.get("createDsc")?.(odd));
    assert.doesNotThrow(() => listeners.get("beforeSendEvent")?.(odd, {}));
  }
  // A client with no hooks at all does not stop the kit from starting.
  assert.doesNotThrow(() => integration.setup?.({} as never));
  assert.doesNotThrow(() => integration.setup?.(undefined as never));
});

// ── Other people's software ────────────────────────────────────────────────
//
// Two messages that reached Sentry in the 30 days to October 12, 2026 came
// from outside software: a mail service's link scanner and another app's
// built-in browser. They are on the ignore list, so a real error stands out.

/** The two, in the shapes the kit matches: an error's value, and its type with the value. */
const OUTSIDE_MESSAGES = [
  "Non-Error promise rejection captured with value: Object Not Found Matching Id:2, MethodName:update, ParamCount:4",
  "Object Not Found Matching Id:11, MethodName:simulateEvent, ParamCount:1",
  "Can't find variable: SCDynimacBridge",
  "ReferenceError: SCDynimacBridge is not defined",
];

/** Failures of our own, which must keep reaching Sentry. */
const ORDINARY_MESSAGES = [
  "send failed",
  "Load failed",
  "TypeError: Cannot read properties of undefined (reading 'id')",
  "Object not found",
  "No post matching id: 42",
  "csp: script-src blocked inline",
];

test("the two errors from outside software are on the ignore list, and an ordinary error is not", () => {
  const ignore = getSentryInitOptions().ignoreErrors ?? [];
  const sources = ignore.map((pattern) => (typeof pattern === "string" ? pattern : pattern.source));
  assert.equal(sources.some((source) => source.includes("Object Not Found Matching Id:")), true);
  assert.equal(sources.some((source) => source.includes("SCDynimacBridge")), true);
  // The kit's own matcher: a pattern may sit anywhere in the message.
  for (const message of OUTSIDE_MESSAGES) {
    assert.equal(stringMatchesSomePattern(message, ignore), true, message);
  }
  for (const message of ORDINARY_MESSAGES) {
    assert.equal(stringMatchesSomePattern(message, ignore), false, message);
  }
});

test("the installed kit drops the two with our list, and still sends an ordinary error", async () => {
  const sent: string[] = [];
  const client = new ServerRuntimeClient({
    dsn: "https://public@o0.ingest.sentry.invalid/1",
    ignoreErrors: getSentryInitOptions().ignoreErrors,
    // The kit's own list is off, so only ours can drop anything here.
    integrations: [eventFiltersIntegration({ disableErrorDefaults: true })],
    stackParser: () => [],
    // Records and sends nothing.
    transport: () => ({
      send: async (envelope: unknown) => {
        sent.push(JSON.stringify(envelope));
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  } as unknown as ConstructorParameters<typeof ServerRuntimeClient>[0]);
  client.init();

  const report = (type: string, value: string) =>
    client.captureEvent({ exception: { values: [{ type, value }] } });
  report("UnhandledRejection", OUTSIDE_MESSAGES[0]);
  report("ReferenceError", OUTSIDE_MESSAGES[2]);
  report("Error", "send failed");
  await client.flush(2000);
  await client.close(2000);

  const text = sent.join("\n");
  assert.equal(text.includes("send failed"), true);
  assert.equal(text.includes("Object Not Found Matching Id"), false);
  assert.equal(text.includes("SCDynimacBridge"), false);
});

test("redactClubLinks: a club link's code goes, plain or inside next=; /c/welcome stays", () => {
  assert.equal(
    redactClubLinks("https://www.connectvibe.app/c/K7Q2M9XDAB3CDE4F"),
    "https://www.connectvibe.app/c/[redacted]",
  );
  assert.equal(
    redactClubLinks("/auth/login?next=%2Fc%2Fk7q2-m9xd-ab3c-de4f"),
    "/auth/login?next=%2Fc%2F[redacted]",
  );
  assert.equal(redactClubLinks("/c/welcome"), "/c/welcome");
  assert.equal(redactClubLinks("src/app/c/[code]/page.tsx"), "src/app/c/[code]/page.tsx");
});
