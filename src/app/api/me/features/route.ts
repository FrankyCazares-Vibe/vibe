import { NextResponse } from "next/server";

import { chatV2For } from "@/lib/chat/flag-server";
import type { FeaturesResponse } from "@/lib/chat/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * GET /api/me/features — which switched features this student has
 * (handoffs/chat-redesign/wave-1-contracts.md section 2).
 *
 * `{ ok: true, chat_v2: boolean }`. The only way a screen learns the flag:
 * the switch and its lists are server-only env values, never NEXT_PUBLIC_.
 * 401 when signed out.
 *
 * Read-only, like /api/me/badge: no rate limit and no Terms or restriction
 * gate. The answer is per person and changes when a list changes or someone
 * joins a listed club, so it is never stored: `private, no-store`.
 *
 * `chatV2For` fails closed (a read error is `false`), so this route has no
 * 500 of its own: a screen that cannot learn the flag shows the old chat.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const body: FeaturesResponse = { ok: true, chat_v2: await chatV2For(user.id) };
  return NextResponse.json(body, { headers: NO_STORE });
}
