import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/require-platform-admin";
import { isSentryConfigured } from "@/lib/sentry-config";

/** P1-004: confirms NEXT_PUBLIC_SENTRY_DSN is present (SDK no-ops without it). */
export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  if (!isSentryConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Set NEXT_PUBLIC_SENTRY_DSN (see .env.example). Add the same in Vercel for production.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
