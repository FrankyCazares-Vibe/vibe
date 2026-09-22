/**
 * Tests for `entitlement-map.ts`: a Stripe subscription → one entitlements
 * row (handoffs/wave-plan-stripe/contract.md §B, plan-critic B2).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/billing/entitlement-map.test.ts
 *
 * The module has only an `import type` line, which type stripping erases, so
 * it loads through a dynamic import of its ".ts" path, the same pattern as
 * `src/lib/mentions.test.ts`. The subscriptions are hand-built fakes with only
 * the fields the mapper reads; no network, no Stripe account.
 *
 * Every patch is also run through a copy of the entitlements CHECK
 * constraints and of `isPlusActive` (src/lib/premium/require-plus.ts:107-126,
 * copied because that file is server-only), so "fails closed" is checked
 * against the rule the gates actually use.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type Stripe from "stripe";

const specifier = "./entitlement-map.ts";
const { entitlementFromSubscription } = (await import(specifier)) as typeof import("./entitlement-map");
const configSpecifier = "./config.ts";
const { PAST_DUE_GRACE_DAYS } = (await import(configSpecifier)) as typeof import("./config");

type Patch = NonNullable<ReturnType<typeof entitlementFromSubscription>>;
type Prior = Parameters<typeof entitlementFromSubscription>[1];

const NOW = new Date("2026-09-22T12:00:00.000Z");
const NOW_S = NOW.getTime() / 1000;
const DAY_S = 24 * 60 * 60;
const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();

const START = NOW_S - 3 * DAY_S;
const PERIOD_END = NOW_S + 27 * DAY_S;

function sub(fields: Record<string, unknown> = {}, itemEnds: Array<number | null | undefined> = [PERIOD_END]) {
  return {
    id: "sub_test_1",
    object: "subscription",
    status: "active",
    start_date: START,
    cancel_at: null,
    cancel_at_period_end: false,
    ended_at: null,
    customer: "cus_test_1",
    items: { object: "list", data: itemEnds.map((end, i) => ({ id: `si_${i}`, current_period_end: end })) },
    ...fields,
  } as unknown as Stripe.Subscription;
}

function map(s: Stripe.Subscription, prior: Prior = null): Patch | null {
  return entitlementFromSubscription(s, prior, NOW);
}

/** Copy of isPlusActive: the predicate every Vibe+ gate uses. */
function isPlusActive(row: Patch | null, now: Date = NOW): boolean {
  if (!row || row.tier !== "plus") return false;
  const t = now.getTime();
  if (row.status !== "active") {
    const grace = row.grace_until ? new Date(row.grace_until).getTime() : NaN;
    if (!(row.status === "past_due" && Number.isFinite(grace) && grace > t)) return false;
  }
  if (row.current_period_end) {
    const end = new Date(row.current_period_end).getTime();
    if (!Number.isFinite(end) || end <= t) return false;
  }
  return true;
}

/** The entitlements CHECK constraints, and the fields every writer stamps. */
function assertWritable(p: Patch) {
  assert.equal(p.tier, "plus");
  assert.ok(["active", "past_due", "canceled", "expired"].includes(p.status), p.status);
  assert.equal(p.source, "stripe");
  assert.equal(p.provider_ref, "sub_test_1");
  assert.equal(p.started_at, iso(START));
  assert.equal(p.updated_at, NOW.toISOString());
  if (p.status === "active" || p.status === "past_due") {
    assert.notEqual(p.current_period_end, null, "a paid row always has an end");
  }
}

test("active → active, paid through the item's period end", () => {
  const p = map(sub());
  assert.ok(p);
  assertWritable(p);
  assert.equal(p.status, "active");
  assert.equal(p.current_period_end, iso(PERIOD_END));
  assert.equal(p.grace_until, null);
  assert.equal(p.cancel_at_period_end, false);
  assert.equal(isPlusActive(p), true);
});

test("trialing → active", () => {
  const p = map(sub({ status: "trialing" }));
  assert.ok(p);
  assert.equal(p.status, "active");
  assert.equal(p.current_period_end, iso(PERIOD_END));
});

test("a paid status with no readable item period end writes nothing", () => {
  for (const status of ["active", "trialing", "past_due"]) {
    for (const ends of [[], [null], [undefined], [Number.NaN], [Infinity], [0], [PERIOD_END, null]]) {
      assert.equal(map(sub({ status }, ends)), null, `${status} with ends ${JSON.stringify(ends)}`);
    }
    assert.equal(map(sub({ status, items: undefined })), null, `${status} with no items`);
  }
});

test("several items: the earliest period end wins", () => {
  const p = map(sub({}, [PERIOD_END, NOW_S + 5 * DAY_S, PERIOD_END + DAY_S]));
  assert.ok(p);
  assert.equal(p.current_period_end, iso(NOW_S + 5 * DAY_S));
});

test("cancel_at_period_end is carried through, access runs to the period end", () => {
  const p = map(sub({ cancel_at_period_end: true }));
  assert.ok(p);
  assert.equal(p.status, "active");
  assert.equal(p.cancel_at_period_end, true);
  assert.equal(p.current_period_end, iso(PERIOD_END));
  assert.equal(isPlusActive(p), true);
  assert.equal(isPlusActive(p, new Date((PERIOD_END + 1) * 1000)), false);
});

test("cancel_at before the item end: ends at cancel_at and says so", () => {
  const cancelAt = NOW_S + 4 * DAY_S;
  const p = map(sub({ cancel_at: cancelAt, cancel_at_period_end: false }));
  assert.ok(p);
  assert.equal(p.status, "active");
  assert.equal(p.current_period_end, iso(cancelAt));
  assert.equal(p.cancel_at_period_end, true);
});

test("cancel_at after the item end: the item end still wins", () => {
  const p = map(sub({ cancel_at: PERIOD_END + 60 * DAY_S }));
  assert.ok(p);
  assert.equal(p.current_period_end, iso(PERIOD_END));
  assert.equal(p.cancel_at_period_end, true);
});

test("past_due opens a seven-day grace window", () => {
  const p = map(sub({ status: "past_due" }));
  assert.ok(p);
  assertWritable(p);
  assert.equal(p.status, "past_due");
  assert.equal(p.current_period_end, iso(PERIOD_END));
  assert.equal(p.grace_until, iso(NOW_S + 7 * DAY_S));
  assert.equal(isPlusActive(p), true);
  assert.equal(isPlusActive(p, new Date((NOW_S + 7 * DAY_S + 1) * 1000)), false);
});

/** A past_due subscription whose items carry both period bounds. */
function pastDue(items: Array<{ start: number | null; end: number }>) {
  const data = items.map(({ start, end }, i) => ({ id: `si_${i}`, current_period_start: start, current_period_end: end }));
  return sub({ status: "past_due", items: { object: "list", data } });
}

test("a first failure's grace counts from when the unpaid period began", () => {
  // The event reached us three days late: four days of grace remain, not seven.
  const p = map(pastDue([{ start: NOW_S - 3 * DAY_S, end: PERIOD_END }]));
  assert.ok(p);
  assert.equal(p.grace_until, iso(NOW_S + 4 * DAY_S));

  // Several items: the latest start is when the unpaid period began.
  const q = map(pastDue([
    { start: NOW_S - 20 * DAY_S, end: PERIOD_END },
    { start: NOW_S - DAY_S, end: PERIOD_END },
  ]));
  assert.ok(q);
  assert.equal(q.grace_until, iso(NOW_S + 6 * DAY_S));

  // Long ago: the window is already over.
  const r = map(pastDue([{ start: NOW_S - 30 * DAY_S, end: PERIOD_END }]));
  assert.ok(r);
  assert.equal(isPlusActive(r), false);
});

test("grace is never more than seven days from now, and from now when Stripe gives no start", () => {
  const future = map(pastDue([{ start: NOW_S + 2 * DAY_S, end: PERIOD_END }]));
  assert.ok(future);
  assert.equal(future.grace_until, iso(NOW_S + 7 * DAY_S));

  const noStart = map(pastDue([{ start: null, end: PERIOD_END }]));
  assert.ok(noStart);
  assert.equal(noStart.grace_until, iso(NOW_S + 7 * DAY_S));
});

test("repeat failures on the same subscription never extend the grace", () => {
  const firstGrace = iso(NOW_S + 2 * DAY_S);
  const prior: Prior = {
    status: "past_due",
    source: "stripe",
    grace_until: firstGrace,
    current_period_end: iso(PERIOD_END),
    provider_ref: "sub_test_1",
  };
  const p = map(sub({ status: "past_due" }), prior);
  assert.ok(p);
  assert.equal(p.grace_until, firstGrace);

  // An expired window stays expired.
  const lapsed = { ...prior, grace_until: iso(NOW_S - DAY_S) };
  const q = map(sub({ status: "past_due" }), lapsed);
  assert.ok(q);
  assert.equal(q.grace_until, iso(NOW_S - DAY_S));
  assert.equal(isPlusActive(q), false);

  // A stored window that can't be read counts as over, not as a fresh one.
  for (const unreadable of [null, "not a date"]) {
    const r = map(sub({ status: "past_due" }), { ...prior, grace_until: unreadable });
    assert.ok(r);
    assert.equal(r.grace_until, NOW.toISOString());
    assert.equal(isPlusActive(r), false);
  }
});

test("grace from a DIFFERENT subscription or state is not reused", () => {
  const otherSub: Prior = {
    status: "past_due",
    source: "stripe",
    grace_until: iso(NOW_S - DAY_S),
    current_period_end: iso(PERIOD_END),
    provider_ref: "sub_other",
  };
  const p = map(sub({ status: "past_due" }), otherSub);
  assert.ok(p);
  assert.equal(p.grace_until, iso(NOW_S + 7 * DAY_S));

  const wasActive: Prior = { ...otherSub, status: "active", provider_ref: "sub_test_1", grace_until: null };
  const q = map(sub({ status: "past_due" }), wasActive);
  assert.ok(q);
  assert.equal(q.grace_until, iso(NOW_S + 7 * DAY_S));
});

test("unpaid and paused → canceled, ending now", () => {
  for (const status of ["unpaid", "paused"]) {
    const p = map(sub({ status }));
    assert.ok(p, status);
    assertWritable(p);
    assert.equal(p.status, "canceled");
    assert.equal(p.current_period_end, NOW.toISOString());
    assert.equal(p.grace_until, null);
    assert.equal(isPlusActive(p), false);
  }
});

test("canceled → canceled at ended_at, or now when Stripe gives none", () => {
  const endedAt = NOW_S - 60;
  const p = map(sub({ status: "canceled", ended_at: endedAt }));
  assert.ok(p);
  assertWritable(p);
  assert.equal(p.status, "canceled");
  assert.equal(p.current_period_end, iso(endedAt));
  assert.equal(isPlusActive(p), false);

  const q = map(sub({ status: "canceled", ended_at: null }, []));
  assert.ok(q, "a canceled subscription needs no item period end");
  assert.equal(q.current_period_end, NOW.toISOString());
});

test("incomplete_expired → expired", () => {
  const p = map(sub({ status: "incomplete_expired" }));
  assert.ok(p);
  assertWritable(p);
  assert.equal(p.status, "expired");
  assert.equal(isPlusActive(p), false);
});

test("incomplete and unknown statuses write nothing", () => {
  assert.equal(map(sub({ status: "incomplete" })), null);
  for (const status of ["something_new", "", "ACTIVE", undefined]) {
    assert.equal(map(sub({ status })), null, String(status));
  }
});

test("started_at falls back to now when Stripe gives no start date", () => {
  const p = map(sub({ start_date: null }));
  assert.ok(p);
  assert.equal(p.started_at, NOW.toISOString());
});

test("the grace length is the same number as config.ts", () => {
  const source = readFileSync(new URL("./entitlement-map.ts", import.meta.url), "utf8");
  const copy = source.match(/const PAST_DUE_GRACE_DAYS = (\d+);/);
  assert.ok(copy, "entitlement-map.ts keeps its own copy");
  assert.equal(Number(copy[1]), PAST_DUE_GRACE_DAYS);
});
