# S68 officer tools: contracts and batches (2026-09-28)

Franky's calls (Sept 28, S68):
- **Cancel = gone.** Cancelling an upcoming club event removes it from every list (the same as Delete). There is NO "cancelled" state on events.
- **Everyone who RSVP'd is told**, whether the officer pressed Cancel or Delete, when the event has not ended yet. RSVP'd = `rsvps.status in ('going','maybe')`, excluding the officer who did it.
- **The notice is from the club, not the officer**, and is **always delivered**: a recipient's blocks/mutes of the officer do not hide it (ruling 14: a victim is never locked out by a harasser officer). The officer's name is never shown on it.
- An event that has already ended is deleted with no notice.
- The production migration is approved ("run it when ready"), after review and a local test.

Carried rulings: `handoffs/wave-plan-sec2/waveB-build.md:8` (current owner/admins may delete any club post; mods can't; nobody deletes a moderator-removed post; an ex-officer may delete but never edit a post they wrote), `waveA-build.md` call 8 / ruling 14, refusal copy is plain English and never mentions a block.

## Contracts (every batch codes against these names; do not rename)

**C1 · DB (B1 writes the migration)** `supabase/migrations/20260930100000_event_cancel_notices.sql`
- `notifications.event_title text` (≤120 chars) and `notifications.event_starts_at timestamptz`, both nullable.
- `notifications_type_check` extended with `'event_cancelled'` (find the LATEST definition across all migrations and keep every type it has).
- Check: `type <> 'event_cancelled' or (org_id is not null and event_title is not null and event_starts_at is not null)`.
- Row shape for a cancel notice: `user_id` = the RSVP'd student, `actor_id` = the officer (column is NOT NULL; never displayed), `org_id` = the club, `type = 'event_cancelled'`, `event_title`, `event_starts_at`. `post_id/comment_id/message_id` null.
- Inserted only by the service role (as every notification is today). Push is queued by the existing insert trigger.

**C2 · Routes (B1)**
- `DELETE /api/events/[id]` — the one route behind both "Cancel event" and "Delete event". Signed in; loads the event with the service role; 404 if missing or `org_id` is null; 403 unless the caller is a CURRENT owner/admin of `org_id` and not suspended/banned (mirror `src/app/api/posts/[id]/route.ts` DELETE: `loadOrgRole` + restriction check). Collect RSVP'd user ids BEFORE deleting (rsvps cascade). Delete with the caller's own client (RLS `events` delete policy enforces) and require exactly 1 row. If `ends_at > now()` insert one C1 notice per RSVP'd user (service role, one batch insert), then `kickPushDrain()`. Respond `{ ok: true, notified: <n> }`. Errors: `{ ok:false, error:"<code>", message:"<plain English>" }`.
- `PATCH /api/events/[id]` — edit `title, description, location, starts_at, ends_at` (and any other field `POST /api/events` accepts, same names). Same auth as DELETE. Only while `ends_at > now()`. Same validation as POST (word filter, time rules, length limits, max 14 days) — extract shared helpers into `src/lib/events/` rather than duplicating. Update with the service role (UPDATE is revoked from clients). Respond `{ ok:true, event: <same shape as one item of GET /api/events> }`. No notification on edit (v1).

**C3 · Payload flags**
- Events: the existing `viewer_can_manage` (GET /api/events, `src/lib/events/manage.ts`) gates Edit / Cancel / Delete in every UI.
- Posts: `viewer_can_delete: boolean` on each item of `/api/feed` (B3) and on `GET /api/posts/[id]` (B4). True iff the post is NOT moderator-removed AND (viewer is the author OR viewer is a current owner/admin of `post.org_id` and not restricted). Computed server-side; never trust the client.
- `/api/me/posts` returns `removed_at` (B4).
- **Removed posts:** any post with `removed_at` set shows no Edit and no Delete anywhere (server already answers 409 `post_removed`).

**C4 · Notification display (B2)** — `event_cancelled` renders as "**{club name}** cancelled **{event_title}** · {day, time of event_starts_at}", with the club's avatar/initials, linking to `/orgs/{club handle}`. Push body: "{club name} cancelled {event_title} ({short date})". It is exempt from every actor block/mute filter (lists, badge counts and push). If the club was deleted (org_id gone → row cascades away) nothing renders.

**C5 · UI copy**
- Upcoming event, officer: menu items "Edit event" and "Cancel event". Confirm: "Cancel {title}? It's removed for everyone, and the {n} people who RSVP'd get a notice." (n from the card's counts when known; otherwise "everyone who RSVP'd gets a notice"). Button: "Cancel event" / "Keep it".
- Ended event, officer: "Delete event". Confirm: "Delete {title}? This can't be undone."
- Club post, officer who isn't the author: "Delete post". Confirm: "Delete this post from {club}? This can't be undone."
- After success: the item leaves the list immediately; a toast "Event cancelled" / "Event deleted" / "Post deleted".

## Batches (one file belongs to exactly one batch)

- **B1 · events server + DB:** the C1 migration, `src/app/api/events/**`, `src/lib/events/**`.
- **B2 · notifications:** `src/lib/push/**`, `src/app/api/me/notifications/**`, `src/app/api/me/otto/**`, `src/components/otto/OttoActivity.tsx`, `src/components/network/OttoSidePanel.tsx`, `src/components/settings/notifications-card-view.ts`, `public/html/_otto.js`, and any other notification renderer/type union B2 finds (report it if it's in another batch's file).
- **B3 · desktop + org page (starts after the S68 header commit):** `src/app/campus/campus-home.tsx` (FeedRow officer Delete; EventCard Edit/Cancel/Delete; CreateEventModal edit mode — it must work at 375px too, since the phone uses EventCard), `src/app/api/feed/route.ts`, `src/app/orgs/[handle]/**`.
- **B4 · phone + static + post routes:** `src/app/api/posts/[id]/route.ts` (GET `viewer_can_delete`), `src/app/api/me/posts/route.ts`, `src/components/mobile/PostViewerMobile.tsx`, `src/components/mobile/CampusMobile.tsx`, `src/components/mobile/ProfileMobile.tsx`, `src/components/mobile/EditPostSheet.tsx`, `public/html/_postViewer.js`, `public/html/profile.html`, `public/sw.js` (bump `SW_VERSION` if any cached static file changed).
