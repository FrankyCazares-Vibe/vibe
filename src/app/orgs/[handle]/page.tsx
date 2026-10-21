import { notFound } from "next/navigation";
import Link from "next/link";

import type { SupabaseClient } from "@supabase/supabase-js";

import { Arrow } from "@/components/brand/Arrow";
import { LoadFailed } from "@/components/feedback/LoadFailed";
import { clubSetupPath } from "@/lib/club-links/redeem";
import { loadClubSetup } from "@/lib/club-links/setup";
import { MobileTabBar } from "@/components/mobile/MobileTabBar";
import { OrgInviteBanner } from "@/components/orgs/OrgInviteBanner";
import { OrgMenu } from "@/components/orgs/OrgMenu";
import { visibleClubPosts } from "@/lib/club-routes/club-posts";
import { isMissingColumnError } from "@/lib/db/missing-column";
import {
  loadRestrictedAuthors,
  readClubPostsForViewer,
} from "@/lib/club-routes/club-posts-read";
import { rsvpCampusDecision } from "@/lib/iu/campus-request";
import { campusRowById, isSharedCampus } from "@/lib/iu/campuses";
import { requireNotRestricted } from "@/lib/moderation/access";
import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { NO_BOARD, loadBoardFacts } from "@/lib/orgs/board-facts";
import { loadFollowerCount, loadViewerFollow, publicMemberCount } from "@/lib/orgs/following";
import {
  boardCardView,
  joinPolicyNotice,
  keepFollowingDefault,
  type OrgDisplayState,
  type OrgRelation,
} from "@/lib/orgs/join-copy";
import {
  isOfficer,
  isSettingsOfficer,
  orgJoinState,
  SIGNED_OUT,
  visibleInviterFirstName,
  type JoinPolicy,
  type OrgAudience,
} from "@/lib/orgs/join-state";
import { loadViewerOrgContext } from "@/lib/orgs/membership";
import { storedMeetingTime } from "@/lib/orgs/meeting-time";
import { headerCount, loadOfficerCounts, needsYouText, type OfficerCounts } from "@/lib/orgs/officer-counts";
import { loadMutedOrgSet } from "@/lib/orgs/org-mutes";
import { withPostMediaUrls } from "@/lib/post-media-url";
import { isClubPostDeleteRole } from "@/lib/posts/viewer-can-delete";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { BoardSection, ChannelsSection } from "./ChannelsSection";
import { AboutDetails, fmtDate } from "./club-page/AboutDetails";
import { ClubCover, ClubHeader, LockGlyph } from "./club-page/ClubHeader";
import { ClubEventsProvider } from "./club-page/ClubEventsProvider";
import { ClubSwitchSync } from "./club-page/ClubSwitchSync";
import { MoreAboutUs } from "./club-page/MoreAboutUs";
import { CoverOfficerButtons, EditPageButton, SharePageButton } from "./club-page/OfficerActions";
import { SwitchChevron } from "./club-page/SwitchChevron";
import { ClubToolsCard, NeedsYouLine } from "./club-page/ToolsCard";
import type { ClubPageOrg } from "./club-page/types";
import { UpNext } from "./club-page/UpNext";
import { OrgContent } from "./OrgContent";
import { OrgEventsSection } from "./OrgEventsSection";
import { OrgPastEvents } from "./OrgPastEvents";
import { type OrgPostItem, OrgPostsList } from "./OrgPostsList";
import { OrgProfileJoinButton } from "./join-button";

type Params = { params: Promise<{ handle: string }> };

const BACKDROP_PRESETS: Record<string, string> = {
  "sand-purple":
    "radial-gradient(120% 80% at 0% 0%, rgba(123,95,224,0.55) 0%, rgba(123,95,224,0) 55%), " +
    "radial-gradient(110% 90% at 100% 100%, rgba(255,92,53,0.5) 0%, rgba(255,92,53,0) 55%), " +
    "linear-gradient(180deg, #1B1530 0%, #241B40 50%, #2E1F35 100%)",
  ember:
    "radial-gradient(120% 90% at 10% 0%, rgba(255,92,53,0.55) 0%, rgba(255,92,53,0) 55%), " +
    "linear-gradient(180deg, #1A0F12 0%, #2A1418 55%, #1F0E12 100%)",
  "deep-violet":
    "radial-gradient(120% 80% at 0% 0%, rgba(120,90,220,0.6) 0%, rgba(120,90,220,0) 55%), " +
    "linear-gradient(180deg, #15102A 0%, #1F1640 60%, #15102A 100%)",
  forest:
    "radial-gradient(120% 90% at 10% 0%, rgba(70,160,110,0.5) 0%, rgba(70,160,110,0) 55%), " +
    "linear-gradient(180deg, #0D1A14 0%, #14241B 60%, #0D1A14 100%)",
  midnight:
    "radial-gradient(120% 80% at 30% 10%, rgba(40,80,180,0.4) 0%, rgba(40,80,180,0) 60%), " +
    "linear-gradient(180deg, #0A0E1A 0%, #14182A 60%, #0A0E1A 100%)",
};

const DORMANT_MS = 60 * 24 * 60 * 60 * 1000;

type OrgProfile = ClubPageOrg;

/** The column wave 2 adds (migration 20261023100000); read with a fallback. */
const MEETING_TIME = "meeting_time";
const ORG_COLUMNS: string =
  "id, handle, name, description, logo_url, banner_url, backdrop_preset, verified, links, philanthropy, last_activity_at, created_at, join_policy, audience, hidden_at, campus_id";

/** The club row as the page reads it (`ORG_COLUMNS`, plus `meeting_time`). */
type OrgRow = {
  id: string;
  handle: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  backdrop_preset: string | null;
  verified: boolean | null;
  links: unknown;
  philanthropy: string | null;
  last_activity_at: string | null;
  join_policy: string;
  audience: string;
  hidden_at: string | null;
  campus_id: string | null;
  meeting_time?: unknown;
};

type PostRow = {
  id: string;
  type: "post";
  content: string;
  media_url: string | null;
  media_thumbnail_url: string | null;
  created_at: string;
  /** Stamped by the database when a published post's text changes. */
  edited_at: string | null;
  user: { id: string; handle: string; name: string; avatar_url: string | null } | null;
};

export async function generateMetadata({ params }: Params) {
  const { handle } = await params;
  const service = createSupabaseServiceClient();
  const { data: org } = await service
    .from("orgs")
    .select("name, description, is_public, hidden_at")
    .eq("handle", handle)
    .maybeSingle();
  // The preview tags are set here too, so a shared club link unfurls as the
  // club's own card (feature report 3, #15) and a missing or hidden club as
  // the plain one below, never as its tab title.
  const generic = { title: "Vibe", description: "Vibe is the social app for students at IU and Purdue." };
  if (!org) return { title: "Not found · Vibe", openGraph: generic, twitter: generic };
  // A hidden club's name must not reach the tab title or a link preview.
  if (org.hidden_at) return { title: "Vibe", openGraph: generic, twitter: generic };
  const title = `${org.name} · Vibe`;
  const description =
    org.description?.slice(0, 200) ||
    (org.is_public ? "An org on Vibe." : "A private org on Vibe.");
  // The site picture: this openGraph replaces the root layout's whole, and
  // the card doesn't use the club's own logo. Next copies it to the X card.
  // Add `?v=2` to the address if the card art is ever redrawn.
  const sharePicture = {
    url: "/opengraph-image",
    width: 1200,
    height: 630,
    alt: "vibe. Your campus. Your people. Yourself.",
  };
  return {
    title,
    description,
    openGraph: { title: org.name, description, type: "profile", images: [sharePicture] },
    twitter: { card: "summary_large_image", title: org.name, description },
  };
}

export default async function OrgProfilePage({ params }: Params) {
  const { handle } = await params;
  const service = createSupabaseServiceClient();

  const readOrg = (withMeetingTime: boolean) =>
    service
      .from("orgs")
      .select(withMeetingTime ? `${ORG_COLUMNS}, ${MEETING_TIME}` : ORG_COLUMNS)
      .eq("handle", handle)
      .maybeSingle();
  let { data: orgData, error: orgErr } = await readOrg(true);
  // A database without "when it meets" yet reads the club as before; the
  // line then shows nothing and Edit page leaves its field out (C8).
  const meetingTimeReady = !(orgErr && isMissingColumnError(orgErr, [MEETING_TIME]));
  if (!meetingTimeReady) ({ data: orgData, error: orgErr } = await readOrg(false));
  // A failed read is a 404, as it always was; now it is logged too.
  if (orgErr) console.error("[orgs/[handle] page org]", orgErr);
  const orgRaw = orgData as unknown as OrgRow | null;
  if (!orgRaw) notFound();

  const orgId = orgRaw.id as string;
  const joinPolicy = orgRaw.join_policy as JoinPolicy;
  const audience = orgRaw.audience as OrgAudience;
  const hiddenAt = (orgRaw.hidden_at as string | null) ?? null;
  const campusId = (orgRaw.campus_id as string | null) ?? null;

  // Viewer relationship: the one join decision every surface renders
  // (`orgJoinState`), so the button never offers a door the join route
  // refuses. Their follow row is read alongside it.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [ctx, followRes] = user
    ? await Promise.all([
        loadViewerOrgContext(service, orgId, user.id),
        loadViewerFollow(service, orgId, user.id),
      ])
    : [null, null];
  const decision = ctx
    ? orgJoinState({
        org: {
          join_policy: joinPolicy,
          audience,
          hidden_at: hiddenAt,
          campus_id: campusId,
        },
        viewer: ctx.viewer,
        role: ctx.role,
        pendingInvite: ctx.pendingInvite,
        pendingRequest: ctx.pendingRequest,
        // Removed members see "Request to join", not "Join" (S67 sec wave 2).
        removed: ctx.removed,
      })
    : null;

  // A hidden club does not exist to anyone outside it: signed out, a failed
  // membership read, or a student who isn't a member all get the same 404 as
  // a handle that was never registered. Members and platform admins see it.
  if (hiddenAt && (!ctx || !ctx.ok || decision?.state === "not_found")) notFound();

  const viewerRole = ctx?.ok ? ctx.role : null;
  // `not_found` can't reach here (the gate above). A failed membership read
  // has no standing to show, so the page then speaks only about the club
  // itself, the way it does to a signed-out visitor.
  const displayState: OrgDisplayState =
    ctx?.ok && decision && decision.state !== "not_found" ? decision.state : SIGNED_OUT;
  // What the header, chips, banner and channels card render. Null when the
  // membership read failed: a member must never be shown the door. A failed
  // FOLLOW read renders Follow, which is safe because POST /follow is
  // idempotent.
  const relation: OrgRelation | null =
    user && !ctx?.ok
      ? null
      : {
          handle: orgRaw.handle as string,
          orgName: orgRaw.name as string,
          state: displayState,
          following:
            !!viewerRole || (!!followRes && followRes.ok && followRes.row !== null),
          role: viewerRole,
          reason: decision?.reason ?? null,
          audience,
          joinPolicy,
        };
  const invite =
    relation?.state === "invited" && ctx?.pendingInvite ? ctx.pendingInvite : null;

  // Away from home (S67 wave 4): the club's campus isn't the viewer's HOME
  // campus. `ctx.viewer` is the users row `loadViewerOrgContext` already
  // read, so this costs no query; `rsvpCampusDecision` is the RSVP route's
  // own rule (both campuses known and different, the club visiting rule),
  // so the cards turn RSVP off exactly where PUT /rsvp answers 403
  // `campus_visiting`. Visiting, Back returns to the campus the student was
  // browsing. A failed membership read counts as home: RSVP stays live and
  // the route's refusal is what the card shows. A club with no campus leaves
  // each event to its creator's campus, which only the route knows.
  const awayFromHome =
    !!ctx?.ok &&
    rsvpCampusDecision({
      orgCampusId: campusId,
      creatorCampusId: null,
      viewerCampusId: ctx.viewer.campus_id,
    }) === "campus_visiting";
  // Members keep their clubs wherever home is, so only a non-member's RSVP
  // turns off (the route makes the same exemption).
  const visiting = awayFromHome && !viewerRole;
  const visitedCampusId = awayFromHome ? (campusRowById(campusId)?.id ?? null) : null;
  const backHref = visitedCampusId
    ? `/campus?${new URLSearchParams({ tab: "orgs", campus: visitedCampusId })}`
    : "/campus?tab=orgs";

  // Recent posts. Always fetched, whatever the join policy: the public
  // profile is meant to give visitors the context they need to decide
  // whether to follow or join. Channel content stays members-only.
  // Clips are backlogged, so `type='clip'` rows are filtered out.
  // A query error is not an empty org: it renders as the failure line below,
  // never as "Nothing posted to the org yet."
  //
  // THE SERVICE ROLE READS THIS LIST, so no policy runs on it. Every other
  // surface leans on `posts_select_authenticated` — `status='published' AND
  // removed_at IS NULL AND user_visible(user_id) …` — and this one is the
  // page that has to write that policy out by hand, or it becomes the one
  // place a post a moderator took down keeps showing, to signed-out visitors
  // included (plan §Database: "and via service-role routes checking the
  // same"). `status` and `removed_at` are filtered here; the author's
  // restriction is checked right after the read, because it lives in another
  // table. A removed post is dropped for its AUTHOR too: this grid has no
  // "Removed by Vibe moderators" notice to carry, and the author is told on
  // their own profile and in the feed, which do.
  //
  // Owners and admins get "Delete post" on every one of the club's posts
  // (S68 officer tools, C3/C5), unless a suspension or ban is in force: the
  // same role rule and restriction check DELETE /api/posts/[id] makes
  // (clubOfficerMayDelete), so the button and the route agree. Only an owner
  // or admin pays for the read; a failed one shows no button.
  //
  // The owner and officers also get their numbers (the club's view, wave 2,
  // C7): pending requests and this week's new followers, for the needs-you
  // line and the Club tools card. The request count leaves out anyone in a
  // block pair with the officer, as their own requests list does; when that
  // block read fails, the numbers aren't read at all (null: no line, no
  // count), rather than count a request the list would hide.
  const officerView = isSettingsOfficer(viewerRole);
  // Server-rendered per request; intentional Date.now() read.
  const nowMs = Date.now(); // eslint-disable-line react-hooks/purity
  const [memberRes, followerCount, clubPosts, invitedByName, officerMayDeletePosts, boardFacts, mutedRes, setup, officerCounts] = await Promise.all([
    service
      .from("org_members")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", orgId),
    loadFollowerCount(service, orgId),
    // A block hides the posts a person WROTE, club posts included (ruling 13):
    // RLS does it on every cookie-client surface, so this service-role grid
    // does it by hand, inside the query, before the limit (signed out,
    // nobody). `removed_at` lands with the moderation migration; the read
    // falls back to the old one on a deploy that doesn't have it yet.
    readClubPostsForViewer(
      service,
      supabase,
      user?.id ?? null,
      orgId,
      "id, type, content, media_url, media_thumbnail_url, created_at, edited_at, user:user_id(id, handle, name, avatar_url)",
    ),
    user && invite?.invited_by
      ? loadInviterFirstName(service, supabase, invite.invited_by, user.id)
      : Promise.resolve(null),
    user && isClubPostDeleteRole(viewerRole)
      ? requireNotRestricted(user.id).then(
          (gate) => gate === null,
          () => false,
        )
      : Promise.resolve(false),
    // The Board card's facts (club model). Nothing to ask while the
    // membership read failed: that page shows no card and no menu.
    relation
      ? loadBoardFacts(service, supabase, {
          orgId,
          hidden: !!hiddenAt,
          viewerId: user?.id ?? null,
          isMember: !!viewerRole,
          following: relation.following,
          removed: !!ctx?.removed,
        })
      : Promise.resolve(NO_BOARD),
    // The ⋯ menu's Mute / Unmute. A failed read reads as not muted: a second
    // mute is harmless (the route answers `already`).
    user && ctx?.ok ? loadMutedOrgSet(supabase, user.id, [orgId]) : Promise.resolve(null),
    // The setup list's progress, for the owner and officers only (the club's
    // view, wave 1): null for a club no setup link made, or a failed read,
    // and then the "Finish setting up" line simply doesn't show.
    isSettingsOfficer(viewerRole)
      ? loadClubSetup(service, {
          id: orgId,
          logo_url: (orgRaw.logo_url as string | null) ?? null,
          banner_url: (orgRaw.banner_url as string | null) ?? null,
          description: (orgRaw.description as string | null) ?? null,
        })
      : Promise.resolve(null),
    user && officerView ? loadOfficerNumbers(service, supabase, orgId, user.id, nowMs) : Promise.resolve(null),
  ]);
  const { posts: postsRes, blocked: blockedAuthors } = clubPosts;
  if (memberRes.error) {
    console.error("[orgs/[handle] page member count]", memberRes.error);
  }

  const lastMs = orgRaw.last_activity_at ? Date.parse(orgRaw.last_activity_at) : null;
  const dormant =
    !orgRaw.verified && lastMs !== null && nowMs - lastMs > DORMANT_MS;

  const orgHandle = orgRaw.handle as string;
  const org: OrgProfile = {
    id: orgId,
    handle: orgHandle,
    name: orgRaw.name as string,
    description: (orgRaw.description as string) ?? "",
    logo_url: orgAssetProxyUrl(orgHandle, orgRaw.logo_url as string | null, "logo"),
    banner_url: orgAssetProxyUrl(
      orgHandle,
      orgRaw.banner_url as string | null,
      "banner",
    ),
    join_policy: joinPolicy,
    audience,
    hidden: !!hiddenAt,
    campus_id: campusId,
    verified: !!orgRaw.verified,
    backdrop_preset: (orgRaw.backdrop_preset as string) ?? "sand-purple",
    links: Array.isArray(orgRaw.links)
      ? (orgRaw.links as Array<{ label: string; url: string }>)
      : [],
    philanthropy: (orgRaw.philanthropy as string) ?? "",
    meeting_time: storedMeetingTime(orgRaw.meeting_time) ?? "",
    last_activity_at: (orgRaw.last_activity_at as string | null) ?? null,
    member_count: memberRes.error ? null : publicMemberCount(memberRes.count, viewerRole),
    // Exact for the owner and officers (even under 5), floored for everyone
    // else; null when the read failed.
    follower_count: headerCount(followerCount, officerView),
    dormant,
  };

  const campusRow = campusRowById(org.campus_id);
  const openToCampus = campusRow
    ? { name: campusRow.name, shared: isSharedCampus(campusRow) }
    : null;
  const notice = joinPolicyNotice({
    state: displayState,
    joinPolicy: org.join_policy,
    audience: org.audience,
    orgName: org.name,
    hidden: org.hidden,
  });

  const { data: postsData, error: postsReadErr } = postsRes;
  const allPostRows = ((postsData || []) as unknown as PostRow[]).map((p) =>
    withPostMediaUrls(p),
  );
  // `user_visible()` — the last piece of the policy the service-role read
  // above skipped. A paused or banned student's posts come off every other
  // surface for as long as the restriction lasts; they come off this one here.
  // A FAILED read is not "nobody is restricted": it renders as the failure
  // line, the same as a failed posts query, because "restriction unknown" has
  // to fail closed. Restricted students can't reach this page at all
  // (src/proxy.ts), so nobody is being hidden from themselves.
  const restrictedAuthors = await loadRestrictedAuthors(
    service,
    allPostRows.map((p) => p.user?.id).filter((id): id is string => !!id),
  );
  // Blocks (ruling 13) fail closed the same way: "block unknown" shows the
  // failure line, never a blocked author's post.
  const postsErr = !!postsReadErr || !restrictedAuthors.ok || !blockedAuthors.ok;
  const posts: PostRow[] =
    restrictedAuthors.ok && blockedAuthors.ok
      ? visibleClubPosts(allPostRows, {
          restricted: restrictedAuthors.ids,
          hiddenAuthors: blockedAuthors.ids,
        })
      : [];

  const backdrop =
    BACKDROP_PRESETS[org.backdrop_preset] ?? BACKDROP_PRESETS["sand-purple"];

  // The Announcement Board card: Open, Read the Board, Follow to read the
  // Board, Verify school email, or nothing (club model; `boardCardView`).
  const boardCard = relation
    ? boardCardView({
        state: relation.state,
        following: relation.following,
        boardId: boardFacts.boardId,
        boardReadable: boardFacts.boardReadable,
        followWouldRead: boardFacts.followWouldRead,
        verifyToRead: boardFacts.verifyToRead,
        orgName: org.name,
      })
    : null;
  // The ⋯ menu, for a signed-in viewer whose standing loaded. Not on a hidden
  // club seen from outside (a platform admin): there is nothing to mute.
  const menu =
    user && ctx?.ok && relation && relation.state !== "hidden" ? (
      <OrgMenu
        orgHandle={org.handle}
        orgName={org.name}
        role={viewerRole}
        muted={!!mutedRes?.ok && mutedRes.ids.has(orgId.toLowerCase())}
        keepFollowing={keepFollowingDefault(followRes?.ok ? followRes.row?.source : null)}
        // The club's switch, for members only (never next to a follower's
        // missing Board card: wave-2 repair, finding 15).
        boardReadersOn={viewerRole && boardFacts.boardId ? boardFacts.readersOn : null}
      />
    ) : null;

  // The owner and officers (C9): Edit page, the cover's + and Club tools,
  // the switch chevron, their two lines and, on a wide screen, the Club
  // tools card. Not the cover buttons on a hidden club.
  const officerRole = officerView && (viewerRole === "owner" || viewerRole === "admin") ? viewerRole : null;
  const needsYou = officerCounts ? needsYouText(officerCounts) : null;
  // "Report this club", in More about us. Signed out there is nobody to file
  // a report as, so the row stays off. `isOfficer` and not the club's
  // `owner_id`: the route refuses only the owner ("You can't report something
  // of your own"), but an officer reporting the club they help run is a
  // conversation with the other officers, not a report to Vibe.
  //
  // `ctx.ok` for the same reason the page renders no join button on a failed
  // membership read: `viewerRole` is null both for a stranger and for a read
  // that fell over, and on the second the club's own owner would be offered
  // a Report that can only come back "You can't report something of your
  // own" — the refusal every other surface is built to avoid. A failed read
  // already means this page speaks only about the club, so the row goes with
  // the rest.
  const reportable = user && ctx?.ok ? { id: org.id, viewerIsOwner: isOfficer(viewerRole) } : null;

  return (
    <main
      // Dark in Light and Night alike (the club's own backdrop), so the
      // page takes Night's tokens as an island (globals.css).
      className={`${user ? "vibe-tabbar-page vibe-mobile-safe-top" : "vibe-mobile-safe-top"} vibe-night-island`}
      style={{
        minHeight: "100vh",
        background: backdrop,
        backgroundAttachment: "fixed",
        color: "var(--charcoal)",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <div
        className="vibe-org-shell"
        // One centred column; the owner and officers get room for the
        // Club tools column on a wide screen.
        style={{ maxWidth: officerRole ? 1100 : 760, margin: "0 auto", padding: "0 24px 64px" }}
      >
        <TopNav signedIn={!!user} backHref={backHref} />

        <ClubCover org={org}>
          {officerRole && !org.hidden ? (
            <CoverOfficerButtons
              orgId={org.id}
              orgHandle={org.handle}
              orgName={org.name}
              verified={org.verified}
              viewerRole={officerRole}
              boardId={boardFacts.boardId}
            />
          ) : null}
        </ClubCover>

        <div className="vibe-club-layout" data-tools={officerRole ? "true" : undefined}>
          <div style={{ minWidth: 0 }}>
            <ClubHeader
              org={org}
              invited={relation?.state === "invited"}
              menu={menu}
              switcher={officerRole ? <SwitchChevron /> : null}
              moreAboutUs={
                <MoreAboutUs reportable={reportable}>
                  <AboutDetails org={org} />
                </MoreAboutUs>
              }
            />

            {/* One row, two halves: Edit page for the owner and officers,
                the join control for everyone else, then Share page. A
                hidden club has no page to share. Mounted once (Edit page
                reads ?edit=1 itself). */}
            <div className="vibe-club-actions">
              {officerRole ? (
                <EditPageButton
                  orgHandle={org.handle}
                  orgName={org.name}
                  hidden={org.hidden}
                  openToCampus={openToCampus}
                  joinPolicy={org.join_policy}
                  audience={org.audience}
                  initialDescription={org.description}
                  initialLinks={org.links ?? []}
                  initialPhilanthropy={org.philanthropy}
                  initialMeetingTime={org.meeting_time}
                  meetingTimeReady={meetingTimeReady}
                />
              ) : (
                <div className="vibe-club-join">
                  {relation ? (
                    <OrgProfileJoinButton
                      relation={relation}
                      pendingInviteId={ctx?.pendingInvite?.id ?? null}
                    />
                  ) : (
                    <LoadFailed
                      tone="dark"
                      failure={{ message: "Couldn't load your membership. Try again." }}
                    />
                  )}
                </div>
              )}
              {org.hidden ? null : <SharePageButton orgHandle={org.handle} orgName={org.name} />}
            </div>

            {setup && !setup.complete ? (
              <FinishSetupLine href={clubSetupPath(org.handle)} done={setup.done} total={setup.total} />
            ) : null}
            {officerRole && needsYou ? (
              <NeedsYouLine handle={org.handle} text={needsYou} requests={officerCounts?.pendingRequests ?? 0} />
            ) : null}

            {/* Membership gates the chats, not the public profile. Description,
                posts, links, and philanthropy all show so a visitor can decide
                whether to follow or join. */}
            {notice ? <JoinPolicyNotice text={notice} /> : null}
            {invite ? (
              <div style={{ marginTop: 16 }}>
                <OrgInviteBanner
                  orgName={org.name}
                  inviterFirstName={invitedByName}
                  expiresAt={invite.expires_at}
                />
              </div>
            ) : null}

            {/* Up next and the Events tab read one list, fetched once. */}
            <ClubEventsProvider orgId={org.id} rsvpAtHomeOnly={visiting} renderKey={nowMs}>
              <UpNext officerHint={!!officerRole && !org.hidden} />
              <OrgContent
                posts={
                  postsErr ? (
                    <PostsFailed />
                  ) : posts.length > 0 ? (
                    <PostsSection
                      posts={posts}
                      org={org}
                      viewerId={user?.id ?? null}
                      officerMayDelete={officerMayDeletePosts}
                    />
                  ) : (
                    <EmptyContent />
                  )
                }
                events={
                  <>
                    <OrgEventsSection
                      orgId={org.id}
                      orgName={org.name}
                      orgHandle={org.handle}
                      orgVerified={org.verified}
                      viewerRole={viewerRole}
                    />
                    {/* Event check-in (Oct 19 2026, contract 4.6): events that
                        ended in the last 30 days, "N were there" and the
                        officers' "Who came". Draws nothing when there are none. */}
                    <OrgPastEvents orgId={org.id} orgHandle={org.handle} />
                  </>
                }
                board={
                  <>
                    {boardCard && relation ? <BoardSection card={boardCard} relation={relation} /> : null}
                    <ChannelsSection orgHandle={org.handle} relation={relation} />
                  </>
                }
              />
            </ClubEventsProvider>
          </div>

          {officerRole ? (
            <aside className="vibe-club-aside">
              <ClubToolsCard
                handle={org.handle}
                requests={officerCounts?.pendingRequests ?? null}
                members={org.member_count}
                followers={org.follower_count}
              />
            </aside>
          ) : null}
        </div>
      </div>

      {/* This phone's remembered club follows the viewer's standing here. */}
      {user && ctx?.ok ? (
        <ClubSwitchSync
          handle={org.handle}
          name={org.name}
          logoUrl={org.logo_url}
          standingKnown
          officer={!!officerRole}
        />
      ) : null}

      {/* The phone tab bar, for signed-in viewers only: every tab is a
          signed-in surface, and a visitor keeps the page's own "Sign in".
          It is hidden above 899px, and it sits inside <main> so the
          `.vibe-tabbar-page:has([aria-modal])` rule can hide it while one
          of this page's inline dialogs is open. */}
      {user ? <MobileTabBar /> : null}
    </main>
  );
}

/**
 * The inviter's first name for the invite banner, exactly as
 * `GET /api/orgs/[slug]` reads it: null when their account is gone, when the
 * viewer has them blocked or muted (critic A7), or when the blocked/muted read
 * failed (the banner then says "an officer" rather than risk the name).
 */
async function loadInviterFirstName(
  service: SupabaseClient,
  supabase: SupabaseClient,
  inviterId: string,
  viewerId: string,
): Promise<string | null> {
  const [inviterRes, hiddenRes] = await Promise.all([
    service.from("users").select("id, name").eq("id", inviterId).maybeSingle(),
    loadHiddenUsers(supabase, viewerId),
  ]);
  return visibleInviterFirstName(
    (inviterRes.data as { id: string; name: string | null } | null) ?? null,
    hiddenRes.ok ? new Set(hiddenRes.hidden.ids) : [inviterId],
  );
}

/**
 * The owner's and officers' numbers (C7), with the request count leaving out
 * everyone in a block pair with this officer (the requests list's BLOCKS
 * rule). Null when the block read fails: the page then shows no needs-you
 * line and no request count, rather than count someone the list hides.
 */
async function loadOfficerNumbers(
  service: SupabaseClient,
  supabase: SupabaseClient,
  orgId: string,
  viewerId: string,
  nowMs: number,
): Promise<OfficerCounts | null> {
  const hidden = await loadHiddenUsers(supabase, viewerId).catch((err: unknown) => ({ ok: false as const, error: err }));
  if (!hidden.ok) {
    console.error("[orgs/[handle] page officer blocks]", hidden.error);
    return null;
  }
  return loadOfficerCounts(service, orgId, nowMs, hidden.hidden.blocked);
}

/**
 * "Finish setting up · 2 of 6", under the buttons while a new club's setup
 * list has steps left (the club's view, wave 1; the officer bar it sat under
 * is gone in wave 2). Officers only. Theme tokens since wave 2 (the page is
 * a night island), the same look as before.
 */
function FinishSetupLine({ href, done, total }: { href: string; done: number; total: number }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        minHeight: 44,
        marginTop: 10,
        padding: "0 14px",
        borderRadius: 14,
        border: "1px solid rgba(var(--scrim-rgb),0.14)",
        background: "rgba(var(--scrim-rgb),0.06)",
        color: "var(--charcoal)",
        textDecoration: "none",
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      <span
        aria-hidden
        style={{ width: 8, height: 8, borderRadius: 999, background: "var(--coral)", flexShrink: 0 }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        Finish setting up{" "}
        <span style={{ color: "var(--ink-muted)", fontWeight: 500 }}>
          · {done} of {total}
        </span>
      </span>
      <Arrow direction="right" />
    </Link>
  );
}

function TopNav({ signedIn, backHref }: { signedIn: boolean; backHref: string }) {
  return (
    <nav
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "20px 0",
        fontSize: 13,
      }}
    >
      {/* Vibe logo with orange dot — matches the LeftNav treatment.
          Oct 19, 2026: family, weight and letter-spacing come from
          .vibe-wordmark (globals.css), the landing's soft shape. */}
      <Link
        href="/"
        className="vibe-wordmark"
        style={{
          color: "#fff",
          textDecoration: "none",
          fontSize: 22,
        }}
      >
        vibe<span style={{ color: "#FF5C35" }}>.</span>
      </Link>
      {signedIn ? (
        <Link
          href={backHref}
          style={{
            color: "rgba(255,255,255,0.95)",
            textDecoration: "none",
            padding: "8px 16px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.08)",
            fontWeight: 600,
            fontSize: 13,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <Arrow direction="left" /> Return to Organizations
        </Link>
      ) : (
        <Link
          href="/auth/login"
          style={{
            color: "rgba(255,255,255,0.85)",
            textDecoration: "none",
            padding: "6px 14px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            fontWeight: 600,
          }}
        >
          Sign in
        </Link>
      )}
    </nav>
  );
}

/**
 * The line under the header: who can join and that anyone can follow, or
 * that the club is hidden. The text is `joinPolicyNotice`'s; open clubs and
 * members get none, so the caller renders nothing on null.
 */
function JoinPolicyNotice({ text }: { text: string }) {
  return (
    <div
      style={{
        marginTop: 16,
        padding: "10px 14px",
        borderRadius: 12,
        background:
          "linear-gradient(180deg, rgba(155,123,255,0.18) 0%, rgba(155,123,255,0.06) 100%)",
        border: "1px solid rgba(155,123,255,0.32)",
        color: "rgba(255,255,255,0.88)",
        fontSize: 13,
        lineHeight: 1.5,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          background: "rgba(155,123,255,0.2)",
          border: "1px solid rgba(155,123,255,0.45)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#C9B8FF",
          flexShrink: 0,
        }}
      >
        <LockGlyph size={13} />
      </span>
      <div>{text}</div>
    </div>
  );
}

/**
 * The club's recent posts. The cards are drawn by OrgPostsList, a client file,
 * because each one carries a Report button and the list listens for
 * `vibe:content-reported`; this server side only shapes the rows. The date is
 * formatted here, on the server, exactly as before, so the HTML the server
 * sends and the client's first render say the same thing.
 */
function PostsSection({
  posts,
  org,
  viewerId,
  officerMayDelete,
}: {
  posts: PostRow[];
  org: OrgProfile;
  viewerId: string | null;
  /** A current owner / admin with no restriction: Delete on every post. */
  officerMayDelete: boolean;
}) {
  const items: OrgPostItem[] = posts.map((p) => ({
    id: p.id,
    content: p.content,
    media_url: p.media_url,
    date_label: fmtDate(p.created_at),
    edited: !!p.edited_at,
    author: p.user ? { id: p.user.id, handle: p.user.handle, name: p.user.name } : null,
  }));
  return (
    <SectionCard title="Recent posts">
      <OrgPostsList
        posts={items}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        viewerId={viewerId}
        officerMayDelete={officerMayDelete}
      />
    </SectionCard>
  );
}

function EmptyContent() {
  return (
    <SectionCard title="Recent activity">
      <div
        style={{
          padding: 28,
          textAlign: "center",
          color: "rgba(255,255,255,0.55)",
          fontSize: 14,
        }}
      >
        Nothing posted to the org yet.
      </div>
    </SectionCard>
  );
}

function PostsFailed() {
  return (
    <SectionCard title="Recent activity">
      {/* Rendered from a server component, which can only pass serializable
          props — no onRetry, so the pill reloads the page. */}
      <LoadFailed
        tone="dark"
        failure={{ message: "Couldn't load this org's posts. Try again." }}
      />
    </SectionCard>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        padding: "clamp(12px, 3.6vw, 16px)",
        borderRadius: 16,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14)",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.55)",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}
