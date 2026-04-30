import { NextResponse } from "next/server";

import { isR2Configured, probeR2Bucket } from "@/lib/r2";

/** P1-002 smoke check: R2 env vars + bucket reachable (Clip signing helpers live in src/lib/r2.ts). */
export async function GET() {
  if (!isR2Configured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME (see .env.example). Server-only — never NEXT_PUBLIC.",
      },
      { status: 503 },
    );
  }

  const result = await probeR2Bucket();
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "R2 HeadBucket failed", detail: result.message },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
