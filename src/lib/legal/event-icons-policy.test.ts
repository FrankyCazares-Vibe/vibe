/**
 * Since Oct 23, 2026 a club's event can show an icon its officers pick (one
 * of twelve, src/lib/events/event-icons.ts; supabase/migrations/
 * 20261027100000_event_icons.sql). What Vibe stores about an event (section
 * 3c) names it in both copies of the policy, the text file and the page,
 * the same day it shipped.
 *
 * Run with:
 *   node --test src/lib/legal/event-icons-policy.test.ts
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const readRoot = (file: string) => readFileSync(new URL(file, root), "utf8");
const oneLine = (s: string) => s.replace(/\s+/g, " ");

const TEXT_FILE = "handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md";
const PAGE_DIR = "src/app/legal/privacy/";

function pageCopy(): string {
  return readdirSync(new URL(PAGE_DIR, root))
    .filter((f) => f.endsWith(".tsx"))
    .sort()
    .map((f) => readRoot(PAGE_DIR + f))
    .join("\n");
}

// Apostrophe-free and quote-free, so the same words match both copies.
const PHRASE = "the icon its club picked for it, your RSVPs (Going or Interested)";

test("both copies of the policy name an event's icon among what Vibe stores", () => {
  for (const [name, text] of [
    [TEXT_FILE, readRoot(TEXT_FILE)],
    [`${PAGE_DIR}*.tsx`, pageCopy()],
  ] as const) {
    assert.ok(oneLine(text).includes(PHRASE), `${name} is missing "${PHRASE}"`);
  }
});
