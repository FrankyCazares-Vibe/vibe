import { NextResponse } from "next/server";

import { chatDesktopAnswer } from "@/lib/chat/flag";
import { chatV2For } from "@/lib/chat/flag-server";
import type { FeaturesResponse } from "@/lib/chat/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * GET /api/me/features — which switched features this student has
 * (handoffs/chat-redesign/wave-1-contracts.md section 2; `chat_desktop` is
 * handoffs/chat-redesign/wave-3-desktop/contract.md section 2).
 *
 * `{ ok: true, chat_v2: boolean, chat_desktop: boolean }`. How a screen
 * learns `chat_v2`: the switches and their lists are server-only env values,
 * never NEXT_PUBLIC_. The two desktop pages also receive `chat_desktop` as a
 * server prop (`desktopChat`), so a laptop never waits for this route.
 * 401 when signed out.
 *
 * `chat_desktop` is worked out from the `chat_v2` answer already in hand
 * (`chatDesktopAnswer`, env only): one database read, as before, and never
 * true without `chat_v2`.
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

  const v2 = await chatV2For(user.id);
  const body: FeaturesResponse = { ok: true, chat_v2: v2, chat_desktop: chatDesktopAnswer(user.id, v2) };
  return NextResponse.json(body, { headers: NO_STORE });
}
