import { NextResponse } from "next/server";

import { REMOVED_PICTURE_MESSAGE } from "@/app/api/admin/images/_lib/removed-picture";
import { checkRemovedPicture } from "@/app/api/admin/images/_lib/removed-picture-store";
import { contentBlockedResponse, requireCanPublish } from "@/lib/moderation/access";
import { checkText } from "@/lib/moderation/text-filter";
import { GROUP_PHOTO_KEY_PREFIX } from "@/lib/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type RouteCtx = { params: Promise<{ id: string }> };
type Body = {
  name?: unknown;
  /** R2 object key (`groups/<channel_id>/<uuid>.<ext>`). Pass null/empty to clear. */
  photo_url?: unknown;
};

/**
 * PATCH a channel — set group name or photo. Any member can change either
 * for v1 (matches the user's "anyone can upload" intent). 1:1 DMs reject
 * since they have no editable surface.
 *
 * Held to what group create holds (S67 security wave 2, A2; report Low
 * "renaming a group chat skips the word filter"): the requireCanPublish gate
 * (Terms, a verified school email, no restriction) and the word filter on the
 * name, answered with the same 422 as create (contentBlockedResponse("name")).
 * Everyone in the chat sees the name in their inbox, and they didn't choose it.
 *
 * A group photo Vibe's moderators took down can't be set again (wave B
 * follow-up P2): the takedown keeps the R2 object as evidence, so re-sending
 * its key would put it back in every member's inbox. 422 picture_removed; a
 * new upload (new random key) passes.
 */
export async function PATCH(req: Request, ctx: RouteCtx) {
  const { id: channelId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const gate = await requireCanPublish(user.id);
  if (gate) return gate;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Verify membership + that the channel is editable (group only).
  const { data: chan, error: chanErr } = await supabase
    .from("channels")
    .select("id, type")
    .eq("id", channelId)
    .maybeSingle();
  if (chanErr) {
    console.error("[threads.PATCH chan]", chanErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!chan) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (chan.type !== "group") {
    return NextResponse.json(
      { ok: false, error: "Only group chats can be edited" },
      { status: 400 },
    );
  }

  const { data: membership } = await supabase
    .from("channel_members")
    .select("channel_id")
    .eq("channel_id", channelId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: 403 });
  }

  const update: Record<string, string | null> = {};
  if (typeof body.name === "string") {
    update.name = body.name.trim().slice(0, 80);
    // An empty name clears it (the inbox falls back to the members' names).
    if (update.name && !checkText(update.name).ok) return contentBlockedResponse("name");
  }
  if (typeof body.photo_url === "string") {
    const t = body.photo_url.trim();
    if (t.length === 0) {
      update.photo_url = null;
    } else {
      // Only keys minted by /api/me/group-photo-upload-url for THIS
      // channel. Anything else could point the inbox at another group's
      // object or an external tracking pixel.
      const expectedPrefix = `${GROUP_PHOTO_KEY_PREFIX}${channelId}/`;
      if (
        !t.startsWith(expectedPrefix) ||
        t.includes("..") ||
        t.length > 512 ||
        !/^[A-Za-z0-9_\-./]+$/.test(t)
      ) {
        return NextResponse.json(
          { ok: false, error: "photo_url must be an upload key for this group" },
          { status: 400 },
        );
      }
      update.photo_url = t;
    }
  } else if (body.photo_url === null) {
    update.photo_url = null;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  // Use service client because `channels` has no UPDATE RLS policy in the
  // base schema. Membership has been verified above.
  const admin = createSupabaseServiceClient();
  if (typeof update.photo_url === "string") {
    const removed = await checkRemovedPicture(admin, "channel", channelId, [update.photo_url]);
    if (removed === "error") {
      return NextResponse.json({ ok: false, error: "Could not update thread" }, { status: 500 });
    }
    if (removed === "removed") {
      return NextResponse.json(
        { ok: false, error: REMOVED_PICTURE_MESSAGE, code: "picture_removed" },
        { status: 422 },
      );
    }
  }
  const { error: updErr } = await admin
    .from("channels")
    .update(update)
    .eq("id", channelId);
  if (updErr) {
    console.error("[threads.PATCH update]", updErr);
    return NextResponse.json({ ok: false, error: "Could not update thread" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
