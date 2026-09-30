# Session 49 handoff — clips backlogged, Supabase restored from pause (2026-09-01)

Short session after a ~3.5 month summer break. Session 48's handoff is dated
2026-05-18, but the last actual commit is `a0734fc` on **2026-05-19** — a
post-handoff day that shipped mobile onboarding, the mobile Otto tour, and clip
text overlays without ever getting written up. §0 backfills them so they don't
get lost again.

Two things happened this session, in order:

1. **Infrastructure was down and got restored.** The Supabase project had been
   paused. Root cause was an unpaid prorated Pro invoice from May, not
   inactivity. User paid it, resumed the project, and all five health endpoints
   came back green.
2. **Clips got backlogged.** User's product call: park the entire vertical
   short-form video surface until Vibe is funded and can afford the storage.
   ~8,100 lines removed across 30 files. Video posts in the feed and video in
   DMs/group chats are deliberately untouched.

Shipped as `0078c9c` on 2026-09-02 and live on `https://www.connectvibe.app`.
Restore tag `clips-before-backlog` (`a0734fc`) is on origin. Session 50 starts
from the open list in §6 — do not re-commit the clips removal.

---

## Agent labels

| Label | Meaning |
|--------|--------|
| **`[Cursor]`** | This thread — the audit, every removal, the docs. |
| **`[You]`** | Human — the product call, the Supabase dashboard work, the invoice. |

---

## 0) Backfill — the undocumented 2026-05-19 commits

Session 48's handoff was written, then eight more commits landed the next day
and no handoff covered them. Recording them here so the history is complete:

- `b2beb77` **Native mobile onboarding rebuild.** `OnboardingMobile.tsx` — the
  4-step Otto flow, mobile-native, selected by `onboarding/OnboardingSwitch.tsx`.
  This was session 48's designated "what's next," done immediately.
- `d984664` **Mobile Otto spotlight tour** (profile → campus → network),
  `use-mobile-tour.ts`.
- `50aa100` **Tour gating fix** — desktop legs skip on mobile; pending flag no
  longer dropped when a start fails.
- `108d189`, `cf11dfb`, `1d3120c`, `d9f6c68`, `a0734fc` **Clip text overlays +
  audio.** Style controls (bg / font / size), Instagram-style text editor,
  pinch-to-scale, per-text timing, then three passes on audio capture (record
  the camera stream directly instead of merging through canvas) and rAF-driven
  overlay timing. All of this is now parked with clips — preserved in the tag.

None of it has been QA'd against a live backend; the project was paused two days
later.

---

## 1) Supabase came back from a pause

The symptom was ugly enough to look like data loss, so it's worth writing down
what it actually was.

**Symptom:** the project hostname stopped resolving entirely (NXDOMAIN), and
every `/api/health/*` check failed. A paused Supabase project tears down its
DNS record, which reads identically to a deleted project from the outside.

**Wrong first theory:** free-tier deletion after 90 days of inactivity. The
break was about the right length for that to be plausible, which is what made
it convincing.

**Actual cause:** the project was **paused, not deleted** — and the trigger was
a prorated Supabase Pro invoice from May that never got paid, not inactivity.
The dashboard said data and storage were all intact and resumable until
2027-07-20. User paid the invoice and hit Resume.

**After restore, all green:** `/api/health/supabase`, `/auth`, `/r2`,
`/resend`, `/sentry`.

**Takeaway for next time:** if the Supabase host stops resolving, open the
dashboard *before* doing any forensics. Paused and deleted look the same from
DNS, and the dashboard tells you which one it is in one glance.

### Paid services, current state

From `DOCS/FINANCES.csv`, confirmed this session:

| Service | Cost | Notes |
|---|---|---|
| Supabase Pro | $25/mo | The one that was unpaid. Pro also prevents future auto-pause. |
| Cloudflare R2 | $0–5/mo | The line item clips would have blown up. |
| Resend | $0–20/mo | Free tier today. |
| Sentry | $0 | Free tier. |
| Custom domain | $10–30/yr | Not bought yet. |
| Cursor Pro | $0 | Covered. |
| Claude Max | $100/mo | Renewed this session. |

Nothing else is outstanding.

**Still open from before the break:** Supabase email auth. The user had turned
off "Confirm email" to dodge the built-in rate limit. Recommendation stands —
turn the email provider and Confirm email back on, and point it at **Custom
SMTP via Resend** so volume isn't capped by Supabase's shared sender. Not done
yet.

---

## 2) Clips are backlogged

### The product decision, in the user's framing

Save clips for when there's funding to pay for video storage. Ship without
them, watch whether users actually ask for short-form video, and if the demand
shows up on its own, expand storage deliberately and turn it back on. Video in
the feed and video in DMs stay, which covers "I want to share a video" without
paying for an entire TikTok surface.

Three explicit calls that shaped the implementation:

- **Hide existing clip rows** rather than delete them — filter at the query layer.
- **Delete the code**, don't feature-flag it, and write down how to restore it.
- **Include `public/html/profile.html`** in this pass rather than deferring it.

### CQO sign-off, and a better reason than the one we had

Rylan Conaway (CQO) endorsed the backlog after the fact and supplied a stronger
rationale than the storage-cost one this session started with — he'd raised it
the first time he ever saw the feature:

> Making a *quality* video is a lot of effort, and nobody outside of marketing
> or film students will sink that time in before Vibe has the "cool factor" that
> makes it pay off.

That's a **creator-supply** problem, and it outranks cost because money doesn't
fix it. Even with free storage, an empty reel is still the outcome — and an empty
reel is worse than no reel, because it reads as a dead app.

It also confirms the cut landed in the right place. The objection is to
**performance video** (produced for strangers), not video as such. Kept: video in
DMs, group chats, and attached to feed posts — all low-effort, you already have
the file. Removed: the clips surface, which demands production. So "you can still
post and send videos" isn't a consolation prize, it's the half of video that
survives the objection.

Both reasons, the historical precedent (TikTok's inherited userbase + sound
library, Instagram waiting for ~1B users, BeReal deliberately going low-effort),
and a two-gate restore trigger are now written into `DOCS/BACKLOG_CLIPS.md`.
The trigger matters: the doc previously said "decide the storage budget first,"
which would have let someone restore clips on a funding event alone. It now
requires a **demand gate** too, measurable from the video plumbing that's already
live — video attach rate on feed posts, repeat video posters, unprompted asks
about caps or editing. Plus the trap: heavy video in DMs but no public video
posts is a *negative* signal for clips that's easy to misread as a positive one.

### The thing that made this non-trivial

Clips were never a separate table. A clip is a row in `posts` with
`type='clip'`. And more dangerously:

> **`clips/` is the R2 key prefix for *all* post video, not just clips.**

So `/api/me/clip-upload-url`, `signClipPutUrl`, `signClipGetUrl`,
`CLIP_KEY_PREFIX`, and the `clips/` branch in `/api/posts/[id]/media` are all
load-bearing for **regular video posts**. Deleting anything matching `clip`
would have silently broken feed video. The rule for the whole pass ended up
being: remove clips as a *surface*, keep every piece of shared video plumbing.

A `clips-before-backlog` git tag was cut at `a0734fc` first, so everything
below has a clean restore point.

### What was deleted outright

| File | Lines |
|---|---|
| `src/components/mobile/ClipComposerMobile.tsx` | 3,333 |
| `src/components/mobile/ClipViewerMobile.tsx` | 773 |
| `src/lib/clip/edit-metadata.ts` | 267 |
| `src/app/api/me/publish-clip/route.ts` | 152 |
| `src/app/api/clips/[id]/view-url/route.ts` | 84 |
| `src/app/api/me/clip-drafts/route.ts` | 38 |

### Read paths that now filter `type='post'`

Every endpoint that could surface a clip row:

- `/api/feed` — main query + the `post_reposts` join
- `/api/trending/hashtags`
- `/api/me/posts`, `/api/users/[handle]/posts`
- `/api/me/creator-stats` — also dropped `clips` from the `totals` shape
- `/api/orgs/[slug]/profile` — dropped the `clipRows` return field
- `/api/me/bookmarks` — `.eq("post.type", "post")` on the embedded join
- `/api/users/[handle]/reposts` — same embedded-join form
- `src/app/orgs/[handle]/page.tsx`

`edit_metadata` also came out of the `select(...)` lists in `/api/feed`,
`/api/posts/[id]`, `/api/me/posts`, and `/api/users/[handle]/posts`.

The last two (`bookmarks` and `reposts`) were the easiest to miss — they don't
query `posts` directly, they pull it in through an embedded join, so they
didn't match a search for `from("posts")`. A saved or reposted clip would have
kept rendering on the profile. Worth remembering the shape of that mistake:
**an audit for "which routes read posts" has to include joins, not just
top-level selects.**

### UI surfaces removed

**Mobile** (`CampusMobile.tsx`, `ProfileMobile.tsx`)
- Clips tab out of both `Tab` unions and both `TAB_ORDER` arrays
- `ClipsPane` on campus; `ClipsGrid` + `DraftsTile` + the clip-drafts preview
  fetch on profile
- `ComposerFab` collapsed from a two-action menu (New post / New clip) to a
  single button that opens the post composer directly — `FabAction` went with it
- `?clip=<id>` deep links now route to the normal post viewer instead of
  404-ing, so old shared links still land somewhere sensible
- "Clip" badges on saved/repost thumbs; the Clips mention in the mobile tour copy

**Desktop** (`campus-home.tsx`, `admin-actions.tsx`)
- The whole reel stack — `ClipsReel`, `ClipsReelInner`, `ClipReelCard`,
  `ClipCommentsSheet`, `ReelAction`, `FeedModeToggle`, `feedModePillStyle`,
  `clipFallbackGradient`, `composerVideoModePill` — ~935 contiguous lines
- `FeedComposer`'s Clip / Video-post mode choice; it always publishes a post now
- The Post/Clip toggle in the org `NewPostModal` — org posts are text + image
- Orphaned icon helpers (`SoundOnIcon`, `SoundOffIcon`, `ShareIcon`)

**Static HTML** (delegated to a subagent, then verified)
- `profile.html` — Clips tab, clips grid CSS/JS, in-page clip composer, the
  clip-drafts modal, `.feed-clip-card` in the mixed All feed, and the clip
  branch in `_buildSavedCell`
- `_postViewer.js` — the clip playback branch (vertical layout, view-url fetch,
  `edit_metadata` overlays)
- `_sharePicker.js` — label is always "Post"

One fix on top of the subagent's work: `_buildFeedCard` had been choosing
`<video>` vs image backdrop off `post.type === 'clip'`, which would have made
**regular video posts** render as a broken background image. It now tests
`media_kind === 'video' || media_url` starting with `clips/` — `/api/feed`
precomputes `media_kind`, the profile endpoints don't, so it needs both.

### Deliberately left alone

- **`messages.html` clip branches.** These render *existing* clip attachments in
  old DMs. Clips can't be shared anymore (the picker only emits `"post"`), but
  historical messages should still render, so the legacy read path stays.
- **`/posts/[id]` for a clip id.** Still resolves and renders. Permalinks that
  were already shared keep working; it's just not reachable from any feed.
- **A pinned clip.** `pinnedPostId` is only an id that the (now clip-free) grid
  highlights by match, so a pinned clip renders nothing. No filter needed.

### Database — no migration, on purpose

Nothing was migrated and no clip row was deleted. `posts.type` still allows
`'clip'`, `posts.edit_metadata` still exists, `messages.attachment_kind` still
allows `'clip'`, and every clip row plus its R2 object is intact.

**Do not tighten the `posts.type` or `messages.attachment_kind` CHECK
constraints.** Dropping `'clip'` would break restore and orphan any clip that
was ever shared into a DM.

---

## 3) Verification

- `npx tsc --noEmit` — clean
- `npm run build` — clean; `/api/clips/[id]/view-url` confirmed gone from the
  route manifest
- `npm run lint` — 67 problems (36 errors, 31 warnings), **unchanged from the
  baseline tag**. Everything flagged in a touched file is either a pre-existing
  `react-hooks/set-state-in-effect` from the stabilization backlog, or a symbol
  that was already unused before this session (`GlassCard` and `handleShare` in
  `campus-home.tsx` were both verified unused at `clips-before-backlog`).

**Still not verified by hand:** post a video in the main feed and send a video
in a DM, on a real phone. Both paths were reasoned about carefully and
typecheck/build clean, but neither was exercised at runtime this session, and
they're exactly the two things this change could plausibly have broken. Do it
as part of session 50 QA, not as a blocker on the backlog commit (already live).

---

## 4) Quick reference

| Thing | Where |
|---|---|
| **Full restore guide** | `DOCS/BACKLOG_CLIPS.md` |
| Restore point | git tag `clips-before-backlog` → `a0734fc` |
| Video upload signing (shared, keep) | `/api/me/clip-upload-url` |
| Video playback redirect (shared, keep) | `/api/posts/[id]/media` |
| R2 prefix + signers (shared, keep) | `src/lib/r2.ts` — `CLIP_KEY_PREFIX`, `signClipPutUrl`, `signClipGetUrl` |
| Clips history | sessions 37, 43, 47 |

`DOCS/BACKLOG_CLIPS.md` is the real artifact from this session — it covers why
clips are parked, what's preserved, the `clips/` naming trap, the untouched
schema, and step-by-step restore (recover files → flip filters → re-add UI →
decide the storage budget first).

---

## 5) Pickup for session 50

Clips backlog is **done** (`0078c9c` on `main`, live on `www.connectvibe.app`).
Do not reopen that tree.

Start here, in this order:

1. **QA mobile onboarding + Otto tour on a phone** against the live backend.
   Built 2026-05-19, never run while Supabase was up. Highest-value unknown.
2. **Hand-test video-in-feed and video-in-DM** on a phone (§3).
3. **Re-enable Supabase Confirm email + Resend custom SMTP** (§1). Auth is
   running without confirmation right now.
4. Then pick from §6. Native iOS/Android rewrite is **not** next — developer
   accounts are fine anytime; Capacitor wrap waits for testers asking for a
   home-screen icon; React Native waits until IU is locked.

Canonical product URL: `https://www.connectvibe.app` (apex 301s to `www`).
The `vibe-mocha-iota.vercel.app` host is the Vercel alias only.

---

## 6) What's still open

Carried forward, minus anything clips-related that this session resolved:

1. **QA the mobile onboarding + tour on a phone.** Built 2026-05-19, never run
   against a live backend — the project was paused two days later. Highest-value
   unknown right now.
2. **Supabase Confirm email + Resend SMTP** — auth is running without email
   confirmation right now.
3. **Lint: `react-hooks/set-state-in-effect`** — pre-existing in `CampusMobile`,
   `ProfileMobile`, `campus-home`, `wavy-background`. Cosmetic, clutters output.
4. **`/posts/[id]` for unauthenticated visitors** — bounces to login; OG meta
   works. Public post pages would need an `is_public` gate + policy + guest mode.
5. **Feed ranking Tier-2** — at 1k+ daily active. Pure Postgres, no new infra.
6. **Mobile work-experience date picker** — free text today, sort key is
   best-effort regex.
7. **Desktop search overlay** — legacy `_searchOverlay.js` on profile.html could
   port to the exported `CampusSearchOverlay`.
8. **Rename `clip*` → `video*`** in the shared R2 plumbing. Now that clips are
   gone, the names actively mislead — they're the top hazard for the next person
   who greps for "clip" and deletes something. It's a pure rename, not a removal.

### Deferred with clips (not cancelled)

- **Text-on-clip overlays.** Was session 48's open item 1. It actually shipped
  into `ClipComposerMobile` on 2026-05-19 (`108d189`, `cf11dfb`, plus three
  audio/timing fixes) — style controls, an Instagram-style text editor, pinch,
  and per-text timing. All of it is parked with the rest, preserved in the tag.
- **Recording / video editing surface.** User's own words before this session:
  "scratched the whole recording, video editing portion for now, circling back
  when we have everything else stabilized." That's now formalized.
