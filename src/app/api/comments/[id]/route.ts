import { NextResponse } from "next/server";

import {
  COMMENT_MAX_CHARS,
  commentEditCutoffIso,
} from "@/lib/comments/edit-window";
import { contentBlockedResponse, requireCanPublish } from "@/lib/moderation/access";
import { checkText } from "@/lib/moderation/text-filter";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

/**
 * Your own comment (Franky, Nov 16, 2026): DELETE any time, PATCH its words
 * for 3 minutes after sending (src/lib/comments/edit-window.ts).
 *
 * DELETE runs on the student's own session: `post_comments_delete_own` is the
 * boundary (only the author's row matches). Its replies go with it (the
 * parent_comment_id foreign key cascades), as do its likes and the
 * notification it caused.
 *
 * PATCH: there is no UPDATE policy on post_comments, so a student can't
 * rewrite a comment through the database directly. This route reads the row
 * under the student's own session first (author, not removed, inside the
 * window), then writes with the service role, filtered on the same three
 * conditions so a row that changed in between is never touched. Only
 * `content` changes; the same text filter and length rule as sending.
 */

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = () =>
  NextResponse.json({ ok: false, error: "Comment not found" }, { status: 404 });
const requestFailed = () =>
  NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });

async function sessionUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { supabase, user: error ? null : user };
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) return notFound();

  const { supabase, user } = await sessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(`comment-delete:${user.id}`, { limit: 30, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  // How many rows leave with it (the comment and its replies), so a screen
  // can lower the post's comment count by the right amount. The count reads
  // every reply, hidden ones too, as the post's count does. Read before the
  // delete (the cascade takes them), sent only when the delete went through.
  // Best effort: a failed count is 0, and the next load corrects it.
  let replies = 0;
  if (isSupabaseServiceConfigured()) {
    try {
      const { count } = await createSupabaseServiceClient()
        .from("post_comments")
        .select("id", { count: "exact", head: true })
        .eq("parent_comment_id", id);
      replies = typeof count === "number" ? count : 0;
    } catch {
      replies = 0;
    }
  }

  const { data, error } = await supabase
    .from("post_comments")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id,post_id");
  if (error) {
    console.error("[comments/:id DELETE]", error);
    return requestFailed();
  }
  // Not theirs, gone already, or never there: the same answer.
  if (!data || data.length === 0) return notFound();

  return NextResponse.json({
    ok: true,
    id,
    post_id: (data[0] as { post_id: string }).post_id,
    removed: 1 + replies,
  });
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) return notFound();

  const { supabase, user } = await sessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(`comment-edit:${user.id}`, { limit: 30, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  // Editing is publishing, so the same gate as sending a comment.
  const gate = await requireCanPublish(user.id);
  if (gate) return gate;

  let body: { content?: unknown };
  try {
    body = (await req.json()) as { content?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ ok: false, error: "Comment is empty" }, { status: 400 });
  }
  if (content.length > COMMENT_MAX_CHARS) {
    return NextResponse.json(
      { ok: false, error: `Comment exceeds ${COMMENT_MAX_CHARS} characters` },
      { status: 400 },
    );
  }
  if (!checkText(content).ok) return contentBlockedResponse("content");

  // Under the student's own session: their own rows are always readable.
  const { data: row, error: readErr } = await supabase
    .from("post_comments")
    .select("id,user_id,created_at,removed_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    console.error("[comments/:id PATCH read]", readErr);
    return requestFailed();
  }
  const own = row as { user_id: string; created_at: string; removed_at: string | null } | null;
  if (!own || own.user_id !== user.id) return notFound();
  if (own.removed_at) {
    return NextResponse.json(
      { ok: false, code: "comment_removed", error: "A moderator removed this comment, so it can't be edited." },
      { status: 409 },
    );
  }
  const cutoff = commentEditCutoffIso();
  if (!(Date.parse(own.created_at) > Date.parse(cutoff))) {
    return NextResponse.json(
      {
        ok: false,
        code: "edit_window_closed",
        error: "Comments can be edited for 3 minutes after you send them.",
      },
      { status: 409 },
    );
  }

  if (!isSupabaseServiceConfigured()) {
    console.error("[comments/:id PATCH] service role not configured");
    return requestFailed();
  }
  const { data: updated, error: writeErr } = await createSupabaseServiceClient()
    .from("post_comments")
    .update({ content })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("removed_at", null)
    .gt("created_at", cutoff)
    .select("id,content")
    .maybeSingle();
  if (writeErr) {
    console.error("[comments/:id PATCH write]", writeErr);
    return requestFailed();
  }
  if (!updated) {
    // It changed between the read and the write (removed, or the window shut).
    return NextResponse.json(
      {
        ok: false,
        code: "edit_window_closed",
        error: "Comments can be edited for 3 minutes after you send them.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, comment: updated });
}
