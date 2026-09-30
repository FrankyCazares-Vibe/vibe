### PM · phone profile: campus and major pickers follow your university (B16m), Edit post on your own cards (E5)

**Owns:** `src/components/mobile/ProfileMobile.tsx`
**Depends on:**
- E0: `type EditedPost` from `src/lib/posts/edit.ts`.
- E1 live: PATCH `/api/posts/[id]`, and `edited_at` in `/api/me/posts` and `/api/users/[handle]/posts`.
- E2: `EditPostSheet`, plus the optional `onEdited` prop on `PostViewerMobile`.
- B15: `settingsCampusCardView` in `src/lib/profile/settings-campus-card.ts`. The phone profile and Settings pickers then share one source for rules and copy (the reader notes flagged three pickers with duplicated strings). **Add this file to the G3 list.**
- The wave 2 B6 campus server rules. No server change.

**Live state (read-only, 2026-09-16):**
- Users:
  - 7 are IU-verified with a campus that isn't confirmed yet.
  - 7 are IU-verified with no campus.
  - 5 are unverified, with no system.
  - 0 rows have `campus_set_at`. Nobody is in a cooldown, and any real campus write by an agent would be the first stamp.
- Posts: 20 published, 4 with media.
- eslint on ProfileMobile.tsx gives 11 problems at `f23bc5d` (recounted).

**Anchors:**
- W1–W3 leave `ProfileMobile.tsx` alone (E2's Do not touch lists it), so every `:line` below is at `f23bc5d`.
- `PostViewerMobile.tsx` (E2, W3) and `CampusMobile.tsx` (CM, same wave) are cited by function name.

**Contract**

1. **Imports** (:18-19)
   - Delete the `IU_CAMPUSES, campusByLabel` import and the `IU_MAJORS_BY_SCHOOL` import.
   - Add:
     - `import { allowedCampusId, isSchoolSystem, type SchoolSystem } from "@/lib/iu/campuses";`
     - `import { majorsForCampus } from "@/lib/iu/majors";`
     - `import { settingsCampusCardView } from "@/lib/profile/settings-campus-card";`
     - `import { EditPostSheet } from "@/components/mobile/EditPostSheet";`
     - `import type { EditedPost } from "@/lib/posts/edit";`
   - Import no server-only module, and don't import `profile-campus-write.ts` directly.

2. **Own campus state** (replaces the legacy label, :347-356)
   - Module scope, next to `pick` (:222-227):
     ```ts
     type OwnCampus = { schoolSystem: SchoolSystem | null; campusId: string | null; campusChangeAvailableAt: string | null; campusConfirmed: boolean };
     const NO_OWN_CAMPUS: OwnCampus = { schoolSystem: null, campusId: null, campusChangeAvailableAt: null, campusConfirmed: false };
     function readOwnCampus(d: Record<string, unknown> | null | undefined): OwnCampus
     ```
     - `schoolSystem`: `isSchoolSystem(d?.schoolSystem) ? d?.schoolSystem : null` (narrow via a local `const raw = d?.schoolSystem`)
     - `campusId`: `allowedCampusId(d?.campusId, schoolSystem)`
     - `campusChangeAvailableAt`: a string, else null
     - `campusConfirmed`: `d?.campusConfirmed === true`
   - `const [campus, setCampus] = useState<string | null>(null)` (:351) becomes `const [ownCampus, setOwnCampus] = useState<OwnCampus>(NO_OWN_CAMPUS)`. Rewrite the comment above it (:347-350): the four fields come top-level from `/api/me/profile-bootstrap` (`profile-bootstrap/route.ts:159-172`, `ownCampusFields`). Owner only.
   - Delete `campusTouched` (:352-356) and each use (:919, :957, :1011, :1620). The "changed from the bootstrap" rule in item 4 replaces it.
   - Mount bootstrap (:371-384):
     - generic: `{ vibeUser?: VibeUser; schoolSystem?: unknown; campusId?: unknown; campusChangeAvailableAt?: unknown; campusConfirmed?: unknown }`
     - `setCampus(…)` becomes `setOwnCampus(isVisitor ? NO_OWN_CAMPUS : readOwnCampus(r.data))`. The visitor bootstrap sends none of these fields.
   - This file stops reading the legacy top-level `campus` label. The badge keeps `vibeUser.studentVerification.school` (:1067, :1447).

3. **`EditDraft.campus`** (:216-218)
   - Now a campus id; `""` means no pick yet.
   - New doc comment: "Campus id from the student's university, or "" before a pick. Sent as `campus_id` only when it differs from the bootstrap's `campusId`."
   - `seedDraftFromUser` (:590-591): `campus: ownCampus.campusId ?? ""`. Delete the `campusByLabel` fallback and its comment (:587-589).

4. **Save** (`commitEdit`, :922-1016)
   - Delete the `school` block (:950-959). In its place:
     ```ts
     // Only a DIFFERENT campus picked in this edit session goes out. Never ""
     // and never the current id: re-sending an unconfirmed campus confirms it
     // and starts the 30-day lock (profile-campus-write.ts:14-18).
     const sentCampusId =
       snapshot.campus && snapshot.campus !== (ownCampus.campusId ?? "") ? snapshot.campus : null;
     if (sentCampusId) body.campus_id = sentCampusId;
     ```
   - Transport stays as it is: a raw `fetch` POST to `/api/me/profile-sync` (:961-966). A non-ok body still throws `j.error` verbatim (:967-971).
     - This client always sends name, bio and the other fields, so a campus rejection comes back as 200 with `campusError` (`profile-sync/route.ts:377`, `:470`, `:476`).
     - The non-ok campus-only answer can't happen here. If it did, the verbatim throw would still show the server's text.
   - Before the re-bootstrap (:976), declare `let freshCampus: OwnCampus | null = null;`.
   - Inside `if (rb.ok && jb?.ok && jb.vibeUser)`, replace :984-986 with `freshCampus = readOwnCampus(jb); setOwnCampus(freshCampus);`.
   - Keep the major (:991-997) and year (:998-1003) round-trip throws as they are.
   - Delete the campus mismatch throw (:1004-1008). After the `if (rb.ok …)` block, in order:
     - `const campusError = typeof j?.campusError?.error === "string" ? j.campusError.error : null;`
     - If `campusError` is set:
       - `setDraft((prev) => (prev ? { ...prev, campus: (freshCampus ?? ownCampus).campusId ?? "" } : prev));`
       - `setEditError(campusError);`
       - `return;`
       - Edit mode stays open; `finally` still clears `savingEdit`.
       - The other fields count as saved, and the picker goes back to the saved campus.
       - Example texts: "That campus isn't part of your university." and "You can change your campus again on October 15.".
     - Else, if `sentCampusId && freshCampus && freshCampus.campusId !== sentCampusId`: `throw new Error("Couldn't save your campus. Try again.")`. The words match `CAMPUS_WRITE_COPY.campus_save_failed` (`profile-campus-write.ts:70`).
   - `cancelEdit` (:916-921) drops `setCampusTouched(false)`. `setDraft(null)` already resets the pick.

5. **Campus picker** (replaces the comment, select and hint at :1612-1657)
   - Computed in the render body next to `const feedPosts = posts ?? [];` (:1110), after the early returns (a plain call, not a hook). JSX reads it only inside `editMode && effectiveDraft`:
     ```ts
     const campusView = !isVisitor && effectiveDraft ? settingsCampusCardView({
       schoolVerified: user.studentVerification?.status === "verified",
       schoolSystem: ownCampus.schoolSystem,
       campusId: effectiveDraft.campus || null,
       campusConfirmed: ownCampus.campusConfirmed,
       campusChangeAvailableAt: ownCampus.campusChangeAvailableAt,
       onboarded: true,
     }) : null;
     ```
     - `campusId` is the draft pick, so `sub` follows what the student just chose.
     - `onboarded` is read only by `nextAvailableAfterWrite`, which PM never calls: the re-bootstrap returns the new `campusChangeAvailableAt`.
     - PM treats `confirm` like `set`. The "Confirm your campus" tap lives in Settings (B15) and on the /campus banner (B14t, mounted by CM).
     - If B15 landed a different signature, re-read `settings-campus-card.ts` on `main` and adapt. The goal is identical rules and copy, not this exact call.
   - New comment: "Campus, chosen within the university your verified school email proved. Same rules and copy as Settings (settings-campus-card.ts)." It must not contain "self-declared", "never verified" or "proves IU membership".
   - `campusView?.mode === "unverified"` (or `campusView` null):
     - no select
     - a line in the hint `<p>` style (:1646-1653), color #5C5853, 12px: "Verify your school email to pick your campus."
     - then `<Link href="/auth/school-email">Verify now →</Link>` (coral #FF5C35, weight 700)
   - Every other mode renders the `<select>` with its current style (:1623-1637) plus `opacity: savingEdit || campusView.locked ? 0.6 : 1`:
     - `value={effectiveDraft.campus}`
     - `onChange={(e) => updateDraft({ campus: e.target.value })}`
     - `disabled={savingEdit || campusView.locked}`
     - when `effectiveDraft.campus === ""`, a first option `<option value="" disabled>Pick your campus</option>`
     - then `campusView.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)`, e.g. "Indianapolis", "Fort Wayne — not open yet"
     - no "Campus — not set" option
   - Under the select, each line in the hint `<p>` style:
     - `campusView.sub` when non-null, e.g. "IU Indianapolis · one community with Purdue Indianapolis (formerly IUPUI)"
     - `campusView.note` when locked, color #C0392B, e.g. "You can change your campus again on October 15."
     - the hint, verbatim, on one source line so grep finds it: `{"Your campus community: its clubs, events and map. Indianapolis is one community for IU and Purdue students."}`. This is B15's sentence; it replaces :1655-1656.

6. **Major picker** (:1533-1582)
   - Next to `campusView`: `const majors = effectiveDraft ? majorsForCampus(effectiveDraft.campus || null, ownCampus.schoolSystem) : null;`
   - `majors === null` means no system, or a campus without a curated list (Fort Wayne, Columbus, West Lafayette, …; Q16):
     - the select becomes `<input value={effectiveDraft.major} onChange={(e) => updateDraft({ major: e.target.value.slice(0, 200) })} placeholder="Your major" maxLength={200} />`
     - same flex slot and pill style, without `appearance` and `textOverflow`
   - Otherwise the select keeps `<option value="">Major</option>` and the "saved major isn't in the list" option. That test becomes `!majors.majors.includes(effectiveDraft.major)` (:1562-1569).
     - `majors.groups.length > 0` (Indianapolis, IU or Purdue): `<optgroup key={g.school.id} label={g.school.shortLabel}>` per group
     - `majors.groups.length === 0` (IU Bloomington): a flat `majors.majors.map(…)`
   - The year select (:1583-1610) doesn't change. The major round-trip check stays; profile-sync trims to 200 (`profile-sync/route.ts:102-104`).

7. **In-place post edits**
   - `PostRow` (:141-148) adds `tags?: string[] | null; edited_at?: string | null;`.
   - Right after `refetchPosts` (:473), before any early return:
     ```ts
     const applyPostEdit = useCallback((p: EditedPost) => {
       setPosts((prev) => prev ? prev.map((x) => x.id === p.id ? { ...x, content: p.content, tags: p.tags, edited_at: p.edited_at } : x) : prev);
       setSavedPosts((prev) => prev ? prev.map((x) => x.id === p.id ? { ...x, content: p.content, tags: p.tags } : x) : prev);
       setReposts((prev) => prev ? prev.map((r) => r.post.id === p.id ? { ...r, post: { ...r.post, content: p.content, tags: p.tags } } : r) : prev);
     }, []);
     ```
   - No refetch after an edit.

8. **Who counts as the viewer's owner** (:332, :1829, :1841, :1851, :1989-1996)
   - The HEAD bug, closed here before Edit reaches it:
     - The mount passes `canDelete={!isVisitor}` for every post opened from your own profile.
     - `PostViewerMobile` computes `owner = canDelete || isOwner`.
     - So a post by someone else, opened from your Saved or Reposts tab, offers "Delete post" today. After E2 it would also offer "Edit post". Both fail with 403 "Not your post".
   - `openPostId` (:332) becomes `const [openPost, setOpenPost] = useState<{ id: string; mine: boolean } | null>(null);`:
     - PostsGrid (:1829): `onOpenPost={(id) => setOpenPost({ id, mine: !isVisitor })}`
     - RepostsList (:1841) and SavedGrid (:1851): `(p) => setOpenPost({ id: p.id, mine: false })`. The viewer's server-computed `is_owner` still gives you Edit and Delete on your own post there.
   - Mount (:1989-1996): `{openPost ? <PostViewerMobile postId={openPost.id} onClose={() => setOpenPost(null)} canDelete={openPost.mine} onDeleted={() => void refetchPosts()} onEdited={applyPostEdit} /> : null}`

9. **`PostsGrid`** (:2202-2256)
   - New props: `onEdited: (p: EditedPost) => void; onDeleted: () => void;`.
   - The mount (:1819-1830) passes `onEdited={applyPostEdit}` and `onDeleted={() => void refetchPosts()}`.
   - Cards: `<PostFeedCard key={p.id} post={p} isOwner={!isVisitor} onTap={() => onOpenPost(p.id)} onEdited={onEdited} onDeleted={onDeleted} />`.
   - The owner's empty state (:2231-2236) doesn't change.

10. **`PostFeedCard`** (:2258-2341)
    - Props add `isOwner: boolean; onEdited: (p: EditedPost) => void; onDeleted: () => void;`. State: `const [actionsOpen, setActionsOpen] = useState(false);`.
    - Wrap the root `<button>` (:2268-2339) in `<div style={{ position: "relative" }}>`. The card button's style adds `width: "100%"`, because a button inside a block div no longer stretches (box-sizing is already global, `globals.css:32`).
    - When `isOwner`, add a ⋯ button as a SIBLING after the card button, never nested inside it:
      - `<button type="button" aria-label="Post actions" onClick={() => setActionsOpen(true)}>`
      - style: `position: "absolute", top: 8, right: 8`, plus the 30×30 look of the "More actions" button in CampusMobile's `FeedCard` (at `f23bc5d`: radius 999, 1px rgba(28,28,30,0.06) border, rgba(255,255,255,0.62) fill, color #5C5853, the 16px three-circle svg)
    - `isOwner && post.content`: the content `<p>` (:2302-2318) adds `paddingRight: 34`. On an image-only post the ⋯ sits over the image corner.
    - Timestamp (:2337): `{post.created_at ? relTimeForCard(post.created_at) + (post.edited_at ? " · Edited" : "") : ""}`. Visitors see " · Edited" too (Q18) but get no ⋯.
    - Mount `{actionsOpen ? <OwnPostActionsSheet postId={post.id} content={post.content ?? ""} hasMedia={!!post.media_url} onClose={() => setActionsOpen(false)} onEdited={onEdited} onDeleted={onDeleted} /> : null}` inside the wrapper div and OUTSIDE the card button. A tap inside the portal then bubbles to the div, which has no handler, and never opens the viewer.

11. **NEW `OwnPostActionsSheet`** (same file, just above `SafetySheetRow` :5151; Q19)
    - Props: `{ postId: string; content: string; hasMedia: boolean; onClose: () => void; onEdited: (p: EditedPost) => void; onDeleted: () => void }`.
    - State: `editOpen`, `deleting`, `const savedRef = useRef(false)`.
    - Chrome copies the safety sheet (:4903-4953):
      - `<Drawer.Root open onOpenChange={(o) => { if (!o) onClose(); }}>`
      - `Drawer.Portal` containing `Drawer.Overlay style={sheetOverlayStyle}` and `Drawer.Content style={sheetContentStyle} aria-describedby={undefined}` (consts at :5199-5238)
      - inside the content: `Drawer.Title style={sheetHiddenTitleStyle}` reading "Post options", `Drawer.Handle style={sheetHandleStyle}`, then `<div style={{ padding: "4px 0 12px" }}>`
    - Rows (`SafetySheetRow`):
      - "Edit post" → `setEditOpen(true)`; disabled while `deleting`
      - "Delete post" (danger; reads "Deleting…" and is disabled while deleting) → `handleDelete`
      - "Cancel" (bold) → `onClose`
    - After `Drawer.Portal`, still inside `Drawer.Root`, following the `PostActionsSheet` + `SharePostSheet` pattern in CampusMobile:
      ```tsx
      {editOpen ? (
        <EditPostSheet nested postId={postId} initialContent={content} hasMedia={hasMedia}
          onClose={() => { setEditOpen(false); if (savedRef.current) onClose(); }}
          onSaved={(p) => { savedRef.current = true; onEdited(p); }} />
      ) : null}
      ```
      - EditPostSheet toasts "Post updated" and calls its own `onClose` after `onSaved` (E2), so a save closes both sheets.
      - Cancel, or a clean dismiss, closes only the edit sheet.
    - `handleDelete` copies `PostViewerMobile`'s `handleDelete` word for word:
      - `window.confirm("Delete this post?")`
      - `vibeRequest(`/api/posts/${postId}`, { method: "DELETE", credentials: "include", failure: "Couldn't delete this post." })`
      - `!r.ok` → `setDeleting(false)`; the sheet stays open
      - ok → `onDeleted(); onClose();`
    - No Report row (the sheet is only for your own posts). The sheet never sends `tags` or `status`.
    - The phone feed card sheet keeps Edit only (CM). Delete on the profile card is Q19's default.

**Acceptance**
- `npx tsc --noEmit` exits 0.
- `npx eslint src/components/mobile/ProfileMobile.tsx` shows ≤ 11 problems.
- `rg -n "IU_CAMPUSES|campusByLabel|IU_MAJORS_BY_SCHOOL|campusTouched|Campus — not set|change it any time|self-declared|proves IU membership|body\.school|Campus didn't save" src/components/mobile/ProfileMobile.tsx` → 0.
- `rg -n "body\.campus_id" src/components/mobile/ProfileMobile.tsx` → exactly 1 hit, directly under the `sentCampusId` guard.
- `rg -nF "Your campus community: its clubs, events and map. Indianapolis is one community for IU and Purdue students." src/components/mobile/ProfileMobile.tsx` → 1. A reviewer diffs this string against B15's `CampusCard` in SettingsClient.
- `rg -n "canDelete=\{!isVisitor\}" src/components/mobile/ProfileMobile.tsx` → 0.
- `rg -n "<EditPostSheet" src/components/mobile/ProfileMobile.tsx` → 1 hit, with `nested`.
- `rg -n "onEdited=\{applyPostEdit\}" src/components/mobile/ProfileMobile.tsx` → 2 hits (viewer mount + PostsGrid mount).
- Read-only SQL, run before and after the live checks, must return the same numbers. This proves no agent wrote anything:
  - `select count(*) from public.users where campus_set_at is not null;` (0 at planning)
  - `select count(*) from public.posts where edited_at is not null;` (needs G1)
- **Live checks on prod.** Signed-in gstack browser as Franky, per the live verification recipe. `browse viewport 375x812` goes BEFORE `goto /profile`.
  - Install the wrapper before the first tap:
    - every non-GET is recorded (method, URL, parsed body) and answered with a synthetic response; nothing is forwarded
    - GET `/api/me/profile-bootstrap` may be rewritten from the real JSON for the state under test
  - To make ProfileMobile re-read the bootstrap through the wrapper, client-navigate: tap the tab bar's Campus tab, then Profile. Never reload, because a reload drops the wrapper.
  - Tap the pencil to enter edit mode.
  - **IU, real bootstrap** (rewrite `campusId:"indianapolis"` if the row has none):
    - options in order: Indianapolis, Fort Wayne — not open yet, Bloomington — not open yet, Columbus — not open yet, East — not open yet, Kokomo — not open yet, Northwest — not open yet, South Bend — not open yet, Southeast — not open yet
    - no "not set" option
    - sub "IU Indianapolis · one community with Purdue Indianapolis (formerly IUPUI)", then the hint
    - majors grouped by IU Indianapolis school
  - **Bio-only save:** the recorded POST `/api/me/profile-sync` body has no `campus_id` and no `school` key. The wrapper answers `{ok:true, profile:null}`.
  - **Purdue** (rewrite `schoolSystem:"purdue"`, `campusId:"indianapolis"`):
    - options: Indianapolis, Fort Wayne — not open yet, West Lafayette — not open yet, Northwest — not open yet
    - no IU-only campus
    - sub "Purdue Indianapolis · one community with IU Indianapolis (formerly IUPUI)"
    - majors show the Purdue Indianapolis groups
  - **Pick mode** (rewrite `campusId:null`):
    - the disabled "Pick your campus" option is selected
    - choosing Indianapolis and saving records exactly `campus_id:"indianapolis"`
  - **Change a campus** (IU, pick Bloomington): majors switch to the flat IU Bloomington list. Pick Columbus: the major becomes a "Your major" text box that still holds the saved major.
  - **Cooldown** (rewrite `campusConfirmed:true`, `campusChangeAvailableAt:"2026-10-15T16:00:00.000Z"`): the select is disabled, with "You can change your campus again on October 15." under it.
  - **Unverified** (rewrite `schoolSystem:null`, `campusId:null`, and delete `vibeUser.studentVerification`):
    - no select
    - "Verify your school email to pick your campus." with "Verify now →" linking to `/auth/school-email`
    - the major is a text box
  - **campusError:** pick Fort Wayne and save, with the wrapper answering 200 `{ok:true, profile:null, campusError:{status:400, code:"campus_not_in_system", error:"That campus isn't part of your university."}}`.
    - edit mode stays open
    - the red line reads that text verbatim
    - the select is back on Indianapolis
    - repeat with `{status:429, code:"campus_change_too_soon", error:"You can change your campus again on October 15.", availableAt:"2026-10-15T16:00:00.000Z"}`: that text, verbatim
  - **Mismatch:** pick Fort Wayne, wrapper answers `{ok:true, profile:null}`, and the real bootstrap still says Indianapolis → "Couldn't save your campus. Try again."
  - **Posts tab, own profile:**
    - every card has a ⋯ (`[aria-label="Post actions"]`)
    - `document.querySelectorAll("button button").length === 0`
    - tapping ⋯ opens "Edit post / Delete post / Cancel" and does NOT open the viewer
  - **Edit from a card:**
    - Save stays disabled until the text changes
    - with PATCH answered 200 `{ok:true, post:{id:<that id>, content:"<new text> #x", tags:["x"], edited_at:"<iso>"}}`:
      - the card text updates, the timestamp ends " · Edited", and "Post updated" toasts
      - both sheets close
      - no GET `/api/me/posts` fires after the PATCH
    - with PATCH answered 403 `{ok:false, code:"terms_required"}`: the toast "Accept the Terms first, then try again." shows, and the edit sheet stays open with the draft
  - **Delete from a card:**
    - dismiss the confirm: nothing is recorded
    - with `window.confirm = () => true` and DELETE answered 200 `{ok:true}`: the sheet closes and one GET `/api/me/posts` refetch fires
    - with DELETE answered 500: the toast "Couldn't delete this post." shows and the sheet stays
  - **Edit from the viewer opened on a card** (E2's menu, PATCH answered as above): after closing the viewer, the card shows the new text with no refetch.
  - **Saved tab:** open a post by someone else (rewrite GET `/api/me/bookmarks` if Franky has none). The viewer's ⋯ shows Report and no Edit post or Delete post.
  - **Visitor `/profile/<another handle>`:** no ⋯ on cards. Rewriting GET `/api/users/<handle>/posts` to add `edited_at` shows " · Edited".
- **Franky's iPhone (Safari), after deploy:**
  - an edit from a card needs no zoom on focus
  - closing both sheets leaves the profile at the same scroll position with no jump
  - the campus select is readable and shows the sub line

**Do not touch:**
- `EditPostSheet.tsx` and `PostViewerMobile.tsx` (E2)
- `CampusMobile.tsx` (CM, same wave). Keep the `CampusSearchOverlay` import as it is, and CM must keep that export's signature.
- `settings-campus-card.ts` and `SettingsClient.tsx` (B15)
- the `IU_CAMPUSES` / `campusByLabel` / `IU_MAJORS_BY_SCHOOL` exports: `campus-scope.ts`, `normalize-profile-view.ts` and `OnboardingMobile.tsx` still import them
- `profile-campus-write.ts`, the `profile-sync` and `profile-bootstrap` routes, and every posts route
- `public/html/profile.html` (PH, W5)
- the portfolio editors, avatar/cover upload, and the owner empty-state CTA (reader B16m item 6 is not in this plan)
- the Reposts/Saved card layouts (no " · Edited" there: those routes don't send `edited_at`)

---
