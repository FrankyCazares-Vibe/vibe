/**
 * Tests for the shared event validation (`validate.ts`), S68 officer tools B1.
 * POST /api/events and PATCH /api/events/[id] both run checkEventFields, so
 * these pin what a create refuses AND what an edit may keep.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/events/validate.test.ts
 *
 * The resolve hook lets validate.ts import "./manage" and
 * "../moderation/text-filter" extensionless (same pattern as manage.test.ts).
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("validate.test.ts needs Node >= 22.15 (module.registerHooks)");
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const { checkEventFields, readEventFields } = await import("./validate");
const { EVENT_MAX_DESCRIPTION, EVENT_MAX_LOCATION, EVENT_MAX_TITLE, EVENT_MAX_DURATION_MS } =
  await import("./manage");
const { filterTerms } = await import("../moderation/text-filter-list");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-10-01T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
/** A listed word, taken from the list itself (never spelled out here). */
const BLOCKED = filterTerms()[0].term;

const good = {
  title: "  Rush night  ",
  description: "Pizza and meet the chapter",
  location: "Union 201",
  starts_at: iso(NOW + DAY),
  ends_at: iso(NOW + DAY + 2 * HOUR),
};

/** A stored event, as the database hands it back (+00:00, not Z). */
const stored = {
  title: "Rush night",
  description: "Pizza",
  location: "Union 201",
  starts_at: "2026-10-01T11:00:00+00:00", // started an hour ago: under way
  ends_at: "2026-10-01T15:00:00+00:00",
};

function problemOf(result: ReturnType<typeof checkEventFields>) {
  return result.ok ? null : result.problem;
}

test("create: a normal event passes, trimmed, with ISO times", () => {
  const r = checkEventFields(readEventFields(good), NOW);
  assert.ok(r.ok);
  assert.deepEqual(r.value, {
    title: "Rush night",
    description: "Pizza and meet the chapter",
    location: "Union 201",
    starts_at: iso(NOW + DAY),
    ends_at: iso(NOW + DAY + 2 * HOUR),
    visibility: "everyone",
    icon: null,
    cover_key: null,
  });
});

test("create: POST's refusals, codes and sentences, in POST's order", () => {
  const check = (patch: Record<string, unknown>) =>
    problemOf(checkEventFields(readEventFields({ ...good, ...patch }), NOW));
  assert.deepEqual(check({ title: "   " }), {
    kind: "invalid", status: 400, code: "title_required", error: "Title is required",
  });
  // A non-string reads as "" (as POST always did), not as "unchanged".
  assert.deepEqual(check({ title: 5 }), check({ title: "" }));
  assert.equal(
    (check({ title: "x".repeat(EVENT_MAX_TITLE + 1) }) as { error: string }).error,
    "Title exceeds 120 characters",
  );
  assert.equal(check({ title: "x".repeat(EVENT_MAX_TITLE) }), null);
  assert.equal(
    (check({ description: "x".repeat(EVENT_MAX_DESCRIPTION + 1) }) as { code: string }).code,
    "description_too_long",
  );
  assert.equal(
    (check({ location: "x".repeat(EVENT_MAX_LOCATION + 1) }) as { code: string }).code,
    "location_too_long",
  );
  // Length is checked before the word filter, the filter before the times.
  assert.equal(
    (check({ title: "x".repeat(EVENT_MAX_TITLE + 1), location: BLOCKED }) as { code: string }).code,
    "title_too_long",
  );
  assert.deepEqual(check({ location: `meet at ${BLOCKED}`, starts_at: "nope" }), {
    kind: "content_blocked", status: 422, field: "location",
  });
  assert.deepEqual(check({ description: BLOCKED }), {
    kind: "content_blocked", status: 422, field: "description",
  });
});

test("create: the time rules (required, order, past start, 14 days)", () => {
  const check = (patch: Record<string, unknown>) =>
    problemOf(checkEventFields(readEventFields({ ...good, ...patch }), NOW));
  assert.match((check({ starts_at: undefined }) as { error: string }).error, /required/);
  assert.match((check({ ends_at: iso(NOW + HOUR) }) as { error: string }).error, /after start/);
  assert.match((check({ starts_at: iso(NOW - HOUR) }) as { error: string }).error, /in the past/);
  const long = check({ starts_at: iso(NOW + HOUR), ends_at: iso(NOW + HOUR + EVENT_MAX_DURATION_MS + 1) });
  assert.equal((long as { error: string }).error, "An event can last at most 14 days");
  assert.equal((long as { code: string }).code, "invalid_times");
});

test("edit: a field left out keeps its stored value; one sent replaces it", () => {
  const f = readEventFields({ location: " Union 305 " }, stored);
  assert.deepEqual(f, {
    title: "Rush night",
    description: "Pizza",
    location: "Union 305",
    startsAt: stored.starts_at,
    endsAt: stored.ends_at,
    visibility: "everyone",
    icon: null,
    coverKey: null,
  });
  // Sent but not a string: "" (so `null` clears a description, as POST reads it).
  assert.equal(readEventFields({ description: null }, stored).description, "");
});

test("edit: an event under way can be fixed without moving its past start", () => {
  const r = checkEventFields(readEventFields({ location: "Union 305" }, stored), NOW, stored);
  assert.ok(r.ok);
  assert.equal(r.value.starts_at, "2026-10-01T11:00:00.000Z");
  assert.equal(r.value.location, "Union 305");
  // The same start written differently (Z vs +00:00) is still "kept".
  const same = checkEventFields(
    readEventFields({ starts_at: "2026-10-01T11:00:00.000Z" }, stored), NOW, stored);
  assert.ok(same.ok);
});

test("edit: a MOVED start can't be in the past, and the end must stay in the future", () => {
  const moved = checkEventFields(
    readEventFields({ starts_at: iso(NOW - 2 * HOUR) }, stored), NOW, stored);
  assert.match((problemOf(moved) as { error: string }).error, /Start time is in the past/);
  const endedEarly = checkEventFields(
    readEventFields({ ends_at: iso(NOW - 10 * 60_000) }, stored), NOW, stored);
  assert.deepEqual(problemOf(endedEarly), {
    kind: "invalid", status: 400, code: "invalid_times", error: "End time is in the past",
  });
  // A create has no such rule to trip: its start already can't be in the past.
  const tooLong = checkEventFields(
    readEventFields({ ends_at: iso(Date.parse(stored.starts_at) + EVENT_MAX_DURATION_MS + 1) }, stored),
    NOW, stored);
  assert.equal((problemOf(tooLong) as { code: string }).code, "invalid_times");
});

test("edit: the word filter checks only what changed", () => {
  const legacy = { ...stored, description: `old text ${BLOCKED}` };
  // Stored before the list grew: editing the room still works.
  const keep = checkEventFields(readEventFields({ location: "Union 305" }, legacy), NOW, legacy);
  assert.ok(keep.ok);
  // Re-sending the same stored text (the edit form sends every field) too.
  const resend = checkEventFields(
    readEventFields({ ...legacy, location: "Union 305" }, legacy), NOW, legacy);
  assert.ok(resend.ok);
  // New text is checked.
  const fresh = checkEventFields(readEventFields({ title: `${BLOCKED} party` }, stored), NOW, stored);
  assert.deepEqual(problemOf(fresh), { kind: "content_blocked", status: 422, field: "title" });
  // The same word is refused on a create (no stored value to compare with).
  const create = checkEventFields(readEventFields({ ...good, description: legacy.description }), NOW);
  assert.deepEqual(problemOf(create), { kind: "content_blocked", status: 422, field: "description" });
});

// ── Who can see it (Oct 22, 2026, "Members only" events) ────────────────────

test("visibility: left out of a create is everyone; everyone and members pass; anything else is 400 invalid_visibility", () => {
  const check = (patch: Record<string, unknown>) => checkEventFields(readEventFields({ ...good, ...patch }), NOW);
  const omitted = check({});
  assert.ok(omitted.ok);
  assert.equal(omitted.value.visibility, "everyone");
  for (const value of ["everyone", "members", " members "]) {
    const r = check({ visibility: value });
    assert.ok(r.ok, value);
    assert.equal(r.value.visibility, value.trim());
  }
  for (const value of ["Members", "friends", "", 1, null, true, ["members"]]) {
    assert.deepEqual(problemOf(check({ visibility: value })), {
      kind: "invalid", status: 400, code: "invalid_visibility",
      error: "Choose who can see it: Everyone or Members only",
    }, JSON.stringify(value));
  }
});

test("visibility is checked last and never word-filtered: an older refusal still wins", () => {
  const r = checkEventFields(readEventFields({ ...good, title: "", visibility: "friends" }), NOW);
  assert.equal((problemOf(r) as { code: string }).code, "title_required");
  const times = checkEventFields(readEventFields({ ...good, starts_at: "nope", visibility: "friends" }), NOW);
  assert.equal((problemOf(times) as { code: string }).code, "invalid_times");
  const blockedWord = checkEventFields(readEventFields({ ...good, visibility: BLOCKED }), NOW);
  assert.equal((problemOf(blockedWord) as { code: string }).code, "invalid_visibility", "an enum, not text");
});

test("visibility on an edit: left out keeps the stored value (junk stored reads everyone); sent replaces it", () => {
  const membersOnly = { ...stored, visibility: "members" };
  const kept = checkEventFields(readEventFields({ location: "Union 305" }, membersOnly), NOW, membersOnly);
  assert.ok(kept.ok);
  assert.equal(kept.value.visibility, "members");
  const flipped = checkEventFields(readEventFields({ visibility: "everyone" }, membersOnly), NOW, membersOnly);
  assert.ok(flipped.ok);
  assert.equal(flipped.value.visibility, "everyone");
  const legacy = checkEventFields(readEventFields({}, { ...stored, visibility: null }), NOW, stored);
  assert.ok(legacy.ok);
  assert.equal(legacy.value.visibility, "everyone");
  const junk = checkEventFields(readEventFields({ visibility: "secret" }, membersOnly), NOW, membersOnly);
  assert.equal((problemOf(junk) as { code: string }).code, "invalid_visibility");
});

test("eventVisibilityOf: only an exact \"members\" is members-only", async () => {
  const { eventVisibilityOf, EVENT_VISIBILITIES } = await import("./validate");
  assert.deepEqual([...EVENT_VISIBILITIES], ["everyone", "members"]);
  assert.deepEqual(
    ["members", "everyone", "MEMBERS", " members", null, undefined, 3].map((v) => eventVisibilityOf(v)),
    ["members", "everyone", "everyone", "everyone", "everyone", "everyone", "everyone"],
  );
});

// ── Its icon (Oct 23, 2026, club view wave 3, batch B4) ─────────────────────

const INVALID_ICON = {
  kind: "invalid", status: 400, code: "invalid_icon", error: "Choose one of the event icons, or none",
};

test("icon: left out of a create or sent null is none; each of the twelve keys passes (trimmed); anything else is 400 invalid_icon", async () => {
  const { EVENT_ICON_KEYS } = await import("./event-icons");
  const check = (patch: Record<string, unknown>) => checkEventFields(readEventFields({ ...good, ...patch }), NOW);
  for (const patch of [{}, { icon: null }]) {
    const r = check(patch);
    assert.ok(r.ok, JSON.stringify(patch));
    assert.equal(r.value.icon, null);
  }
  for (const key of [...EVENT_ICON_KEYS, " food "]) {
    const r = check({ icon: key });
    assert.ok(r.ok, key);
    assert.equal(r.value.icon, key.trim());
  }
  for (const value of ["Food", "Meeting", "calendar", "", "   ", "url(x)", 1, true, ["food"], { key: "food" }]) {
    assert.deepEqual(problemOf(check({ icon: value })), INVALID_ICON, JSON.stringify(value));
  }
});

test("icon is checked last and never word-filtered: an older refusal still wins", () => {
  const r = checkEventFields(readEventFields({ ...good, title: "", icon: "nope" }), NOW);
  assert.equal((problemOf(r) as { code: string }).code, "title_required");
  const vis = checkEventFields(readEventFields({ ...good, visibility: "friends", icon: "nope" }), NOW);
  assert.equal((problemOf(vis) as { code: string }).code, "invalid_visibility");
  const blockedWord = checkEventFields(readEventFields({ ...good, icon: BLOCKED }), NOW);
  assert.deepEqual(problemOf(blockedWord), INVALID_ICON, "an enum, not text");
});

test("icon on an edit: left out keeps the stored key (junk stored reads none); sent replaces it; null takes it off", () => {
  const withIcon = { ...stored, icon: "music" };
  const kept = checkEventFields(readEventFields({ location: "Union 305" }, withIcon), NOW, withIcon);
  assert.ok(kept.ok);
  assert.equal(kept.value.icon, "music");
  const swapped = checkEventFields(readEventFields({ icon: "party" }, withIcon), NOW, withIcon);
  assert.ok(swapped.ok);
  assert.equal(swapped.value.icon, "party");
  const off = checkEventFields(readEventFields({ icon: null }, withIcon), NOW, withIcon);
  assert.ok(off.ok);
  assert.equal(off.value.icon, null);
  for (const legacy of [{ ...stored, icon: null }, { ...stored, icon: "Music" }, stored]) {
    const r = checkEventFields(readEventFields({}, legacy), NOW, legacy);
    assert.ok(r.ok);
    assert.equal(r.value.icon, null);
  }
  const junk = checkEventFields(readEventFields({ icon: "secret" }, withIcon), NOW, withIcon);
  assert.deepEqual(problemOf(junk), INVALID_ICON);
});

// ── Its cover photo (Oct 23, 2026, event covers, batch B1) ──────────────────

const ORG = "dddddddd-0000-4000-8000-000000000001";
const OTHER_ORG = "eeeeeeee-0000-4000-8000-000000000002";
const COVER = `orgs/${ORG}/events/3f0e7c1a-1b2c-4d5e-8f90-a1b2c3d4e5f6.jpg`;
const NEW_COVER = `orgs/${ORG}/events/9a8b7c6d-1b2c-4d5e-8f90-a1b2c3d4e5f6.webp`;
const INVALID_COVER = {
  kind: "invalid", status: 400, code: "invalid_cover", error: "That cover photo can't be used. Add it again, or remove it.",
};

test("cover: left out of a create or sent null is none; this club's cover passes (trimmed)", () => {
  const check = (patch: Record<string, unknown>) =>
    checkEventFields(readEventFields({ ...good, ...patch }), NOW, undefined, ORG);
  for (const patch of [{}, { cover_key: null }]) {
    const r = check(patch);
    assert.ok(r.ok, JSON.stringify(patch));
    assert.equal(r.value.cover_key, null);
  }
  for (const value of [COVER, ` ${NEW_COVER} `]) {
    const r = check({ cover_key: value });
    assert.ok(r.ok, value);
    assert.equal(r.value.cover_key, value.trim());
  }
});

test("cover: anything but a cover of THIS club's events is 400 invalid_cover", () => {
  const check = (patch: Record<string, unknown>, orgId: string | null | undefined = ORG) =>
    problemOf(checkEventFields(readEventFields({ ...good, ...patch }), NOW, undefined, orgId));
  for (const value of [
    `orgs/${OTHER_ORG}/events/3f0e7c1a-1b2c-4d5e-8f90-a1b2c3d4e5f6.jpg`,
    `orgs/${ORG}/banner/3f0e7c1a-1b2c-4d5e-8f90-a1b2c3d4e5f6.jpg`,
    `orgs/${ORG}/events/3f0e7c1a-1b2c-4d5e-8f90-a1b2c3d4e5f6.gif`,
    `orgs/${ORG}/events/../x.jpg`,
    "https://example.com/a.jpg",
    "",
    "   ",
    5,
    true,
    [COVER],
    { key: COVER },
  ]) {
    assert.deepEqual(check({ cover_key: value }), INVALID_COVER, JSON.stringify(value));
  }
  // No club (a create whose org_id is missing or malformed): no folder, so no cover.
  assert.deepEqual(check({ cover_key: COVER }, null), INVALID_COVER);
  assert.deepEqual(problemOf(checkEventFields(readEventFields({ ...good, cover_key: COVER }), NOW)), INVALID_COVER);
  // ...and no cover asks nothing of the club.
  assert.equal(check({}, null), null);
});

test("cover is checked last and never word-filtered: an older refusal still wins", () => {
  const check = (patch: Record<string, unknown>) =>
    problemOf(checkEventFields(readEventFields({ ...good, ...patch }), NOW, undefined, ORG));
  assert.equal((check({ title: "", cover_key: "nope" }) as { code: string }).code, "title_required");
  assert.equal((check({ icon: "nope", cover_key: "nope" }) as { code: string }).code, "invalid_icon");
  assert.equal((check({ visibility: "x", cover_key: "nope" }) as { code: string }).code, "invalid_visibility");
  assert.deepEqual(check({ cover_key: BLOCKED }), INVALID_COVER, "a key, not text");
});

test("cover on an edit: left out keeps the stored key; sent replaces it; null takes it off", () => {
  const withCover = { ...stored, cover_key: COVER };
  const kept = checkEventFields(readEventFields({ location: "Union 305" }, withCover), NOW, withCover, ORG);
  assert.ok(kept.ok);
  assert.equal(kept.value.cover_key, COVER);
  const swapped = checkEventFields(readEventFields({ cover_key: NEW_COVER }, withCover), NOW, withCover, ORG);
  assert.ok(swapped.ok);
  assert.equal(swapped.value.cover_key, NEW_COVER);
  const off = checkEventFields(readEventFields({ cover_key: null }, withCover), NOW, withCover, ORG);
  assert.ok(off.ok);
  assert.equal(off.value.cover_key, null);
  for (const legacy of [stored, { ...stored, cover_key: null }, { ...stored, cover_key: "" }]) {
    const r = checkEventFields(readEventFields({}, legacy), NOW, legacy, ORG);
    assert.ok(r.ok);
    assert.equal(r.value.cover_key, null);
  }
  const junk = checkEventFields(readEventFields({ cover_key: "secret" }, withCover), NOW, withCover, ORG);
  assert.deepEqual(problemOf(junk), INVALID_COVER);
});

test("cover on an edit: the stored key sent back unchanged isn't checked again; a new one is", () => {
  // A stored key the rule wouldn't take today (say, written before it) still saves an edit.
  const odd = `orgs/${ORG}/events/legacy-name.jpg`;
  const legacy = { ...stored, cover_key: odd };
  for (const body of [{ location: "Union 305" }, { location: "Union 305", cover_key: odd }]) {
    const r = checkEventFields(readEventFields(body, legacy), NOW, legacy, ORG);
    assert.ok(r.ok, JSON.stringify(body));
    assert.equal(r.value.cover_key, odd);
  }
  // Another club's key is refused even on an event that has a cover.
  const foreign = `orgs/${OTHER_ORG}/events/3f0e7c1a-1b2c-4d5e-8f90-a1b2c3d4e5f6.jpg`;
  const r = checkEventFields(readEventFields({ cover_key: foreign }, legacy), NOW, legacy, ORG);
  assert.deepEqual(problemOf(r), INVALID_COVER);
});

test("storedCoverKey: only a non-empty string is a key", async () => {
  const { storedCoverKey } = await import("./validate");
  assert.deepEqual(
    [COVER, "", null, undefined, 5, {}].map((v) => storedCoverKey(v)),
    [COVER, null, null, null, null, null],
  );
});
