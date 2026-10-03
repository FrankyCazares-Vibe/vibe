# Privacy Policy v2: what changed after the checks

2026-10-03, for Franky. Six checkers re-opened the code behind 358 sentences. 79 did not hold, 4 of them flatly wrong. Publish `privacy-policy-publish.md` (about 5,990 words on screen). `privacy-policy-v2.md` is the same text with brackets.

## 1. What was wrong, most important first

1. **Your posts are public.** The draft said they were not. Signed-out visitors can read every post you made as yourself.
2. **Error reports.** A failed server request can carry the sign-in cookie to Sentry. 3d now says such a report can identify your account.
3. **A deleted message's file.** "No link to it can be made" was false. Section 8 now says only that the file stays.
4. **Sign-up order.** The checkbox at sign-up is the acceptance. There is no later step.
5. **Views.** A post counts after about a second on screen in the feed. A Vibe+ owner sees when, not only who.
6. **Starter name.** Anyone with the profile link can read it.
7. **Blocks.** The blocked person is told the account restricted them. A one-to-one chat leaves both inboxes.
8. **Who sees what.** Added: view and save totals, an open club's members on the Map, who RSVP'd in an event chat.
9. **Deletion** also takes other people's comments, likes and poll votes, and misses more files than the draft said.
10. **Sign out** reaches other devices within about an hour.
11. **Waitlist.** "Whatever happens" is gone. Added: cofounders see the handle you made, a reply shows your full address, and joining is not agreeing to the policy.
12. **Reading messages.** A fourth case (when you ask), and a line that people keep this rule, not a system.
13. **New:** AI coding tools can pass database records to their provider.
14. **Taken out:** the cofounder's name, the Outlook address, cookie details, "no two-factor for the admin accounts", "no password asked", the unchecked ban code, every "from our database" phrase.

## 2. Left out on purpose: fix in code

1. Error reports carry the sign-in cookie: `src/lib/sentry-config.ts`.
2. The verify step reveals whether a school email is taken or banned: `src/app/api/auth/school-email/request/route.ts`.
3. A ban's second scrambled code is never checked, and the one-account check has a row cap: `src/lib/moderation/access.ts`.
4. Club chat blocks are screen-only: a new migration after `supabase/migrations/20261001100000_chat_v2_rooms.sql`.
5. Chat members can read each other's read and mute state: a new migration on `channel_members`.
6. Any signed-in account can read last-active times: a new migration after `supabase/migrations/20260903100000_security_hardening.sql`.
7. A deleted message's file can be re-attached: `src/app/api/me/threads/[id]/messages/route.ts`.
8. Deleting an account asks for no password: `src/app/api/me/route.ts`.
9. Admin search puts an email in the web address: `src/app/admin/users-client.tsx`.
10. A block does not stop reactions: `src/app/api/me/threads/[id]/messages/[messageId]/react/route.ts`.
11. Anyone can re-send your waitlist form: `src/lib/waitlist/store.ts`.
12. The starter name comes from the sign-in email: `supabase/migrations/20261003120000_waitlist_hardening.sql`.
13. Page scripts can read the sign-in cookie: `next.config.ts`.

Fixes 1, 4, 5, 6 and 12 each let a sentence leave the policy.

## 3. Still resting on a person or a dashboard

- All three moderate, and one cofounder holds the logins: Franky.
- No backups, "Confirm email" on, "about an hour": Franky, in Supabase.
- The daily waitlist clean-up runs: Franky, the CRON_SECRET in Vercel.
- What a server error report holds: Franky, one event in Sentry.
- Which AI tools read the live database: Franky.
- Where hello@ and help@ land: Franky or James.
- How long providers keep logs: each provider's documents.
- What people do (four cases for messages, 24 hours, 30 days, 90 days, hand deletion, police or NCMEC, sale notice): all three cofounders.

## 4. Pages that now contradict the policy

- `src/app/legal/delete-account/page.tsx` lines 159, 198, 237: "erased from storage", "up to a year", "routine backups".
- `src/app/legal/terms/page.tsx` lines 26, 150: "using the Service, you agree".
- `src/app/legal/community/page.tsx` lines 36, 54: "a real student"; "who did what is yours".
- `src/app/legal/child-safety/page.tsx` line 35: "enrolled".
- `src/app/plus/page.tsx` lines 652, 712: "including from us"; "no seeing who blocked you".
- `src/app/support/page.tsx` line 136: add "while they are signed in".
- `src/components/settings/SettingsClient.tsx` line 1255: "on this browser".
- `src/app/waitlist/waitlist-form.tsx` lines 206 to 216: three providers; "a current student".
- The Terms draft: see `calls-for-franky.md` section 4.
