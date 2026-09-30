# Session 57 §4-2 / §4-3 / §4-4: build spec (phone DM media, requests, quote-replies, previews, profile safety menu, decline)

Every new write goes through `vibeRequest` (`src/lib/feedback/request.ts:120-160`). It never throws, and on failure it toasts either the caller's `failure` line or the mapped line from `src/lib/feedback/failure-copy.ts:88-132`:
- A 401 gets a Sign in action.
- A `terms_required` refusal gets Review Terms.
- A 429 gets a wait line.
- A human-readable 403 or 409 sentence is shown verbatim (`:114-123`).
- A 400 gets the caller's line unless it's in the pass-through list (`:124-128`).

ToastHost sits at z-index 12000 (`src/components/feedback/ToastHost.tsx:41`), above the vaul sheets at 1201 (`MessagesMobile.tsx:147`). So a toast is visible over any drawer.

`MessagesMobile.tsx` imports neither `vibeRequest` nor `toast` today (imports at `:1-5`), so batch B2 adds both. `ProfileMobile.tsx` already imports both (`:14-15`) and `Drawer` (`:6`).

`ConversationView` is also used by CampusMobile for org channels (`CampusMobile.tsx:18, :493`). CampusMobile builds a fake thread entry there with `type:"org"`, `accepted_at: now` and no `is_request` (`CampusMobile.tsx:1670-1682`). Every change below must be a no-op or still correct for that entry.

---

## (a) Phone DM composer: attach a photo or video

### Desktop flow being mirrored (`public/html/messages.html`)
- **File input:** `accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"` (`:1060`).
- **Client checks** (`:2375-2400`): type must be image/* or video/*; at most 15 MB for images and 200 MB for videos (`:2385`).
- **Staged card:** thumbnail, "Photo · N KB" and × (`:2411-2435`).
- **Send** (`__dmSend`, `:2294-2372`):
  1. POST `/api/me/messages-upload-url` with `{channelId, contentType, sizeBytes}` (`:2305-2316`).
  2. PUT the file to `uploadUrl` with a `Content-Type` header (`:2319-2334`).
  3. POST `/api/me/threads/<ch>/messages` with `{content, media_url: objectKey, media_kind: kind, parent_message_id?}` (`:2335-2350`).
  4. Clear the staged file, reload the messages, and clear the reply target (`:2355-2365`).

### Server contract
**1. `POST /api/me/messages-upload-url`** (`src/app/api/me/messages-upload-url/route.ts:43-138`)
- **Returns 503** when R2 isn't configured (`:44-49`).
- **Gates:**
  - 401 when signed out.
  - Rate limit: 20 per 10 minutes per user (`:60-64`).
  - Terms gate (`:66-67`).
  - Needs `channelId`, else 400 (`:76-79`).
  - Membership gate on `channel_members`: 403 "Not a member" (`:81-94`). Org channels have no `channel_members` rows (see the comment at `messages/route.ts:277-279`), so **the upload always 403s in an org channel**.
- **Allowed types**, lowercased with any `;params` stripped (`:96-110`):
  - Images: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
  - Videos: `video/mp4`, `video/quicktime`, `video/webm`.
  - Anything else gets 400 "Unsupported file type (jpg, png, webp, gif, mp4, mov, webm)" (`:17-27`).
- **Size:** `sizeBytes` must be a positive safe integer. Images at most 15 MB, videos at most 200 MB, else 400 "File too large (max 15MB for images)" / "(max 200MB for videos)" (`:14-15`, `:115-124`).
- **Success:** `{ ok:true, uploadUrl, objectKey: "messages/<channelId>/<uuid>.<ext>", kind: "image"|"video" }` (`:126-132`).

**2. The PUT to `uploadUrl`**
- Content-Length is part of the signature, so R2 answers 403 unless the body is exactly `sizeBytes` bytes. The browser sets Content-Length from the File (`src/lib/r2.ts:60-65`).
- Content-Type is not signed; it only sets the stored object's default (`r2.ts:66-68`, `:189-206`).

**3. `POST /api/me/threads/<ch>/messages`** (`src/app/api/me/threads/[id]/messages/route.ts:357-622`)
- **Gates:** rate limit 60 per minute (`:368-369`); Terms gate (`:371-372`).
- **Content:** empty with no media is 400 "Empty message" (`:399-401`); content is capped at 4000 characters (`:18`, `:402-404`).
- **Media fields:** `media_url` must pass `isChannelMessageMediaKey(key, channelId)` (`src/lib/messages/channel-access.ts:113-118`), else 400 "Invalid media key". `media_kind` must be `image` or `video`, else 400 (`:406-425`).
- **Block guard:** 403 "Couldn't send this message" (`:487-516`). That passes as a human sentence, so it's shown verbatim.
- **Success:** `{ ok:true, message }`. The message already has `media_url` rewritten to the members-only proxy `/api/me/threads/<ch>/messages/<id>/media`, plus `parent_preview` (`:614-622`, `channel-access.ts:125-127`).

### Build (all in `src/components/mobile/MessagesMobile.tsx`, ConversationView `:802-1402`)
**New state** (next to `:817-834`):
- `staged: { file: File; kind: "image"|"video"; contentType: string; previewUrl: string } | null`
- `uploading: boolean`
- Revoke `previewUrl` on clear and on unmount.

**Picker**
- Add a hidden `<input type="file">` with desktop's exact `accept` list.
- Add a 40px photo button to the left of the textarea, inside the form (`:1270-1292`).
- Render both only when `thread?.type !== "org"`, because the upload route 403s there.
- Reset `input.value` on click. This is the iOS "same file twice" fix already in ProfileMobile (`ProfileMobile.tsx:1066-1068`).

**On choose**
- Normalise `contentType = file.type.split(";")[0].trim().toLowerCase()`.
- Reject before any network call, with `toast({tone:"error"})` and these lines:
  - Unsupported type: "Photos can be JPG, PNG, WebP or GIF, and videos MP4, MOV or WebM."
  - Too big: "That photo is over 15 MB." / "That video is over 200 MB."
- These checks matter because the server's 400 text isn't in the pass-through list, so it would only show the generic caller line.

**Staged chip**
- Goes above the input bar, like desktop's `compStaged`.
- Shows a thumbnail (`<img>`, or `<video muted playsInline>`), "Photo" or "Video" with the size in KB, and an × with `aria-label` "Remove attachment".
- While uploading, the × is disabled and the chip reads "Sending…".

**`send()`** (`:892-934`)
- Enable Send when `draft.trim() || staged`. The submit button's disabled check at `:1326` and `:1334-1336` must use the same test.
- Path with a staged file. It is **non-optimistic**: nothing is appended until the server answers.
  1. `const sign = await vibeRequest<{uploadUrl:string; objectKey:string; kind:"image"|"video"}>("/api/me/messages-upload-url", { json: { channelId: threadId, contentType, sizeBytes: file.size }, failure: kind==="video" ? "Couldn't upload your video." : "Couldn't upload your photo." })`
  2. `const put = await vibeRequest(sign.data.uploadUrl, { method: "PUT", body: file, headers: { "content-type": contentType }, failure: <same line> })`. R2 answers 2xx with an empty body, which `vibeRequest` reads as `{}`. The default same-origin credentials send no cookies cross-origin.
  3. `const r = await vibeRequest<{message: MessageRow}>(\`/api/me/threads/${enc(threadId)}/messages\`, { json: { content: text, media_url: sign.data.objectKey, media_kind: sign.data.kind, ...(replyTo ? { parent_message_id: replyTo.id } : {}) }, failure: "Couldn't send your message." })`
  4. On success, append `r.data.message`, clear `staged`, `draft` and `replyTo`, and keep the view pinned to the bottom.
  5. On any failure, keep the staged file, draft and reply target. The toast has already said why.
- Text-only path: keep the existing optimistic temp row, but swap the raw `fetch` (`:910-919`) for the same `vibeRequest` call. On failure it already removes the temp row and restores the draft (`:927-928`). Stop setting the error banner (`:1251-1267`), since the toast replaces it; delete the banner if nothing else uses it.
- **Request threads:** a successful send implicitly accepts (server `:551-564`). After it, mark the request resolved locally and call `onThreadsChanged?.()`, mirroring desktop `:2353-2354` (see (b)).

---

## (b) Accept / Decline on phone message requests

### Where the request state lives in MessagesMobile
- The `requests` state is set from `GET /api/me/threads` → `j.requests` (`:229`, `:270-285`).
- The Requests tab pill shows the count as its badge (`:449-454`), and the list switch is at `:340-343`.
- Tapping a row opens `ConversationView` with `thread = threads?.find(...) ?? requests?.find(...)` (`:484-497`).
- `ThreadEntry` (`:48-70`) has `accepted_at` but **not** `is_request`, even though the server sends it (`src/app/api/me/threads/route.ts:55`, `:602`, `:609`).
- The conversation header (`:1034-1178`) and the input bar have no request affordance at all.

### Desktop being mirrored
- The request bar (`messages.html:1052`) shows when `d.isRequest`, with the text "<name> sent you a message request. You haven't connected yet — accept or decline." (`:2261-2267`).
- `__dmReqBarBusy` disables both buttons while a request is in flight (`:2444-2447`).
- **Accept** is `vibeRequest(".../accept", {method:"POST", failure:"Couldn't accept this request."})`. On ok, desktop sets `isRequest = false`, hides the bar and reloads the list (`:2449-2462`).
- **Decline** is `vibeRequest(".../decline", {method:"POST", failure:"Couldn't decline this request."})`. On ok, desktop drops the thread, closes the view and reloads the list (`:2464-2482`).
- Desktop shows no confirm dialog for either.

### Server contract
- **`POST /api/me/threads/<id>/accept`** (`accept/route.ts:8-48`):
  - 401 when signed out; 403 "Not a member"; `{ok:true, already:true}` when already accepted.
  - Otherwise it updates `accepted_at`, which works because of the column grant and the update-own policy. Returns `{ok:true}`.
- **`POST /api/me/threads/<id>/decline`** (`decline/route.ts:12-34`): see (f). **Until F1 is applied it returns `ok:true` without deleting anything.**

### Build (`MessagesMobile.tsx`)
**Types and props**
- Add `is_request?: boolean` to `ThreadEntry` (`:48-70`).
- Add an optional `onThreadsChanged?: () => void` prop to ConversationView (`:802-816`).
  - MessagesMobile passes `() => void refetchThreads()` (`:485-496`).
  - CampusMobile passes nothing.

**Request bar**
- Compute `isRequest = thread?.is_request === true && requestState === "pending"`, where local `requestState` is `"pending" | "accepted" | "declined"`.
- CampusMobile's org entries omit `is_request`, so the bar never shows there.
- Place the bar between the message list (`:1181-1249`) and the input form (`:1270`), like desktop's bar above its composer.
- It carries desktop's sentence with `threadTitle(thread)`, plus two buttons: **Accept** (coral `#FF5C35`) and **Decline** (ghost). A `reqBusy` flag disables both while a request is in flight.

**Accept**
- The `vibeRequest` call above.
- On `r.ok`: set `requestState="accepted"` (the bar disappears) and call `onThreadsChanged?.()`, so the thread moves from Requests to All.
- On failure, the toast says why and the buttons come back.

**Decline**
- First ask `window.confirm("Decline this request? It'll be removed from your inbox.")`. This is the same confirm pattern as Delete conversation (`:1537-1543`); desktop has none, see the open questions.
- Then the `vibeRequest` call above.
- On `r.ok`: call `onThreadsChanged?.()` then `onClose()`.
- On failure, the bar stays.

**Implicit accept on send**
- After any successful send while `isRequest`, set `requestState="accepted"` and call `onThreadsChanged?.()`, because the server already accepted (`messages/route.ts:553-564`).

### Risks
- **Deploy order.** The phone Decline only really works once F1 is live.
  - Before F1, Decline shows success, then the Requests tab repaints the request on the next reload. That's the same as desktop today.
  - After F2 but before F1, Decline shows the honest toast "Couldn't decline this request. Try again."
- **Deep links.** A thread opened by `?channel=` with `thread === null` (`:298-303`) shows no bar. That's acceptable: it's the org-channel path.

---

## (c) Quote-reply stubs, plus a Reply action (desktop has one)

### Server (already shipped)
**GET** rows carry `parent_message_id` and `parent_preview: { id, content: string|null, user_id, author: {id, handle, name, avatar_url}|null } | null`:
- the type is at `messages/route.ts:65-70`
- `hydrateParentPreviews` fills it (`:140-177`)
- defaults are applied at `:206-207`

**POST** accepts `parent_message_id` (`:382-385`):
- It rejects a parent from another channel with 400 "Parent message belongs to a different channel" (`:478-482`).
- An id that doesn't exist, or a non-UUID id (the lookup errors, `:474-476`), is **silently dropped**. The message then sends without a parent.
- The POST response embeds `parent_preview` (`:614-621`).
- The parent's foreign key is `ON DELETE SET NULL` (live constraint `messages_parent_message_id_fkey`). So deleting a parent quietly removes the stub from its replies.

### Desktop being mirrored
- **Stub** (`messages.html:1264-1270`, CSS `.dm-quote` at `:355-357`):
  - A coral left border.
  - "↩ {authorName || 'message'}".
  - The body `(content || '(media)').slice(0,140)`, one line with an ellipsis.
  - Desktop only renders it on plain-text bubbles (`:1384`).
- **Reply action:** "↩ Reply" in the per-message action pill (`:1294`) calls `__dmStartReply` (`:1736-1752`), which sets `replyTo {id, channelId, authorName, content}`.
- **Pill above the composer:** "↩ Replying to X" plus the body and × (`:1759-1781`).
- **Send** adds `parent_message_id` (`:2338-2349`).
- The reply target is cleared on a successful send (`:2361-2364`) and on a channel switch (`:2210-2213`).

### Build (`MessagesMobile.tsx`)
**Type**
- Add to `MessageRow` (`:95-118`): `parent_preview?: { id: string; content: string | null; user_id: string; author: { id: string; handle: string | null; name: string | null; avatar_url: string | null } | null; media_kind?: "image"|"video"|null; attachment_kind?: "post"|"clip"|null } | null`.

**Stub** in `MessageBubble` (`:2946-3567`)
- When `message.parent_preview` is set, render it as the first child of the stacked column (`:3484-3497`), for text, media and card messages alike.
- Author line: "↩ " + (`author.id === meId` ? "You" : `author.name || author.handle || "message"`). Pass `meId` down, or pass an `isParentMine` flag.
- Body: `content?.trim()`, else "Photo" / "Video" / "Shared post" when the C2 fields are present, else "Attachment". One line with an ellipsis; `maxWidth: 260`.
- Colours follow the existing `darkMode` / `isMine` palette (`:3060-3088`).
- No long-press handlers on the stub.

**Reply action**
- Add an optional `onReply` prop to `ReactionPicker` (`:3569-3673`).
- After the emoji buttons, render a thin separator and a "↩ Reply" button (`aria-label="Reply"`) that calls `onReply()` and closes the picker.
- `MessageBubble` gets `onReply`, and ConversationView passes `() => startReply(m)`.
- Hide Reply on optimistic rows (`id.startsWith("temp_")`), because the server would silently drop that parent.

**ConversationView**
- State: `replyTo: { id: string; authorName: string; preview: string } | null`.
- `startReply` sets it and focuses `inputRef` (`:834`).
- Render a reply pill right above the input form (`:1270`): "Replying to {name}", a one-line preview, and × (`aria-label="Cancel reply"`).
- Add `useEffect(() => setReplyTo(null), [threadId])`.
- `send()` adds `parent_message_id: replyTo.id`, and the optimistic temp row carries a `parent_preview` built from `replyTo`, so the stub shows immediately.
- Clear `replyTo` only on a successful send.
- Reply works in org channels too, because the server checks the parent is in the same channel. No gate needed.

### C2 (optional, server batch)
- In `hydrateParentPreviews`, change the select (`messages/route.ts:152-157`) to `"id, content, user_id, media_kind, attachment_kind, author:users!messages_user_id_fkey(id, handle, name, avatar_url)"`.
- Extend `ParentPreview` (`:65-70`) with the two nullable fields.
- The columns exist in production (live check constraints `messages_media_kind_check` and `messages_attachment_kind_check`).
- **Risk:** in production this helper swallows its own error (`:158-163`). A typo in the select would silently remove every stub, so check the stubs live after deploy.

---

## (d) Thread-list preview says "Attachment" for a photo

### Current
- **Server:** `last_message` is selected as `"channel_id, content, created_at, user_id"` (`src/app/api/me/threads/route.ts:493-498`) and stored at `:505-515`. Its type is at `:52`.
- **Phone:** `ThreadRow` shows `content?.trim() || "Attachment"` (`MessagesMobile.tsx:575-579`).
- **Desktop and the static widgets** fall back even worse, to "No messages yet" or an empty line:
  - `messages.html:1911`
  - `_miniMessenger.js:448`
  - `_sharePicker.js:151-152`

### D1: the minimal server change (`threads/route.ts`)
- Select `"channel_id, content, created_at, user_id, media_kind, attachment_kind"` at `:495`.
- In the reducer at `:509-513`, add `media_kind: (m.media_kind as "image"|"video"|null) ?? null` and `attachment_kind: (m.attachment_kind as "post"|"clip"|null) ?? null`.
- Widen the type at `:52` to `{ content; created_at; user_id; media_kind: "image"|"video"|null; attachment_kind: "post"|"clip"|null } | null`.
- The change is additive, so every existing consumer keeps working.
- **Risk:** `lastErr` is swallowed (`:500-503`). A bad column would blank every preview and, worse, make the request guard at `:557-561` hide **every** request, because `last` would be null. Both columns exist in production (constraints above). After deploy, verify one request thread still appears.

### D2: client label (`MessagesMobile.tsx`)
- Widen `ThreadEntry.last_message` (`:54-58`) with both optional fields.
- Change the preview at `:575-579` to: `!lm ? "No messages yet" : lm.content?.trim() || (lm.media_kind === "video" ? "Video" : lm.media_kind === "image" ? "Photo" : lm.attachment_kind === "clip" ? "Shared a clip" : lm.attachment_kind === "post" ? "Shared a post" : "Attachment")`.

### D3 (optional, separate static batch)
- Apply the same fallback in `messages.html:1911`, `_miniMessenger.js:448` and `_sharePicker.js:151-152`.

---

## (e) Phone visitor profile ⋯ safety menu: Block / Mute / Report

### Current
- **Visitor header actions:** the floating group (`ProfileMobile.tsx:1081-1167`). A visitor gets only Search (`:1091-1108`); the owner also gets the pencil and Settings (`:1109-1166`).
- **Blocked either way:** an early return renders `BlockedByTargetView` (`:949-951`).
  - That view has "You blocked X" plus **Unblock**, via `vibeRequest` DELETE `/api/me/block` then `location.reload()` (`:4388-4539`, `:4408-4424`).
  - So a visitor who reaches the normal header has **not** blocked the target, and the menu never needs an Unblock row.
- **The visitor payload carries the target's UUID:** `id: profile.id` (`src/lib/profile/build-vibe-user-v1.ts:88`, built at `src/app/api/users/[handle]/bootstrap/route.ts:176`), plus `_viewerFollowState`, which can be `"self"` (`ProfileMobile.tsx:108-129`).
- **Mounted for phones by** `ProfileHandleSwitch.tsx:117` (`<ProfileMobile targetHandle={handle} />`).

### Desktop being mirrored
- **Menu** (`profile.html:6037-6079`): it fetches the relationship on open (`:6047`), then lists rows in this order:
  - [Unfollow {first}, only if following]
  - Report {first}
  - Mute or Unmute {first}
  - Block or Unblock {first}, in red
- **Shared helpers** (`public/html/_safetyActions.js`):
  - **Block** confirm (`:117`): "Block {name}?\n\nThey won't be able to message you, see your posts, or find you in search. You also won't see their content."
  - **After a block** (`:126-139`): the toast "Blocked {name}", or "Blocked {name} — connection removed" when `removed_connection`; the Connect state resets to none; the menu repaints.
  - **Mute sheet** (`:171-233`): durations 1 hour / 8 hours / 24 hours / 7 days / Until I unmute (`:171-177`), with the note "You won't see their posts in your feed or get notifications from them. They won't know." (`:199`).
  - **Report sheet** (`:256-321`):
    - reasons Spam / Harassment or bullying / Sexual content / Hate speech / Self-harm or violence / Other, sending `spam`, `harassment`, `sexual`, `hate`, `self_harm` and `other` (`:256-263`)
    - the note "Reports go to admins only. The person you're reporting won't see this." (`:275`)
    - an optional textarea capped at 1000 characters (`:277`); Submit is disabled until a reason is picked (`:281`, `:292`)
    - `vibeRequest` with failure "Couldn't send your report." (`:297-306`); on failure the sheet stays open with the choice kept (`:307-313`)
    - success toast "Report submitted. Thanks for telling us." (`:314`)

### Endpoints (all exist)
- **`GET /api/me/relationships?with=<uuid|handle>`** → `{ok, blocking, muting, mute_until}`; 401 when signed out, 404 when the user doesn't exist (`relationships/route.ts:15-85`).
- **`POST /api/me/block {target_id: <uuid>}`** → `{ok, removed_connection}`, or `{ok, already:true}` if already blocked (`block/route.ts:112-200`).
  - 400 "Invalid target_id" when it isn't a UUID (`:81-83`); 400 "Cannot block yourself" (`:133-135`).
  - Side effects: it deletes follow edges in both directions (`:150-168`) and sets `hidden_at` on the shared DM (`:170-197`).
  - No rate limit and no Terms gate. DELETE with the same body unblocks (`:203-274`).
- **`POST /api/me/mute {target_id, duration_hours: 1|8|24|168|null}`** → `{ok, until}` (`mute/route.ts:12`, `:41-90`); `DELETE {target_id}` → `{ok}` (`:92-126`).
- **`POST /api/me/reports {target_type:"user", target_id:<uuid>, reason_code, reason}`** → `{ok}` (`reports/route.ts:30-82`).
  - Rate limit 10 per hour (`:40-41`) and a Terms gate (`:43-44`).
  - Database: `target_id` is a uuid column, `target_type` and `reason_code` are check-constrained, and `reason` is at most 1000 characters (live constraints).
  - The live INSERT policy is `auth.uid() = reporter_id`.

### Build (`ProfileMobile.tsx`)
**E1: ⋯ button and sheet**
- In the floating group (`:1091-1108`), when `isVisitor && user.id && user._viewerFollowState !== "self"`, add a button with `floatingActionStyle` (`:4629-4644`), `aria-label="More options for {name}"` and a three-dot SVG (copy `MessagesMobile.tsx:1172-1176`).
- It opens a vaul `Drawer`, styled like MessagesMobile's sheets (`:130-171`).
- On open, fetch the relationship quietly: `vibeRequest<{blocking:boolean; muting:boolean; mute_until:string|null}>("/api/me/relationships?with=" + encodeURIComponent(user.id), { failure: "Couldn't check your mute setting.", quiet: true })`.
  - If it fails, still show the menu, with a Mute row and a small grey line showing `r.message`.
- Rows: **Report {first}**, **Mute {first}…** or **Unmute {first}**, **Block {first}** (danger), **Cancel**.

**E2: Report**
- Opens a nested `Drawer.NestedRoot`, the same pattern as MessagesMobile's `MuteDurationSheet` (`:1806`).
- Six reason rows (tap to select), a textarea with `maxLength={1000}`, and desktop's note.
- Submit is disabled until a reason is picked and reads "Sending…" while in flight.
- Call: `vibeRequest("/api/me/reports", { json: { target_type: "user", target_id: user.id, reason_code, reason: note.trim() }, failure: "Couldn't send your report.", success: "Report submitted. Thanks for telling us." })`.
- On ok, close both sheets. On failure, keep the sheet with the reason and note so Submit can be pressed again.

**E3: Mute**
- A nested sheet with desktop's 5 durations and note.
- Mute: `vibeRequest("/api/me/mute", { json: { target_id: user.id, duration_hours: hours ?? null }, failure: \`Couldn't mute ${first}.\`, success: hours ? \`Muted for ${label}\` : \`Muted ${first}\` })`.
- Unmute: `vibeRequest("/api/me/mute", { method: "DELETE", json: { target_id: user.id }, failure: \`Couldn't unmute ${first}.\`, success: \`Unmuted ${first}\` })`.
- On ok, update the local `muting` state.

**E4: Block, and what happens after**
- Ask `window.confirm` with desktop's exact text (but see the open question about its truthfulness).
- Then `vibeRequest<{removed_connection?: boolean; already?: boolean}>("/api/me/block", { json: { target_id: user.id }, failure: \`Couldn't block ${first}.\` })`.
- On ok:
  1. `toast(r.data.removed_connection ? \`Blocked ${name} — connection removed\` : \`Blocked ${name}\`)`
  2. close the sheets
  3. `setFollowState("none")`
  4. `setUser(u => u ? { ...u, _viewerHasBlocked: true } : u)`. The early return at `:949-951` then renders `BlockedByTargetView` ("You blocked X" plus Unblock) **without a reload**. A reload would wipe the module-level toast.
- On failure, the toast explains and the profile stays as it is.

### Risks and gaps (app-store relevant)
- **Mute is currently a no-op everywhere.**
  - Nothing outside `mute/route.ts` and `relationships/route.ts` reads `mutes`. My grep for `mutes`, `muter_id` and `muted_id` found only the separate per-channel member-mute route.
  - The database function `is_muting_now` is referenced only in its own migration (`20260506100000:126`) and a revoke (`20260903100000:255`).
  - The feed (`src/app/api/feed/route.ts`, imports `:1-6`) and notifications (`src/app/api/me/notifications/route.ts`, imports `:1-4`) read neither `mutes` nor `blocks`, and no `src/lib` helper reads them either.
  - So desktop's Mute copy is false today, and the phone would repeat it.
- **Block hides:** DMs (`threads/route.ts:517-550`), sends (`messages/route.ts:487-516`), search, suggestions, follow, the visitor bootstrap, `users/[handle]/posts` and the resume proxy (grep list). **It does not hide:** the campus feed or notifications. An app reviewer who blocks someone and then scrolls the feed will still see that person's posts.
- **Block's follow teardown is half-done.** It deletes both directions, but the live `connections` DELETE policy is `connections_delete_follower` (`auth.uid() = follower_id`), so the edge where the target follows the viewer silently survives. This predates these batches and is out of their scope.
- **Signed-out visitors** can load `/profile/<handle>` (bootstrap handles `viewer = null`, `:153`, `:180`). Their taps get the 401 "Sign in" toast, which is acceptable.

---

## (f) Decline: server check, and the migration

### Measured (read-only SQL on production, 2026-09-11)
- **`pg_policies`, `public.channel_members`:** only `channel_members_select_member` (SELECT, `is_channel_member(channel_id)`) and `channel_members_update_own` (UPDATE, `auth.uid() = user_id` for both checks). **No INSERT and no DELETE policy.**
- **`pg_class`:** `relrowsecurity = true`, `relforcerowsecurity = false`, `relacl = {postgres=arwdDxtm, authenticated=rdDxtm, service_role=arwdDxtm}`. So `authenticated` has table-level SELECT and DELETE, and no INSERT or UPDATE.
- **Column ACLs:** `authenticated=w` on `accepted_at`, `last_read_at`, `hidden_at`, `pinned_at`, `typing_until`, `muted_until` and `cleared_at`. This matches `supabase/migrations/20260903110000_channel_members_column_grants.sql`.
- **`pg_roles`:** `authenticated.rolbypassrls = false`; `service_role.rolbypassrls = true`.
- **Helper:** `is_channel_member(cid)` is SECURITY DEFINER and checks that a row exists for `auth.uid()`.
- **Pending rows:** 0 pending `channel_members` rows out of 25 total, so there's nothing live to decline right now.

### Verdict
- The decline route (`decline/route.ts:23-27`) runs `delete()` on the signed-in client.
  - DELETE is granted, but row security has no DELETE policy. Postgres applies default-deny, so **0 rows are deleted and no error comes back**. The route then returns `{ok:true}` (`:29-33`).
- Desktop reads `ok`, drops the thread, then calls `__dmLoadList()` (`messages.html:2473-2481`). The server still has the pending row with an inbound last message, so the request repaints (`threads/route.ts:557-561`, `:609`).
- **The student sees no error, and the request comes back.** It works less than it appears to, and it never errors.
- Accept works (column grant plus the update-own policy). Leave or kick uses the service client (`members/[userId]/route.ts:44`, `:60-64`), so it's unaffected.
- Caveat: the `SET ROLE authenticated` plus EXPLAIN was refused ("permission denied to set role"). This verdict therefore rests on the catalog and on Postgres row-security semantics, not on an executed statement. It matches S54's finding (`handoffs/2026-09-07-broken-features-report.md:53-61`).

### F1: migration (do not apply from this task)
File: `supabase/migrations/20260911100000_channel_members_delete_own_pending.sql`

```sql
-- Session 58: declining a message request removes the viewer's own,
-- still-pending membership row (src/app/api/me/threads/[id]/decline).
-- channel_members has RLS on and `authenticated` holds DELETE, but no
-- DELETE policy ever existed, so the route's delete matched zero rows,
-- returned no error, answered ok:true, and the request came straight back
-- (S54 broken-features report #3; re-verified live 2026-09-11).
-- Scoped to rows still pending: an accepted conversation is hidden with
-- Delete conversation (hidden_at) or left with Leave group (service role),
-- never deleted through this door. No GRANT change: DELETE is already
-- granted to authenticated.
DROP POLICY IF EXISTS "channel_members_delete_own_pending" ON public.channel_members;
CREATE POLICY "channel_members_delete_own_pending"
  ON public.channel_members FOR DELETE TO authenticated
  USING (auth.uid () = user_id AND accepted_at IS NULL);
```

Record it the house way: the management API via curl, plus a `schema_migrations` row. The last 6 rows each hold one statement (measured).

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260911100000', 'channel_members_delete_own_pending', ARRAY[$m$DROP POLICY IF EXISTS "channel_members_delete_own_pending" ON public.channel_members; CREATE POLICY "channel_members_delete_own_pending" ON public.channel_members FOR DELETE TO authenticated USING (auth.uid () = user_id AND accepted_at IS NULL);$m$]);
```

What the new policy allows: a user can remove only themselves, and only from a thread they haven't accepted. The worst case is leaving a request unanswered, which is exactly what Decline means.

### F2: route (`decline/route.ts`)
Make the delete prove itself:

```ts
const { data: removed, error } = await supabase
  .from("channel_members").delete()
  .eq("channel_id", channelId).eq("user_id", user.id)
  .is("accepted_at", null)
  .select("channel_id");
if (error) { console.error("[threads.decline]", error); return 500 "Request failed"; }
if (!removed?.length) {
  const { data: row } = await supabase.from("channel_members").select("accepted_at")
    .eq("channel_id", channelId).eq("user_id", user.id).maybeSingle();
  if (!row) return NextResponse.json({ ok: true, already: true });      // double tap / already declined
  if (row.accepted_at) return 409 { ok:false, error: "You already accepted this conversation." };
  console.error("[threads.decline] pending row survived delete");      // policy missing: fail loudly
  return 500 { ok:false, error: "Request failed" };
}
return NextResponse.json({ ok: true });
```

- The 409 text passes the human-sentence rule, so it's shown verbatim (`failure-copy.ts:123`).
- DELETE…RETURNING also runs the SELECT policy against the row. `is_channel_member` is true for your own row at scan time. This is reasoned, not run; if it were wrong, the result would be a loud 500, never a false ok.

### Deploy order
1. **Apply F1 first.** The current route then genuinely deletes pending rows. Accepted rows still delete nothing, same as today.
2. **Then ship F2, B2 and B3.** If F2 ships before F1, Decline becomes an honest "Couldn't decline this request. Try again." until F1 lands.

### What changes for the sender once decline works
- The sender's DM loses its only other member, so `peer` becomes null (`threads/route.ts:540`, `:581-583`).
  - On a phone it's titled "Direct message" (`MessagesMobile.tsx:201`); on desktop the name is blank.
- The sender's further messages go nowhere.
- Messaging the decliner again from their profile creates a brand-new request, because `findExistingDm` finds no row for the target (`threads/route.ts:114-126`).
- See the open questions.

---

## Batches (one file per batch)
- **B1 (server-dm):** the new migration file, `src/app/api/me/threads/[id]/decline/route.ts`, `src/app/api/me/threads/route.ts` and `src/app/api/me/threads/[id]/messages/route.ts`. Items F1, F2, D1, C2.
- **B2 (messages-mobile):** `src/components/mobile/MessagesMobile.tsx`. Items A1, A2, B1, C1, D2. It works before B1 lands: labels fall back to "Attachment", and Decline behaves as described under deploy order.
- **B3 (profile-mobile-safety):** `src/components/mobile/ProfileMobile.tsx`. Items E1–E4. Independent of the other batches.
- **B4 (optional, desktop-preview):** `public/html/messages.html`, `public/html/_miniMessenger.js` and `public/html/_sharePicker.js`. Item D3. Needs D1 first.

## Live verification (next session)
- **Phone attach:**
  - A 5 MB JPEG, a HEIC from the iPhone camera roll (does iOS hand over `image/jpeg`?), a >200 MB video (the client toast), and a MOV.
  - Simulate refusals on each of the three steps with the per-route fetch override.
- **Request round trip:** a second account DMs you, you Decline, you hard-refresh. The request must not come back, and you should get no toast. This needs F1.
- **Reply:** reply to a photo, then check the stub on both phone and desktop.
- **Preview:** a photo-only message reads "Photo" in the list, and one request thread still appears (the D1 guard).
- **Safety menu:**
  - Report (a `terms_required` simulation shows Review Terms).
  - Mute then Unmute.
  - Block, landing on BlockedByTargetView with the toast still visible, then Unblock.