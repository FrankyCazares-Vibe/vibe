# Club chat today — code map (S68, 2026-09-29)

CH = src/app/campus/campus-home.tsx, CM = src/components/mobile/CampusMobile.tsx.

## Desktop
- State CH:447-454; orgs `/api/orgs?filter=mine`, channels `/api/orgs/[handle]/channels` cached per org (CH:640-727); grid `72px 240px 1fr` CH:954-991; Chat tab locked to viewport (CH:896), Otto orb hidden (CH:528); deep link `?tab=chat&org=&channel=`.
- ServerRail CH:15083 (44px squircle pills, white capsule on active, dashed "+" "Create a new org"; no unread, no verified, no reorder).
- ChannelRail CH:15418 (org name → /orgs/[handle], VerifiedBadge, own RoleChip, "Hidden · policy · N channels"; "📌 Pinned" + "Text channels" CH:15577/15590; # or lock CH:15373; owner/admin ⚙ + right-click settings; "+ Channel", "Settings"; no members, unread, search).
- ChannelMain CH:15663 ("# name · Org", org tint; topic not shown; backdrop presets CH:288: cream default, sand-purple, ember, deep-violet, forest, midnight).
- ChannelChat CH:15817: polls every 2s, latest 80 (CH:15931); Discord-style left rows, dark glass bubbles; date separators (CH:16901); drag-left timestamps; hover pill 5 emoji + Reply (CH:16327); reaction chips; reply quote stub; single-line composer "Message #name" (CH:16589). Missing: media/shared-post render (photo-only = empty bubble), @mention picker, edit, delete, report, typing, read state, paging, pins.
- Empty state CH:16928 "Find your people." Modals: OrgSettingsModal CH:1538 (overview/channels/members/followers/invites/requests/danger), CreateChannelModal CH:1409, ChannelSettingsModal CH:3171 (+ ChannelAccess CH:3511). Roles ROLE_META/ROLE_PERMS CH:16661-16700.

## Phone
Drill-down: ChatPane CM:2157 ("Servers", "Search servers") → OrgChannelsDrawer CM:2487 (backdrop, "Search channels", "Text channels"/"Private", topic) → `ConversationView` (MessagesMobile.tsx:1017) with a synthetic thread (CM:2459). iMessage bubbles; long-press reactions/Reply/Report (MessageBubble :3849); attachments off in clubs (`canAttach` :1374); NO polling (load once / on send / Retry :1117-1192); no officer tools; ⋯ menu shows DM actions ("Clear" no-op for clubs: messages GET ignores cleared_at for org channels, messages/route.ts:233).

## Data + permissions
- `channels` type dm|group|org_channel|org_subchannel (subchannel/parent unused), topic, is_private, position, pinned. `messages` (4000 chars, media, attachment, parent_message_id, removed_*). `message_reactions` (7-emoji allowlist lib/messages/reaction-emoji.ts:21). `channel_members` (also club subscription rows, lib/orgs/membership.ts:214). `org_channel_members` (private allow-list). `org_members.role` owner/admin/mod/member.
- `can_view_org_channel` (20260922090000:142) + policies 20260507110000:164: any member reads/posts any public channel. **#announcements is an ordinary public channel** (created at api/orgs/route.ts:882-886) — no read-only/officer-only kind.
- Routes: `/api/me/threads/[id]/messages` GET/POST, `/react`, DELETE (sender only); gate `ensureMember` (lib/messages/channel-access.ts:45). Channel create/edit service-role, owner/admin.
- **No Supabase realtime anywhere** — polling. Send 60/min (messages/route.ts:358), requireCanPublish + word filter. No typing/read receipts for clubs (:267). No edit. Officers can't delete others' messages (only Vibe mods remove).

## Club features in chat
Not in chat: events, polls, RSVPs, announcements, role badges on messages. @mentions parsed server-side → notify (messages/route.ts:572-613); push only for mentions, never names club/channel (lib/push/payload.ts:400); push dark in prod. Otto "mentioned you in a chat" → plain /messages (_otto.js:880). New message bumps org `last_activity_at`.

## DMs vs clubs
Same tables/routes. Club channels also appear in the `/messages` inbox as groups (messages.html:2002). @mention picker (:3591) and delete-own (:1382) exist only there. Desktop campus chat has its own thinner renderer; phone reuses DM ConversationView.

## Discord-derived (to change)
Server rail, squircle pills, capsule indicator, dashed "+", channel rail, # and lock icons; copy "Text channels", "📌 Pinned", "Message #name", "+ Channel", "Pick an org from the rail.", "Servers", "Search servers", "Search channels"; uppercase colored role chips; Discord blurple #5865F2 (CM:2340, 2644); empty states "Discord-style channels" (CH:16996), "Spin up a server…" (CH:17083); comments "Discord-style" CM:69, 417, 1027, 2153, 2199, 2482.

## Constraints
- Blocks don't apply in club channels (by design, messages/route.ts:481-486); ruling 13 hides blocked people's POSTS only.
- A victim is never locked out by a harasser officer (lib/orgs/org-blocks.ts:14-24). Removed members request to rejoin; leaving drops chat rows; roster readable by current viewers only (20260928150000).
- Pending privacy fix: chat members can read others' last_read_at / typing_until / muted_until (moved out of wave A) — read receipts/presence must wait for it.
- Hidden clubs 404 to non-members (lib/orgs/hidden-gate.ts); invites refused.
- Counts public / identities private; N=1 count is an identity (org-following-spec C13).
- Visiting another campus: Chat tab shows own clubs (CH:919); founders' rule: no chatting across campuses.
- Audience iu/purdue/both gates joining (lib/orgs/join-state.ts:62). Verified seal (CH:16700). Posting needs Terms + verified school email + no restriction; media keys channel-scoped.
