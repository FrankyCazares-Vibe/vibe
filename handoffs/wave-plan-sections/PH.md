### PH · desktop profile: campus and majors from your university, fake calendar purge, search meta, post-edit sync

**Owns:** `public/html/profile.html`
**Depends on:**
- E1 live: `/api/me/posts` and `/api/users/[handle]/posts` return `edited_at`. G1 must be applied first; at planning time `posts.edited_at` does not exist live.
- E6, same wave, by event contract only. After a successful PATCH, `_postViewer.js` fires `window.dispatchEvent(new CustomEvent('vibe:post-edited', { detail: { id, content, tags, edited_at } }))`. PH listens for it and never imports or edits the viewer.
- H1 live: `/api/search` org rows carry `join_policy` and `audience`, and hidden clubs are gone.
- B15 is the copy source for the hint sentence, the cooldown line and the option label format. B20 (same wave, `messages.html`) carries the identical fake-event pairs; the two batches share no file.

**Scope limit:** no Edit control on profile cards (Q20: Edit lives in the viewer the cards open), no server or `src/` file, no `_postViewer.js`.

Anchors: no earlier wave touches `profile.html`, so every `file:line` below was read at `f23bc5d` and holds until PH starts. Live data at planning time: 19 users (7 `iu` + `indianapolis`, 7 `iu` with no campus, 5 with no system), 0 Purdue, 0 confirmed campuses.

**Contract**

1. **Campus state.** Hazard: `profile-html-bridge.tsx:62` stores only `vibeUser`, so on first paint the page knows no system, campus id or cooldown.
   - Declare with `var`, directly above `(function initProfilePage(){` (:7163), for the same TDZ reason as :7062-7064 and :7780-7783: `var _campusCtx = null; var _campusCtxPromise = null; var _campusPick = null;`.
   - `_campusCtx` shape: `{ system: 'iu'|'purdue'|null, campuses: Array<{id,name,shortName,city,shared,sharedWith,isOpen}>, currentCampusId: string|null, availableAt: string|null }`.
   - New `function _ensureCampusContext()`:
     - returns early when `window.viewingRealUser` or `!_isAppShell()` (:5909)
     - returns `_campusCtxPromise` when already set
     - otherwise runs `Promise.all([fetch('/api/campuses', {credentials:'include'}), fetch('/api/me/profile-bootstrap', {credentials:'include'})])`
   - `/api/campuses` must answer `ok:true`. It sets `system`, `campuses` and `currentCampusId`.
   - The bootstrap is optional and sets only `availableAt = typeof j.campusChangeAvailableAt === 'string' ? j.campusChangeAvailableAt : null`. It's the only source of the cooldown, since `/api/campuses` has none and is owned by nobody. If it fails, `availableAt` stays null and the server's `campusError` is the backstop.
   - When `/api/campuses` fails (non-2xx, 503 `campus_not_ready`, network), set `_campusCtx = null` and `_campusCtxPromise = null` so the next edit-mode entry retries.
   - Once the promise settles (either way), call `_renderCampusPicker()` and `_hydrateMajorPicker(vibeLoad('vibe_user_v1') || {})`.
   - `toggleEdit` (:3974), after `if (editMode) _profileSyncLastOk = null;` (:3997): `if (editMode && typeof _ensureCampusContext === 'function') _ensureCampusContext();`. This one hook covers every entry: the button at :3193 and the calls at :4955, :5701, :5708 and :7346.
   - Nothing campus-related is written to `vibe_user_v1` any more.

2. **Markup and CSS.**
   - :3365, inside `.meta-campus-edit`, before `#campusSelect`: add `<span class="meta-campus-static" data-campus-static></span>`. Change the display span's default text from `Not set` to empty.
   - :3367, the hint becomes `<span class="meta-campus-hint" style="display:none"><span data-campus-hint-copy>Your campus community: its clubs, events and map. Indianapolis is one community for IU and Purdue students.</span><span data-campus-sub></span><span data-campus-note></span></span>`. The copy is verbatim from B15 and PM, and "Not verified — change it any time." is gone.
   - :3364, after `#majorSelect`: `<input type="text" id="majorInput" class="meta-major-select" maxlength="200" placeholder="Your major" aria-label="Major" onchange="_onMajorYearChange()" style="display:none;cursor:text">`.
   - CSS next to :400-402: `.meta-campus-hint [data-campus-sub]:not(:empty), .meta-campus-hint [data-campus-note]:not(:empty) { display:block; margin-top:2px; }` and `.meta-campus-static { font-size:12.5px; color:var(--muted); }`.

3. **Picker render.** Delete `IU_CAMPUSES` (:7065-7075), `_campusOptionText` (:7079-7083), `_canonicalCampusLabel` (:7088-7093), `_currentCampusLabel` (:7100-7105) and `_populateCampusPicker` (:7107-7125).
   - New `function _campusBadgeText(user)`: `const s = user && user.studentVerification && user.studentVerification.school;`. Return `typeof s === 'string' && s && !/^(IU|Purdue) verified$/.test(s) ? s : ''`. The badge is server-rendered by `campusBadgeForProfile` (`build-vibe-user-v1.ts:117-124`) for owners and visitors alike.
   - `_hydrateCampusPicker(user)` (:7127-7141, rewrite) sets the display text:
     - the badge when there is one
     - else, owner with `studentVerification`: `Pick your campus`
     - else, owner: `Not set`
     - visitor with no badge: the chip hides, as :7137-7139 does today
     Then it calls `_renderCampusPicker()`.
   - New `function _renderCampusPicker()`, owner only. It is safe before `_campusCtx` exists.
     - **No context** (loading, failed, or not app shell): hide `#campusSelect`. `[data-campus-static]` shows the badge (or empty), and `[data-campus-sub]` and `[data-campus-note]` are emptied. It never shows `Not set` as an option and never builds a static list.
     - **`system === null`:** hide the select. `[data-campus-static]` reads `Verify your school email to pick your campus.` (verbatim from B15).
     - **Otherwise:** show the select and empty the static span. Rebuild the options every render.
       - When `value === ''`, the first option is `<option value="" disabled selected>Pick your campus</option>`.
       - Then one option per campus: `value = c.id`, `textContent = c.isOpen ? c.shortName : c.shortName + ' — not open yet'`. This matches B15 and the shipped `onboarding.html:760`. There is no `Not set` option.
       - `value = _campusPick || _campusCtx.currentCampusId || ''`.
       - `[data-campus-sub]` shows the selected row's `sharedWith || name` (for example "IU Indianapolis · one community with Purdue Indianapolis (formerly IUPUI)"), or empty.
       - `locked = Date.parse(availableAt) > Date.now()`. Set `sel.disabled = locked`.
       - When locked, `[data-campus-note]` shows `_campusTooSoonCopy(availableAt)`; otherwise it's empty.
   - New `function _campusTooSoonCopy(iso)` mirrors `campusChangeTooSoonCopy` (`profile-campus-write.ts:158-168`) word for word:
     - an invalid date gives `You changed your campus recently. Try again later.`
     - otherwise `You can change your campus again on ${new Date(ms).toLocaleDateString('en-US', {month:'long', day:'numeric', timeZone:'America/Indiana/Indianapolis'})}.`

4. **Change and payload.**
   - `_onCampusChange` (:7143-7160, rewrite):
     - `if (!_campusCtx) return;`
     - `const v = sel.value;` and return if `!v` or `!_campusCtx.campuses.some(c => c.id === v)` (never `''`)
     - `_campusPick = (v === _campusCtx.currentCampusId) ? null : v;`
     - then `_renderCampusPicker(); _hydrateMajorPicker(vibeLoad('vibe_user_v1') || {}); scheduleProfileServerSync();`
     - no `vibeSave`, no `u.campus`, no `_campusCleared`
   - `buildProfileSyncPayload` (:7819), campus block (:7862-7872), replaced whole: `if (_campusPick && _campusCtx && _campusPick !== _campusCtx.currentCampusId && _campusCtx.campuses.some(c => c.id === _campusPick)) payload.campus_id = _campusPick;`.
   - `payload.school` is never set. Onboarding critic A4: re-sending an unstamped current campus would confirm a backfilled row and start the 30-day lock (`profile-campus-write.ts:14-18`).

5. **Sync result and adoption.**
   - `_runProfileServerSync` (:8160), right after `_profileSyncLastOk = true;` (:8179) and BEFORE the `localIsNewer()` early return (:8188-8189). Otherwise an edit made mid-flight would swallow the campus result.
     `if (typeof payload.campus_id === 'string') _afterCampusSync(payload.campus_id, r.data && r.data.campusError);`
   - New `function _afterCampusSync(sent, err)`:
     - **Rejected** (`err && typeof err.error === 'string'`):
       - `window.vibeToast(err.error, { tone: 'error' })`, using the server copy verbatim (for example "That campus isn't part of your university." or "You can change your campus again on October 15.")
       - if `typeof err.availableAt === 'string'`, set `_campusCtx.availableAt = err.availableAt`
       - `currentCampusId` is unchanged
     - **Accepted:** `_campusCtx.currentCampusId = sent`.
     - Either way: `if (_campusPick === sent) _campusPick = null;` (a newer pick made during the flight stays), then `_renderCampusPicker(); _hydrateMajorPicker(vibeLoad('vibe_user_v1') || {});`. On rejection this reverts the select to the server campus.
   - `!r.ok` (:8174-8178): leave `_campusPick` set, so the retry flush re-sends it. `vibeRequest` already toasted. On desktop a campus-only body can't happen, because the payload always carries the other fields (`profile-sync/route.ts:374-386`).
   - Adoption at :8202-8204: delete the three `nu.campus` / `_campusCleared` lines and add `if (_campusCtx) { if (!_campusPick) _campusCtx.currentCampusId = (typeof jb.campusId === 'string') ? jb.campusId : null; _campusCtx.availableAt = (typeof jb.campusChangeAvailableAt === 'string') ? jb.campusChangeAvailableAt : null; }`. The existing `hydrateProfileFields(nu)` (:8245) then repaints the badge and picker.
   - Empty-storage branch (:7301): delete `nu.campus = …` and its two-line comment. The page reloads straight after, and edit mode fetches the context.

6. **Majors** (:7548-7610). This replaces the IU-only `window.IU_MAJORS_BY_SCHOOL` build. `_iu-majors.js` loads synchronously at :23.
   - `_populateMajorPicker(campusId, system)` (:7548, rewrite):
     - `const list = typeof window.vibeMajorsForCampus === 'function' ? window.vibeMajorsForCampus(campusId, system) : null;`
     - `key = (campusId || '') + '|' + (system || '')`. Return when `sel.dataset.populatedFor === key`. This replaces the `populated === '1'` early return, so a campus change re-populates.
     - `list === null`: hide `#majorSelect`, show `#majorInput`, set `populatedFor = key`, return.
     - Otherwise show the select (`sel.disabled = false`) and hide the input.
     - Options: blank `Major`, then for `list.groups.length` one `<optgroup label=g.school.shortLabel>` per group; otherwise a flat list of `list.majors`. Then `sel.dataset.populatedFor = key`.
   - `_hydrateMajorPicker(user)` (:7572, rewrite):
     - pending means `_campusCtxPromise !== null && _campusCtx === null`: show `#majorSelect` empty and disabled, hide `#majorInput`, set `sel.dataset.populatedFor = ''`, and return. `_ensureCampusContext` calls `_hydrateMajorPicker` once right after creating the promise, so a free-text box from first paint never flashes before the list
     - otherwise call `_populateMajorPicker(_campusPick || (_campusCtx && _campusCtx.currentCampusId) || null, _campusCtx ? _campusCtx.system : null)`
     - a failed context gives `(null, null)`, which is free text
     - keep the "saved major not in the list" extra option (:7577-7587) and `sel.value = cur`; the input takes `input.value = cur`; year unchanged
   - Verified at HEAD: `vibeMajorsForCampus('indianapolis','iu')` gives 11 groups (first `Kelley`); `('indianapolis','purdue')` gives 6 groups (first `Engineering`); `('iu-bloomington','iu')` gives 0 groups and 163 flat majors; `('fort-wayne','iu')` and `(null,null)` give null.
   - `_onMajorYearChange` (:7595): `u.major = (input && input.style.display !== 'none') ? input.value.trim().slice(0, 200) : (sel ? sel.value : '');`. The rest is unchanged.

7. **Fake calendar events.**
   - Delete the `seedEvents` IIFE (:6729-6737). `calendarEvents` (:6728) starts empty.
   - Next to `CAL_KEY` (:6872), add:
     `const FAKE_SEED_CAL_EVENTS = [['IU Spring Career Fair','IMU Alumni Hall'],['Goldman Sachs Info Session','Kelley School of Business 100'],['Weekly Design Critique','Luddy Hall 1106'],['IU Hackathon 2025','Assembly Hall']];`
     B20 puts the identical four pairs in `messages.html`, and a reviewer diffs the two.
   - `_calLoad` (:6881-6890), after `JSON.parse`:
     - return unless `saved` is a plain object
     - for each key: `kept = (Array.isArray(saved[k]) ? saved[k] : []).filter(e => !(e && FAKE_SEED_CAL_EVENTS.some(([n, l]) => e.name === n && e.location === l)))`
     - when `kept` is empty, delete the key; else `saved[k] = kept`
     - if anything was dropped or deleted, `localStorage.setItem(CAL_KEY, JSON.stringify(saved))` inside the existing try
     - then the existing merge
     The purge runs on every load and is idempotent. The four fakes persist because `_calSave` (:6874-6879) wrote them for anyone who ever added or removed an event.
   - Placeholder :9188 `e.g. Goldman Sachs Info Session` → `e.g. Club info session`.

8. **Search** (following spec §5.6).
   - Comment :6395-6397 → `// Org rows navigate (View); following and joining live on the org page.`
   - `_profSearchOrgToRow` (:6398-6412): `meta` (:6399) becomes `[typeof o.member_count === 'number' ? (o.member_count === 1 ? '1 member' : o.member_count + ' members') : null, o.verified ? 'Verified' : null, o.join_policy === 'invite' ? 'Invite only' : o.join_policy === 'request' ? 'By request' : null, o.audience === 'iu' ? 'IU only' : o.audience === 'purdue' ? 'Purdue only' : null].filter(Boolean).join(' · ')`.
   - This is the F5a `memberCountText` / `policyChip` / `audienceChip` wording and order. It has no follower count (C13), and it's tolerant: missing fields render nothing. It fixes today's "1 members".

9. **Post cards carry a swappable text node** (E7).
   - `_profileMapDbRow` (:8430-8452):
     - `bodyHTML` (:8448) → `'<span class="ppost-text">' + bodyText + '</span>' + mediaHTML`
     - `date` (:8447) → `_formatRelativeDate(row.created_at) + (row.edited_at ? ' · Edited' : '')`
     - This covers own posts (`hydrateProfilePostsFromAPI` :8338) and visited profiles, which map through the same function.
   - `_publishProfilePostLocal` (:5998-6016): `bodyHTML` (:6014) → `'<span class="ppost-text">' + bodyText + '</span>' + imageHTML`.
   - `_renderPostCard` (:8700-8729), `savePostsToStorage` (:8262), `postExcerpt` and `_profilePrefillFromCard` (:5768) need no change. `.ppost-body` `textContent` is the same with the span.

10. **`vibe:post-edited` listener** (new, directly after `_profilePrefillFromCard`, top level; it runs only on the event, so there's no TDZ).
    - Guard: `const d = ev && ev.detail;` and return unless `d && typeof d.id === 'string' && d.id`. `content = typeof d.content === 'string' ? d.content : ''`. `tags = Array.isArray(d.tags) ? d.tags.filter(t => typeof t === 'string') : []`.
    - `const cards = document.querySelectorAll('#profilePostsList .profile-post-card[data-post-id="' + CSS.escape(d.id) + '"]');`. Return when there are none.
    - For each card, new `function _applyPostEditToCard(card, content, tags)`:
      - `textHTML = _esc(content).replace(/\n/g, '<br>')`. Content always goes through `_esc` (:7618) and is never inserted raw.
      - If `.ppost-body > .ppost-text` exists, set its `innerHTML = textHTML`.
      - Legacy cached card (no span): `body.innerHTML = '<span class="ppost-text">' + textHTML + '</span>' + [...body.children].filter(el => el.tagName === 'IMG' || el.tagName === 'VIDEO').map(el => el.outerHTML).join('')`.
      - Tags: when `tags.length`, `html = tags.map(t => '<span class="ppost-tag">#' + _esc(t) + '</span>').join('')`. Create `div.ppost-tags` right after `.ppost-readmore` if missing, then set its innerHTML. With no tags, remove `.ppost-tags`.
      - `.ppost-date`: append ` · Edited` unless its text already ends with it.
      - `_measureReadMore(card)` (:8744).
    - Then `populateAllGrid()` (:5806), which rebuilds the All feed from the updated list.
    - Pinned slot, IN PLACE:
      - if `profilePinnedId === d.id` (:5549), find `#pinnedContent .pinned-post-card[data-pin-id="<CSS.escape(id)>"]`
      - set `.pin-post-body` innerHTML to `cards[0].querySelector('.ppost-body').innerHTML` (already escaped)
      - create, update or remove `.pin-post-tags` after `.pin-post-body` from the card's `.ppost-tags` innerHTML (same markup as :5612-5613)
      - Do NOT call `pinFromProfile(id)` as the E7 note proposed. Its programmatic path runs `saveProfileToStorage()` → `scheduleProfileServerSync()` (:7777), which would send a full `/api/me/profile-sync` POST on every post edit. `pinnedId` doesn't change, so nothing needs saving.
    - `savePostsToStorage()` (:8262; a no-op on visited profiles).
    - E6 owns the viewer; PH adds no Edit control, and the owner card × (`deleteProfilePost` :8761) stays.

11. **Comments.** Rewrite them system-neutral, dropping "IU-grouped", "self-declared, never verified", "@iu.edu proves IU membership" and "MIRROR of IU_CAMPUSES":
    - CSS :383-384 → `/* Major picker: display text in normal mode; in edit mode the student's campus list (grouped when it has schools) or a free-text box. */`
    - CSS :396-399 → `/* Campus picker: the university comes from the verified school email; the campus is chosen within it (GET /api/campuses). Same display/edit flip as the major picker. */`
    - JS :7050-7064 → one block saying the options and the student's university come from `GET /api/campuses` (no static mirror), writes send `campus_id` only when the student changed it, the cooldown comes from the own bootstrap, and the `var` state sits above `initProfilePage` for TDZ.
    - JS :7543-7547 → the list comes from `window.vibeMajorsForCampus(campusId, system)` (`_iu-majors.js`, generated from `majors.ts`); a campus with no curated list gets free text.

**Acceptance** (agents never write to prod: every non-GET in a live check goes through the blocker; Franky makes any real campus change or post edit)
- Static: extract every inline `<script>` without `src=` (6 at HEAD) into the scratchpad, then run `node --check` on each. All pass:
  `OUT=<scratchpad>/ph node -e 'const fs=require("fs");const h=fs.readFileSync("public/html/profile.html","utf8");let i=0;for(const m of h.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)){if(/application\/(ld\+)?json/.test(m[1]))continue;fs.writeFileSync(process.env.OUT+"/profile-inline-"+(i++)+".js",m[2]);}console.log(i)' && for f in <scratchpad>/ph/profile-inline-*.js; do node --check "$f" || echo FAIL "$f"; done`
- `rg -n "IU_CAMPUSES|_campusCleared|payload\.school|_canonicalCampusLabel|_campusOptionText|_currentCampusLabel|nu\.campus|IU_MAJORS_BY_SCHOOL|public follow API|seedEvents|Not verified — change it any time" public/html/profile.html` → 0, and `rg -ni "self-declared" public/html/profile.html` → 0 (3 hits at HEAD: :396, :7051, :7862).
- `rg -n "IU Spring Career Fair|Goldman Sachs Info Session|Weekly Design Critique|IU Hackathon 2025" public/html/profile.html` → exactly 1 line, the `FAKE_SEED_CAL_EVENTS` constant.
- `rg -n "payload\.campus_id\s*=" public/html/profile.html` → 1, and `rg -n "school:" public/html/profile.html` → 0 (0 at HEAD).
- `rg -n "vibe:post-edited" public/html/profile.html` → 1 (the listener). `rg -n "pinFromProfile\(d\.id|pinFromProfile\(id\)" public/html/profile.html` → 0.
- `rg -n "ppost-text" public/html/profile.html` → hits in `_profileMapDbRow`, `_publishProfilePostLocal` and the listener only.
- Copy parity with B15 and PM: `rg -F "Your campus community: its clubs, events and map. Indianapolis is one community for IU and Purdue students." public/html/profile.html src/components/settings/SettingsClient.tsx src/components/mobile/ProfileMobile.tsx` → one hit per file. `rg -F " — not open yet" public/html/profile.html public/html/onboarding.html` → both files.
- `node --test --experimental-strip-types src/lib/iu/majors.test.ts` still passes (`_iu-majors.js` untouched). `npx tsc --noEmit` exits 0 (no TS touched). No eslint target.
- Read-only SQL, before the W5 push: `select column_name from information_schema.columns where table_schema='public' and table_name='posts' and column_name='edited_at'` → 1 row (G1). `select school_system, count(*) from users group by 1` shows the Purdue count, which was 0 at planning, so the Purdue picker is checked only by override.
- **Live, 1280px, signed in as Franky** (`/profile`, which bridges to `/html/profile.html?app=1`). Install the blocker after load and BEFORE the first Edit click. It passes GETs through, answers matching overrides, and records and fakes every non-GET:
  `window.__nonGet=[];window.__ov={};const _f=window.fetch.bind(window);window.fetch=async(u,o={})=>{const url=String(u&&u.url||u),m=String(o.method||'GET').toUpperCase();for(const k in window.__ov){const v=window.__ov[k];if(url.includes(k)&&(v.method||'GET')===m)return new Response(JSON.stringify(v.body),{status:v.status||200,headers:{'content-type':'application/json'}});}if(m!=='GET'){window.__nonGet.push({m,url,body:o.body});return new Response('{"ok":true,"profile":null}',{status:200,headers:{'content-type':'application/json'}});}return _f(u,o);};`
  1. **IU picker** (no override). Edit shows a select on `Indianapolis` with options `Indianapolis`, `Fort Wayne — not open yet`, `Bloomington — not open yet`, …; the sub-line "IU Indianapolis · one community with Purdue Indianapolis (formerly IUPUI)"; the hint sentence; no `Not set` option; majors grouped, first optgroup `Kelley`. `__nonGet` is empty. Screenshot.
  2. **Pick `Fort Wayne — not open yet`.** Majors swap to the free-text box prefilled with the saved major. After about 1.5s, `__nonGet` holds exactly one POST `/api/me/profile-sync` whose body has `"campus_id":"fort-wayne"` and no `school` key. The select returns to Indianapolis once the real bootstrap GET is adopted, because the write was faked.
  3. **Reload, re-install, edit only the bio.** The recorded profile-sync body has neither `campus_id` nor `school`.
  4. **Purdue.** Set `__ov['/api/campuses']={body:{ok:true,system:'purdue',preselect:null,currentCampusId:'indianapolis',campuses:[{id:'indianapolis',name:'Indianapolis',shortName:'Indianapolis',city:'Indianapolis',shared:true,sharedWith:'Purdue Indianapolis · one community with IU Indianapolis (formerly IUPUI)',isOpen:true},{id:'fort-wayne',name:'Fort Wayne',shortName:'Fort Wayne',city:'Fort Wayne',shared:true,sharedWith:'Purdue Fort Wayne · one community with IU Fort Wayne',isOpen:false},{id:'purdue-west-lafayette',name:'Purdue West Lafayette',shortName:'West Lafayette',city:'West Lafayette',shared:false,sharedWith:null,isOpen:false},{id:'purdue-northwest',name:'Purdue Northwest',shortName:'Northwest',city:'Hammond / Westville',shared:false,sharedWith:null,isOpen:false}]}}` on a fresh load, then Edit. Expect options `Indianapolis`, `Fort Wayne — not open yet`, `West Lafayette — not open yet`, `Northwest — not open yet`; the Purdue sub-line; first majors optgroup `Engineering`. Screenshot.
  5. **No campus yet.** The same override with `currentCampusId:null` → the first option is a disabled, selected `Pick your campus`.
  6. **Unverified.** `{ok:true,system:null,campuses:[],preselect:null,currentCampusId:null}` → no select, and the text `Verify your school email to pick your campus.`
  7. **Route down.** `__ov['/api/campuses']={status:500,body:{ok:false,code:'request_failed',error:'Request failed'}}` → no select and no `Not set`; the badge text only; the major is free text. Leave edit mode, drop the override, re-enter: the picker appears (retry).
  8. **Cooldown.** `__ov['/api/me/profile-bootstrap']={body:{ok:true,campusChangeAvailableAt:'2026-10-15T16:00:00Z'}}` before the first Edit → select disabled, note `You can change your campus again on October 15.` Screenshot.
  9. **Rejected campus.** `__ov['/api/me/profile-sync']={method:'POST',body:{ok:true,profile:null,campusError:{status:400,code:'campus_not_in_system',error:"That campus isn't part of your university."}}}`, then pick Fort Wayne → the error toast with that text, and the select back on Indianapolis.
- **Fake events** (`/html/profile.html?app=1`, or `/messages` for B20's twin): run `localStorage.setItem('vibe_cal_events_v1', JSON.stringify({"2026-09-20":[{"name":"IU Hackathon 2025","time":"09:00","location":"Assembly Hall","notes":"","color":"#FF5C35"},{"name":"Study group","time":"18:00","location":"Library","notes":"","color":"#FF5C35"}],"2026-09-22":[{"name":"Weekly Design Critique","time":"19:00","location":"Luddy Hall 1106","notes":"","color":"#7C5CFC"}]}))` and reload. The calendar shows only "Study group", and the stored JSON is `{"2026-09-20":[{…"Study group"…}]}` (the 09-22 key is gone). A second reload writes nothing new.
- **Search.** A real GET for `sae` in the profile search shows the meta `1 member · Invite only` (H1 live; add ` · Verified` only if SAE is verified). Under `__ov['/api/search']` returning `{ok:true,users:[],events:[],orgs:[{id:'x',handle:'x',name:'X',member_count:12,verified:false}]}` (no policy fields; the page needs one of the three arrays, :6354), the meta is exactly `12 members`.
- **Post-edit sync, with no PATCH.** On own `/profile`, with the blocker installed, take the id of a post that shows in both Posts and All:
  - run `window.dispatchEvent(new CustomEvent('vibe:post-edited',{detail:{id:'<id>',content:'<img src=x onerror=alert(1)> fixed #fresh',tags:['fresh'],edited_at:new Date().toISOString()}}))`
  - the Posts card and the All clone show the literal `<img …>` text, the chip `#fresh` and ` · Edited` in the date; no alert fires
  - the image or video under the text is still there (for a media post)
  - dispatching again doesn't double ` · Edited`
  - with that post pinned, the pinned slot shows the new text
  - `__nonGet` stays empty (no profile-sync from the pin path)
  Reload afterwards: `/api/me/posts` repaints the real text; the dispatch touched only this browser's `vibe_posts_v1`.
- **With E6 on the same build.** Open the post in the viewer, ⋯ → Edit post, and save under `__ov['/api/posts/']={method:'PATCH',body:{ok:true,post:{id:'<id>',content:'edited in viewer #x',tags:['x'],edited_at:'2026-09-20T12:00:00Z'}}}`. Close the viewer: the card and the clone already read "edited in viewer", with `#x` and ` · Edited`, and there was no reload.
- **Reload (Franky's own real edit, or a GET override of `/api/me/posts` adding `edited_at` to one row):** the card date reads `… · Edited`. A visited profile (`/profile/<handle>`) shows the same through `/api/users/[handle]/posts`.

**Do not touch:**
- `public/html/_postViewer.js` (E6), `public/html/messages.html` (B20)
- `public/html/_persistence.js`, `public/html/_iu-majors.js` (generated; `majors.test.ts` guards it), `public/html/onboarding.html` (the shipped `ac014a3` picker)
- `src/app/profile/profile-html-bridge.tsx`, `src/app/api/campuses/route.ts`, `src/app/api/me/profile-sync/route.ts`, `src/app/api/me/profile-bootstrap/route.ts`, `src/app/api/search/route.ts` (H1)
- the `IU_CAMPUSES` / `campusByLabel` shims in `src/lib/iu/campuses.ts`
- in `profile.html`:
  - `deleteProfilePost` (:8761) and the owner card ×
  - `_profilePrefillFromCard` (:5768)
  - the composer's `_extractHashtags` (:5895). Its Unicode `#tag` rule differs from the server's ASCII rule, so a non-ASCII tag changes on its first edit (0 live rows); that's a follow-up, not this batch.
  - the calendar render functions (their unescaped `e.name` in the modal pills, :6818-6821, is self-only localStorage and out of scope)

---
