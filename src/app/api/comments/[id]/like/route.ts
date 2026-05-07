import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

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

/** Heart a comment. Idempotent. */
export async function POST(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing comment id" }, { status: 400 });
  }
  const auth = await authorize();
  if (!auth.ok) return auth.res;

  const { error } = await auth.supabase
    .from("comment_likes")
    .insert({ comment_id: id, user_id: auth.userId });

  if (error) {
    if (/duplicate key|unique constraint/i.test(error.message ?? "")) {
      return NextResponse.json({ ok: true, already: true });
    }
    console.error("[comments/:id/like POST]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Unheart a comment. Idempotent. */
export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing comment id" }, { status: 400 });
  }
  const auth = await authorize();
  if (!auth.ok) return auth.res;

  const { error } = await auth.supabase
    .from("comment_likes")
    .delete()
    .eq("comment_id", id)
    .eq("user_id", auth.userId);

  if (error) {
    console.error("[comments/:id/like DELETE]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
