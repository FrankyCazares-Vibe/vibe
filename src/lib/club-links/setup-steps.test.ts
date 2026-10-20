import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./setup-steps.ts";
const { setupProgress, isSetupMark } = (await import(specifier)) as typeof import("./setup-steps");

const EMPTY = {
  logoUrl: null,
  bannerUrl: null,
  description: "",
  officerCount: 0,
  eventCount: 0,
  hasMembersLink: false,
  marks: {},
};

test("a brand-new club: nothing done, six steps in the board's order", () => {
  const p = setupProgress(EMPTY);
  assert.deepEqual(p.steps.map((s) => s.id), ["photo", "about", "who_can_join", "officers", "first_event", "members_link"]);
  assert.equal(p.done, 0);
  assert.equal(p.total, 6);
  assert.equal(p.complete, false);
});

test("photo and cover needs both; one line needs words, not spaces", () => {
  assert.equal(setupProgress({ ...EMPTY, logoUrl: "k" }).steps[0].done, false);
  assert.equal(setupProgress({ ...EMPTY, logoUrl: "k", bannerUrl: "b" }).steps[0].done, true);
  assert.equal(setupProgress({ ...EMPTY, description: "   " }).steps[1].done, false);
  assert.equal(setupProgress({ ...EMPTY, description: "We play chess." }).steps[1].done, true);
});

test("who can join is done only once an officer chose it; officers by an officer or a skip", () => {
  assert.equal(setupProgress({ ...EMPTY, marks: { who_can_join: "2026-10-21T00:00:00Z" } }).steps[2].done, true);
  assert.equal(setupProgress({ ...EMPTY, marks: { who_can_join: 1 } }).steps[2].done, false);
  assert.equal(setupProgress({ ...EMPTY, officerCount: 1 }).steps[3].done, true);
  assert.equal(setupProgress({ ...EMPTY, marks: { officers_skipped: "2026-10-21T00:00:00Z" } }).steps[3].done, true);
});

test("everything done: complete", () => {
  const p = setupProgress({
    logoUrl: "k",
    bannerUrl: "b",
    description: "x",
    officerCount: 2,
    eventCount: 1,
    hasMembersLink: true,
    marks: { who_can_join: "t" },
  });
  assert.equal(p.complete, true);
  assert.equal(p.done, 6);
});

test("marks: only the two known ones", () => {
  assert.equal(isSetupMark("who_can_join"), true);
  assert.equal(isSetupMark("officers_skipped"), true);
  assert.equal(isSetupMark("photo"), false);
  assert.equal(isSetupMark(null), false);
});
