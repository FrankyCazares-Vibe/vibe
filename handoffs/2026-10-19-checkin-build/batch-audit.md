# Final audit (Oct 19 2026, late): notes

Auditor pass over the whole uncommitted check-in diff. Local stack only.

## Environment
- No dev server was listening on :3000 when this pass began (the "vibe"
  preview had been stopped 9 h earlier). Nothing else was running on the
  port, so I started the project's own `vibe` launch config (`npm run dev`,
  .env.development.local = local Supabase). It is still running for the
  orchestrator's browser pass.
- Batch 0 files equal the contract byte for byte (migration and
  event-checkin.ts).

## Fix 1: the event-chat line under "You're checked in" (campus-home.tsx)
- Seen in the browser at 375 px: the card drew Going / Interested, then the
  check-in slot, then "You'll appear in the event chat." So right after a
  check-in the card read "You're checked in / You'll appear in the event
  chat.", telling the student check-in puts them in the chat. It doesn't
  (D12). The slot now sits after the chat line, still outside the action
  row.
- New test in `src/lib/events/event-checkin.test.ts` pins the order (slot
  after `{EVENT_CHAT_LINE}`, one slot per card).

## Attacks run (all refused as they should be)
- Database over local REST (`scratchpad/audit/rest-attack.mjs`), as anon
  and as blake: `event_checkin_self_as` by POST and GET -> 42501 (also with
  forged `role` headers); read `event_checkin_sessions`, insert into
  `event_checkins` -> 42501; open / door / mark / unmark / clear ->
  `not_manager` (anon 42501); state count null; mine []; GraphQL names no
  check-in object. Service role: self_as answers a word, but it can't read
  `event_checkin_sessions` or `event_checkins` directly.
- Routes on next dev (`live-attack-1.mjs`, `live-attack-2.mjs`, Batch 1's
  `checkin-curl-check.mjs` 22/22): every officer route (door GET/POST/DELETE,
  marks PUT/DELETE, clear, attendees) as anon (401), blake member, casey mod,
  drew non-member (403/404), no code or token in any refusal; check-in stays
  open after their Stop/Clear tries; admin emery sees the same code; forged
  X-Forwarded-Host never moves the QR link; body tricks (number code, both
  fields, array, full-width digits, 5 digits, bad tokens) cost no try;
  `p_user` / `user_id` in the body ignored; A's code and token refused on B;
  old code and token dead after Stop + Start; from-5 floor (4 -> null for a
  student, exact for the owner; 5 -> 5); REST reads give a student only
  their own row, nothing through a users embed; a student's DELETE of
  another's row touches 0; mark refuses a no-RSVP account; signed-out QR
  link -> login with the bare path (no token); blake's door page HTML holds
  no live code; `when=past` shows no count under 5; 21st try of the UTC day
  -> 429 `checkin_too_many_tries`, window_start = UTC midnight.
- Logs: no route log line fired with a code, token or user id. Next dev's
  own request log (and Vercel's, in production) has the URL, so the QR
  token and a marked person's id appear there: Privacy Policy section 6
  already says so.
- Browser at 375 px: signed-out link -> login -> back to the bare page with
  the code box; code "15 35" -> checked in; fresh link -> token gone from the
  address bar, "I'm here" -> checked in; old link -> expired line + code box;
  card sheet; Settings card; door QR decodes (BarcodeDetector) to the right
  link with a 22-character token; attendee split + Clear confirm.
- Privacy Policy checker run against next dev: PASS (1232 sentences, 470
  blocks, 5 tables); report.txt / report.json now name localhost:3000.

## Not changed (outside what I may edit, or a call for Franky)
1. Batch 0 words: `CHECKIN_ERRORS.checkin_too_many_tries` says "Ask someone
   running check-in to mark you as here", but a mark needs a Going or
   Interested RSVP (`not_on_list`), so a walk-in who hits the limit is sent
   to an officer who can't help. Suggested: "Too many tries today. If you
   said Going or Interested, ask someone running check-in to mark you as
   here." (Batches 1 and 3 flagged it too.)
2. D8 "A suspended officer ... can stop" is not true: src/proxy.ts refuses
   every non-GET /api call from a restricted account and allowlists no
   check-in path (D12 keeps the proxy unchanged). Their door read answers
   `restricted`, so no codes show on their screen; check-in stays open until
   another officer stops it or the window ends. Pick: strike "They can stop"
   from D8 (my pick), or allowlist DELETE /api/events/<id>/checkin/door.
   The same proxy rule stops a suspended student removing their own
   check-in (as RSVP DELETE today); deleting the account still removes it.
3. `event_checkin_mine` lists at most 200, so the policy's "you can remove
   any of your check-ins there" fails past 200 check-ins. Far off; noted.
4. Called straight over REST, the officer functions answer `not_found` vs
   `not_manager`, so anyone holding an event id learns whether it exists
   (the routes already hide this with notManagerResponse). Ids are random
   uuids; migration is Batch 0, so noted only.
5. Production pre-check could add `show track_commit_timestamp` (local: off).
   If it were on, Postgres would keep each row's commit time, and the
   policy's "our database does not store the time" would need a second look.

## Final numbers
- `npx tsc --noEmit -p .`: exit 0. `npm test`: 3297 / 3297 (one new test).
- eslint campus-home.tsx: 0 errors, the same 6 old warnings.
- Local SQL check: `event-checkins-check: all 119 cases passed` (ROLLBACK).
- Policy test 8 / 8; checker PASS against next dev.
- Local leftovers: none of my test events, check-ins or sessions remain
  (0/0/0). drew's eventCheckin budget is spent for Oct 19 UTC (the limiter
  test), back at 00:00 UTC. The dev server on :3000 is still up.
