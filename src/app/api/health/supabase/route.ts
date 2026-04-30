import { NextResponse } from "next/server";

import { createSupabaseClient } from "@/lib/supabase";

/**
 * P1-001 smoke check: env vars load, JS client builds, Supabase Auth API responds.
 * Schema-backed queries land in P1-005+.
 */
export async function GET() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

    if (!baseUrl || !anonKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (local: .env.local; Vercel: Project Settings → Environment Variables).",
        },
        { status: 503 },
      );
    }

    const healthRes = await fetch(`${baseUrl}/auth/v1/health`, {
      headers: { apikey: anonKey },
      cache: "no-store",
    });

    if (!healthRes.ok) {
      const detail = await healthRes.text();
      return NextResponse.json(
        {
          ok: false,
          error: `Supabase Auth health returned ${healthRes.status}`,
          detail: detail.slice(0, 300),
        },
        { status: 502 },
      );
    }

    const authHealth = (await healthRes.json()) as Record<string, unknown>;

    createSupabaseClient();

    return NextResponse.json({
      ok: true,
      authHealth,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
