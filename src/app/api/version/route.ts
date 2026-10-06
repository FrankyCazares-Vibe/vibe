import { NextResponse } from "next/server";

import { BUILD_ID } from "@/lib/build/build-refresh";

// Never cached: the answer has to come from the build that is live now.
export const dynamic = "force-dynamic";

/**
 * GET /api/version: which build is this?
 *
 * Answers `{ build }` and nothing else. `BuildRefresh`
 * (src/components/build/BuildRefresh.tsx) asks it when a person comes back
 * to an open tab; a different id there means a newer build is live.
 *
 * Public on purpose: the landing page and /waitlist run the same check for
 * signed-out visitors. It takes no request argument, so it cannot read a
 * cookie, a header or the address, and it touches no database. The id is the
 * one written into this build's own files (BUILD_ID), `null` where there is
 * none (local dev), and `null` tells the browser to do nothing.
 *
 * `no-store` keeps Vercel's cache and the browser's from handing back an old
 * build's answer.
 */
export function GET() {
  return NextResponse.json(
    { build: BUILD_ID || null },
    { headers: { "cache-control": "no-store" } },
  );
}
