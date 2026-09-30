# authz-chat lens notes (S67 sec lenses, HEAD 24dac9f) — read-only

## Live DB (read-only SQL)
- message_reactions_emoji_check now = 7-emoji allowlist (report #1 DB half FIXED at 24dac9f).
- messages: INSERT grant on all cols incl attachment_kind/attachment_id (FK posts), parent_message_id, removed_at/by/reason, media_url; no UPDATE grant; no UPDATE policy.
- channel_members: UPDATE own row on accepted_at,last_read_at,hidden_at,pinned_at,typing_until,muted_until,cleared_at; no INSERT policy; DELETE own only while pending.
- channels: INSERT (org_id NULL any user; org -> owner/admin); no channel/channel_members triggers.
- messages_insert_member (DM/group): block check vs any peer; messages_insert_org_member: can_view_org_channel only (no block check, no officer-only check).
- reactions insert: member/can_view_org_channel, no block check.
- TODO: route hydration of attachment_id / parent_message_id via service role.

## Routes checked
- messages GET/POST: user-scoped client + ensureMember; parent must be same channel; attachment via posts RLS; media key must be channel folder; block check DM/group. SOUND.
- media proxy: ensureMember + RLS + cleared_at + key-in-folder. SOUND (signed URL 1h lingers after kick — low).
- message DELETE own only (RLS + check); react via RLS + allowlist + DB check. SOUND.
- accept/decline/hide/clear/mute/pin/read/typing: own row only. SOUND.
- members POST (add to group): any member may add a connected user; only requireTermsAccepted (not requireCanPublish); no MAX_GROUP_MEMBERS; no block check vs other members. members DELETE: admin-only kick, group only. OK.
- threads PATCH (rename/photo): any member; requireTermsAccepted only; NO checkText on rename (create path has it).
- CANDIDATE (low): channel_members SELECT policy lets a member read peers' muted_until/hidden_at/cleared_at/pinned_at via PostgREST.

## FINDING A (Medium): org-channel channel_members rows survive leave/kick
- subscribePublicChannels (src/lib/orgs/membership.ts:206) + subscribe-public route upsert channel_members for org public channels.
- Leave (join/route.ts:268-272) and kick (members/[userId]/route.ts:150-154) delete only org_members; no trigger on org_members cleans channel_members (only imply_follow/unfollow_on_leave).
- channel_members_select_member = is_channel_member(channel_id) (no org check) -> ex-member reads roster (user_id, last_read_at, typing_until + users embed) of club channel incl. new joiners; hidden club too.
- ensureMember falls into DM path for org channel invisible via RLS -> returns ok for ex-member; messages GET returns peer_typing names; messages-upload-url gate is channel_members only -> ex-member can mint R2 upload URLs into the club channel folder.
- Live: 2 org-channel channel_members rows, 0 stale today (latent).
- Contrast: PATCH public->private flip DOES purge channel_members ([channelId]/route.ts ~140) acknowledging the risk.
- Finding A extra: org_members SELECT is members-only unless org is public+open+unhidden, so the stale channel_members roster is a real members-only-roster leak for invite-only/hidden clubs. /api/users/search?channel= scope uses channel_members too (roster search for ex-member).
- Checked sound: report route reads target via user client; otto unread uses user client; block route own rows; push decideMention re-checks can_view_org_channel + hidden_club + blocked/muted; notifications list doesn't embed message content.
- is_blocked_either_way / is_org_member / can_view_org_channel guarded vs uid spoof. blocks_select_either lets blocked party see blockers (design).
- Report #13 (purge other members' files): FIXED — storage-purge.ts:208-226 keeps keys another member's message names.
- Report #1 DB half fixed (emoji CHECK) + read-route filter.

## Other findings
- B (Low): channel_members_select_member exposes peers' muted_until/hidden_at/cleared_at/pinned_at (live: 25 rows, 3 hidden, 1 cleared, 0 muted). mutes & channel_member_mutes are own-only; chat mute isn't.
- C (Low): group create/add do no block check across members; add has no MAX_GROUP_MEMBERS (50) cap, no rate limit, terms-only gate.
- D (Low): group rename (threads/[id] PATCH) skips checkText that create applies (route.ts:261-264 vs [id]/route.ts:70-72).
- Info: message_reactions SELECT returns reactor user_id to all channel/club members via PostgREST while route returns counts only. Opening a request marks read -> sender sees Read receipt.
- badge.ts excludes org channels (sound). admitMember always subscribes (membership.ts:267).
