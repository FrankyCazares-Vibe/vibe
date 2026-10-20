import { NextResponse } from "next/server";

import {
  ADMIN_READ_LIMIT,
  ADMIN_WRITE_LIMIT,
  adminFail,
  adminWriteKey,
  requirePlatformAdmin,
} from "@/lib/auth/require-platform-admin";
import { getSiteOriginForRequest } from "@/lib/auth/site-url";
import { CLUB_HANDLE_RE, clubLinkUrl, suggestClubHandle } from "@/lib/club-links/code";
import { clubHandleFree, clubLinkState, createSetupLink, listSetupLinks } from "@/lib/club-links/store";
import { checkText } from "@/lib/moderation/text-filter";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Body = { name?: unknown; handle?: unknown; checked?: unknown };

/**
 * Admin › Clubs › "New club setup link" (the club's view, wave 1).
 *
 * GET: the setup links, newest first: the club's name and handle, made,
 * ends, and where each stands (live / used, with the club it made /
 * expired / cancelled). Never a code: only its hash is kept.
 *
 * POST { name, handle?, checked }: a new setup link. It works once, for 7
 * days, and lets one person past the closed waitlist; that person becomes
 * the owner of a club with this name and handle, checked (verified) when
 * `checked` is true ("We met in person"). The answer carries the link
 * itself, once: { ok, url, link }. The handle must be free: no club has it
 * and no live setup link holds it. The table keeps who made each link.
 */
export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;
  const limit = await rateLimit(`admin-read:${gate.userId}`, ADMIN_READ_LIMIT);
  if (!limit.allowed) return tooManyRequests(limit);

  const service = createSupabaseServiceClient();
  const links = await listSetupLinks(service);
  return NextResponse.json({
    ok: true,
    links: links.map((l) => ({
      id: l.id,
      name: l.club_name,
      handle: l.club_handle,
      checked: l.checked,
      created_at: l.created_at,
      expires_at: l.expires_at,
      used_at: l.used_at,
      state: l.off_at ? "cancelled" : clubLinkState(l),
      club: l.club,
    })),
  });
}

export async function POST(req: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return adminFail(400, "invalid_body", "Invalid JSON");
  }
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 50) {
    return adminFail(400, "invalid_name", "The club's name is 2 to 50 characters.");
  }
  if (!checkText(name).ok) {
    return adminFail(400, "content_blocked", "That name has a word Vibe doesn't allow.");
  }
  const handle =
    typeof body.handle === "string" && body.handle.trim()
      ? body.handle.trim().toLowerCase()
      : suggestClubHandle(name);
  if (!handle || !CLUB_HANDLE_RE.test(handle)) {
    return adminFail(
      400,
      "invalid_handle",
      "The handle is 3 to 31 lowercase letters, numbers, _ or -, starting with a letter or number.",
    );
  }
  if (typeof body.checked !== "boolean") {
    return adminFail(400, "invalid_body", "checked must be true or false");
  }

  const limit = await rateLimit(adminWriteKey(gate.userId), ADMIN_WRITE_LIMIT);
  if (!limit.allowed) return tooManyRequests(limit, "Too many changes at once. Try again shortly.");

  const service = createSupabaseServiceClient();
  if (!(await clubHandleFree(service, handle))) {
    return adminFail(409, "handle_taken", `@${handle} is taken. Pick another handle.`);
  }
  const made = await createSetupLink(service, { name, handle, checked: body.checked, actorId: gate.userId });
  if (!made.ok) return adminFail(500, "create_failed", "Couldn't make the link. Try again.");

  return NextResponse.json({
    ok: true,
    url: clubLinkUrl(getSiteOriginForRequest(req), made.code),
    link: {
      id: made.link.id,
      name: made.link.club_name,
      handle: made.link.club_handle,
      checked: made.link.checked,
      created_at: made.link.created_at,
      expires_at: made.link.expires_at,
      used_at: null,
      state: "live",
      club: null,
    },
  });
}
