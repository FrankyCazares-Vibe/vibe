import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_COMMENT = 500;

type RouteContext = { params: Promise<{ id: string }> };
type RepostBody = { comment?: unknown };

async function authorize(): Promise<
  | { ok: true; userId: string; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> }
  | { ok: false; res: NextResponse }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, userId: user.id, supabase };
}

function readComment(body: RepostBody): { ok: true; comment: string | null } | { ok: false; res: NextResponse } {
  if (!("comment" in body) || body.comment === undefined || body.comment === null) {
    return { ok: true, comment: null };
  }
  if (typeof body.comment !== "string") {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "Comment must be a string" }, { status: 400 }),
    };
  }
  const trimmed = body.comment.trim();
  if (!trimmed) return { ok: true, comment: null };
  if (trimmed.length > MAX_COMMENT) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: `Comment exceeds ${MAX_COMMENT} characters` },
        { status: 400 },
      ),
    };
  }
  return { ok: true, comment: trimmed };
}

/**
 * Repost (with optional quote comment). Idempotent on (post_id, user_id):
 * a second POST overwrites the comment. To remove the repost, call DELETE.
 */
export async function POST(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });
  }
  const auth = await authorize();
  if (!auth.ok) return auth.res;

  let body: RepostBody = {};
  try {
    body = (await req.json()) as RepostBody;
  } catch {
    // Empty body is fine — plain boost.
  }
  const parsed = readComment(body);
  if (!parsed.ok) return parsed.res;

  const { error } = await auth.supabase
    .from("post_reposts")
    .upsert(
      { post_id: id, user_id: auth.userId, comment: parsed.comment },
      { onConflict: "post_id,user_id" },
    );

  if (error) {
    console.error("[posts/:id/repost POST]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Edit your existing quote comment without changing the timestamp. */
export async function PATCH(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });
  }
  const auth = await authorize();
  if (!auth.ok) return auth.res;

  let body: RepostBody;
  try {
    body = (await req.json()) as RepostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = readComment(body);
  if (!parsed.ok) return parsed.res;

  const { error } = await auth.supabase
    .from("post_reposts")
    .update({ comment: parsed.comment })
    .eq("post_id", id)
    .eq("user_id", auth.userId);

  if (error) {
    console.error("[posts/:id/repost PATCH]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Un-repost. Idempotent — deleting zero rows is success. */
export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });
  }
  const auth = await authorize();
  if (!auth.ok) return auth.res;

  const { error } = await auth.supabase
    .from("post_reposts")
    .delete()
    .eq("post_id", id)
    .eq("user_id", auth.userId);

  if (error) {
    console.error("[posts/:id/repost DELETE]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
