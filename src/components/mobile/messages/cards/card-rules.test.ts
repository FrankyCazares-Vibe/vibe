/**
 * Tests for cards/card-rules.ts (handoffs/chat-redesign/wave-2-contracts.md
 * 11.8, 1.2 "Cards"; W2-S3): the poll bar width, the option label's
 * three-way rule, the sign-up layout rule and progress, the fallback title
 * of a cancelled event, the card labels and the announcements.
 *
 * Run with:
 *   node --test src/components/mobile/messages/cards/card-rules.test.ts
 *
 * The module imports only types, so no resolve hook is needed.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

// A variable specifier: TypeScript refuses a literal `.ts` import without
// `allowImportingTsExtensions`, while Node needs the extension to load it.
const specifier = "./card-rules.ts";
const r = (await import(specifier)) as typeof import("./card-rules");

const person = (name: string, handle = name.toLowerCase().replace(/\W+/g, "")) => ({ id: handle, handle, name, avatar_url: null });

test("pollBarWidth: count over max(total_voters, 1), each bar on its own, capped at 100", () => {
  assert.equal(r.pollBarWidth(7, 12), 58);
  assert.equal(r.pollBarWidth(3, 12), 25);
  assert.equal(r.pollBarWidth(2, 12), 17);
  assert.equal(r.pollBarWidth(0, 0), 0);
  assert.equal(r.pollBarWidth(1, 0), 100);
  assert.equal(r.pollBarWidth(5, 3), 100);
  assert.equal(r.pollBarWidth(-2, 4), 0);
});

test("votesWord", () => {
  assert.equal(r.votesWord(1), "1 vote");
  assert.equal(r.votesWord(0), "0 votes");
  assert.equal(r.votesWord(7), "7 votes");
});

test("optionAriaLabel: including / colon / dot alone (1.2, W0_Cards:57,69)", () => {
  const maya = person("Maya R.");
  const priya = person("Priya S.");
  const sam = person("Sam T.");
  const jonah = person("Jonah K.");
  const ava = person("Ava L.");
  assert.equal(
    r.optionAriaLabel({ label: "Havana Nights", mine: true, count: 7, voters: [maya, priya, sam] }, false),
    "Havana Nights, your pick. 7 votes, including Maya R. and Priya S.",
  );
  assert.equal(r.optionAriaLabel({ label: "Old Hollywood", mine: false, count: 2, voters: [jonah, ava] }, false), "Old Hollywood. 2 votes: Jonah K. and Ava L.");
  assert.equal(r.optionAriaLabel({ label: "Cash", mine: false, count: 1, voters: [sam] }, false), "Cash. 1 vote: Sam T.");
  // A count above the visible names with two or fewer names still reads as every visible voter (PRIVACY-L4).
  assert.equal(r.optionAriaLabel({ label: "Masquerade", mine: false, count: 3, voters: [jonah, ava] }, false), "Masquerade. 3 votes: Jonah K. and Ava L.");
  assert.equal(r.optionAriaLabel({ label: "Venmo", mine: true, count: 9, voters: [] }, true), "Venmo, your pick. 9 votes.");
  assert.equal(r.optionAriaLabel({ label: "Venmo", mine: false, count: 9, voters: [maya, priya, sam] }, true), "Venmo. 9 votes.");
  assert.equal(r.optionAriaLabel({ label: "Nobody", mine: false, count: 0, voters: [] }, false), "Nobody. 0 votes.");
  // A voter without a name speaks their handle, then `Someone`.
  assert.equal(r.optionAriaLabel({ label: "X", mine: false, count: 1, voters: [{ id: "1", handle: "jd", name: "  ", avatar_url: null }] }, false), "X. 1 vote: jd.");
});

test("pollFooter / pollCardLabel", () => {
  assert.equal(r.pollFooter({ total_voters: 12, anonymous: false, closed: false }), "12 voted · names shown");
  assert.equal(r.pollFooter({ total_voters: 13, anonymous: true, closed: false }), "13 voted · anonymous");
  assert.equal(r.pollFooter({ total_voters: 13, anonymous: true, closed: true }), "Closed · 13 voted");
  const open = { question: "Theme for fall formal?", total_voters: 12, anonymous: false, closed: false };
  assert.equal(r.pollCardLabel(open, "Devin O.", false), "Poll from Devin O.: Theme for fall formal? 12 voted, names shown");
  assert.equal(r.pollCardLabel(open, null, false), "Poll from someone: Theme for fall formal? 12 voted, names shown");
  assert.equal(r.pollCardLabel({ ...open, anonymous: true }, "Devin O.", false), "Poll from Devin O.: Theme for fall formal? 12 voted, anonymous");
  assert.equal(r.pollCardLabel({ question: "Dues: Venmo or cash?", total_voters: 13, anonymous: true, closed: false }, null, true), "Your anonymous poll: Dues: Venmo or cash? 13 voted");
  assert.equal(r.pollCardLabel({ ...open, question: "Q?" }, null, true), "Your poll: Q? 12 voted, names shown");
  assert.equal(r.pollCardLabel({ ...open, question: "Q?", closed: true }, "Devin O.", false), "Poll from Devin O.: Q? Closed, 12 voted, names shown");
});

test("signupTwoLine: two-line when any label is longer than 12 characters (open point 14.34)", () => {
  assert.equal(r.signupTwoLine(["Mon 11–12", "Tue 12–1", "Wed 2–3"]), false);
  assert.equal(r.signupTwoLine(["Leaves 6:45", "Leaves 7:00"]), false);
  assert.equal(r.signupTwoLine(["Twelve chars"]), false);
  assert.equal(r.signupTwoLine(["Thirteen char"]), true);
  assert.equal(r.signupTwoLine(["short", "Bring the speakers"]), true);
  assert.equal(r.signupTwoLine([]), false);
  // Code points, not UTF-16 units.
  assert.equal(r.signupTwoLine(["🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉"]), false);
});

test("signupCounts / signupProgress / filledLine", () => {
  const opts = [
    { count: 2, capacity: 2 },
    { count: 1, capacity: 2 },
    { count: 0, capacity: 2 },
  ];
  assert.deepEqual(r.signupCounts(opts), { taken: 3, total: 6 });
  assert.deepEqual(r.signupProgress(6, 3), { kind: "segments", segments: 6, filled: 3 });
  assert.deepEqual(r.signupProgress(12, 12), { kind: "segments", segments: 12, filled: 12 });
  assert.deepEqual(r.signupProgress(13, 4), { kind: "bar", fraction: 4 / 13 });
  assert.deepEqual(r.signupProgress(50, 60), { kind: "bar", fraction: 1 });
  assert.deepEqual(r.signupProgress(0, 0), { kind: "segments", segments: 0, filled: 0 });
  assert.equal(r.filledLine(3, 6, false), "3 of 6 filled");
  assert.equal(r.filledLine(3, 6, true), "Closed · 3 of 6 filled");
});

test("openWord / spotsOpen / takeSpotLabel / leaveLabel / signupCardLabel", () => {
  assert.equal(r.openWord(1), "1 open");
  assert.equal(r.openWord(2), "2 open");
  assert.equal(r.spotsOpen(1), "1 spot open");
  assert.equal(r.takeSpotLabel("Tue 12–1", 1), "Take a spot in Tue 12–1, 1 spot open");
  assert.equal(r.takeSpotLabel("Wed 2–3", 2), "Take a spot in Wed 2–3, 2 spots open");
  assert.equal(r.leaveLabel("Mon 11–12"), "Leave Mon 11–12");
  assert.equal(r.signupCardLabel("Tabling shifts", 3, 6, "Jonah K.", false), "Sign-up from Jonah K.: Tabling shifts, 3 of 6 spots filled");
  assert.equal(r.signupCardLabel("Tabling shifts", 3, 6, null, false), "Sign-up from someone: Tabling shifts, 3 of 6 spots filled");
  assert.equal(r.signupCardLabel("Rides", 4, 6, null, true), "Your sign-up: Rides, 4 of 6 spots filled");
});

test("visibleTakers / firstOpenIndex", () => {
  assert.deepEqual(r.visibleTakers(["a", "b", "c"]), { shown: ["a", "b", "c"], more: 0 });
  assert.deepEqual(r.visibleTakers(["a", "b", "c", "d", "e"]), { shown: ["a", "b", "c"], more: 2 });
  assert.deepEqual(r.visibleTakers([]), { shown: [], more: 0 });
  assert.equal(r.firstOpenIndex([{ full: true, mine: false }, { full: false, mine: true }, { full: false, mine: false }, { full: false, mine: false }]), 2);
  assert.equal(r.firstOpenIndex([{ full: true, mine: false }, { full: false, mine: true }]), -1);
});

test("fallbackEventTitle: between `Event: ` and ` · ` (5.1)", () => {
  assert.equal(r.fallbackEventTitle("Event: Fall Formal · Thu Oct 8, 7:30 PM"), "Fall Formal");
  assert.equal(r.fallbackEventTitle("Event: Fall Formal · Thu Oct 8, 7:30 PM — Bring a friend"), "Fall Formal");
  assert.equal(r.fallbackEventTitle("Event: No date"), "No date");
  assert.equal(r.fallbackEventTitle("Something else entirely"), "Something else entirely");
  assert.equal(r.fallbackEventTitle(""), "");
});

test("eventPlaceLine / goingWord / rsvpSpoken / showAppearLine", () => {
  assert.equal(r.eventPlaceLine("Campus Center 450", "Thu Oct 8, 7:30 PM"), "Campus Center 450 · Thu Oct 8, 7:30 PM");
  assert.equal(r.eventPlaceLine("  ", "Thu Oct 8, 7:30 PM"), "Thu Oct 8, 7:30 PM");
  assert.equal(r.goingWord(18), "18 going");
  assert.equal(r.rsvpSpoken("going"), "you're going");
  assert.equal(r.rsvpSpoken("maybe"), "you said maybe");
  assert.equal(r.rsvpSpoken(null), null);
  assert.equal(r.showAppearLine({ viewer_status: null, room_id: null, state: "soon" }), true);
  assert.equal(r.showAppearLine({ viewer_status: "going", room_id: null, state: "soon" }), false);
  assert.equal(r.showAppearLine({ viewer_status: null, room_id: "r1", state: "soon" }), false);
  assert.equal(r.showAppearLine({ viewer_status: null, room_id: null, state: "closed" }), false);
});

test("eventCardLabel / cancelledEventLabel", () => {
  const input = { title: "Fall Formal", location: "Campus Center 450", whenSpoken: "Thursday October 8, 7:30 PM", going: 18, status: "going" as const };
  assert.equal(r.eventCardLabel(input, "Maya R.", false), "Event shared by Maya R.: Fall Formal, Campus Center 450, Thursday October 8, 7:30 PM. 18 going, you're going");
  assert.equal(r.eventCardLabel({ ...input, location: "", status: "maybe" }, null, false), "Event shared by someone: Fall Formal, Thursday October 8, 7:30 PM. 18 going, you said maybe");
  assert.equal(r.eventCardLabel({ ...input, status: null, going: 0 }, null, true), "Event you shared: Fall Formal, Campus Center 450, Thursday October 8, 7:30 PM. 0 going");
  assert.equal(r.cancelledEventLabel("Fall Formal", "Maya R.", false), "Event shared by Maya R.: Fall Formal. This event was cancelled.");
});

test("announcements (1.2)", () => {
  assert.equal(r.announceVotes(13), "13 voted");
  assert.equal(r.announceFilled(4, 6), "4 of 6 filled");
  assert.equal(r.announceRsvp("going"), "You're going");
  assert.equal(r.announceRsvp("maybe"), "You said maybe");
  assert.equal(r.announceRsvp(null), "RSVP removed");
});

test("whenParts / shareEventLine / shareEventLabel (the Share-an-event rows)", () => {
  assert.deepEqual(r.whenParts("Thu Oct 8, 7:30 PM"), { weekday: "Thu", month: "Oct", day: "8", clock: "7:30 PM" });
  assert.deepEqual(r.whenParts("Tue Oct 13, 7 PM"), { weekday: "Tue", month: "Oct", day: "13", clock: "7 PM" });
  assert.deepEqual(r.whenParts(""), { weekday: "", month: "", day: "", clock: "" });
  assert.equal(r.shareEventLine("Thu Oct 8, 7:30 PM", "Campus Center 450"), "Thu · 7:30 PM · Campus Center 450");
  assert.equal(r.shareEventLine("Tue Oct 13, 7 PM", ""), "Tue · 7 PM");
  assert.equal(r.shareEventLabel("Fall Formal", "Thursday October 8, 7:30 PM", "Campus Center 450", true), "Fall Formal, Thursday October 8, 7:30 PM, Campus Center 450, selected");
  assert.equal(r.shareEventLabel("Open Practice", "Tuesday October 13, 7 PM", "", false), "Open Practice, Tuesday October 13, 7 PM");
});

test("personName", () => {
  assert.equal(r.personName({ name: "Maya R.", handle: "mayar" }), "Maya R.");
  assert.equal(r.personName({ name: "", handle: "mayar" }), "mayar");
  assert.equal(r.personName({ name: " ", handle: " " }), "Someone");
});

test("cardWord: card.type first, then the kind, then the fallback text's prefix", () => {
  const poll = { type: "poll" } as unknown as import("@/lib/chat/types").Card;
  const signup = { type: "signup" } as unknown as import("@/lib/chat/types").Card;
  const event = { type: "event" } as unknown as import("@/lib/chat/types").Card;
  assert.equal(r.cardWord({ kind: "poll", card: poll, content: "Sign-up: Bake sale" }), "Poll");
  assert.equal(r.cardWord({ kind: "poll", card: signup, content: "Poll: Which day?" }), "Sign-up");
  assert.equal(r.cardWord({ kind: "event_card", card: event, content: "" }), "Event");
  // A null card: the kind, and for `poll` the stored fallback's prefix.
  assert.equal(r.cardWord({ kind: "event_card", card: null, content: "Event: Fall Formal · Thu Oct 8, 7:30 PM" }), "Event");
  assert.equal(r.cardWord({ kind: "poll", card: null, content: "Sign-up: Bake sale shifts" }), "Sign-up");
  assert.equal(r.cardWord({ kind: "poll", card: null, content: "Poll: Which day?" }), "Poll");
  assert.equal(r.cardWord({ kind: "poll", card: null, content: "" }), "Poll");
});

test("cardAuthorName: You when mine, the name, the handle, Someone", () => {
  assert.equal(r.cardAuthorName({ users: person("Maya R.") }, true), "You");
  assert.equal(r.cardAuthorName({ users: null }, true), "You");
  assert.equal(r.cardAuthorName({ users: person("Maya R.") }, false), "Maya R.");
  assert.equal(r.cardAuthorName({ users: { ...person("", "mayar"), name: "  " } }, false), "mayar");
  assert.equal(r.cardAuthorName({ users: null }, false), "Someone");
  assert.equal(r.cardAuthorName({ users: { ...person("", ""), name: " " } }, false), "Someone");
});
