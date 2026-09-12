import { NextResponse } from "next/server";

import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/me/otto — single-roundtrip composition of Otto's home screen.
 *
 * Pulled from four sources and stitched together:
 *   - notifications  → "Otto saw" activity feed
 *   - rsvps + events → "Coming up" (next 7 days, going/maybe)
 *   - otto_reminders → split into dated (Coming up) + undated (Asking for you)
 *   - connections    → new followers viewer hasn't followed back yet
 *                      (blocks in either direction excluded; mutes are not —
 *                      see the note above that query)
 *   - channel_members→ unread DM channel count
 *   - users.otto_settings → preset blob (merged with defaults)
 *
 * Counts are derived from the same payload — Otto's hero line shows
 * "N nudges · N reminders · N unread" so the eyebrow stays honest.
 *
 * Designed to be cheap on a fresh page load (no cron / no fanout table at v1).
 * Each section caps at 12 rows so a chatty viewer doesn't blow up the response.
 *
 * A section whose read fails is named in `failed` instead of coming back as
 * an empty array, so the page can say "couldn't load" where it used to say
 * "nothing new on campus yet." Every other section still ships.
 */

const ACTIVITY_LIMIT = 12;
const UPCOMING_LIMIT = 12;
const ASKING_LIMIT = 12;

const DEFAULT_SETTINGS: OttoSettings = {
  chattiness: "moderate",
  rsvp_day_before: true,
  mention_pings: true,
  milestone_pings: true,
  daily_summary: false,
  summary_time: "09:00",
  unanswered_dm_pings: false,
};

export type OttoSettings = {
  chattiness: "quiet" | "moderate" | "loud";
  rsvp_day_before: boolean;
  mention_pings: boolean;
  milestone_pings: boolean;
  daily_summary: boolean;
  summary_time: string; // "HH:MM"
  unanswered_dm_pings: boolean;
};

export type ActivityRow = {
  id: string;
  type: string;
  created_at: string;
  actor: { id: string; name: string | null; handle: string | null; avatar_url: string | null } | null;
  post_id: string | null;
  post_excerpt: string | null;
  comment_excerpt: string | null;
};

export type UpcomingEvent = {
  kind: "event";
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
  viewer_status: "going" | "maybe";
};

export type UpcomingReminder = {
  kind: "reminder";
  id: string;
  title: string;
  body: string | null;
  remind_at: string;
};

export type UpcomingRow = UpcomingEvent | UpcomingReminder;

export type AskingFollower = {
  kind: "follower";
  user_id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type AskingUnreadDm = {
  kind: "unread_dms";
  count: number;
};

export type AskingReminder = {
  kind: "reminder";
  id: string;
  title: string;
  body: string | null;
  created_at: string;
};

export type AskingRow = AskingFollower | AskingUnreadDm | AskingReminder;

/**
 * A section whose read was refused. See `OttoPayload.failed`. "dms" is the
 * unread-DM read behind the "N unread DMs" row and `counts.unread`: it can
 * fail on its own while the rest of "Asking for you" loads fine.
 */
export type OttoFailedSection = "activity" | "upcoming" | "asking" | "dms";

export type OttoPayload = {
  ok: true;
  activity: ActivityRow[];
  upcoming: UpcomingRow[];
  asking: AskingRow[];
  settings: OttoSettings;
  counts: { nudges: number; reminders: number; unread: number };
  /**
   * The sections whose read failed, so each one renders its own inline
   * failure instead of its empty copy. Optional and additive: it's always
   * sent, but a payload from before it existed reads as "nothing failed",
   * and a client that doesn't know the field still gets every section that
   * did load.
   */
  failed?: OttoFailedSection[];
};

function mergeSettings(raw: unknown): OttoSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const r = raw as Record<string, unknown>;
  return {
    chattiness:
      r.chattiness === "quiet" || r.chattiness === "loud" ? r.chattiness : DEFAULT_SETTINGS.chattiness,
    rsvp_day_before: typeof r.rsvp_day_before === "boolean" ? r.rsvp_day_before : DEFAULT_SETTINGS.rsvp_day_before,
    mention_pings: typeof r.mention_pings === "boolean" ? r.mention_pings : DEFAULT_SETTINGS.mention_pings,
    milestone_pings: typeof r.milestone_pings === "boolean" ? r.milestone_pings : DEFAULT_SETTINGS.milestone_pings,
    daily_summary: typeof r.daily_summary === "boolean" ? r.daily_summary : DEFAULT_SETTINGS.daily_summary,
    summary_time:
      typeof r.summary_time === "string" && /^\d{2}:\d{2}$/.test(r.summary_time)
        ? r.summary_time
        : DEFAULT_SETTINGS.summary_time,
    unanswered_dm_pings:
      typeof r.unanswered_dm_pings === "boolean" ? r.unanswered_dm_pings : DEFAULT_SETTINGS.unanswered_dm_pings,
  };
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const nowIso = new Date().toISOString();
  const weekFromNowIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Settings live on users.otto_settings — single read.
  // otto_settings is private (no RLS read); self-read via service role.
  const settingsRes = await createSupabaseServiceClient()
    .from("users")
    .select("otto_settings")
    .eq("id", user.id)
    .maybeSingle();

  const settings = mergeSettings(settingsRes.data?.otto_settings);

  // The sections whose read was refused. Each stays out of the payload's
  // arrays, so the page shows "couldn't load" where it used to show the
  // empty copy.
  const failed: OttoFailedSection[] = [];

  // Nobody blocked in either direction, and nobody muted right now — the
  // same people /api/me/notifications leaves out, filtered on actor_id
  // before the limit so a hidden row doesn't cost a visible one its slot.
  // The nudges count reads off this same query and the unread-DM count
  // skips their messages, so Mute's and Block's "you won't get
  // notifications from them" holds on the phone Otto tab too. Fail closed
  // as the notifications route does: without the list there's no way to
  // tell which rows to drop.
  const hiddenRes = await loadHiddenUsers(supabase, user.id);
  if (!hiddenRes.ok) {
    console.error("[api/me/otto hidden-users]", hiddenRes.error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const hiddenIds = hiddenRes.hidden.ids;
  const hidden = new Set(hiddenIds);

  // ── Activity (notifications) ────────────────────────────────────────
  const ACTIVITY_SELECT =
    "id,type,created_at,post_id,read_at," +
    "actor:users!notifications_actor_id_fkey(id,name,handle,avatar_url)," +
    "post:posts!notifications_post_id_fkey(id,content)," +
    "comment:post_comments!notifications_comment_id_fkey(id,content)";
  let activityQuery = supabase
    .from("notifications")
    .select(ACTIVITY_SELECT)
    .eq("user_id", user.id);
  if (hiddenIds.length > 0) activityQuery = activityQuery.notIn("actor_id", hiddenIds);
  const activityRes = await activityQuery
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_LIMIT);
  if (activityRes.error) {
    console.error("[api/me/otto activity]", activityRes.error);
    failed.push("activity");
  }

  type RawActivity = {
    id: string;
    type: string;
    created_at: string;
    post_id: string | null;
    read_at: string | null;
    actor: ActivityRow["actor"];
    post: { id: string; content: string | null } | null;
    comment: { id: string; content: string | null } | null;
  };
  const activity: ActivityRow[] = ((activityRes.data ?? []) as unknown as RawActivity[]).map((n) => ({
    id: n.id,
    type: n.type,
    created_at: n.created_at,
    actor: n.actor,
    post_id: n.post_id,
    post_excerpt: n.post?.content?.slice(0, 120) ?? null,
    comment_excerpt: n.comment?.content?.slice(0, 120) ?? null,
  }));

  const unreadActivityCount = ((activityRes.data ?? []) as unknown as RawActivity[]).filter(
    (n) => n.read_at === null,
  ).length;

  // ── Upcoming (RSVPs + dated reminders) ──────────────────────────────
  const [rsvpsRes, datedRemRes] = await Promise.all([
    supabase
      .from("rsvps")
      .select(
        "status,event:events!inner(id,title,starts_at,ends_at,location)",
      )
      .eq("user_id", user.id)
      .in("status", ["going", "maybe"])
      .gte("event.ends_at", nowIso)
      .lte("event.starts_at", weekFromNowIso)
      .order("event(starts_at)", { ascending: true })
      .limit(UPCOMING_LIMIT),
    supabase
      .from("otto_reminders")
      .select("id,title,body,remind_at")
      .eq("user_id", user.id)
      .is("dismissed_at", null)
      .not("remind_at", "is", null)
      .gte("remind_at", nowIso)
      .order("remind_at", { ascending: true })
      .limit(UPCOMING_LIMIT),
  ]);

  // Both reads make up one list, so either one failing means "Coming up" is
  // incomplete — and an incomplete list is indistinguishable from a quiet week.
  if (rsvpsRes.error || datedRemRes.error) {
    console.error("[api/me/otto upcoming]", rsvpsRes.error ?? datedRemRes.error);
    failed.push("upcoming");
  }

  type RawRsvp = {
    status: "going" | "maybe";
    event: { id: string; title: string; starts_at: string; ends_at: string; location: string | null } | null;
  };
  const upcomingEvents: UpcomingEvent[] = ((rsvpsRes.data ?? []) as unknown as RawRsvp[])
    .filter((r) => r.event)
    .map((r) => ({
      kind: "event" as const,
      id: r.event!.id,
      title: r.event!.title,
      starts_at: r.event!.starts_at,
      location: r.event!.location,
      viewer_status: r.status,
    }));

  type RawDatedRem = { id: string; title: string; body: string | null; remind_at: string };
  const upcomingReminders: UpcomingReminder[] = ((datedRemRes.data ?? []) as RawDatedRem[]).map((r) => ({
    kind: "reminder" as const,
    id: r.id,
    title: r.title,
    body: r.body,
    remind_at: r.remind_at,
  }));

  const upcoming: UpcomingRow[] = [...upcomingEvents, ...upcomingReminders]
    .sort((a, b) => {
      const at = a.kind === "event" ? a.starts_at : a.remind_at;
      const bt = b.kind === "event" ? b.starts_at : b.remind_at;
      return at.localeCompare(bt);
    })
    .slice(0, UPCOMING_LIMIT);

  // ── Asking for you (new followers + unread DMs + undated reminders) ─
  // "Asking" surfaces things expecting a response. Vibe uses a follow
  // model (no friend-request status), so the analog of "pending
  // connections" is one-way followers viewer hasn't followed back —
  // they're saying "let's connect", and the [Follow back] button mirrors
  // the Network page action.
  //
  // This list filters on BLOCKS only — not mutes — and the two controls'
  // own copy is why. Block says you don't see each other; offering a
  // [Connect] button for someone the viewer blocked, or who blocked them,
  // contradicts that (and the follow would be refused anyway). Mute's own
  // copy is "You won't see their posts in your feed or get notifications
  // from them. They won't know." — both halves are kept by `hiddenIds` on
  // the activity feed and the unread-DM count above. A follower row is
  // neither a post nor a notification: it's a question still waiting on a
  // yes or no, so a muted follower stays visible here. Blocks are
  // excluded in the query, before the 50-row window, so a blocked
  // follower can't push a real one out of the list.
  const blockedIds = Array.from(hiddenRes.hidden.blocked).filter((id) => id !== user.id);
  let followersInQuery = supabase
    .from("connections")
    .select("follower_id,created_at")
    .eq("following_id", user.id);
  if (blockedIds.length > 0) {
    followersInQuery = followersInQuery.notIn("follower_id", blockedIds);
  }

  const [followersInRes, viewerOutRes, undatedRemRes] = await Promise.all([
    followersInQuery.order("created_at", { ascending: false }).limit(50),
    supabase.from("connections").select("following_id").eq("follower_id", user.id),
    supabase
      .from("otto_reminders")
      .select("id,title,body,created_at")
      .eq("user_id", user.id)
      .is("dismissed_at", null)
      .is("remind_at", null)
      .order("created_at", { ascending: false })
      .limit(ASKING_LIMIT),
  ]);

  // A refused read of who the viewer already follows would make every
  // follower look new, so it fails the section rather than inventing rows.
  let askingError: unknown =
    followersInRes.error ?? viewerOutRes.error ?? undatedRemRes.error ?? null;

  const viewerFollows = new Set(
    ((viewerOutRes.data ?? []) as { following_id: string }[]).map((r) => r.following_id),
  );
  type RawFollower = { follower_id: string; created_at: string };
  const newFollowerEdges = ((followersInRes.data ?? []) as RawFollower[]).filter(
    (r) => !viewerFollows.has(r.follower_id),
  );
  const followerIds = newFollowerEdges.map((r) => r.follower_id);
  const followerCreatedAt = new Map<string, string>(
    newFollowerEdges.map((r) => [r.follower_id, r.created_at] as const),
  );

  let followers: AskingFollower[] = [];
  if (followerIds.length > 0) {
    const profilesRes = await supabase
      .from("users")
      .select("id,name,handle,avatar_url")
      .in("id", followerIds);
    if (profilesRes.error) askingError = profilesRes.error;
    type ProfileRow = {
      id: string;
      name: string | null;
      handle: string | null;
      avatar_url: string | null;
    };
    followers = ((profilesRes.data ?? []) as ProfileRow[]).map((p) => ({
      kind: "follower" as const,
      user_id: p.id,
      name: p.name,
      handle: p.handle,
      avatar_url: p.avatar_url,
      created_at: followerCreatedAt.get(p.id) ?? "",
    }));
    followers.sort((a, b) => b.created_at.localeCompare(a.created_at));
    followers = followers.slice(0, 6);
  }

  // Unread DM count: channels where this user is a member, type='dm',
  // accepted, not hidden, and the latest message is newer than last_read_at
  // (or last_read_at is null). The threads route does this in detail; here
  // we just need the count. Defensive try/catch — channels schema lag won't
  // 500 the page. Either read failing names "dms" in `failed` rather than
  // leaving the count at 0: an unread DM the student can't see is worse than
  // a section that admits it didn't load.
  let unreadDmCount = 0;
  try {
    const { data: dmMemberships, error: membersErr } = await supabase
      .from("channel_members")
      .select("channel_id,last_read_at,accepted_at,hidden_at,channels!inner(id,type)")
      .eq("user_id", user.id)
      .eq("channels.type", "dm");
    if (membersErr) throw membersErr;
    type DmRow = {
      channel_id: string;
      last_read_at: string | null;
      accepted_at: string | null;
      hidden_at: string | null;
    };
    const dms = ((dmMemberships ?? []) as unknown as DmRow[]).filter(
      (r) => r.accepted_at !== null && r.hidden_at === null,
    );
    if (dms.length > 0) {
      const channelIds = dms.map((r) => r.channel_id);
      const { data: lastMsgs, error: msgsErr } = await supabase
        .from("messages")
        .select("channel_id,user_id,created_at")
        .in("channel_id", channelIds)
        .order("created_at", { ascending: false })
        .limit(channelIds.length * 3);
      if (msgsErr) throw msgsErr;
      const latestByChannel = new Map<string, { user_id: string; created_at: string }>();
      type MsgRow = { channel_id: string; user_id: string; created_at: string };
      for (const m of (lastMsgs ?? []) as MsgRow[]) {
        if (!latestByChannel.has(m.channel_id)) {
          latestByChannel.set(m.channel_id, { user_id: m.user_id, created_at: m.created_at });
        }
      }
      for (const r of dms) {
        const last = latestByChannel.get(r.channel_id);
        if (!last) continue;
        if (last.user_id === user.id) continue;
        // A blocked or muted sender doesn't raise the unread count: the
        // hero chip and the "N unread DMs" row keep Mute's promise too.
        if (hidden.has(last.user_id)) continue;
        if (!r.last_read_at || new Date(last.created_at) > new Date(r.last_read_at)) {
          unreadDmCount += 1;
        }
      }
    }
  } catch (e) {
    console.error("[api/me/otto unread-dms]", e);
    failed.push("dms");
  }

  type RawUndatedRem = { id: string; title: string; body: string | null; created_at: string };
  const undatedReminders: AskingReminder[] = ((undatedRemRes.data ?? []) as RawUndatedRem[]).map((r) => ({
    kind: "reminder" as const,
    id: r.id,
    title: r.title,
    body: r.body,
    created_at: r.created_at,
  }));

  if (askingError) {
    console.error("[api/me/otto asking]", askingError);
    failed.push("asking");
  }

  const asking: AskingRow[] = [
    ...(unreadDmCount > 0 ? [{ kind: "unread_dms" as const, count: unreadDmCount }] : []),
    ...followers,
    ...undatedReminders,
  ].slice(0, ASKING_LIMIT);

  // ── Counts ──────────────────────────────────────────────────────────
  const counts = {
    nudges: unreadActivityCount,
    reminders: upcomingReminders.length + undatedReminders.length,
    unread: unreadDmCount,
  };

  const payload: OttoPayload = {
    ok: true,
    activity,
    upcoming,
    asking,
    settings,
    counts,
    failed,
  };

  return NextResponse.json(payload);
}
