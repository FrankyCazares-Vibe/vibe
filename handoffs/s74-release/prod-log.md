# Production log, S74 (Oct 4, 2026)

Every read and write on production today, in order. Reads follow the counts-only rule (structure, fingerprints, counts, settings; nobody's records).

## Pre-check reads (read-only connector, project rqopjkimxbjkwdkpkbfq), about 10:20

| Check | Expected | Got |
|---|---|---|
| `app_settings`, `signup_allowlist`, `waitlist` tables | three nulls | three nulls |
| `hook_waitlist_gate(jsonb)`, schema `auth_hooks`, `signup_is_open()` | nulls | nulls |
| newest migration row / row count | 20261001120000 / 97 | 20261001120000 / 97 |
| `handle_new_user()` md5 | cb3e3ae40a7d2fcc7897d31fa9f8be66 | same |
| triggers on `auth.users` | on_auth_user_created | same |
| search_path | "$user", public | same |
| `email_sends_kind_check` md5 | 1ff55ca8584f10a7f97dc6b643680272 | same |
| `moderation_actions_action_check` md5 | e30d12ff2a5602dbddd78d9634efd09a | same |
| `moderation_actions_target_type_check` md5 | dbb1ba407960c58e045f56391b5262fa | same |
| `chat_message_pins`, `chat_pins_drop_removed()` | nulls | nulls |
| triggers on `messages` | bump_org_activity_on_message, messages_check_media_ref | same |
| triggers on `channels` | chat_channels_fill_kind, chat_channels_subscribe | same |
| `messages.removed_at` type | timestamp with time zone | same |
| `channels.post_policy` exists | false | false |
| `can_post_org_channel` md5 | 8d8be860d3f7077b9d6f9238705bdca7 | same |
| `chat_cast_vote` md5 | a8f2efe48f8c892b609a188deb132551 | same |
| `can_view_org_channel` md5 | 747ee06d2e4c3e8a788129f7530ec0ae | same |

All match. Nothing written yet.

## More reads, about 10:25 and 12:00 (read-only connector, counts and settings only)

| Check | Got |
|---|---|
| `channels`: anon / authenticated may insert, update; row security on | f, f, on / f, f, on (as the who-can-post file expects) |
| accounts in `public.users` | 20 |
| accounts with Vibe+ today (`entitlements`, the app's own rule) | 1 |

Franky said in chat at about 10:19 that `CRON_SECRET` is set on Vercel Production ("should be good now"). To be proven after the deploy: the cron Run answers 200.

## October 5: go-live writes (Management API, release commit 50b60d2ed937d64be42c856e80c9c39fc7b2d448)

Gate on that exact commit: typecheck 0, 2,174 of 2,174 tests, build exit 0, waitlist end-to-end all cases, policy page = text (1,087 of 1,087 sentences).
Pre-checks re-read at 12:15: every value as on October 4 (accounts 21, was 20).

| Time (EDT) | Step | Answer |
|---|---|---|
| ~12:20 | file 1 `20261003100000_waitlist` + row | `[]`, `[]` |
| ~12:20 | `signup_open` set to true | `true`; `signup_is_open()` = true; waitlist 0 rows; 98 rows |
| ~12:21 | files 2 to 8 (`110000` gate, `120000` hardening, `130000` code scrub, `140000` retention, `150000` retention fixes, `160000` line, `170000` margin), each with its row | all `[]` (file 4 was accepted) |
| ~12:22 | `waitlist_email_viewers` = Franky's account id (checked that the id exists) | 1 viewer |
| ~12:22 | post-check (read-only connector) | switch true; 105 rows, newest 20261003170000; hook function exists; `auth_hooks` usage: anon, authenticated, service_role false, supabase_auth_admin true; `signup_is_open` executable by anon, authenticated, service_role; 0 standing-rule violations; triggers on auth.users: on_auth_user_created, waitlist_scrub_access_code; on auth.identities: waitlist_scrub_access_code |

Note: the read-only connector's own role (`supabase_read_only_user`) may not call `signup_is_open()` (permission denied, a normal error, database fine). Read the setting row instead.
| 12:22 | `git push origin main` c71e9a4..50b60d2 | Vercel Production deploy 6864262363: success at 12:24 |
| 12:24 | served build | new CSS (`vln-sky`); landing "Sign up" while open; `/waitlist` 307 to sign-up; `/legal/privacy` "Effective October 5, 2026" with `id="waitlist"`; `/api/cron/waitlist-purge` 401 without the secret (not 308) |
| 12:25 | hook ON (`PATCH config/auth`: `hook_before_user_created_enabled` true, uri `pg-functions://postgres/auth_hooks/hook_waitlist_gate`) | re-read: on; anonymous sign-in off, autoconfirm off, CAPTCHA off, `disable_signup` false |
| 12:25 | gate decision while OPEN, called directly with a made-up address and no code (creates nothing) | allow; auth.users 21 |
| 12:25 | **`signup_open` set to false** | `false` |
| 12:25 | gate decisions while CLOSED (same direct call) | no code: `access_code_required`, http 403; unknown code: `access_code_invalid`; auth.users still 21; waitlist 0 rows |
| 12:25 | live site | landing "Join the waitlist" x5, no "Sign up"; `/waitlist` 200 with the form and the new notice; `/auth/signup` shows the Access code field (looked at 375px) |

Not done by the session: a real sign-up attempt on production (the session does not create accounts on the live site). Franky's live test covers it.
| 12:27 | pins file `20261004100000_chat_message_pins` + row | `[]`, `[]`; after-apply: row security on, 0 policies, ACL postgres + service_role only, trigger text as the header says, eight `false` for anon and authenticated, 0 pins |
| 12:28 | who-can-post pre-checks (all six items) | not applied (f, 0); three fingerprints as expected; `org_channel_members` exists; the self-test club is a hidden test club; triggers on the eight tables exactly as listed; ACL `authenticated=rdDxtm`, no anon, no PUBLIC; no UPDATE policy; anon and authenticated cannot insert or update; row security on |
| 12:28 | who-can-post file `20261004110000_chat_room_post_policy` + row | `[]`, `[]`; column `text, not null, 'everyone'`, 2 checks, 0 rooms with another rule; fingerprints now ae485a1f… / 0ba4681e… / 747ee06d…; apply record: behaviour check passed; 107 rows, newest 20261004110000 |
| 12:29 | `chat-v2-after-deploy.sql`, counts only (read-only connector) | 0 findings; 5 clubs, 22 club rooms checked |

All ten database files are on production. Desktop Messages is still OFF (`CHAT_DESKTOP_*` not set on Vercel).
