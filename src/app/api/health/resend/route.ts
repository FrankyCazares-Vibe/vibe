import { NextResponse } from "next/server";

import { isResendConfigured, probeResendApi } from "@/lib/resend";

/** P1-003 smoke check: Resend API key valid (domains.list, or inferred OK for send-only keys — never sends mail). */
export async function GET() {
  if (!isResendConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Set RESEND_API_KEY (see .env.example). Server-only — never NEXT_PUBLIC_*.",
      },
      { status: 503 },
    );
  }

  const result = await probeResendApi();
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "Resend API request failed", detail: result.message },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
