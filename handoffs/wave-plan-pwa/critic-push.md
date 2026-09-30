# Wave 2′ (push): plan critic

Session 65 · 2026-09-24 · a read-only pass over main `9ba375e`, done before any wave 2′ code. Checked against:
- the LOCAL database, read-only (schema, function bodies, triggers, `schema_migrations`);
- `web-push` 3.6.7, unpacked from the local npm cache into the scratchpad;
- `next` 16.3.4 (`after`) and `@supabase/auth-js` 2.105.1 in node_modules;
- Google's FCM docs (error codes, collapsible messages), fetched 2026-09-24.

Where this file and plan §7 disagree, the RULING below is the contract unless the orchestrator overrules it.

**Real names, so no batch has to guess them.**
- **Messages and chats:** `messages.user_id` is the sender (there is no `sender_id`). `channels.type` is dm, group, org_channel or org_subchannel, plus `channels.org_id` and `channels.is_private`. `channel_members` holds `accepted_at`, `last_read_at`, `hidden_at` and `muted_until`. `channel_member_mutes` is (channel_id, muter_id, muted_user_id, until).
- **People:** `mutes` is (muter_id, muted_id, until); `blocks` is (blocker_id, blocked_id); `connections` is (follower_id, following_id).
- **Clubs:** `orgs` has `join_policy` (open, request or invite), `audience` (both, iu or purdue), `is_public`, `hidden_at`, `handle` and `name`.
- **Restrictions:** `account_restrictions` has `user_id`, `kind`, `starts_at`, `ends_at` and `lifted_at`.
- **Consent:** `users.terms_version`, `terms_accepted_at` and `age_attested_at`, read through `hasRecordedConsent` (src/lib/legal/terms.ts:22). That function also checks `TERMS_VERSION`; the SQL `has_recorded_consent()` does not.
- **Removal and media:** `removed_at` exists on posts, post_comments and messages. `messages.media_kind` is image or video; `messages.attachment_kind` is post or clip.
- **SQL helpers:** all are SECURITY DEFINER and answer truthfully when the caller is service_role: `is_blocked_either_way(viewer_id, other_id)`, `is_muting_now(viewer_id, other_id)`, `user_visible(p_user_id)`, `can_view_org_channel(cid, uid)`, `rate_limit_hit(p_key, p_limit, p_window_seconds)`.
- **TypeScript helpers:** `loadHiddenUsers(client, viewerId)` (src/lib/safety/hidden-users.ts:26), `getActiveRestriction` (src/lib/moderation/access.ts:89), `checkText` (src/lib/moderation/text-filter.ts:145, pure), `rateLimit` (src/lib/rate-limit.ts:25), `requirePlatformAdmin` (src/lib/auth/require-platform-admin.ts:21).

---

1. **2E — BLOCKING — adding the kick to `src/lib/mentions.ts` breaks an existing test.**
   **Evidence:** mentions.ts has only an `import type` line. src/lib/mentions.test.ts:19-26 loads it under `node --test`. Adding a runtime `import { kickPushDrain } from "@/lib/push/dispatch"` makes it unloadable, for two reasons: node can't resolve `@/`, and dispatch is server-only (node_modules/server-only/index.js throws under plain node). On top of that, `after()` throws synchronously outside a request (node_modules/next/dist/server/after/after.js:18).
   **RULING:** 2E does NOT edit mentions.ts. The chat-mention kick is the messages route's own kick. 2E also takes ranged edits in two more files:
   - src/app/api/me/publish-post/route.ts: one `kickPushDrain()` after the awaited insert at :214;
   - src/app/api/posts/[id]/route.ts: one after each of :642 and :690.

   The `notifyOrg` kick stays in src/lib/orgs/membership.ts, which is server-only and imported by no test.

2. **2D/2E — BLOCKING — the enqueue and the drain race each other.**
   **Evidence:** Next runs `after()` callbacks concurrently. AfterContext builds `new PQueue()` (node_modules/next/dist/server/after/after-context.js:32), and p-queue's default is `concurrency: Infinity`. Plan §7 2E says the messages route "calls enqueueMessagePush(...) then kickPushDrain()". If each one schedules its own `after()`, the drain can claim before the outbox rows exist. The DM then waits for some unrelated write and dies at the 30-minute cutoff. There is no cron in the repo.
   **RULING (contract):** `enqueueMessagePush(args: {messageId; channelId; senderId}): void` and `kickPushDrain(): void` follow these rules:
   - They are synchronous, return nothing and never throw.
   - Both return at once when `!pushEnabled()`, with no `after()` and no query. That is production today.
   - Otherwise each wraps its own `after(...)` call in try/catch, because `after()` throws when called outside a request scope. The callback also catches everything.
   - enqueueMessagePush runs ONE callback, in this order: read members → read devices → insert rows with `ON CONFLICT DO NOTHING` → `await drainPushOutbox()`.
   - In the messages route, 2E calls only `enqueueMessagePush` for DM and group channels, with no separate kick. For club channels it calls `kickPushDrain()` only if a mention row was written.
   - Both are called synchronously before the handler returns, never from a promise nobody awaits.
   - A module-level `drainScheduled` flag, cleared when the drain starts, lets several kicks in one request share one drain.

3. **2C/2D — BLOCKING — the FCM contract isn't pinned.**
   **Evidence:** §7 names `toFcm(m, token)` (2D) and "the FCM v1 message body type" (2C), but gives no `sendFcm` signature. FCM's request body is `{"message": {...}}`, so "body type" can mean either the wrapper or the message inside it.
   **RULING:** src/lib/push/types.ts (2C) exports:
   ```ts
   export type FcmMessage = { token: string; notification: { title: string; body: string };
     data: Record<string, string>; android: FcmAndroid; apns: FcmApns }; // the INNER message
   export type PushSendOpts = { ttlSec: number; urgency: "very-low" | "low" | "normal" | "high"; topic?: string };
   ```
   The senders:
   - `sendFcm(message: FcmMessage, opts: PushSendOpts): Promise<SendResult>` wraps the message as `{message}`, sets `android.ttl = "<ttlSec>s"` and sets `apns.headers["apns-expiration"]`.
   - `sendWebPush(device, payload, opts: PushSendOpts)` keeps the §7 signature.
   - Each sender reads its own config (`vapidConfig(process.env)` or `fcmConfig(process.env)`). When that is null it returns `{ok:false, gone:false, retry:false, config:true}`. Neither sender ever throws.
   - 2D's `toFcm(m, token)` returns `FcmMessage`.

4. **2A/2D — MAJOR — some outbox rows never finish, and the claim function's shape is undefined.**
   **Evidence:** §7 claims rows that are "unclaimed, or claimed > 2 min ago and attempts < 3". It doesn't say what happens to a row that reaches 3 attempts, or one past the 30-minute cutoff. Such a row has neither `sent_at` nor `skipped_reason`, so it sits in the pending index forever. Nothing deletes finished rows, and the return shape of `claim_push_outbox` is unspecified.
   **RULING:**
   - **Signature:** `claim_push_outbox(p_limit int) returns setof public.push_outbox`, VOLATILE, SECURITY DEFINER, `set search_path = public`. It must be VOLATILE because PostgREST runs STABLE functions read-only, and the UPDATE would fail.
   - **Refusal:** copied from `rate_limit_hit`: `if current_setting('role', true) in ('anon','authenticated') then raise exception 'not allowed' using errcode = '42501'`.
   - **One call does three things:**
     1. Mark pending rows older than 30 min `skipped_reason = 'stale'`, and rows with attempts ≥ 3 `'gave_up'`.
     2. Claim `least(greatest(p_limit,1),100)` rows ordered by `created_at`, `FOR UPDATE SKIP LOCKED`, setting `claimed_at = now()` and `attempts = attempts + 1`.
     3. When `random() < 0.01`, delete finished rows older than 7 days (the `rate_limit_hit` cleanup pattern).
   - **Pending index:** `where sent_at is null and skipped_reason is null`.
   - **Dispatcher outcomes:**
     - A row is `sent_at` if ANY device accepted it. Never re-send to a device that already succeeded.
     - A row is left for re-claim only when every device answered `retry`.
     - A retry on attempt 3 ends as `'failed'`.
     - There is no retry loop inside a drain: Apple's 429 is per device token.
   - **`skipped_reason`:** no CHECK beyond `~ '^[a-z_]{1,40}$'`; the vocabulary lives in dispatch.ts.

5. **2B — MAJOR (lock-screen privacy) — logout removes one device, but sign-out is global.**
   **Evidence:** src/app/api/auth/logout/route.ts:10-13 calls `supabase.auth.signOut()`. auth-js defaults that to `{ scope: 'global' }` (node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:3176), which ends every session the student has. The plan deletes only `push_address`. So a lab computer or an old phone that is now signed out keeps showing "Name: message text" (the D2 default).
   **RULING:**
   - The logout route calls `getUser()` first. It tolerates an empty or non-JSON body and a GoTrue failure: sign-out never fails because of push.
   - It then deletes EVERY `push_devices` row for that user, then signs out.
   - `push_address` is still accepted, so wave 3′'s client can keep sending it.
   - 2D also skips and deletes devices whose `last_seen_at` is more than 60 days old. The device POST refreshes `last_seen_at`, and wave 3′ re-syncs on every open.

6. **2D — MAJOR (lock-screen privacy) — club-chat @mentions leak private-channel text and name the club.**
   **Evidence:** the messages route picks club mention targets from `org_members` (src/app/api/me/threads/[id]/messages/route.ts:590-597). A private sub-channel (`channels.is_private`) is readable only by its `org_channel_members` and the officers, per `can_view_org_channel`. A member outside that channel gets a mention row today, and with D2 previews its text reaches their lock screen. D2's rule against naming a club covers invites and approvals only.
   **RULING:**
   - For a mention row whose message is in a channel with `org_id` set, 2D calls `can_view_org_channel(channel_id, recipient)` as service role.
   - It skips the row as `no_access` when that returns false or the club is hidden.
   - The push never names the club or the channel: "{Name} mentioned you in a club chat". Text shows only if previews are on. The URL is `/orgs/<handle>`, because /messages lists DMs and groups only.
   - One test decides whether a club may be named: `hidden_at is null and join_policy <> 'invite' and audience = 'both' and is_public`. `org_invite`, `org_request_approved` and club mentions all use it.

7. **2D — MAJOR (lock-screen privacy; for Franky) — a stranger's comment is the same harassment path as a stranger's DM request.**
   **Evidence:** D2 withholds text only for message requests from people the student doesn't follow. But `notify_on_comment_insert` writes a row for ANY comment on the student's post. That includes direct PostgREST inserts, which skip the route's rate limit and word filter (research/critic.md C6). §7's pair limit covers chat only.
   **RULING:**
   - Comment and post-mention pushes carry text only when the recipient follows the actor, i.e. a `connections` row with `follower_id = recipient` and `following_id = actor`.
   - Otherwise the push reads "{Name} commented on your post" or "{Name} mentioned you in a post".
   - The pair limit `push-pair:<actor>:<recipient>` (10 a minute) applies to every kind that has an actor.
   - This is a third D2 exception. Franky confirms or overrules it, as with the other two.

8. **2D — MAJOR — one stranger can buzz a phone 10 times a minute through a message request.**
   **Evidence:** the sender limit is 60 a minute (messages/route.ts:381), and §7 adds a pair limit of 10 a minute and a recipient limit of 20 per 10 min. While a request is pending (the recipient's `channel_members.accepted_at` is null), every message in it pushes.
   **RULING:** while the recipient hasn't accepted, send at most one push per request thread per 6 hours. The limiter is `rateLimit("push-request:<channel>:<recipient>", {limit: 1, windowSec: 21600})`, spent only after every other check passes. The tag is `request:<channel>`.

9. **2D — MAJOR — like and follow bursts still buzz up to 20 times in the store apps.**
   **Evidence:** D1 promises that "a popular post doesn't buzz 40 times". A same-tag replacement is quiet only in our service worker (public/sw.js:161-163, no `renotify`). On Android (`android.notification.tag`) and iOS (`apns-collapse-id`), a replaced notification alerts again, so the only brake is `push:<recipient>`, 20 per 10 min. And `follow:<actor>` never collapses at all: 40 follows after a demo day are 40 different tags.
   **RULING:**
   - Tags are `like:<post>`, `follows` (one per recipient) and `comment:<post>`.
   - For `like` and `follows`, a per-tag limit of one push per 10 min: `push-tag:<recipient>:<tag>`. Later rows end as `throttled`; the in-app row stays.
   - "{Name} and N others liked your post" is optional polish (one head count of unread like rows on that post).

10. **2D — MAJOR — a single recipient budget lets likes and comments crowd out DMs.**
    **Evidence:** §7 has one `push:<recipient>` bucket, 20 per 10 min, shared by every kind. Twenty likes and comments in ten minutes silence the next DM.
    **RULING:**
    - Two buckets:
      - `push:<recipient>:chat`, 30 per 10 min, for DMs, group messages, requests and chat mentions;
      - `push:<recipient>:activity`, 20 per 10 min, for everything else.
    - Spend them last, after every check that doesn't spend anything, and only on attempt 1, so a re-claimed row doesn't pay twice.
    - Fail-open is fine: this is annoyance control, not security.

11. **2D (and public/sw.js) — MAJOR — every DM after the first in a conversation arrives silently in browsers.**
    **Evidence:** the plan tags DMs `dm:<channel>`, and public/sw.js:161-163 replaces a same-tag notification "quietly (no renotify)". That's right for likes and wrong for messages: in Chrome, Edge and Firefox, on desktop and Android, every message after the first in a thread makes no sound, no vibration and no banner.
    **RULING:**
    - payload.ts puts `"renotify": true` inside `notification` for DMs, group messages and requests. WebKit's declarative parser ignores unknown keys inside `notification` (research/critic.md C1).
    - 2D takes a ≤10-line edit to public/sw.js: `if (tag && n.renotify === true) options.renotify = true;`, plus a `SW_VERSION` bump.
    - If the orchestrator won't widen 2D's files, the fallback is a tag per message, `dm:<channel>:<message>`, keeping the Topic per thread.

12. **2D — MAJOR — a phone with both the web app and the store app gets every push twice.**
    **Evidence:** §7 sends to "each of the recipient's devices". D3 moves students from the Home Screen web app to the store apps, so during the switch an iPhone can hold both an `ios-web` row and an `ios-app` row.
    **RULING:** when a recipient has an `ios-app` or `android-app` device seen in the last 30 days, skip their web device on the same system (`ios-web`, `android-web`). This is a per-device skip, not a per-row one. `desktop-web` always gets its push.

13. **2D — MAJOR — "one push per message when a DM and its @mention share it" can't be done by looking for the other row.**
    **Evidence:** the mention row (from the trigger) and the message rows (from the enqueue) are drained by different drains running at the same time (see item 2). A "skip if the other one already went" check either sends twice or skips both.
    **RULING:** make it deterministic. A `mention` row whose message is in a channel with `org_id is null` always ends as `covered_by_message`, without sending. The message push may say "{Name} mentioned you" when the text contains the recipient's @handle (optional). This matches decision 3: a mention doesn't break a chat mute.

14. **2D — MAJOR — cost: roughly 15 round trips per outbox row, plus a badge per row.**
    **Evidence:** per row, §F needs:
    - the source row, its channel and its club;
    - blocks and mutes, then the chat mute and the group mute;
    - two restriction lookups, then consent and otto_settings, then the follow edge;
    - two limiter RPCs;
    - the devices;
    - a badge: unread notifications, channel_members, and latest messages. The threads route alone fetches `channelIds.length * 5` messages (src/app/api/me/threads/route.ts:521).
    - then the final update.

    A group message to 20 people is 19 rows, about 300 queries inside someone's like or DM request.
    **RULING:**
    - **Batch loads.** Per claimed batch of at most 25 rows, load in bulk:
      - the sources, with one `.in()` per table;
      - the recipients' `users` rows (consent and otto_settings), in one query;
      - the restrictions for every actor and recipient, in one query;
      - the devices, in one query.
    - **Per recipient:** memoise `loadHiddenUsers(service, recipientId)` and the badge. Only the limiter RPCs run per push.
    - **Sending:** devices go in parallel (`Promise.allSettled`), with web-push `timeout: 8000` and FCM `AbortSignal.timeout(8000)`. Keep claiming until the queue is empty or 20 s have passed.
    - **Badge:** the count route's own rule (`loadHiddenUsers` plus a head count, src/app/api/me/notifications/count/route.ts) plus unread DM and group threads, in at most 4 queries. If the badge read fails, OMIT `app_badge` and `aps.badge`. Never send null, and never hold back the push.
    - **Duplicate rows:** never call `.single()` or `.maybeSingle()` on notifications by (user, actor, type[, post]). Production holds 29 follow rows over 25 pairs and 8 like rows over 7 (supabase/migrations/20260922120000_t2_notification_writes_and_helper_grants.sql:62-63). Use `.limit(1)`.

15. **2C — MAJOR (public repo / logs) — a web-push error object carries the push endpoint.**
    **Evidence:** web-push 3.6.7 builds `WebPushError(message, statusCode, headers, body, endpoint)` (src/web-push-error.js:3-11). So `console.error("[push]", err)` writes a bearer capability into the Vercel logs.
    **RULING:** senders log only `{status, host, reason}`. For web push, `host` is `new URL(address).host`. For FCM, log the HTTP status and `details[].errorCode`. Never log the error object, the endpoint, the FCM token, a key or the payload.

16. **2C — MAJOR (public repo) — test fixtures are the likeliest way a key gets committed.**
    **Evidence:** send-fcm.test.ts needs an RSA key and a service-account-shaped JSON to exercise the JWT, and config.test.ts needs a VAPID pair. GitHub's secret scanning recognises a GCP service-account JSON by its shape, so even a fake one can block the push that deploys. Every change here is pushed.
    **RULING:**
    - Tests build keys at runtime with `crypto.generateKeyPairSync("rsa", {modulusLength: 2048})` and `("ec", {namedCurve: "prime256v1"})`, and assemble and base64 the JSON in memory.
    - No committed file contains a PEM, a `"type": "service_account"` literal or a `private_key` field.
    - `.env.example` lines stay commented out, with no sample values.
    - `FCM_SERVICE_ACCOUNT_B64` is made with a pipe (`base64 -i <file> | pbcopy`) and never written into the repo folder.
    - The service account holds only the "Firebase Cloud Messaging API Admin" role. Don't use the default firebase-adminsdk account.
    - `/api/health/push` returns booleans only: no project id, no client_email, no key fingerprint.

17. **2C — MAJOR — the FCM error map deletes good tokens and never recovers from an expired OAuth token.**
    **Evidence:** per Google's FCM error-code doc (firebase.google.com/docs/cloud-messaging/error-codes, fetched 2026-09-24):
    - INVALID_ARGUMENT (400) covers invalid tokens AND bad payload fields, TTL and size.
    - Only UNREGISTERED (404) says "Remove this registration token".

    So a payload bug filed under "invalid-token → gone" wipes every app device in one drain. Separately, a 401 caused by our own stale or revoked access token is filed as "config" until the ~55-minute cache expires.
    **RULING:**
    - **Gone (delete the device):**
      - 404 UNREGISTERED;
      - 403 SENDER_ID_MISMATCH (the token belongs to another Firebase project);
      - a 400 whose `google.rpc.BadRequest` field violations name `message.token`.
    - **Other 400s:** `{retry:false, gone:false}`, and count toward `failures`.
    - **401 UNAUTHENTICATED:** drop the cached access token and retry once, in the same call.
    - **401 THIRD_PARTY_AUTH_ERROR** (the APNs key): config.
    - **429, 500 and 503:** retry by re-claim, leaving the row in place.
    - **OAuth token endpoint failures:** config.
    - Pure `classifyFcmError(status, body)` and `classifyWebPushStatus(status)` go in types.ts so they can be tested (see item 19).

18. **2C — MINOR — the VAPID caching rule is backwards, and caching needs a specific call shape.**
    **Evidence:** Apple says "Don't refresh your JWT more frequently than once per hour" (research/web-android-push.md:107). §7 says to cache for "< 1 hour", which means refreshing more often than that. web-push signs a new JWT on every send when `vapidDetails` is passed (src/web-push-lib.js:278-286). A caller's own `Authorization` header survives only with `vapidDetails: null` (:159) and no global `setVapidDetails`.
    **RULING:**
    - Per push-service origin, sign once with `getVapidHeaders(aud, subject, pub, priv, "aes128gcm", now + 12 h)`. Reuse it until 1 h before it expires (module-level cache, per server instance).
    - Send with `sendNotification(sub, payload, {vapidDetails: null, headers: {Authorization}, TTL, urgency, topic, timeout: 8000})`.
    - Never call `webpush.setVapidDetails`.
    - Never also put TTL, Urgency or Topic inside `headers`: web-push throws on duplicates.
    - Always pass TTL, because web-push's default is 4 weeks (:13).

19. **2C — MINOR — send-fcm.test.ts can't load a module that imports server-only.**
    **Evidence:** node_modules/server-only/index.js throws unless it is resolved under "react-server". House rule: node:test runs on pure modules only.
    **RULING:** send-fcm.ts has no `import "server-only"` and no runtime `@/` import. It reads only `process.env` and `node:crypto`, and takes `fetch` and `now` as optional injectables. The alternative is to move `buildAssertion` and `classifyFcmError` into types.ts and test them there. send-webpush.ts keeps `server-only`; its pure status map sits in types.ts.

20. **2B/2C — MAJOR (SSRF) — the validator and web-push parse URLs differently.**
    **Evidence:** web-push sends to `url.parse(endpoint)` — Node's legacy parser (src/web-push-lib.js:274, :348). A validator written with `new URL()` sees the WHATWG host instead. The two disagree on backslashes, `@` and odd characters, which is exactly where SSRF slips through.
    **RULING:** device-address.ts exports `isAllowedWebPushEndpoint(s): boolean`. An endpoint passes only if:
    - it is https and at most 1024 characters;
    - it has no `@`, no `\`, no whitespace or control characters, no userinfo and no explicit port;
    - `new URL(s).href === s`;
    - its hostname is `fcm.googleapis.com`, `updates.push.services.mozilla.com` or `web.push.apple.com`, or ends with `.push.apple.com` or `.notify.windows.com` (matching the suffix WITH its leading dot).

    Keys: decoded with `Buffer.from(x, "base64url")`, `p256dh` must be 65 bytes and `auth` 16, the same test web-push's src/encryption-helper.js runs. FCM token: `^[A-Za-z0-9_:\-]{100,4096}$`. send-webpush.ts runs the endpoint check again before every send, and also checks that `url.parse(s).hostname === new URL(s).hostname`.

21. **2B/2C/2D — MAJOR — `origin` is never defined, and it doubles as the CSRF and Preview guard.**
    **Evidence:**
    - 2A stores `origin`, but nothing says what 2B writes there or what 2D filters on.
    - Preview shares the production database (.env.example:90), so a row registered on a preview origin would get production pushes.
    - The proxy never checks `Origin` on API writes.
    - This write means "send this student's private messages to that endpoint".

    **RULING:**
    - config.ts (2C) adds `pushSiteOrigin(env): string | null`. It returns `PUSH_SITE_ORIGIN` when `VERCEL_ENV === "production"`, `http://localhost:3000` when `NODE_ENV === "development"`, and null otherwise.
    - 2B requires `Content-Type: application/json` and `Origin === pushSiteOrigin()`. Otherwise it answers 403 with `code: "wrong_origin"`. It stores that origin on the row.
    - 2D sends only to devices whose `origin === pushSiteOrigin()`.
    - Payload URLs are built on `pushSiteOrigin()`, so a local tap lands locally. On production that is the same constant as before.

22. **2B — MINOR — gates and refusal codes for the device routes.**
    **Evidence:** `requireNotRestricted` already checks Terms (src/lib/moderation/access.ts:203, "THE TERMS HALF IS EXACTLY requireTermsAccepted"), yet §7 lists both, which reads consent twice. DELETE's gates aren't stated.
    **RULING:**
    - **POST:** getUser → validate → `rateLimit("push-devices:<uid>", {limit: 20, windowSec: 3600})` → `requireNotRestricted` → `pushAllowedFor`. A refusal at that step is 403 `{ok:false, error:"Notifications aren't available yet", code:"push_unavailable"}`. Then upsert: reset `failures`, set `last_seen_at`, keep `created_at`. Keep at most 10 devices per user by deleting the oldest `last_seen_at`. A missing table answers 503 `push_unavailable`.
    - **DELETE:** getUser → validate → rateLimit, and nothing else. No Terms, restriction or allowlist gate: a suspended student, and a student after push is switched off, must still be able to remove a device. A missing table answers `{ok:true}`.

23. **2A — MAJOR — the fail-open trigger can fail forever without anyone noticing, and the file has production traps.**
    **Evidence:** §7 has the trigger swallow its own errors, and the planned acceptance only checks that a like still succeeds. A privilege or `ON CONFLICT` mistake would then mean no push is ever enqueued, silently.
    **RULING:**
    - **Acceptance probes.** The file's LOCAL ACCEPTANCE PROBES prove that an outbox row appears for each writer family, for a recipient with a device, and that none appears for a recipient without one:
      - follow (user client → definer trigger);
      - like (service role);
      - comment (user client);
      - mention and org_invite (service role).
    - **The swallow:** `exception when others then raise warning 'push_outbox enqueue failed: %', sqlstate;` (log SQLSTATE, not SQLERRM).
    - **The file never:**
      - adds a constraint or unique index to `notifications` (production has duplicate follow and like rows; see item 14);
      - backfills the outbox.
    - **The file does:**
      - create indexes on `push_devices(user_id)` (for the trigger's EXISTS) and `push_outbox(recipient_id)` (for the users cascade);
      - add CHECKs: `(transport = 'fcm') = (platform in ('ios-app','android-app'))`, `length(address) <= 4096`, and short lengths on `app_version` and `origin`;
      - skip `new.type = 'connection'` in the trigger.
    - **Pre-flight:** list the existing triggers on notifications and expect none. Hand-made dashboard webhooks are how the `connection` drift happened.
    - **Order and finish:**
      - ROLLBACK drops the trigger, then the functions, then the tables.
      - The body ends with `notify pgrst, 'reload schema'`; otherwise the RPC returns PGRST202 until the schema reloads.
      - The EXECUTE post-check stays at 0: grant `claim_push_outbox` to anon, authenticated and service_role, and refuse inside.

24. **2A — MINOR — how the file is applied.**
    **Evidence:** §7 says `supabase migration up`. The house header (20260922150000_billing_stripe.sql:91-96, rulings H5) uses PSQL plus a manual `schema_migrations` INSERT. The local stack is in sync (75 files, 75 rows, checked 2026-09-24), so either route applies only this file.
    **RULING:** document the PSQL recipe in the header, the house way; either route is fine locally. Gate on version per H2: predecessor 20260923090000 present and this file's own version absent. Never gate on `max(version)`, because 20260922150000 (billing) is still unapplied on production.

25. **2B/2D — MINOR — "tables absent" must also cover the missing RPC.**
    **Evidence:** the code ships before the migration. On a database without the function, `rpc("claim_push_outbox")` fails with PGRST202 or 42883, not 42P01 or PGRST205. The matcher in access.ts is private (access.ts:68-73) and has already been copied once (billing/customers.ts).
    **RULING:** config.ts (2C, pure) exports `isMissingPushSchema(err)`, matching 42P01, PGRST205, PGRST202, 42883 and the "could not find the table/function" message. 2B and 2D both use it, and a missing schema is logged once per server instance, not on every kick.

26. **2D — MINOR — preferences and gates the list misses.**
    **Evidence:**
    - `otto_settings.mention_pings` already exists as the "Ping on mentions" toggle (src/components/otto/OttoSettings.tsx:62), and some students may have turned it off. §7 reads only `push.off`.
    - The allowlist is checked only when a device registers.
    - The hidden-club check covers the club kinds only, not a like or comment on a club's post (`posts.org_id`).

    **RULING:**
    - Mention pushes are off when `push.off` includes "mention" OR `mention_pings === false`.
    - Parse `otto_settings.push` defensively: a non-object means the defaults, and unknown kinds are ignored.
    - Re-check `pushAllowedFor(recipient)` on every row (skip reason `not_allowed`), so narrowing PUSH_ALLOWLIST stops pushes.
    - Skip a like, comment or post mention on a post with `org_id` when that club is hidden.
    - Check consent with `hasRecordedConsent` (TypeScript, version-aware), not the SQL function.

27. **2D — MINOR — payload details.**
    **Evidence:**
    - FCM: "Notification messages are always collapsible and will ignore the collapse_key parameter" (firebase.google.com/docs/cloud-messaging/customize-messages/collapsible-message-types, fetched 2026-09-24).
    - WebKit rejects a declarative message that has an invalid field (research/critic.md C2).

    **RULING:**
    - **Drop `android.collapse_key`.** FCM ignores it for notification messages.
    - **Title and body:**
      - The title is never empty (fallback "Vibe") and at most 60 characters.
      - The body is at most 100 characters, after `checkText`.
      - Omit both `app_badge` keys when the badge is unknown; never send null or a negative number.
    - **TTL and urgency by kind:**
      - chat: 86400 s, `high`;
      - comment, mention and club kinds: 86400 s, `normal`;
      - like and follows: 3600 s, `low`.
    - **Attachments and previews:**
      - A shared post or clip reads "shared a post"; a photo or video reads "sent a photo" or "sent a video". Never the shared post's text.
      - `previews: false` removes all user-written text (message, comment, post text, group name); names stay.
    - **URLs by kind:**
      - post kinds: `/posts/<id>`;
      - follows: `/profile/<handle>`;
      - DM, group and request: `/messages?channel=<id>`;
      - club kinds and club mentions: `/orgs/<handle>`.
    - **Imports:** payload.ts imports only relative, pure modules (`./config`, `../moderation/text-filter`). payload.test.ts registers the ".ts" resolve hook exactly as src/lib/pwa/display-mode.test.ts:9-37 does.

28. **2E — MINOR — where the kicks go.**
    **RULING:**
    - Kick after a successful write only: never after a refused write or a validation error. A no-op success (already liked, already following) may kick; it does no harm.
    - Never `await` a push call, and never put one in the response path.
    - In `notifyOrg`, the kick goes just before the `if (!error) return;` at src/lib/orgs/membership.ts:409, inside that success branch, so a failed insert never kicks.

---

**DEFERRED (no batch may claim these):**
- any real send;
- whether iOS declarative push and Android/iOS native pushes re-alert on a same-tag or `apns-collapse-id` replacement (the basis of items 9 and 11);
- whether Apple actually enforces the one-JWT-per-hour rule;
- FCM delivery and APNs auth to the store apps;
- `after()` timing on Vercel production;
- the SameSite value of the session cookies (item 21's Origin check is defence in depth either way);
- iOS "Show Previews" behaviour for web-app notifications.

**Out of scope for wave 2′, noted for the orchestrator:**
- public/sw.js has no owner in §7. Item 11 assigns it to 2D; otherwise use item 11's fallback.
- Wave 3′ has three follow-ups:
  - make the Otto "Ping on mentions" toggle and the Settings card write the same key (see item 26);
  - the browser-only sign-outs (verify-school, EmailLinkProblem) must hit the DELETE route before `signOut`;
  - the service worker could suppress a push while a focused window already shows that thread.
- src/app/api/me/notifications/count/route.ts:73 still counts the dead `connection` kind. The badge (item 14) must use the same rule as that route, or the two numbers will disagree.
