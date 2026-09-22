import { NextResponse } from "next/server";

import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Body = { post_id?: unknown };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Set or clear the signed-in user's pinned post.
 *   { post_id: "<uuid>" } → pin that post (must be authored by viewer)
 *   { post_id: null }     → unpin
 *
 * Pinning someone else's post is intentionally rejected — the pin slot
 * on the profile is "this is what I want people to see first about me",
 * not a curated repost.
 *
 * `pinned_post_id` is no longer UPDATE-granted to `authenticated` (migration
 * 20260922130000), so PostgREST can't skip the ownership check below. Both
 * writes go through the service role, scoped to the caller's own id, after
 * auth, the rate limit, the Terms gate and (for a pin) the ownership check.
 */
export async function PATCH(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`pinned:${user.id}`, { limit: 60, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  // Same gate as the sibling profile writes (profile, profile-sync).
  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const raw = body.post_id;
  if (raw === null) {
    // Unpin
    const { error } = await createSupabaseServiceClient()
      .from("users")
      .update({ pinned_post_id: null })
      .eq("id", user.id);
    if (error) {
      console.error("[me/pinned PATCH unpin]", error);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, pinned_post_id: null });
  }

  if (typeof raw !== "string" || raw.length === 0) {
    return NextResponse.json(
      { ok: false, error: "post_id must be a string or null" },
      { status: 400 },
    );
  }

  // Not a post id at all. Answered here instead of letting Postgres fail
  // the uuid cast (which used to surface as a 500).
  if (!UUID_RE.test(raw)) {
    return NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });
  }

  // Verify ownership before pinning — RLS doesn't gate updates to a FK
  // column by the referenced row's owner. Defensive read, on the caller's
  // own client so it only finds posts they can see.
  const { data: post, error: postErr } = await supabase
    .from("posts")
    .select("id,user_id")
    .eq("id", raw)
    .maybeSingle();
  if (postErr) {
    console.error("[me/pinned PATCH post]", postErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!post) {
    return NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });
  }
  if (post.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "You can only pin your own posts" }, { status: 403 });
  }

  const { error: upErr } = await createSupabaseServiceClient()
    .from("users")
    .update({ pinned_post_id: raw })
    .eq("id", user.id);
  if (upErr) {
    console.error("[me/pinned PATCH update]", upErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, pinned_post_id: raw });
}
