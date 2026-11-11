/**
 * Otto's desk, the pure half (desk.ts, Wave 2A, Nov 10, 2026): officer vs
 * student, empty states, the one-coral rule, honesty (nothing says Otto did,
 * sent or will send anything), count floors, and the 7-day / 8-30-day split.
 * "Now" is Tue Nov 10 2026, noon on campus (EST, UTC-5).
 *
 * Run with:
 *   node --test src/lib/otto/desk.test.ts
 *
 * WHY THE RESOLVE HOOK: as in up-next-steps.test.ts, Node's type stripping
 * doesn't resolve the "@/…" alias or add file extensions, and desk.ts reads
 * campus time and the Up next steps through them.
 */
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("desk.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const D = (await import(new URL("./desk.ts", import.meta.url).href)) as typeof import("./desk");
type DeskInput = import("./desk").DeskInput;
type DeskModel = import("./desk").DeskModel;
type DeskClubFacts = import("./desk").DeskClubFacts;
type DeskClubEvent = import("./desk").DeskClubEvent;

const NOW = new Date("2026-11-10T17:00:00Z");
const H = 60 * 60 * 1000;
const DAY = 24 * H;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

const CLUB = { orgId: "org-1", name: "Canal Run Club", handle: "canalrun", role: "owner" as const, avatarUrl: null };
const CLUB_2 = { orgId: "org-2", name: "Chess", handle: "chess", role: "officer" as const };

function studentInput(over: Partial<DeskInput> = {}): DeskInput {
  return {
    clubs: [],
    actingAs: null,
    club: null,
    followers: [],
    unreadDms: 0,
    reminders: [],
    going: [],
    checkedIn: [],
    rsvpsMade: [],
    notifications: [],
    ...over,
  };
}

function facts(over: Partial<DeskClubFacts> = {}): DeskClubFacts {
  return { memberCount: 38, requests: [], setup: null, drafts: [], events: [], latestPostAt: null, posts: [], joins: [], ...over };
}

function officerInput(f: Partial<DeskClubFacts> = {}, over: Partial<DeskInput> = {}): DeskInput {
  return studentInput({ clubs: [CLUB, CLUB_2], actingAs: CLUB, club: facts(f), ...over });
}

function event(id: string, startOffset: number, over: Partial<DeskClubEvent> = {}): DeskClubEvent {
  return {
    id,
    title: `Event ${id}`,
    starts_at: at(startOffset),
    ends_at: at(startOffset + 2 * H),
    location: "The Lantern Room",
    going_count: 12,
    interested_count: 3,
    checkin_open: false,
    checked_in_count: null,
    visibility: "everyone",
    created_at: at(-20 * DAY),
    ...over,
  };
}

const request = (id: string, name: string, canAccept = true, ageMs = 2 * H) => ({
  id,
  person: { id: `u-${id}`, name, handle: name.toLowerCase() },
  requestedAt: at(-ageMs),
  canAccept,
});

/** A busy officer desk and a busy student desk, used by the rule tests below. */
function busyOfficer(): DeskModel {
  return D.buildDesk(
    officerInput({
      requests: [request("r1", "Maya Lopez"), request("r2", "Jordan Lee", false)],
      setup: [{ id: "photo", done: true }, { id: "officers", done: false }, { id: "first_event", done: false }],
      drafts: [{ id: "p-draft", excerpt: "Saturday long run, meet at the canal", createdAt: at(-3 * H) }],
      events: [event("tomorrow", DAY), event("past", -3 * DAY, { checked_in_count: 9, created_at: at(-6 * DAY) })],
      posts: [{ id: "p1", excerpt: "Great turnout tonight!", createdAt: at(-2 * DAY) }],
      latestPostAt: at(-2 * DAY), // the thank-you for "past" is posted, so Up next is tomorrow's
      joins: [at(-1 * DAY), at(-2 * DAY), at(-12 * DAY)],
    }),
    NOW,
  );
}

function busyStudent(): DeskModel {
  return D.buildDesk(
    studentInput({
      unreadDms: 2,
      followers: [{ id: "f1", name: "Sam Park", handle: "sam", followedAt: at(-5 * H) }],
      reminders: [
        { id: "rem-undated", title: "Ask about the bake sale", remindAt: null, createdAt: at(-DAY) },
        { id: "rem-thu", title: "Bring the banner", remindAt: at(2 * DAY) },
      ],
      going: [
        { id: "e-fri", title: "Trivia night", startsAt: at(3 * DAY + 6.5 * H), endsAt: at(3 * DAY + 9 * H), orgHandle: "chess" },
        { id: "e-far", title: "Formal", startsAt: at(9 * DAY), endsAt: at(9 * DAY + 3 * H), orgHandle: "chess" },
      ],
      checkedIn: [{ id: "e-old", title: "Blitz night", startsAt: at(-3 * DAY), endsAt: at(-3 * DAY + 2 * H), orgHandle: "chess" }],
      rsvpsMade: [
        { id: "e-fri", title: "Trivia night", startsAt: at(3 * DAY), endsAt: at(3 * DAY + 2 * H), rsvpAt: at(-DAY), status: "going" },
        { id: "e-x", title: "Open mic", startsAt: at(-9 * DAY), endsAt: at(-9 * DAY + H), rsvpAt: at(-10 * DAY), status: "maybe" },
      ],
      notifications: [
        { id: "n1", type: "post_like", createdAt: at(-2 * H), actorName: "Riley Chen", orgName: null, orgHandle: null, postId: "p9", eventTitle: null, eventStartsAt: null },
        { id: "n2", type: "event_cancelled", createdAt: at(-DAY), actorName: null, orgName: "Chess", orgHandle: "chess", postId: null, eventTitle: "Blitz night", eventStartsAt: at(DAY) },
        { id: "n3", type: "brand_new_type", createdAt: at(-3 * DAY), actorName: "Ann", orgName: null, orgHandle: null, postId: null, eventTitle: null, eventStartsAt: null },
      ],
    }),
    NOW,
  );
}

const allItems = (m: DeskModel) => [...m.ready, ...m.scheduled, ...m.done, ...m.saw, ...m.earlier];

// ── Officer vs student ─────────────────────────────────────────────────────

test("a student desk: no club, Ready = unread DMs, follow-backs, undated reminders", () => {
  const m = busyStudent();
  assert.equal(m.role, "student");
  assert.equal(m.actingAs, null);
  assert.deepEqual(m.ready.map((i) => i.kind), ["unread_dm", "follow_back", "reminder"]);
  assert.equal(m.ready[0].title, "2 unread messages");
  assert.deepEqual(m.ready[0].verb, { kind: "link", label: "Open Messages", href: "/messages" });
  assert.equal(m.ready[1].title, "Sam followed you");
  assert.equal(m.ready[1].href, "/profile/sam");
  assert.equal(m.ready[2].whenLabel, "Reminder");
});

test("a student's Scheduled: Going within 7 days and dated reminders, soonest first", () => {
  const m = busyStudent();
  assert.deepEqual(m.scheduled.map((i) => i.id), ["reminder:rem-thu", "rsvp:e-fri"]);
  assert.equal(m.scheduled[0].whenLabel, "Reminder · Thu");
  assert.equal(m.scheduled[1].whenLabel, "Fri, Nov 13 · 6:30 PM");
  assert.equal(m.scheduled[1].href, "/orgs/chess?event=e-fri");
  assert.ok(!m.scheduled.some((i) => i.id === "rsvp:e-far"), "nine days out is not this week");
});

test("an officer desk acts as the club: requests, Up next, setup, drafts, in that order", () => {
  const m = busyOfficer();
  assert.equal(m.role, "officer");
  assert.equal(m.actingAs?.handle, "canalrun");
  assert.deepEqual(m.clubs.map((c) => c.handle), ["canalrun", "chess"]);
  assert.deepEqual(m.ready.map((i) => i.kind), ["join_request", "join_request", "up_next", "setup_step", "draft"]);
  const [maya, jordan, upNext, setup, draft] = m.ready;
  assert.deepEqual(maya.verb, { kind: "join_request", label: "Accept", orgSlug: "canalrun", requestId: "r1" });
  assert.equal(maya.detail, "Accept makes Maya member 39.");
  assert.ok(maya.willHappen?.includes("Maya becomes member 39"));
  // One that the approve route would refuse gets no Accept and no promises.
  assert.deepEqual(jordan.verb, { kind: "link", label: "Review", href: "/orgs/canalrun/tools/requests" });
  assert.equal(jordan.willHappen, undefined);
  assert.equal(upNext.title, "Event tomorrow");
  // The button only opens the club page, so it says that; the step is in the line.
  assert.equal(upNext.verb?.label, "Open Up next");
  assert.match(upNext.detail ?? "", /^Tomorrow · 12 going · 3 interested\. Next: Share the event\.$/);
  assert.equal(setup.detail, "1 of 3 done. Next: Add your officers.");
  assert.equal(setup.href, "/orgs/canalrun/setup");
  assert.equal(draft.href, "/posts/p-draft");
  assert.deepEqual(m.scheduled.map((i) => i.id), ["event:tomorrow"]);
  assert.equal(m.scheduled[0].detail, "Posted · 12 going");
});

test("an officer desk leaves the student's own rows out", () => {
  const m = D.buildDesk(
    officerInput({}, {
      unreadDms: 4,
      followers: [{ id: "f1", name: "Sam", handle: "sam", followedAt: at(-H) }],
      going: [{ id: "e1", title: "Trivia", startsAt: at(DAY), endsAt: at(DAY + H) }],
    }),
    NOW,
  );
  assert.ok(!allItems(m).some((i) => i.kind === "unread_dm" || i.kind === "follow_back" || i.kind === "rsvp"));
});

test("more than five requests fold into one row to Club tools", () => {
  const reqs = Array.from({ length: 8 }, (_, i) => request(`r${i}`, `Person${i}`));
  const m = D.buildDesk(officerInput({ requests: reqs }), NOW);
  const jr = m.ready.filter((i) => i.kind === "join_request");
  assert.equal(jr.length, 6);
  assert.equal(jr[5].title, "3 more people asked to join");
  assert.equal(jr[5].href, "/orgs/canalrun/tools/requests");
  // Eight people waiting is eight things, not six.
  assert.match(m.say, /^eight things are ready\./);
});

test("a thank-you owed puts Up next on Post a thank-you", () => {
  const m = D.buildDesk(officerInput({ events: [event("past", -2 * DAY, { checked_in_count: 9 })], latestPostAt: null }), NOW);
  assert.equal(m.ready[0].kind, "up_next");
  assert.equal(m.ready[0].verb?.label, "Open Up next");
  assert.equal(m.ready[0].detail, "Done · 9 came. Next: Post a thank-you.");
});

test("unknown member count: Accept still offered, no number promised", () => {
  const m = D.buildDesk(officerInput({ memberCount: null, requests: [request("r1", "Maya")] }), NOW);
  assert.equal(m.ready[0].detail, "Accept lets Maya in.");
  assert.ok(!(m.ready[0].willHappen ?? []).some((l) => /\d/.test(l)));
});

test("Acting as: ?club=me is the person's own desk, a handle picks, anything else is the first club", () => {
  assert.equal(D.chooseActingClub([CLUB, CLUB_2], null)?.handle, "canalrun");
  assert.equal(D.chooseActingClub([CLUB, CLUB_2], "CHESS")?.handle, "chess");
  assert.equal(D.chooseActingClub([CLUB, CLUB_2], "nope")?.handle, "canalrun");
  assert.equal(D.chooseActingClub([CLUB, CLUB_2], "me"), null);
  assert.equal(D.chooseActingClub([], null), null);
});

// ── Empty states ───────────────────────────────────────────────────────────

test("an empty student desk: every section empty, Otto's default empty lines, all-clear sky", () => {
  const m = D.buildDesk(studentInput(), NOW);
  for (const k of ["ready", "scheduled", "done", "saw", "earlier"] as const) assert.deepEqual(m[k], [], k);
  assert.deepEqual(m.empty, {
    ready: "nothing needs you right now.",
    scheduled: "nothing on the calendar this week.",
    done: "nothing done yet this week. that's fine.",
    saw: "quiet so far.",
  });
  assert.equal(m.say, "all clear. i'll put things here when they need you.");
  assert.equal(D.deskPrimaryId(m), null);
});

test("an empty officer desk is still an officer desk", () => {
  const m = D.buildDesk(officerInput(), NOW);
  assert.equal(m.role, "officer");
  assert.equal(m.ready.length + m.scheduled.length + m.done.length, 0);
  assert.equal(m.say, "all clear. i'll put things here when they need you.");
  // An officer's Scheduled is every upcoming event, so its empty line isn't "this week".
  assert.equal(m.empty.scheduled, "nothing on the calendar yet.");
});

test("a student desk with a failed read never says all clear", () => {
  for (const f of ["dms", "asking", "upcoming"]) {
    const m = D.buildDesk(studentInput({ missing: [f] }), NOW);
    assert.doesNotMatch(m.say, /all clear/, f);
    assert.equal(m.say, "part of my desk didn't load. try again in a bit.");
  }
  // Otto saw failing doesn't touch the sky line (it never mentions Saw).
  assert.match(D.buildDesk(studentInput({ missing: ["activity"] }), NOW).say, /^all clear/);
});

test("the student sky line has no send queue", () => {
  const m = busyStudent();
  assert.doesNotMatch(m.say, /goes out/);
  assert.match(m.say, /waiting for you\.$/);
  assert.equal(D.skyLine({ ready: 1, scheduled: 0, role: "student" }), "one thing is waiting for you.");
});

test("a failed unread read leaves the row out instead of saying 0", () => {
  const m = D.buildDesk(studentInput({ unreadDms: null }), NOW);
  assert.equal(m.ready.length, 0);
});

test("the sky line counts in words, lowercase", () => {
  assert.equal(D.skyLine({ ready: 1, scheduled: 0 }), "one thing is ready. nothing goes out without you.");
  assert.equal(D.skyLine({ ready: 2, scheduled: 5 }), "two things are ready. nothing goes out without you.");
  assert.equal(D.skyLine({ ready: 0, scheduled: 3 }), "all clear. three things on the calendar.");
  assert.equal(D.skyLine({ ready: 14, scheduled: 0 }), "14 things are ready. nothing goes out without you.");
  for (const m of [busyOfficer(), busyStudent()]) assert.equal(m.say, m.say.toLowerCase());
});

// ── One coral per frame ────────────────────────────────────────────────────

test("one coral: only ready[0]'s verb is primary, and deskPrimaryId names it", () => {
  for (const m of [busyOfficer(), busyStudent()]) {
    const primaries = allItems(m).filter((i) => i.primary);
    assert.equal(primaries.length, 1, "exactly one primary");
    assert.equal(primaries[0], m.ready[0]);
    assert.ok(m.ready[0].verb, "the primary has a verb to draw");
    assert.equal(D.deskPrimaryId(m), m.ready[0].id);
    // Other rows keep their verbs; they render quiet.
    assert.ok(m.ready.slice(1).some((i) => i.verb && !i.primary));
  }
});

test("one coral: a top row without a verb means no coral at all", () => {
  const m = D.buildDesk(studentInput({ reminders: [{ id: "r", title: "Call home", remindAt: null }] }), NOW);
  assert.equal(m.ready[0].verb, undefined);
  assert.equal(allItems(m).filter((i) => i.primary).length, 0);
  assert.equal(D.deskPrimaryId(m), null);
});

// ── Honesty ────────────────────────────────────────────────────────────────

/** Things only a working Otto agent could say. None of them is true yet. */
const DISHONEST = [
  /\botto (did|does|drafted|wrote|sent|sends|posted|will|is going to|reminds?|handled)\b/i,
  /\bi(?:'ll| will| am going to|'m going to) (send|remind|post|draft|message|notify|tell|share|email|text)\b/i,
  /\bi (sent|drafted|posted|wrote|reminded|handled|did)\b/i,
  /\b(will|i'll) remind\b/i,
  /\bremind(s|ing)? you\b/i,
  /\bwe('ll| will) (send|remind)\b/i,
  /\bask otto\b/i,
  /\bthings otto did\b/i,
  /\bdrafted by\b/i,
];

function strings(m: DeskModel): string[] {
  const out = [m.say, ...Object.values(m.empty)];
  for (const i of allItems(m)) {
    out.push(i.title, i.detail ?? "", i.whenLabel ?? "", i.verb?.label ?? "", ...(i.willHappen ?? []));
  }
  return out.filter(Boolean);
}

test("honesty: nothing the desk prints says Otto did, sent, drafted or will send anything", () => {
  const texts = [
    ...strings(busyOfficer()),
    ...strings(busyStudent()),
    ...strings(D.buildDesk(studentInput(), NOW)),
    ...strings(D.buildDesk(officerInput({ requests: Array.from({ length: 7 }, (_, i) => request(`r${i}`, `P${i}`)) }), NOW)),
    ...[0, 1, 2, 11].flatMap((ready) => [0, 1, 4].map((scheduled) => D.skyLine({ ready, scheduled }))),
    ...Object.values(D.DESK_EMPTY),
  ];
  assert.ok(texts.length > 40);
  for (const t of texts) for (const bad of DISHONEST) assert.doesNotMatch(t, bad, `"${t}"`);
});

test("honesty: reminders are labelled as reminders, never promised", () => {
  assert.equal(D.reminderLabel(null, NOW.getTime()), "Reminder");
  assert.equal(D.reminderLabel(at(2 * DAY), NOW.getTime()), "Reminder · Thu");
  assert.equal(D.reminderLabel(at(H), NOW.getTime()), "Reminder · Today");
  assert.equal(D.reminderLabel(at(10 * DAY), NOW.getTime()), "Reminder · Nov 20");
});

test("honesty: what will happen on Accept is what the approve route does today", () => {
  const [maya] = busyOfficer().ready;
  assert.deepEqual(maya.willHappen, [
    "Maya becomes member 39",
    "Maya gets a notice that you said yes",
    "Maya joins the club's open chats",
  ]);
  for (const i of [...busyStudent().ready, ...busyOfficer().ready.slice(1)]) {
    if (i.verb?.kind !== "join_request") assert.equal(i.willHappen, undefined, i.id);
  }
});

test("sentence case: every title and detail starts with a capital, a digit or @", () => {
  for (const m of [busyOfficer(), busyStudent()]) {
    for (const i of allItems(m)) {
      assert.match(i.title, /^[A-Z0-9@]/, i.id);
      if (i.detail) assert.match(i.detail, /^[A-Z0-9@]/, `${i.id} detail`);
    }
  }
});

test("honesty: the scan itself catches the lines it must", () => {
  for (const bad of ["Otto sent the reminder", "I'll remind you Thursday", "I drafted this for you", "ask otto", "Things Otto did"]) {
    assert.ok(DISHONEST.some((re) => re.test(bad)), bad);
  }
});

// ── Counts ─────────────────────────────────────────────────────────────────

test("counts: exact for officers; another person's count shows to others only from 5 up", () => {
  assert.equal(D.shownCount(2, true), 2);
  assert.equal(D.shownCount(0, true), 0);
  assert.equal(D.shownCount(4, false), null);
  assert.equal(D.shownCount(5, false), 5);
  assert.equal(D.shownCount(38.9, false), 38);
  for (const junk of [null, undefined, NaN, -1, Infinity]) assert.equal(D.shownCount(junk as number, true), null, String(junk));
});

test("counts: check-ins show the officer's exact number, and nothing when unknown or none", () => {
  const m = D.buildDesk(
    officerInput({
      events: [
        event("three", -2 * DAY, { checked_in_count: 3 }),
        event("unknown", -3 * DAY, { checked_in_count: null }),
        event("zero", -4 * DAY, { checked_in_count: 0 }),
      ],
      latestPostAt: at(-H),
    }),
    NOW,
  );
  const checkins = m.done.filter((i) => i.kind === "checkin");
  assert.deepEqual(checkins.map((i) => i.title), ["3 checked in at Event three"]);
});

test("counts: new members are a number, never who", () => {
  const m = busyOfficer();
  const joined = [...m.done, ...m.earlier].filter((i) => i.id.startsWith("join_request:joined:"));
  assert.deepEqual(joined.map((i) => i.title), ["2 new members", "1 new member"]);
  for (const i of joined) assert.doesNotMatch(`${i.title} ${i.detail}`, /Maya|Jordan|@/);
});

test("counts: a student desk prints no one else's count", () => {
  for (const i of allItems(busyStudent())) {
    if (i.kind === "unread_dm") continue; // their own unread messages
    assert.doesNotMatch(`${i.title} ${i.detail ?? ""}`, /\b\d+ (going|interested|checked in|members?|followers?)\b/, i.id);
  }
});

// ── Done this week (7 days) and Earlier (8-30 days) ─────────────────────────

test("the split: 0-7 days is Done this week, 8-30 days is Earlier, older drops, newest first", () => {
  const post = (id: string, ageMs: number) => ({ id, excerpt: `Post ${id}`, createdAt: at(-ageMs) });
  const m = D.buildDesk(
    officerInput({
      posts: [post("a", H), post("b", 7 * DAY - H), post("c", 7 * DAY + H), post("d", 29 * DAY), post("e", 31 * DAY), post("future", -DAY)],
    }),
    NOW,
  );
  assert.deepEqual(m.done.map((i) => i.id), ["post:a", "post:b"]);
  assert.deepEqual(m.earlier.map((i) => i.id), ["post:c", "post:d"]);
  for (const i of [...m.done, ...m.earlier]) assert.equal(i.stamp, "done");
  assert.equal(m.done[0].whenLabel, "Today");
  assert.equal(m.earlier[1].whenLabel, "Oct 12");
});

test("the split for a student: a check-in this week, an RSVP from ten days ago is Earlier", () => {
  const m = busyStudent();
  assert.deepEqual(m.done.map((i) => i.id), ["rsvp:made:e-fri", "checkin:e-old"]);
  assert.equal(m.done[1].title, "Checked in at Blitz night");
  assert.equal(m.done[1].whenLabel, "Sat");
  assert.deepEqual(m.earlier.map((i) => i.id), ["rsvp:made:e-x"]);
  assert.equal(m.earlier[0].title, "Interested in Open mic");
});

test("the split helper is exact at the edges", () => {
  const item = (id: string) => ({ id, kind: "post" as const, title: id });
  const now = NOW.getTime();
  const { done, earlier } = D.splitDone(
    [
      { at: now - 7 * DAY, item: item("edge7") },
      { at: now - 7 * DAY - 1, item: item("just-past") },
      { at: now - 30 * DAY, item: item("edge30") },
      { at: now - 30 * DAY - 1, item: item("gone") },
      { at: NaN, item: item("nan") },
    ],
    now,
  );
  assert.deepEqual(done.map((i) => i.id), ["edge7"]);
  assert.deepEqual(earlier.map((i) => i.id), ["just-past", "edge30"]);
});

// ── Otto saw ───────────────────────────────────────────────────────────────

test("Otto saw: notifications in today's words, a cancelled event as its own kind", () => {
  const m = busyStudent();
  assert.deepEqual(m.saw.map((i) => i.kind), ["notification", "cancelled", "notification"]);
  assert.deepEqual(m.saw.map((i) => i.href), ["/posts/p9", "/orgs/chess", undefined]);
  assert.deepEqual(m.saw.map((i) => i.whenLabel), ["2h", "1d", "3d"]);
  assert.equal(m.saw[0].title, "Riley liked your post");
  assert.match(m.saw[1].title, /^Chess cancelled Blitz night/);
  assert.equal(m.saw[2].title, "Something new on your account");
});
