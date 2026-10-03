# Profiles on a phone: map for the demo video

Written 2026-10-02 by the profiles agent. Local stack only (http://localhost:3102, local Supabase).
"RAN" = I did it in a headless phone browser or against the local database. "READ" = I only read the code.
Paths are relative to /Users/franciscocazares/vibe unless absolute.

## 0. Where the phone profile lives (READ)

- `/profile` -> `src/app/profile/page.tsx` (gates: campus access + signed in) -> `ProfileSwitch.tsx` -> on a phone `MobileShell` + `ProfileMobile` with no props (owner mode).
- `/profile/<handle>` -> `src/app/profile/[handle]/page.tsx` (NOT campus gated; 404 for unknown handle) -> `ProfileHandleSwitch.tsx` -> on a phone `ProfileMobile targetHandle=<handle>` (visitor mode).
  - Your own handle (`/profile/franky` as franky) does `window.location.replace("/profile")` (ProfileHandleSwitch.tsx:110-118). So visiting yourself never shows visitor mode.
  - The phone holds a blank `MobileShell` until the "who am I" lookup answers (line 124). That is a short empty frame before the profile paints: the recorder should wait for the name before marking the cut.
- The whole screen is ONE file: `src/components/mobile/ProfileMobile.tsx` (6834 lines). Main component at line 407, render from line 1523.
- Phone vs desktop is decided by viewport (`useIsMobile`, breakpoint 900px). At 390 wide we always get ProfileMobile.

## 1. Own profile, top to bottom (RAN at 390x844 Night as franky; stills 01-own-*.png)

Data comes from three GETs (RAN, all 200): `/api/me/profile-bootstrap`, `/api/me/posts`, `/api/me/bookmarks`, plus `/api/users/franky/reposts`.
Opening /profile makes NO write request (RAN: zero non-GET requests).

| # | Piece | What Franky shows today | Code (ProfileMobile.tsx) | Feeds from |
|---|-------|------------------------|--------------------------|------------|
| 1 | Cover, 200px tall, full bleed | default "peach-sky" gradient (peach -> lilac -> light blue). No picture. | 1527-1534 | `users.banner_url` (picture) else `users.banner_gradient` (a KEY, one of 8) else default |
| 2 | Three round buttons top right | Search (magnifier), Edit profile (pencil), Settings (gear, a link to /settings) | 1609-1725 | none |
| 3 | Avatar, 88x88 rounded square (radius 22), overlaps the cover | initials "FC" on a flat peach tile `#FFD3C2` | 1734-1806 | `users.avatar_url` |
| 4 | Stats row | "10 FOLLOWERS", "10 CONNECTIONS" (connections in coral) | 1812-1823, StatTile 6424 | counted from `follows` (see section 1b) |
| 5 | Name (Fraunces 26px) + school badge pill | "Franky Cazares" + cap icon "IU Bloomington" | 1858-1871, VerifiedBadge 6469 | `users.name`; badge needs `school_email_verified` and the campus label |
| 6 | Handle | "@franky" | 1877-1888 | `users.handle` |
| 7 | Tagline, italic in curly quotes | "vibin" | 1912-1925 | `users.tagline` (falls back to first line of bio, see 1b) |
| 8 | Meta chips | book "Marketing · Year 3", pin "IU Bloomington" | 2129-2141, MetaChip 6490 | headline built from `users.major` + `users.year`; location from `users.location_text` else campus |
| 9 | "Here for" row (owner only) | NOT shown for Franky (empty) | 2146-2153, HereForRow 6570 | `users.looking_for` |
| 10 | Vibe tags + skills chips (max 8) | NOT shown for Franky (none) | 2161-2176 | `users.interests` (vibe tags) + `users.skills` |
| 11 | Bio card, title "Bio" | "vibin" | 2255-2261, Section 6754 | `users.bio`; hidden if `profile_layout.hidden` has "bio" |
| 12 | Tab strip: POSTS / PORTFOLIO (icons + caps, underline on active) | Posts active | ProfileTabs 2647 | none |
| 13 | Sub tabs (pills): Posts / Reposts / Saved | Posts active (cream pill) | PostsSubTabs 2995 | none |
| 14 | Post list: ONE COLUMN of cards (text, then a square 1:1 picture, then "1d ago"), each with a "..." at top right | 4 cards, all with pictures | PostsGrid 2720, PostFeedCard 2789 | `posts` rows of the user, `media_thumbnail_url` or `media_url` |
| 15 | Coral "+" round button, bottom right, fixed | present | 2589-2627 | none |
| 16 | Tab bar | Campus, Network, otto, Messages, Profile (Profile lit) | MobileTabBar.tsx | none |

It is NOT a three-across grid. The component is named PostsGrid but renders a single column of cards (2763-2786).
Each picture is cropped to a square with `background: center/cover` (2875), so tall phone photos lose top and bottom.

### 1b. Which columns feed each piece (READ, then matched against what the screen showed)

The phone never reads the `users` row directly. `/api/me/profile-bootstrap` (src/app/api/me/profile-bootstrap/route.ts:24-25 lists the columns) reads the row with the service role and passes it through `buildVibeUserV1FromProfile` (src/lib/profile/build-vibe-user-v1.ts:56). Mapping:

- `users.name` -> name. `users.handle` -> @handle.
- `users.tagline` -> the italic quoted line. EMPTY tagline falls back to the FIRST LINE OF `users.bio` (build-vibe-user-v1.ts:20-26, 65). That is why every cast member shows their bio twice: once in quotes, once in the Bio card. Franky: "vibin" twice.
- `users.major` + `users.year` -> the book chip "Marketing · Year 3" (headlineFromProfileParts, lines 41-52). With NO major and NO year the chip falls back to the campus label, so James and Rylan (seeded `real: true`, no major/year) show "IU Bloomington" THREE times: badge, book chip, pin chip (RAN, still 02-visit-rylanconaway-top.png).
- `users.location_text` -> the pin chip; empty falls back to the campus label (line 75).
- `users.school_verified` + `users.school_system` + `users.campus_id` -> the badge pill text ("IU Bloomington").
- `users.avatar_url` -> avatar (`avatarPhoto`). `users.banner_url` -> cover picture (`coverPhoto`); if empty, `users.banner_gradient` -> cover theme key (`coverGradient`); a picture always wins over a theme (lines 110-116).
- `users.interests` -> vibe tag chips. `users.skills` -> more chips in the same row (first 6 of each, 8 shown) and the Skills block in Portfolio.
- `users.looking_for` -> the "Here for" row (owner only; blanked for visitors).
- `users.bio` -> Bio card.
- `users.work_experience`, `users.current_on`, `users.resume_docs` / `users.resume_url`, `users.resume_redactions` -> the Portfolio tab.
- `users.profile_layout` -> which Portfolio blocks show and in what order; can also hide the Bio.
- `users.pinned_post_id` -> sent as `pinnedPostId` but ProfileMobile.tsx never reads it (grep: no use). A pinned post does NOT show on the phone profile.
- Counts: `getCountsFor` (src/lib/connections/queries.ts:47) counts rows in table `connections` (`follower_id`, `following_id`). Followers = rows where `following_id` = the user. Connections = people who follow each other both ways. "Following" is computed but the phone does not draw it.
- Posts list: `/api/me/posts` (own) or `/api/users/<handle>/posts` (visitor) -> `posts.content`, `posts.media_url` / `media_thumbnail_url`, `posts.created_at`, `posts.edited_at`.
- Reposts: `/api/users/<handle>/reposts`. Saved: `/api/me/bookmarks` (owner only; visitors get no Saved pill).

## 2. Visiting a profile (RAN for rylanconaway, jamesandres, hanasato, mayaokafor; stills 02-visit-*.png)

Route: `/profile/<handle>`. Handles in the seed are NOT the first names: `rylanconaway`, `jamesandres`, `hanasato`, `mayaokafor`, `theolindqvist`, `priyaraman`, `jonahreyes`, `amaradiallo`, `lucasferreira`, `devonbrooks`, `noorhaddad`, `elicarter`; only Franky is plain `franky` (scripts/demo-seed.mjs:253-289).

What differs from the own profile (RAN):
- Top right: TWO round buttons, Search and "..." (aria-label "More options for <Name>", opens Report / Mute / Block). No pencil, no gear.
- No "Here for" row. No Saved pill (only Posts / Reposts). No "..." on the post cards. No coral "+" button.
- Under the chips: a pill "N you both follow" (only when N > 0; opens MutualsSheet) and then ONE full-width button.
- The button is `FollowButton` (ProfileMobile.tsx:5579). Its words: "Connect" (you do not follow them), "Follow back" (they follow you; coral), "Following ✓", "Connected ✓" (both ways). There is NO button that says "Follow" and NO "Message" button anywhere on the phone profile (READ the whole render, lines 2199-2225, and RAN: no such control in the DOM).
- For Franky today EVERY cast profile I opened says "Connected ✓" (outlined, quiet), because the seed makes the cast follow each other both ways. A filled "Connect" button would need one cast member Franky does not follow.
- The tab bar keeps "Profile" lit on someone else's profile (mobile-tab-active.ts: `/profile/<handle>` is under `/profile`).

Getting there (READ for the code; the taps are RAN in section 7):
- Feed card: the author's NAME and AVATAR are both `<a href="/profile/<handle>">` (CampusMobile.tsx `AuthorLink`, 1447-1477; used at 1659 and 1699). The avatar link is `aria-hidden` and `tabIndex=-1`, so `getByRole("link")` only finds the NAME. The card itself is a button that opens the post viewer, so a tap must land on the name or the avatar, not beside it.
- Post viewer (full screen): the author row is a link to the profile (PostViewerMobile.tsx:608-609).
- DM: the header NAME is a link `a[href="/profile/<handle>"]` (messages/ConversationView.tsx:663-665); the avatar next to it is NOT a link. Also a row in the conversation's action sheet (ConversationActionSheet.tsx:271).
- Followers: the two numbers on a profile are plain text, NOT tappable (StatTile, ProfileMobile.tsx:6424). Lists of followers live on the Network tab (NetworkMobile.tsx: tabs Connections / Following / Followers), where the avatar and the name are links (1094-1127).
- Search (the magnifier, on Campus and on any profile): a person row does `router.push("/profile/<handle>")` (CampusMobile.tsx:4264).

Getting back: the profile has NO back arrow and no close button (READ: nothing in the cover but the round buttons; RAN: no such control). The ways back are the browser's back (`page.goBack()`), or a tab in the tab bar (Campus, Messages...). Tapping the lit Profile tab goes to Franky's OWN profile, which is a natural cut: visit someone, tap Profile, land on yours.

Side effect of a visit (RAN): each first load of a visitor profile sends `POST /api/profile-views` (ProfileMobile.tsx:587-605), which writes a row to the profile-view ledger. My walk made a handful of these on the local database as franky. See section 8 for cleanup.

## 3. Customisation: what a student can change on the phone

Entry: the pencil in the cover, `aria-label="Edit profile"` (ProfileMobile.tsx:1690-1711). It only flips local state (`enterEdit`, 804-808): NO request is sent (RAN: zero non-GET requests from tapping the pencil, opening Layout, and Cancel). `/profile?edit=1` opens straight into edit mode (520-522).

In edit mode the three round buttons become three pills: "Layout", "Cancel", coral "Save" (RAN, still 04-edit-top.png). What can be changed, and where it is written (all through `POST /api/me/profile-sync`, service role, own row only):

| Thing | Control in edit mode | Writes | On the phone? |
|---|---|---|---|
| Cover PHOTO | pill "Change cover" (`aria-label="Change cover photo"`) -> system file picker -> crop screen (3:1, "Crop cover photo") -> upload | file to bucket `profiles` at `<uid>/banner-<uuid>.jpg` (POST /api/me/profile-upload, kind=banner), then `users.banner_url` | yes |
| Cover THEME (8 gradients: peach-sky, sky-peach, mint-lilac, sunrise, ember-night, deep-sea, orchid, pine) | NONE on the phone. The picker exists only on the desktop page (public/html/profile.html). ProfileMobile only PAINTS the stored key (line 1438). | `users.banner_gradient` (a key; CHECK constraint `users_banner_gradient_preset_check`) | NO (desktop only) |
| Profile photo | coral camera dot on the avatar (`aria-label="Change profile photo"`) -> file picker -> crop 1:1 -> upload | `<uid>/avatar-<uuid>.jpg`, then `users.avatar_url` | yes |
| Name, tagline, "where you're based", major, year, campus | inline inputs / selects | `users.name`, `tagline`, `location_text`, `major`, `year`, `campus_id` | yes |
| "Here for" (4 chips: Meeting people / Showing work / Finding clubs / Just exploring) | dashed chips, tap to toggle | `users.looking_for` | yes (owner sees it only) |
| Vibe tags | chip input "Add vibe tags…" | `users.interests` | yes |
| Bio | textarea | `users.bio` | yes |
| Layout: order of sections and hide/show | pill "Layout" -> sheet "Arrange your profile." with up / down / eye per row (Bio, Experience, Skills, Posts, Resume, Working on), own Save | `users.profile_layout` (jsonb `{v, order, hidden, bioSide}`) | yes |
| Portfolio: Working on, Experience (+ logos), Resume files (up to 3) | "Edit" pills inside the Portfolio tab while in edit mode | `users.current_on`, `work_experience`, `work_order_manual`, `resume_docs`, `resume_url` | yes |
| Skills | not editable on the phone (comment at PortfolioPane, line ~3410: "Edited on the desktop profile today") | `users.skills` | NO |
| Pinned post | nothing on the phone reads or sets it | `users.pinned_post_id` | NO |
| App look: Auto / Light / Night | Settings (gear) -> card "How Vibe looks" | `localStorage.vibe_theme` + the account (`otto_settings.theme`) | yes, but it is the whole app's look, not the profile's |

There is no per-profile colour or font choice anywhere. "Make your profile your own" on a phone today means: cover photo, profile photo, the words and chips, and the Layout sheet.

### What could be SHOWN in about three seconds

1. BEST, no risk: tap the pencil. The cover grows "Change cover" + the tip pill, the avatar grows a coral camera dot, the name gets a coral underline, Layout / Cancel / Save appear. Then tap Cancel. Writes nothing. (RAN.) Keep the camera on the TOP 600px: lower down the edit form shows a greyed campus box reading "Bloomington — not open yet" and a red line "You can change your campus again on November 16." (still 04-edit-top.png).
2. Good, no risk if you Cancel: pencil -> "Layout" -> the "Arrange your profile." sheet slides in from the right (RAN, still 04-edit-layout-sheet.png). Tapping an up/down arrow reorders rows live inside the sheet without saving. Close with the sheet's own "Cancel". TRAPS: the sheet's top bar is LIGHT in Night (cream bar, white Cancel pill, dark title); and with an empty portfolio four of six rows say "Nothing yet · visitors skip it".
3. A real cover change in the app: NOT on the local stack as it stands. READ, not run: `/api/me/profile-sync` refuses any avatar/cover URL that is not `https:` on the Supabase host (`isSupabaseHttpsUrl`, src/lib/org-asset-url.ts:47-57, called at profile-sync/route.ts:497-505 and 657-668). The local stack's URL is `http://127.0.0.1:54321`, so the upload step would work and the save step would answer 400 "Invalid banner" / "Invalid avatar_url", shown as a red box on the profile. Also the file picker is a system dialog (Playwright can feed it with `setInputFiles` on the hidden `input[type=file]`, the picker itself never shows on a recording) and the crop screen is an extra step. Not a three-second shot.
4. A cover or photo "before/after" WITHOUT the app: film the profile, change `users.banner_url` / `banner_gradient` / `avatar_url` in the database between two clips (section 4), film again, and cut. That is honest only as "this is what your profile can look like", not as "watch me tap".

### Undo after a take

- Pencil then Cancel, or Layout then Cancel: nothing to undo.
- If a take ever taps Save in edit mode with a changed field: the old values are in the seed (scripts/demo-seed.mjs:253-289). Re-running the seed puts name/major/year/bio back; it does NOT clear `tagline`, `interests`, `looking_for`, `location_text`, `profile_layout` (the seed never writes them), so reset by hand:
  `update public.users set tagline='', interests='{}', looking_for='{}', location_text='', profile_layout='{}'::jsonb where handle='franky';` (run in `docker exec -i supabase_db_vibe psql -U postgres -d postgres`; check each column's empty value first, I did not run this).
- Layout saved by mistake: `update public.users set profile_layout='{}'::jsonb where handle='franky';` (all three rows I looked at hold `{}` today, RAN).

## 4. Avatars and banners: where they live and how the seed can set them locally

Where the picture lives (READ, and RAN against the local database):
- Column `public.users.avatar_url` (text, nullable) and `public.users.banner_url` (text, nullable) hold a FULL public URL. `public.users.banner_gradient` (text, default '') holds a theme KEY; a banner photo wins over a theme.
- The file is in the PUBLIC storage bucket `profiles` (RAN: `public = true`, 8 MB limit, jpeg/png/webp/gif/pdf). The app writes `<user id>/avatar-<uuid>.<ext>` and `<user id>/banner-<uuid>.<ext>` at the ROOT of the user's folder (profile-upload/route.ts:48-55, 207). Post photos sit one level down in `<user id>/posts/`.
- Today no cast member has either: all 13 rows have `avatar_url` NULL, `banner_url` NULL, `banner_gradient` '' (RAN). Neither `scripts/demo-seed.mjs` nor `scripts/local-seed.mjs` writes these columns (grep: no match).

What stands in the way (this is where avatars DIFFER from post photos):
- Post photos: the trigger `posts_check_media_refs` refuses a local URL, hence the seed's `setLocalMediaUrl` trick (scripts/demo-seed.mjs:644-697).
- Avatars / banners: there is NO trigger on those columns. RAN: the only trigger on `public.users` is `users_campus_in_system` (campus_id, school_system). The only checks are `users_banner_gradient_preset_check` (the 8 keys or ''), the handle format and the school system. The lock is a GRANT: `authenticated` cannot UPDATE `avatar_url`, `banner_url` or `banner_gradient` (RAN: false, false, false), the service role can (RAN: true). Migration `supabase/migrations/20260912102000_users_media_url_host_lock.sql`.
- The https / own-host / own-file rules live only in the ROUTE (`/api/me/profile-sync`, lines 484-509 and 655-672), not in the database. The seed's `admin` client (service role) does not go through that route.
- Nothing filters the URL at read or render time: the feed, DM header, Network rows and the profile all paint `background: url(<avatar_url>)` as stored (CampusMobile.tsx:1671, ConversationView.tsx:648, NetworkMobile.tsx:1101, ProfileMobile.tsx:1533 and 1740). No CSP or image-host list in next.config.ts or src/proxy.ts (grep: none). Post photos on `http://127.0.0.1:54321/...` already load in this browser (RAN, the stills show them), so the same host will load for avatars.

So the seed needs NO replica-role trick for avatars and banners. Recipe (READ and reasoned; I did not write anything, so this is NOT run):

```js
// inside scripts/demo-seed.mjs, next to ensurePostPhoto; PHOTOS_DIR, admin, API_URL, must() already exist
async function ensureProfilePhoto(userId, kind /* "avatar" | "banner" */, file) {
  const src = join(PHOTOS_DIR, file);
  if (!existsSync(src)) { photoNotes.push(`${file}: not in ${PHOTOS_DIR}; no ${kind}`); return; }
  const bytes = readFileSync(src);
  const name = `${kind}-demo.jpg`;            // must match /^(avatar|banner)-[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,5}$/
  must(await admin.storage.from("profiles").upload(`${userId}/${name}`, bytes, { contentType: "image/jpeg", upsert: true }), `upload ${name}`);
  const url = `${API_URL}/storage/v1/object/public/profiles/${userId}/${name}`;
  must(await admin.from("users").update({ [kind === "avatar" ? "avatar_url" : "banner_url"]: url }).eq("id", userId), `set ${kind}`);
}
// a cover THEME instead of a photo (no file needed):
// await admin.from("users").update({ banner_gradient: "ember-night" }).eq("id", userId);
```

Notes for whoever builds it:
- File name: keep the `avatar-…` / `banner-…` shape at the folder root so the app's own "is this the student's own photo" parser (src/lib/media/profile-image-key.ts:62, ROOT_IMAGE_RE) recognises it. No `%`, spaces or query string.
- The upload goes in as-is (the seed bypasses the route's re-encode and resize). Crop BEFORE uploading: the avatar is drawn 88x88 CSS px (176 real px at 2x) as `center/cover` in a rounded SQUARE; in the feed and DMs it is a 36px circle. The cover box on the phone is 390x200 CSS px (about 2:1), `center/cover`; the app's own crop is 3:1 with the middle 2:1 kept on phones. So prepare a square for the avatar and roughly a 1560x800 (or wider, subject centred) image for the cover. `sips` or ffmpeg can crop into the scratchpad; never write the result into the repo.
- Upsert with the same name keeps a re-run idempotent, but browsers cache by URL: after swapping the file under the same name, reload hard or change the name (`avatar-demo2.jpg`).
- Undo: `update public.users set avatar_url = null, banner_url = null, banner_gradient = '' where handle = '<handle>';` and delete the two objects from the bucket (admin.storage.from("profiles").remove([...])).
- Cover themes that suit Night (dark gradients): `ember-night` (black -> purple -> coral, the closest to the brand's "near-black + coral bloom"), `deep-sea`, `orchid`, `pine`. The default `peach-sky` is a pale pastel and is what EVERY profile shows today.
- TRAP: the top-right round buttons are translucent dark discs (`floatingActionStyle`); they read fine on the pastel default (RAN). On a dark cover they have not been looked at: check a still before filming.

Franky's ten pictures (RAN: `sips` sizes; they stay in ~/vibe-demo-photos/web, never the repo):
campus-fog 1200x1600, campus-night 1200x1600, dunes 1600x1067, field-night 1406x1600, gorilla 1290x828, kitchen 1290x842, kitten 1200x1600, lawn-event 720x1280, sae-letters 1279x1600, turtle 1600x1598.
- Cover candidates (need a wide crop): `dunes` (1600x1067, landscape, the only one that survives a 2:1 crop at full width: 1600x800) and `turtle` (1600x1598; a 1600x800 band across the turtle works). `gorilla` and `kitchen` are landscape but show people and are on the "held" list in demo-cast.md.
- Avatar candidates: none of the ten is a portrait of Franky meant as a profile picture. `turtle` (square already) or a tight square from `dunes` would work as a non-face avatar. Which pictures are cleared for use is Franky's call (demo-cast.md lists the held ones); I did not open the JPEGs.
- Already used as post photos: sae-letters, turtle, field-night, dunes (Franky), kitchen, lawn-event, gorilla (Rylan), kitten (James), campus-night (Hana), campus-fog (Maya). Reusing a post photo as the same person's cover would show it twice on their profile.
- Leftover files: Franky's folder still holds `posts/demo-gorilla.jpg`, `demo-kitchen.jpg`, `demo-kitten.jpg` from an earlier run; no post points at them (RAN). Harmless and off camera.

## 5. Which cast profile to visit on camera

What each one shows to Franky today (RAN: the visitor walk + the local database). None has an avatar, a cover, tags, skills, or anything in Portfolio.

| Profile | Followers / Connections | "you both follow" | Book chip | Tagline + Bio | Posts (with picture) | Button | Where in Franky's feed (page y, CSS px, top = 0) |
|---|---|---|---|---|---|---|---|
| Rylan Conaway `/profile/rylanconaway` | 2 / 2 | 1 (James) | "IU Bloomington" (no major/year) | "Vibe team." twice | 3 (3): kitchen "Family dinner at the house.", lawn event "Tabling outside the Campus Center…", gorilla "Found a quiet spot to think." | Connected ✓ | 2983 (11th card), also 3807 and 4314 |
| James Andres `/profile/jamesandres` | 2 / 2 | 1 | "IU Bloomington" (no major/year) | "Vibe team." twice | 2 (1): text "Good chapter meeting tonight…", kitten "New roommate." | Connected ✓ | 3639 and 5287 |
| Hana Sato `/profile/hanasato` | 2 / 2 | 2 | "Computer Graphics · Year 4" | "Computer graphics senior. Always has a camera." twice | 1 (1): campus at night | Connected ✓ | 747 (4th card) |
| Maya Okafor `/profile/mayaokafor` | 8 / 8 | 9 | "Media Arts · Year 2" | "Media arts. New here this semester, still finding the good coffee." twice | 1 (1): foggy campus | Connected ✓ | 1253 (5th card) |
| Priya Raman `/profile/priyaraman` | 3 / (not read) | (not read) | "Informatics · Year 4" | bio twice | 1 (0): her Chess Club "Blitz Night" post, text only. READ: a signed-in visitor's list includes the person's club posts (api/users/[handle]/posts/route.ts:125-133); the still 03-from-feed-profile.png is hers, top of page only | Connected ✓ | 200 (1st card) |

Franky himself (own profile): 10 / 10, 4 picture cards (the SAE club post shows on his own list too), no avatar, default cover, "vibin" twice.

Recommendation: RYLAN. He is the only one whose profile has more than one picture, so a short glide down his page shows three square photos in a row; nobody else has anything below the first card. What Rylan lacks, in order of how much it shows:
1. No avatar: a flat peach "RC" tile.
2. Default pastel cover, the same one as Franky's, so the two profiles look alike in a cut.
3. "IU Bloomington" three times in one screen (badge, book chip, pin chip) because he has no major/year. One `major` + `year` fixes the middle one.
4. "Vibe team." twice (tagline falls back to the bio). A separate `tagline` fixes it.
5. Followers 2 / Connections 2: small next to Franky's 10 / 10.
6. Portfolio tab: "Nothing here yet / Rylan Conaway hasn't added projects, experience, skills, or a resume yet." Stay on Posts.
7. The button is a quiet outlined "Connected ✓"; there is no filled call to action to look at.
8. He is 11th in the feed (about 2700px of scrolling). Reach him by Search from Franky's profile ("rylan" -> one result, RAN) or from his DM row in Messages, not by scrolling the feed.

If the path must start from a feed card near the top: HANA (4th card, picture post, proper chips) is the cleanest header, but her page ends after one post. Maya has the best numbers (8 / 8, "9 you both follow") and one picture.

What each candidate would show AFTER a seed pass (my suggestion, nothing written): avatar + cover for Franky and the visited person; `tagline` different from `bio`; for Rylan and James a `major` and `year` (they are seeded `real: true`, which skips both, demo-seed.mjs:286-289 and 358: ask Franky what to put); 3 to 5 `interests` so the chip row appears; and optionally two `work_experience` rows + two `current_on` rows + `skills` so Portfolio is not empty (shapes: work_experience `[{title, company, dates, location, description, logo_url}]`, src/lib/profile/work-experience.ts:1-8; current_on `[{icon, text, logoUrl}]`, src/lib/profile/current-on.ts:45). All are plain service-role updates on `public.users`; `skills`, `interests`, `work_experience`, `looking_for` are also closed to `authenticated` but open to the service role.

Note on the pictures: `handoffs/s72-prep/demo-cast.md` line 5 still lists dunes, the field, the kitten, the gorilla and the kitchen as "held", while the seed now uses all ten (demo-seed.mjs:596-639). Rylan's profile is two held pictures out of three. Someone should confirm that note is out of date before Rylan's page goes in a public video.

## 6. What looks wrong or unfinished on camera (RAN unless marked)

Profile header (own and visited):
- Every avatar is a flat peach tile with initials (`#FFD3C2`, dark letters); every cover is the same pale pastel gradient. Two profiles in a row look like the same page with different words.
- The school badge is a LIGHT pink pill in Night (hard-coded `linear-gradient(135deg,#FFF0F0,#FFE5DB)`, ProfileMobile.tsx:6469-6487). It reads as intended branding, but it is the brightest thing under the cover.
- The tagline repeats the bio word for word on all 13 cast profiles (fallback, section 1b).
- James and Rylan: "IU Bloomington" three times in one screen.
- Franky: no "Here for" row, no tag chips.
- The tab bar is see-through: card text and pictures show faintly behind "Campus / Network / otto / Messages / Profile" while scrolling (stills 02-visit-rylanconaway-top.png, 04-edit-top.png). Rest a scroll so no text line sits behind the bar.

Empty states:
- Portfolio tab, own: dashed box "Nothing here yet / Show what you're working on, where you've worked, or add a resume." + a coral "Edit profile →" (still 04-own-portfolio.png). Visitor: "Nothing here yet / <Name> hasn't added projects, experience, skills, or a resume yet." EVERY cast profile has this.
- Reposts: "No reposts yet / Tap the repost button on a post to add it here." Saved: "Nothing saved yet / Tap the bookmark on any post to keep it here. Only you see this list." (stills 04-own-sub-*.png). The database has 0 reposts and 0 bookmarks.

Zeros:
- Opening a post from a profile (PostViewerMobile): heart 0, comments 0, views 0, "COMMENTS / Be the first to comment." (still 04-own-post-viewer.png). The database has 0 likes, 0 reposts and 3 comments in total, none on a cast post.
- Feed cards show "0 0 0" under every post (stills 05-feed-at-target.png).

Light elements in Night:
- Post viewer: the top bar (close, author) and the bottom "Add a comment…" bar are cream/white.
- "Arrange your profile." sheet: cream top bar, white Cancel pill, dark title (still 04-edit-layout-sheet.png). READ: hard-coded `rgba(255,255,255,0.7)` / `#1C1C1E` in PortfolioEditorShell (ProfileMobile.tsx:4974-4990).
- "You both follow" sheet: a cream sheet with a dark row inside, and the row's second line is CLIPPED: "@jamesandres · 1 you bot…" (still 05-mutuals-sheet.png).
- DM composer: the photo button is a light grey disc (still 06-dm-after-back.png).

Test data and odd words:
- Edit mode, below the fold: a greyed campus box "Bloomington — not open yet", "IU Bloomington", and a RED line "You can change your campus again on November 16." (still 04-edit-top.png).
- Settings (the gear): shows `franky@example.test`, `franky.demo@iu.edu`, "Bloomington — not open yet", "Locked for 14 more days. You changed your handle on Oct 2." Do not film Settings.
- Campus header (not a profile, but in every shot that passes through the feed): subtitle clipped, "13 at IU Bloomington · 1 acti…".
- SAE Lounge (club chat) opens with three lines from "Avery Owner @avery_owner", a local-seed test account (still 05-dm-james.png, which is the SAE room, see the trap in section 7).
- Network tab, Discover (the default view): ALL test accounts. "From your clubs: Avery Owner @avery_owner", then "Elsewhere at IU: Vibe Review Friend @vibe_review_pal, Vibe Review @vibe_review, Emery Admin @emery_admin, Blake Student @blake_iu" (still 03-network.png). Do not film the Network tab's first screen. Its Followers / Connections / Following lists hold only the cast (still 03-network-followers.png).

Timing:
- The first hit of a route on the dev server compiles it: `/profile/rylanconaway` took 3.5 s to paint the name the first time, 0.4 to 1.3 s after. Visit every route once (off camera) before recording.
- A visited profile paints nothing but the tab bar until its "who am I" check answers (section 0), then a grey skeleton, then the page.

## 7. For the recorder: selectors (each one RAN on the local server unless marked READ)

Tab bar (MobileTabBar.tsx:136-156):
- Profile tab: `page.locator('nav[aria-label="Primary"] a[href="/profile"]')`. From a visited profile it lands on Franky's own `/profile`.
- Campus tab: `nav[aria-label="Primary"] a[href="/campus"]`. Messages: `a[href="/messages"]` inside the same nav.

Feed card author (CampusMobile.tsx AuthorLink):
- Name: `page.locator('a[href="/profile/<handle>"]:not([aria-hidden])')`, then `onScreen(page, …)` from lib.mjs.
- Avatar: `a[href="/profile/<handle>"][aria-hidden="true"]`; a tap on it works too (RAN at an uncovered spot).
- TRAP: `onScreen()` only checks 0 <= y < 844. On /campus the top 122 CSS px are under the red header + the Feed/Events/Orgs/Map pills, and everything below 784 is under the tab bar (RAN: measured clear band y 122 to 784 at x=195). A link at y=78 counted as "on screen", the tap hit the pill row, and nothing navigated. Pick a link whose box is inside 130..760, or scroll so it is.
- TRAP: `tap()` calls `scrollIntoViewIfNeeded`, which can leave the link under the header for the same reason. Glide to it first.
- Page y of each author's first name link with the feed at the top: priyaraman 200, theolindqvist 389, amaradiallo 578, hanasato 747, mayaokafor 1253, jonahreyes 1760, lucasferreira 1929, devonbrooks 2118, franky 2287, noorhaddad 2814, rylanconaway 2983, elicarter 3470, jamesandres 3639.
- A feed card for Franky's own post links to `/profile/franky`, which bounces to `/profile` (a blank frame on the way).

Visited profile:
- Loaded when: `page.locator("h1", { hasText: "<Name>" }).waitFor()` (the name is the only h1).
- The connect button: `page.getByRole("button", { name: /^(Connect|Follow back|Following ✓|Connected ✓)$/ })` (count 1; for Rylan the text is "Connected ✓", box x16 y500 w358 h45). DO NOT tap it in a take without cleanup: a tap on "Connected ✓" UNFOLLOWS (DELETE /api/me/follow) with no confirm (READ: toggleFollow, ProfileMobile.tsx:745-778).
- "…" menu: `page.getByRole("button", { name: /^More options for / })`.
- Mutual pill: `page.locator("button", { hasText: "you both follow" })` (opens a light sheet, see section 6).
- Top tabs: `page.getByRole("button", { name: "Posts", exact: true })` and `{ name: "Portfolio", exact: true }` (they are buttons with `aria-pressed`). The pane also swipes sideways.
- Sub tabs: `page.getByRole("tab", { name: "Posts" | "Reposts" | "Saved", exact: true })` (role=tab inside role=tablist; Saved only on your own profile).
- A post card: `page.locator("button", { hasText: "<first words of the post>" })`; it opens the full-screen viewer; close with `page.getByRole("button", { name: "Close", exact: true })`.
- Scroll: `glide(page, 520, 1200)` moved Rylan's page so the first picture card fills the screen (still 05-visit-scrolled.png). The page scrolls the document, not an inner box.

Own profile:
- Round buttons: `getByRole("button", { name: "Search", exact: true })`, `getByRole("button", { name: "Edit profile", exact: true })`, `getByRole("link", { name: "Settings", exact: true })`.
- In edit mode: `getByRole("button", { name: "Layout: arrange your profile", exact: true })`, `{ name: "Cancel", exact: true }`, `{ name: "Save profile", exact: true }` (its visible word is "Save"), `{ name: "Change cover photo" }` (visible "Change cover"), `{ name: "Change profile photo" }`.
- Layout sheet: `page.locator('[role=dialog]')`; close with `.getByRole("button", { name: "Cancel", exact: true })` inside it (there are two "Cancel" buttons on screen while it is open). Row buttons: `aria-label="Hide Bio"` / `"Show Bio"` etc. (READ, ProfileMobile.tsx ~4853).
- Own post "…": `getByRole("button", { name: "Post actions", exact: true })` (one per card).
- New post: `getByRole("button", { name: "New post", exact: true })`.

Getting to a profile without the feed:
- Search: tap Search, then `page.locator('input[type="search"]')` (placeholder "Search people, orgs, clubs"), type `rylan`, then `page.locator("button", { hasText: "Rylan Conaway" })` (one result under "PEOPLE", dark and clean, stills 07-search-*.png). Name painted 1.2 s after the tap.
- DM: on /messages each person row is a button with `aria-label="<Name>, <when>"`: use `page.locator('button[aria-label^="James Andres,"]')`. In the open DM the header name is `page.locator('a[href="/profile/jamesandres"]')` (box x106 y8 w222 h24); the avatar beside it is not a link.
- TRAP in scripts/demo-video/record.mjs line 81: `page.locator("button", { hasText: "James Andres" }).first()` matches the SAE CLUB row first whenever SAE is above James in the list, because the SAE row's preview reads "James Andres: I'm in." (RAN: it opened the SAE Lounge). It works in the current take only because sending James a message lifts his row to the top.

Back:
- No back control on a profile. `page.goBack()` works: from a profile reached by the feed it returns to /campus; from a DM it returns to `/messages?channel=<id>` with the DM open again.
- TRAP: after `goBack()` the feed is NOT where you left it. I left it scrolled 2683 px (Rylan's card) and came back at 520 px, the offset the PROFILE had been scrolled to (stills 05-feed-at-target.png vs 05-feed-after-back.png). Cut away instead of filming the return, or re-glide.
- Cleaner exits: tap the Profile tab (to Franky's own page) or the Campus tab.

## 8. What my walk changed on the local database, and how to put it back

I did not follow, edit, save, post or message. The app itself writes on plain visits, and those happened:
- `profile_views`: one row per profile per day for the viewer. Franky now has rows for rylanconaway, jamesandres, hanasato, mayaokafor, priyaraman dated today (RAN: 5 rows where `viewer_user_id` = Franky; I cannot say how many predate my walk). Nothing on Franky's screens shows them. Remove with: `delete from public.profile_views where viewer_user_id = (select id from public.users where handle = 'franky');`
- `POST /api/posts/<id>/view` fired twice when I opened Franky's own turtle post in the viewer (RAN: read after that open, the post still has 0 rows in `post_views` and `view_count` 0, so an author's own view is not counted).
- `POST /api/me/threads/<id>/read` fired for the SAE Lounge (by the mis-targeted tap above) and for the James DM. The main session's earlier still (explore/41-messages-v2.png) already showed both rows without an unread mark, so I expect no visible change, but I did not compare unread state before and after.
- `POST /api/me/heartbeat` on every page (presence).
A recorder take that visits a profile will write the same `profile_views` row; add the delete above to record.mjs's cleanup if the ledger should stay empty.

## 9. Stills saved (all in notes/profiles/, 390x844 at 2x unless "full")

Own profile: 01-own-top.png, 01-own-full.png (full page), 01-own-scroll1.png, 01-own-scroll2.png, 01-own-scroll3.png; data: 01-own-dom.json, 01-own-text.txt, 01-own-api.txt.
Visits by URL: 02-visit-<handle>-top.png, -full.png, -reposts.png, -portfolio.png for rylanconaway, jamesandres, hanasato, mayaokafor; data: 02-visit-report.json, 02-visit-api.txt.
Paths in: 03-feed-before-tap.png, 03-from-feed-profile.png (Priya), 03-feed-after-back.png, 03-network.png, 03-network-followers.png; 03-paths-log.txt.
Own tabs and edit: 04-own-sub-reposts.png, 04-own-sub-saved.png, 04-own-sub-posts.png, 04-own-portfolio.png, 04-own-post-viewer.png, 04-own-post-actions.png, 04-edit-top.png, 04-edit-full.png (full page), 04-edit-layout-sheet.png, 04-after-cancel.png, 04-settings-full.png (full page); 04-own-log.txt.
Selectors run: 05-feed-at-target.png, 05-visit-from-feed.png (Rylan), 05-mutuals-sheet.png, 05-visit-scrolled.png, 05-feed-after-back.png, 05-dm-james.png (really the SAE Lounge), 05-selectors-log.txt (the run stopped at the DM step, see the trap).
DM path: 06-messages-home.png, 06-dm-james.png, 06-visit-from-dm.png, 06-dm-after-back.png.
Search path: 07-search-open.png, 07-search-rylan.png, 07-visit-from-search.png.
Walk scripts (scratchpad/video/): pw1.mjs, pw2.mjs, pw3.mjs, pw3b.mjs, pw4.mjs, pw5.mjs, pw6.mjs, pw7.mjs.

## 10. Not determined

- Whether an in-app cover or photo upload really fails on the local stack: READ only (the https check). Trying it is a write, so I did not.
- The seed recipe for avatars and covers (section 4) is not run. The database facts under it are (no trigger, grants, bucket).
- How the round buttons and the name area look over a DARK cover theme or a photo cover: no profile has one.
- How a profile looks with tags, "Here for", skills, experience, working-on or a resume: no cast row has any, so I have no still of a filled Portfolio.
- Which pictures are cleared for a public video (the "held" note in demo-cast.md vs the seed).
- The desktop profile (public/html/profile.html), the cover-theme picker there, and the pinned post: out of scope (phone only), READ in passing.
- Whether the SAE Lounge or the James DM had an unread mark before my walk opened them (section 8).
