# Email verification fix plan (2026-09-14)

Scope: (A) Supabase account confirmation ("Confirm your Vibe account") and (B) Vibe's own IU email verification. This plan is read-only: nothing was edited, sent, or reconfigured. Code citations are against HEAD `917775f`.

---

## 1. Root cause

### In plain English

Tapping "Confirm your Vibe account" does confirm the account right away. The trouble is the sign-in step that runs next. It only works in the exact browser the student signed up in. Even in that browser, a bug makes it sign in twice, and the second attempt fails. So every student, whichever browser they used, ended on "That confirmation link is invalid or expired" while their account was already confirmed. IU's Outlook also opens links before the student does, which uses up the one-time link. The IU-email step (B) is not what's broken, though it has smaller rough edges.

### Ranked causes

| # | Cause | Verdict | Reach (2026-09-14) | Evidence |
|---|---|---|---|---|
| 1 | **Double code exchange in the signup browser.** The browser client exchanges `?code=` automatically on creation, then the page exchanges the same code again. The second exchange fails because the verifier was deleted, and the page redirects to the error. | Confirmed | 3 of 3 same-browser taps: signed in, then shown the error anyway | `callback/page.tsx:98` creates the client. `@supabase/ssr` forces `flowType:"pkce"` and `detectSessionInUrl` (`node_modules/@supabase/ssr/dist/main/createBrowserClient.js:37,39`). `initialize()` auto-exchanges (`GoTrueClient.js:293-304`) and deletes the verifier (`:1483`). The page's own exchange at `callback/page.tsx:107` waits on init (`GoTrueClient.js:1123`), throws "verifier missing" (`:1472-1473`), and redirects at `callback/page.tsx:108-110`. |
| 2 | **PKCE ties the link to the signup browser.** Opening it in the Gmail/Google app webview, Chrome for iOS, or a laptop leaves no verifier. | Confirmed | 5 of 9 confirmations; 1 of them (`1b25c91e`) never signed in | `_isPKCECallback` requires the verifier cookie (`GoTrueClient.js:3131-3133`). The template has only `{{ .ConfirmationURL }}` (live config). There is no `verifyOtp` or `token_hash` path in `src`. |
| 3 | **One message for every outcome, and nothing says "you're confirmed".** It also says "sign up again", which sends no email to a confirmed account but still shows "Check this inbox". | Confirmed | 9 of 9 confirmations saw the error; 2 accounts confirmed but never signed in | All failure branches go to one URL (`callback/page.tsx:91,109,120,127`). The page never reads `error_code`. Copy is at `login/page.tsx:112-116`. The banner shows whenever there is no session (`signup/page.tsx:69-76`). |
| 4 | **Link scanner pre-fetch** (Microsoft Defender Safe Links). A plain GET on `{{ .ConfirmationURL }}` burns the token. | Confirmed | 1 of 9 (`d09cf6a8`, the only iu.edu account email; never signed in) | A GET 303 from AS "Microsoft Corporation" at 02:55:06.624 was followed by `email_confirmed_at` 02:55:06.862. The student's taps then got "One-time token not found". |
| 5 | **No resend control, raw rate-limit text, misleading repeat-signup banner.** | Plausible (friction, not rejection) | 6 raw "only request this after N seconds" errors; 9-10 `user_repeated_signup` with no email | No `auth.resend` in `src`. The raw error is shown at `signup/page.tsx:65-67`. |
| - | B bound to session / domain rejects (H5), host mismatch (H6), deliverability (H7) | Refuted as causes | 0 B rejections; all hosts www; confirm latency 12.7-99.8s | See section 2B for the B friction that is still fixed. |

**Data behind the table** (Supabase, read-only):

- **Unexchanged codes.** `select left(f.user_id::text,8), f.authentication_method, (f.auth_code_issued_at is not null), f.created_at, f.auth_code_issued_at, u.email_confirmed_at, u.last_sign_in_at, (select min(created_at) from auth.sessions s where s.user_id=f.user_id), split_part(lower(u.email),'@',2) from auth.flow_state f left join auth.users u on u.id=f.user_id`
  - Six rows from 2026-09-14 have a code issued that was never exchanged: 5 cross-browser plus 1 scanner.
- **Confirmed but never signed in.** `select split_part(lower(email),'@',2), email_confirmed_at is not null, last_sign_in_at is not null, count(*) from auth.users group by 1,2,3`
  - 2 confirmed accounts have never signed in: 1 gmail.com, 1 iu.edu.
- **Auth logs, last 24h.** `select log_attributes['path'], log_attributes['grant_type'], log_attributes['status'], log_attributes['error_code'], count() from logs where source='auth_logs' and log_attributes['path'] in ('/token','/verify') group by 1,2,3,4`
  - `/verify` returned 303 18 times, but only 3 PKCE `/token` calls returned 200.
  - Missing-verifier failures never reach the server.
- **Same-browser race.** `select left(s.user_id::text,8), u.email_confirmed_at, s.created_at, extract(epoch from (s.created_at-u.email_confirmed_at)), (select string_agg(m.authentication_method,',') from auth.mfa_amr_claims m where m.session_id=s.id), left(s.user_agent,40) from auth.sessions s join auth.users u on u.id=s.user_id where u.created_at > now()-interval '1 day'`
  - `b80adedc` and `6b037104` each have an `email/signup` session 0.5s after confirming, then a `password` session about 4s later.

---

## 2. Target flow

### 2A. Account confirmation

**New email link:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`, plus the 8-digit `{{ .Token }}` printed in the email.

**`/auth/confirm` is a tap-to-confirm page.**
- It does nothing on load: it creates no Supabase client and makes no network call.
- The student taps **Confirm my account**. That calls `supabase.auth.verifyOtp({ token_hash, type })`, which POSTs to `/verify` and saves the session in whatever browser is open (`GoTrueClient.js:1887-1915`). No code verifier is involved.
- On the server, GoTrue accepts `type=email` with a `token_hash` against the confirmation token. Otherwise it returns 403 `otp_expired`, "Token has expired or is invalid" (supabase/auth `internal/api/verify.go`, `FindUserByOneTimeToken(..., ConfirmationToken, RecoveryToken)`).

**`/auth/callback` stays** for emails already in inboxes (`?code=`) and for resent emails (`#access_token`). It is fixed to exchange at most once and to show a real explanation instead of redirecting to an error.

| Situation | What happens | What the student sees |
|---|---|---|
| Opened in a different browser, device or mail app | `verifyOtp` works anywhere | "You're confirmed", then `/auth/school-email?account_verified=1` |
| Scanner pre-fetches (Safe Links, Gmail) | A GET only renders the button page. No token is used. | Their own tap works |
| Taps twice, same browser | The second `verifyOtp` returns `otp_expired`. The page sees a session. | "You're already signed in." Continue |
| Taps twice, other browser | `otp_expired`, no session | "This link was already used or has expired." Sign in, or send a new email |
| Resent, taps an older email | `otp_expired` (a resend replaces the token) | Same card, with "Only the newest email works" |
| Expired (older than 1h) | `otp_expired` | Same card, with a one-tap resend (address prefilled when this browser signed up) |
| Mail app cuts the link | No `token_hash` | "This link is incomplete", with the code box and resend |
| Can't tap the link at all | Types the 8-digit code on the signup screen, `/auth/confirm`, or login | `verifyOtp({ email, token, type:"email" })`. GoTrue accepts a confirmation token for `email`+`token` (verify.go `isOtpValid(... user.ConfirmationToken ...)`). |
| Old email (`{{ .ConfirmationURL }}`), other browser | `/verify` has already confirmed. The callback finds no verifier. | "Your email is confirmed." Sign in (no false "invalid") |
| Old email, same browser | The client auto-exchanges once. The page only waits for the session. | Goes straight to the IU email step (race removed) |
| Resent email under the old template | GoTrue redirects with `#access_token` (resend sends no `code_challenge`, `GoTrueClient.js:2115-2129`). Auto-detect throws on implicit URLs in PKCE mode (`GoTrueClient.js:3040-3043`), so the page keeps its manual `setSession`. | Goes straight on |
| Signs up again with a confirmed email | `signUp` returns a user with `identities: []` (documented Supabase behavior; verify with the stub in Batch 3) | "This email may already have an account. Sign in, or reset your password." No false "Check this inbox". |
| Resubmits within 60s | `over_email_send_rate_limit` | "We just sent an email to this address. You can ask for another in 57 seconds." |
| Password login before confirming | `email_not_confirmed` | "Confirm your email first", with resend and code boxes prefilled with the typed address |
| Wrong password | `invalid_credentials` | "That email and password don't match. Use the personal email you signed up with, not your .edu." |
| Session expires later in onboarding | Existing redirect to `/auth/login?next=/auth/school-email` (`school-email/page.tsx:85`) | Login banner: "Sign in to pick up where you left off." |

**Resend is neutral by design.** GoTrue `/resend` returns 200 `{}` for both an unknown and an already-confirmed address (supabase/auth `internal/api/resend.go`). The copy therefore never claims an email was sent: "If {email} has an account that still needs confirming, a new email is on its way. Only the newest email works." The same card always links to Sign in.

**Inbox tip, shown with every resend:** "Not there after a minute? Check Spam or Junk. On IU Outlook, also check Quarantine."

### 2B. IU email verification

**Decision: keep the link bound to the signed-in account, and add a typed code that works across devices.**

Why not make the link work while signed out, even bound to user id and address, single-use and POST-only:
- The Session 51 threat is an attacker requesting a link with their own user id and a victim's IU address (`confirm/route.ts:16-22`). The email lands in the victim's inbox.
- A signed-out link turns one careless click by the victim into a verified attacker account.
- It also locks the real student out later, because `school_email` is unique (`confirm/route.ts:105-119` returns 409).
- A confirmation interstitial that names the account reduces the risk but does not remove it.

A typed code proves the same thing as the link: the person can read the inbox. The person typing it is inherently already signed in as the account that asked. A victim cannot bind their address to someone else's account by accident; they would have to hand over the code, and the email says never to share it.

**Code design (stateless, no migration):**
- `code = first 5 bytes of HMAC-SHA256(SCHOOL_EMAIL_VERIFY_SECRET, "vibe-school-code-v1|" + userId + "|" + lowercased email + "|" + floor(now/1800))`, taken mod 10^8 and zero-padded to 8 digits.
- The code is accepted for the current and the previous 30-minute window, so it always lasts at least 30 minutes.
- Bound to user id plus address. Checked only on an authenticated POST, with a constant-time compare.
- Rate limit 5 attempts per 15 min per user and 30 per hour per IP, both **fail-closed**. Today's limiter fails open (`rate-limit.ts:36-43`).
- Brute force: at most about 480 guesses a day against about 2 live codes in 10^8.
- Not single-use, but reuse is harmless: the same user and address is a no-op 200 (`confirm/route.ts:81-90`).
- Sending again within a window gives the same code, so resends never invalidate anything.

| Situation | What happens |
|---|---|
| Opens the email in the Outlook app while signed in to Vibe in Safari | Types the code on `/auth/school-email` in Safari. Verified. |
| Taps the link inside Outlook's in-app browser (signed out) | New "Almost there" card instead of a silent redirect: "This link has to open where you're signed in to Vibe…" Buttons: **Sign in here to finish** (login banner explains which email to use), or type the code in the original tab. |
| Scanner fetches the B link | No effect: a GET renders only, and confirm is POST plus session (`verify-school/page.tsx:28-33`, `confirm/route.ts:37-39`). |
| Taps link or enters code twice | 200 "School email verified." (idempotent) |
| Resends | Old links still work for 48h (`school-email-token.ts:49`); the code is the same within the window. A countdown replaces "Try again shortly." |
| Hits 3 sends/hour | "You've asked for 3 emails this hour. Use the code or link from the newest one, or try again later this hour." |
| Wrong or expired code | "That code didn't match. Check the newest email — codes work for 30 minutes." |
| Session expired before typing the code | A 401 shows "You were signed out. Sign in, then type the same code again — it still works for 30 minutes." |
| Signed in as a different account | "This link is for a different Vibe account. Sign in with the account that asked for it, or type the code there." |
| Link expired or secret rotated | "This IU verification link has expired or is broken. Send a new one." (no longer resembles A's wording) |

---

## 3. Config changes outside the repo (each needs Franky's explicit OK)

| # | Where | Change | Why | OK needed |
|---|---|---|---|---|
| C1 | Supabase, Authentication, Emails, **Confirm signup** | Replace the body with the template below. Subject unchanged: `Confirm your Vibe account`. **Before replacing, paste the current HTML into a local file for rollback.** | Fixes causes 2 and 4 and adds the typed code | Yes |
| C2 | Supabase `uri_allow_list` | **No change.** The token_hash link makes no redirect. Resend's `emailRedirectTo` (`https://www.connectvibe.app/auth/callback?next=…`) already passes via the site_url host match. | - | No action |
| C3 | Supabase `rate_limit_email_sent` | 30 to **60** per hour now. Before any class or event signup, set it to about 2x the expected peak-hour signups. Only raise it after checking the Resend plan quota (Free is 100/day), since all mail shares it. | The resend button adds sends; per-address 60s cooldown still applies | Yes |
| C4 | Resend, Domains, connectvibe.app | Confirm **click tracking OFF** and **open tracking OFF** | Tracking rewrites links (including Supabase SMTP mail) and adds a redirect hop scanners fetch | Yes (a check; change only if on) |
| C5 | Supabase `mailer_otp_length` 8, `mailer_otp_exp` 3600 | **Keep.** The template copy says "8-digit" and "1 hour". | - | No action |
| C6 (optional) | Supabase `rate_limit_verify` 30 per 5 min | Raise to 60 before a campus event (possibly per IP behind campus NAT) | Only matters with many taps from one network | Yes, only if an event is planned |

### C1: new Confirm signup template

The live HTML could not be read without credentials. This version follows the documented A5 design (brand, button plus visible link, 1-hour note, footer) in the auth-page palette (`#FAF7F2` ground, `#FF5C35` accent, `#1c1c1e` text, `#8a8580` muted, DM Sans).

Franky should keep any header or footer details from the current version that differ. Also save this as `supabase/templates/confirmation.html` (Batch 2) so the repo holds the source.

```html
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#FAF7F2;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#FAF7F2;">
      Tap Confirm, or type the code {{ .Token }}. Expires in 1 hour.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F2;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:16px;font-family:'DM Sans',Helvetica,Arial,sans-serif;color:#1c1c1e;">
            <tr>
              <td style="padding:32px 28px 0 28px;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:900;letter-spacing:-0.5px;">
                vibe<span style="color:#FF5C35;">.</span>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 0 28px;font-size:22px;font-weight:700;line-height:1.3;">
                Confirm your account<span style="color:#FF5C35;">.</span>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 0 28px;font-size:15px;line-height:1.55;color:#5c5956;">
                You're one tap from Vibe. Confirm this is your email, and we'll ask for your IU email next.
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 0 28px;">
                <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email"
                   style="display:inline-block;background:#FF5C35;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;line-height:1;padding:16px 26px;border-radius:12px;">
                  Confirm my account &rarr;
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 0 28px;font-size:14px;line-height:1.55;color:#5c5956;">
                Or type this code on the Vibe screen that asked you to check your email:
              </td>
            </tr>
            <tr>
              <td style="padding:10px 28px 0 28px;">
                <span style="display:inline-block;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:26px;font-weight:700;letter-spacing:6px;color:#1c1c1e;background:#FFEDE7;padding:12px 18px;border-radius:10px;">{{ .Token }}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 0 28px;font-size:13px;line-height:1.55;color:#8a8580;">
                Button not working? Copy this link into your browser:<br>
                <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email" style="color:#FF5C35;word-break:break-all;">{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email</a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 0 28px;font-size:13px;line-height:1.55;color:#8a8580;">
                This link and code expire in 1 hour. Any browser or phone works. If you asked for more than one email, use the newest one.
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 28px 28px;">
                <div style="border-top:1px solid #EEE8DF;padding-top:16px;font-size:12px;line-height:1.55;color:#a8a39c;">
                  You're getting this because someone signed up for Vibe with {{ .Email }}. If that wasn't you, you can ignore this email.<br>
                  Vibe &middot; connectvibe.app
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

The template deliberately contains no `{{ .ConfirmationURL }}`. That link is burned by any GET, which is cause 4.

---

## 4. Deploy order

Rule: nobody mid-signup breaks. Emails already in inboxes (old `{{ .ConfirmationURL }}`, 1-hour life) must keep working, and `/auth/callback` is never removed.

1. **C4 check** (Resend tracking off). No user impact.
2. **Deploy Batches 1-3** (the A code) at a quiet hour. The old template is still live.
   - Old links now land on the fixed callback: the same browser goes straight on, other browsers get "Your email is confirmed. Sign in."
   - `/auth/confirm` exists but no email points to it yet.
   - Gap risk: the signup "pending" screen offers the code box, but old-template emails have no code. The link still works, the box says "Or type the 8-digit code from the email", and the gap lasts only until step 4, so keep it under 15 minutes.
3. **Smoke check prod without accounts:**
   - `curl -sI https://www.connectvibe.app/auth/confirm` returns 200.
   - In a browser, open `/auth/confirm?token_hash=smoke&type=email`: the button renders and the network panel shows zero `/auth/v1/*` requests. Do not tap.
   - Franky runs step A0 of section 6 (old-template path) now.
4. **C1: switch the template** (Franky, dashboard). Note the UTC timestamp as `SWITCH_TS`. New emails use `/auth/confirm` plus the code. Old emails still in inboxes keep working through `/auth/callback` until they expire an hour later.
5. **Franky runs A1-A6** (section 6).
6. **C3** (email rate limit), once A is verified.
7. **Deploy Batches 4-5** (B) as a separate release.
   - The code route and the email that contains the code ship in the same deploy.
   - Token format is unchanged, so B links sent before the deploy stay valid for 48h.
   - Run B1-B5.

**Rollback:**
- A: paste the saved old template back. `/auth/callback` still handles old links honestly, so this is safe.
- B: revert Batches 4-5. Links in circulation still verify, and codes in already-sent emails simply stop being accepted.

---

## 5. Implementation batches

Each file belongs to exactly one batch. Dependency order: 1 before 2 and 3 (2 and 3 can run in parallel); 4 before 5.

Every batch must pass these acceptance checks:
- `npx tsc --noEmit` is clean.
- `npx eslint <file>` shows no more problems than the HEAD version of that file (`git show HEAD:<file> > /tmp/x && npx eslint --stdin …`, or compare counts; 0 for new files).
- No `public/html` scripts are touched, so `node --check` does not apply. If one is touched, run `node --check` on it.

**Local test harness note:**
- The repo's `node:test` harness currently fails on Node 25: `node --test --experimental-strip-types src/lib/otto/parse-reminder.test.ts` gives `ERR_MODULE_NOT_FOUND` on the extensionless import.
- So unit checks below run as throwaway scripts in the scratchpad. Copy the pure module there, import it with an explicit `.ts`, and run `node --experimental-strip-types`. Add `--conditions=react-server` for files importing `server-only`.
- Docker is not installed, so local Supabase with Inbucket cannot run.
- The dev server's Supabase is production. Local scenario checks therefore either make no auth calls, or stub `window.fetch` in the page for `*/auth/v1/*` (same recipe as the S-59 live verification).
- The stub must be installed before the Supabase client is created: supabase-js captures `fetch` at construction.

### Batch 1: shared A core (lib, components, CSS)

**Files:**
- NEW `src/lib/auth/email-link-errors.ts`
- NEW `src/lib/auth/pending-signup.ts`
- NEW `src/components/auth/ResendConfirmation.tsx`
- NEW `src/components/auth/ConfirmCodeForm.tsx`
- NEW `src/components/auth/EmailLinkProblem.tsx`
- MODIFY `src/lib/auth/email-confirm-redirect.ts`
- MODIFY `src/app/globals.css`

**Contract C-1: `email-link-errors.ts`** (pure; no imports)
```ts
export type EmailLinkProblem =
  | "confirmed_sign_in"      // ?code= arrived, no session here (other browser / verifier gone)
  | "link_used_or_expired"   // otp_expired | flow_state_expired | flow_state_not_found | "invalid or has expired" | "expired or is invalid"
  | "already_signed_in"      // a token failed but this browser has a session
  | "too_many_tries"         // status 429 | over_request_rate_limit
  | "offline"                // fetch threw
  | "incomplete_link"        // no token_hash, no code, no hash tokens, no error params
  | "unknown";
export function classifyEmailLinkProblem(i: {
  hasCode: boolean; hasSession: boolean; hasToken: boolean;
  errorCode?: string | null; errorDescription?: string | null;
  status?: number | null; networkError?: boolean;
}): EmailLinkProblem;
// precedence: hasSession → already_signed_in; networkError → offline; 429/over_request_rate_limit → too_many_tries;
// expired-family code/description → link_used_or_expired; hasCode → confirmed_sign_in;
// !hasToken && !hasCode && !errorCode && !errorDescription → incomplete_link; else unknown
export function readAuthUrlParams(href: string): {
  code: string | null; tokenHash: string | null; type: string | null; next: string | null;
  accessToken: string | null; refreshToken: string | null;
  error: string | null; errorCode: string | null; errorDescription: string | null; // query OR hash
};
export function parseRetryAfterSeconds(message: string | null | undefined): number | null; // /after (\d+) seconds?/
export const INBOX_TIP = "Not there after a minute? Check Spam or Junk. On IU Outlook, also check Quarantine.";
export const EMAIL_LINK_COPY: Record<EmailLinkProblem, { title: string; body: string; primaryLabel: string | null; primaryHref: string | null }>;
```

**`EMAIL_LINK_COPY` strings (exact):**

| Key | title | body | primaryLabel | primaryHref |
|---|---|---|---|---|
| `confirmed_sign_in` | "Your email is confirmed." | "This link opened in a different browser or app than the one you signed up in, so we couldn't sign you in here. Sign in with your email and password to keep going." | "Sign in" | "/auth/login?notice=confirmed" |
| `link_used_or_expired` | "This link was already used or has expired." | "If you tapped it before, your account is already confirmed — just sign in. If not, send yourself a new email below. Only the newest email works." | "Sign in" | "/auth/login" |
| `already_signed_in` | "You're already signed in." | "This link was already used, and this browser is signed in. Pick up where you left off." | "Continue" | null (computed with `getPostLoginDestination(supabase, null)`) |
| `too_many_tries` | "Too many tries from this network." | "Wait a few minutes, then tap the button again. Your link keeps working until it expires." | null | null |
| `offline` | "We couldn't reach Vibe." | "Check your connection and tap the button again." | null | null |
| `incomplete_link` | "This link is incomplete." | "Some mail apps cut long links. Tap the button in the email instead of copying the link, or type the 8-digit code from the email." | null | null |
| `unknown` | "We couldn't confirm you from this link." | "Try signing in. If it says your email isn't confirmed, send a new email below." | "Sign in" | "/auth/login" |

**Contract C-2: `pending-signup.ts`** (client-safe; every storage access in try/catch)
```ts
export function rememberPendingSignup(email: string): void;   // localStorage "vibe.pendingSignup.v1" = {email, at}
export function readPendingSignupEmail(): string | null;      // null if missing, >24h old, or storage throws
export function clearPendingSignup(): void;
```

**Contract C-3: `email-confirm-redirect.ts`** (additions only; existing exports unchanged)
```ts
export const EMAIL_CONFIRM_PAGE_PATH = "/auth/confirm";
export function getBrowserSiteOrigin(): string; // NEXT_PUBLIC_SITE_URL without trailing "/" || window.location.origin (same logic as signup/page.tsx:47-49)
```

**Contract C-4: components** (all `"use client"`; use existing `vibe-auth-*` classes)
```tsx
export function ResendConfirmation(p: { initialEmail?: string | null; autoStartCooldownSec?: number }): JSX.Element;
export function ConfirmCodeForm(p: { initialEmail?: string | null; askEmail?: boolean }): JSX.Element;
export function EmailLinkProblemCard(p: { problem: EmailLinkProblem; email?: string | null }): JSX.Element;
```

**`ResendConfirmation`:**
- Calls `supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: getAuthEmailCallbackUrl(getBrowserSiteOrigin()) } })`.
- The email field is hidden behind "Change" when `initialEmail` is given.
- Button: "Send a new email", and while cooling down "Send again in {n}s" (60s default).
- On success: `rememberPendingSignup(email)`, then "If {email} has an account that still needs confirming, a new email is on its way. Only the newest email works."
- On `over_email_send_rate_limit`: cooldown `parseRetryAfterSeconds(msg) ?? 60`, copy "We just sent one. You can ask again in {n}s."
- On any other error: "Couldn't send right now. Try again in a minute."
- Always renders `INBOX_TIP`.

**`ConfirmCodeForm`:**
- Label "8-digit code". Input `inputMode="numeric"`, `autoComplete="one-time-code"`. On change it strips non-digits and caps at 8; no `maxLength`, matching the signup comment's reasoning.
- Button "Confirm with code". Calls `verifyOtp({ email, token, type: "email" })`.
- On success: `clearPendingSignup()` then `window.location.assign(POST_EMAIL_CONFIRM_PATH)`.
- On `otp_expired`: "That code didn't work. It may be mistyped, already used, or older than an hour — send a new email below."
- On 429: use the `too_many_tries` body.

**`EmailLinkProblemCard`:**
- Renders brand, title, body and primary action.
- For `link_used_or_expired`, `unknown` and `incomplete_link`, it adds `ResendConfirmation`, a disclosure "Have the 8-digit code?" that opens `ConfirmCodeForm`, and `INBOX_TIP`.
- For `already_signed_in`, Continue computes its destination with `getPostLoginDestination`.

**`globals.css` additions:**
- `.vibe-auth-banner--info` (neutral tint)
- `.vibe-auth-secondary` (outline button, min-height 48px)
- `.vibe-auth-code-input` (monospace, letter-spacing 0.3em, centered, font-size 22px, never below 16px so iOS does not zoom)
- `.vibe-auth-tip` (13px, `#8a8580`)
- `.vibe-auth-disclosure` (text button)

**Acceptance and scenario checks (Batch 1):**
- Scratchpad unit script over `email-link-errors.ts`:
  - `?code=x` with no session gives `confirmed_sign_in`.
  - `errorCode=otp_expired` gives `link_used_or_expired`, but `already_signed_in` when `hasSession`.
  - Status 429 gives `too_many_tries`.
  - Empty input gives `incomplete_link`.
  - `readAuthUrlParams("https://x/auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired")` reads the hash values.
  - `parseRetryAfterSeconds("For security purposes, you can only request this after 57 seconds.") === 57`.
- `pending-signup.ts` with a fake `localStorage` global:
  - An entry older than 24h returns null.
  - A throwing storage returns null and does not throw.

### Batch 2: `/auth/confirm` page, callback rewrite, template source

**Files:**
- NEW `src/app/auth/confirm/page.tsx`
- NEW `src/app/auth/confirm/layout.tsx`
- MODIFY `src/app/auth/callback/page.tsx`
- NEW `src/app/auth/callback/layout.tsx`
- NEW `supabase/templates/confirmation.html`
- MODIFY `supabase/config.toml`

**`confirm/layout.tsx` and `callback/layout.tsx`** (server components):
- `export const metadata = { referrer: "no-referrer", robots: { index: false, follow: false } }`
- Purpose: the token must not leak through Referer to font or analytics hosts, and the pages must not be indexed.

**`/auth/confirm/page.tsx`** (`"use client"`, Suspense):
- **Route and params:** `GET /auth/confirm?token_hash=<string>&type=email|signup`. Any other `type` is treated as `email`, and `next` is ignored. The destination is always `POST_EMAIL_CONFIRM_PATH`, so the email carries no open-redirect surface.
- **On mount:** reads `readAuthUrlParams(location.href)` and `readPendingSignupEmail()`. It must **not** call `getSupabaseBrowserClient()` or any network request.
- **Idle screen:**
  - Headline "Confirm your account."
  - Sub-text "Tap below to finish. We wait for your tap so email security scanners can't use up your link."
  - Primary button "Confirm my account →".
  - Disclosure "Have the 8-digit code instead?" opens `ConfirmCodeForm`, with the email asked and prefilled from pending.
- **Tap:**
  - A module-level `Map<tokenHash, Promise>` guard ensures one `/verify` per token, even on double tap or Strict Mode. The button is disabled with the label "Confirming…".
  - It calls `verifyOtp({ token_hash, type })`.
  - Success with a session: `clearPendingSignup()`, hint "You're confirmed. Taking you to the next step…", then `window.location.assign(POST_EMAIL_CONFIRM_PATH)`. This is a full navigation so the proxy sees the cookies, the same pattern as `login/page.tsx:45-46`.
  - Success without a session: show `confirmed_sign_in`.
  - Error: `getSession()`, then `classifyEmailLinkProblem({hasCode:false, hasToken:true, hasSession, errorCode: error.code, errorDescription: error.message, status: error.status})`, then `EmailLinkProblemCard`.
  - Thrown or network error: `offline`.
- **No `token_hash`:** `incomplete_link` card.

**`/auth/callback/page.tsx` rewrite:**
- Keep `setSessionFromHashOnce` and `waitForBrowserSession`. **Delete** `exchangePkceOnce`, the `vibe_pkce_*` lock, and every `router.replace("/auth/login?error=auth_callback")`.
- **Flow:**
  1. Read `readAuthUrlParams(location.href)` **before** creating the client.
  2. If there is no code, no hash tokens and no error params, show the `incomplete_link` card.
  3. `getSupabaseBrowserClient()`, then `await supabase.auth.getSession()`. This waits on `initializePromise`, which auto-exchanges `?code=` once when the verifier exists.
  4. If there is no session but hash tokens exist, call `setSessionFromHashOnce`. It is needed because a PKCE client rejects implicit URLs (`GoTrueClient.js:3040-3043`) and resent emails are implicit (`:2115-2129`).
  5. If `waitForBrowserSession` finds a session: strip the hash, `clearPendingSignup()`, then `window.location.replace(safeNextPath(next) ?? POST_EMAIL_CONFIRM_PATH)`.
  6. Otherwise show the card for `classifyEmailLinkProblem({hasCode: !!code, hasToken:false, hasSession:false, errorCode, errorDescription})`.
- **On-page text** while working: "Signing you in…".

**`supabase/templates/confirmation.html`** is the exact template from section 3, C1, and is the repo's source of truth.

**`supabase/config.toml`:**
- Add `[auth.email.template.confirmation]` with `subject = "Confirm your Vibe account"` and `content_path = "./supabase/templates/confirmation.html"`.
- Set `otp_length = 8` (currently `6` at `config.toml:227`) to match production.
- Leave `enable_confirmations = false` (`:221`) as is, and add a comment noting that production is `true` and that this is why dev never hit the callback.

**Scenario checks** (`npm run dev`, Browser pane, desktop and then the `mobile` preset):
1. `/auth/confirm?token_hash=pkce_test&type=email`: the button renders, and the network panel shows **zero** requests to `/auth/v1/*` after load (the scanner-safety invariant). `document.querySelector('meta[name="referrer"]').content === "no-referrer"`.
2. On the same page, install a fetch stub where `*/auth/v1/verify` returns 403 `{"code":403,"error_code":"otp_expired","msg":"Email link is invalid or has expired"}`. Tap the button twice quickly. Expect **exactly one** `/verify` request, then the "This link was already used or has expired." card with resend and code.
3. Stub a 429 and expect `too_many_tries`. Stub a rejected fetch and expect `offline`.
4. `/auth/confirm` with no params gives `incomplete_link`.
5. `/auth/callback?code=fake-code-0001&next=%2Fauth%2Fschool-email%3Faccount_verified%3D1` in a fresh profile. There is no verifier, so expect "Your email is confirmed." and **no** `/auth/v1/token` request.
6. `/auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired` gives `link_used_or_expired`.
7. `/auth/callback` bare gives `incomplete_link`. The URL never changes to `/auth/login?error=auth_callback`.
8. On the phone preset, for every card: `document.documentElement.scrollWidth <= innerWidth`, buttons at least 44px tall, and the code input font-size at least 16px.
9. Optional, and the only check that touches prod auth: tap Confirm on `/auth/confirm?token_hash=bogus` without a stub. Expect a real 403 `otp_expired`. It creates nothing, sends nothing, and uses 1 of the IP's `rate_limit_verify` budget.

### Batch 3: signup and login surfaces

**Files:**
- MODIFY `src/app/auth/signup/page.tsx`
- MODIFY `src/app/auth/login/page.tsx`

**Signup:**
- Replace the inline origin (`:47-49`) with `getBrowserSiteOrigin()`.
- **`signErr`:**
  - `signErr.code === "over_email_send_rate_limit"`: switch to the pending view with a cooldown of `parseRetryAfterSeconds(msg) ?? 60`, and error text "We just sent an email to this address. You can ask for another in {n} seconds."
  - Anything else: keep `signErr.message`.
- **No session and `data.user?.identities?.length === 0`:** info banner "This email may already have an account." with links **Sign in** (`/auth/login`) and **Forgot password?** (`/auth/forgot-password`). No pending view.
- **No session otherwise:** `rememberPendingSignup(email)`, then the **pending view** replaces the form:
  - Headline "Check your email."
  - Sub-text "We sent a link to {email} from noreply@connectvibe.app. Tap Confirm in that email — any browser or phone works. Or type the 8-digit code from the email here."
  - `ConfirmCodeForm initialEmail={email} askEmail={false}`
  - `ResendConfirmation initialEmail={email} autoStartCooldownSec={60}`
  - Tail link "Confirmed on another device or app? Sign in" (`/auth/login?notice=confirmed`)
  - Button "Wrong address? Start over" resets the form.
- **IU hint (non-blocking):** when `isSchoolEmail(email.trim())` (client-safe import from `@/lib/auth/school-email-domains`), show a `.vibe-auth-tip` under the email field: "Heads up: use a personal email here — you'll add your IU email in the next step."

**Login:**
- `?notice=confirmed`: success banner "Your email is confirmed. Sign in to keep going."
- `?error=auth_callback` (old bookmarks or tabs): replace the `:112-116` copy with an info banner, "That link didn't sign you in here — but your email may already be confirmed. Try signing in. If it says your email isn't confirmed, send a new email below.", plus a collapsed `ResendConfirmation`.
- `next` starting with `/auth/verify-school`: info banner "Sign in to finish verifying your IU email. Use the personal email you signed up with, not your .edu."
- `next` starting with `/auth/school-email`: info banner "Sign in to pick up where you left off."
- **`signErr`:**
  - `code === "email_not_confirmed"`: error "Confirm your email first — we sent a link when you signed up.", with `ResendConfirmation initialEmail={email}` and `ConfirmCodeForm initialEmail={email} askEmail={false}` below.
  - `code === "invalid_credentials"`: "That email and password don't match. Use the personal email you signed up with (not your .edu)."
  - Otherwise: the raw message.
- **On mount:** `getSession()`. If there is a session, show info banner "You're already signed in." with a **Continue →** button (`getPostLoginDestination`). **Never auto-redirect**, to avoid a loop with the logout flow at `SettingsClient.tsx:930-937`.

**Scenario checks:**
- **Signup** (the stub can go on after load, because the client is created on submit at `signup/page.tsx:46`). Stub `*/auth/v1/signup`:
  - (a) 200 `{"id":"00000000-0000-0000-0000-000000000000","email":"t@example.com","identities":[]}` gives the "may already have an account" banner.
  - (b) 200 with `identities:[{"id":"x"}]` and no session gives the pending view with the address echoed, the code box, a 60s countdown, and `localStorage["vibe.pendingSignup.v1"]` set.
  - (c) 429 `{"code":429,"error_code":"over_email_send_rate_limit","msg":"For security purposes, you can only request this after 57 seconds."}` gives "ask for another in 57 seconds".
  - Stub `*/auth/v1/resend` 200 `{}`: neutral copy plus countdown.
  - Type `x@iu.edu`: the tip shows and submit is not blocked.
- **Login:**
  - Start on `/auth/signup` (no client yet), install the stub, then client-navigate with the "Log in" link so the singleton is created with the stub.
  - Stub `*/auth/v1/token?grant_type=password` 400 `{"code":400,"error_code":"email_not_confirmed","msg":"Email not confirmed"}`: the confirm-first block shows with the email prefilled.
  - 400 `invalid_credentials`: the new copy.
  - `/auth/login?error=auth_callback`, `?notice=confirmed` and `?next=%2Fauth%2Fverify-school%3Ftoken%3Dx`: each banner renders.
- **Both pages** on the phone preset: no horizontal scroll, and inputs at least 16px.

### Batch 4: B server (typed code, shared apply, copy, limiter)

**Files:**
- MODIFY `src/lib/auth/school-email-token.ts`
- NEW `src/lib/auth/school-email-apply.ts`
- MODIFY `src/app/api/auth/school-email/confirm/route.ts`
- NEW `src/app/api/auth/school-email/confirm-code/route.ts`
- MODIFY `src/app/api/auth/school-email/request/route.ts`
- MODIFY `src/lib/email/resend-transactional.ts`
- MODIFY `src/lib/rate-limit.ts`

**Contract C-5: `school-email-token.ts`** (additions)
```ts
export const SCHOOL_CODE_LENGTH = 8;
export const SCHOOL_CODE_WINDOW_SEC = 1800;
export function schoolEmailCode(userId: string, email: string, nowSec?: number): string;
export function verifySchoolEmailCode(userId: string, email: string, code: string, nowSec?: number): boolean;
// HMAC-SHA256(getSecret(), `vibe-school-code-v1|${userId}|${email.toLowerCase().trim()}|${Math.floor(now/1800)}`)
// → digest.readUIntBE(0,5) % 1e8 → padStart(8,"0"); verify accepts window w and w-1; /^\d{8}$/ required; timingSafeEqual
```

**Contract C-6: `school-email-apply.ts`** (`import "server-only"`)
```ts
export type ApplyResult = { status: 200 | 400 | 409 | 500; body: { ok: boolean; message?: string; error?: string } };
export async function applySchoolEmailVerification(userId: string, email: string): Promise<ApplyResult>;
```
- Moves `confirm/route.ts:72-140` unchanged in behavior and strings: idempotent 200, allowlist 400, 409, 500, then 200 "School email verified."

**`confirm/route.ts`:**
- Keep `:23-70`. Change only the `:56` string to "This IU verification link has expired or is broken. Send a new one from the verify page."
- Then `const r = await applySchoolEmailVerification(user.id, payload.email); return NextResponse.json(r.body, { status: r.status })`.

**Contract C-7: `POST /api/auth/school-email/confirm-code`**, body `{ schoolEmail: string; code: string }`, checked in this order:
1. 503 `{ok:false,error:"Server misconfiguration."}` unless both the secret and the service role are configured.
2. `getUser()`, else 401 `{ok:false,error:"Unauthorized"}`. **This comes before any rate-limit write**, so anonymous calls write nothing.
3. Invalid body: 400 `"Invalid JSON"`.
4. `normalizeSchoolEmail`: 400 `"Enter the IU email you sent the code to."`. Code with spaces and dashes stripped, not `/^\d{8}$/`: 400 `"Enter the 8-digit code from the email."`
5. `rateLimit("school-code:"+user.id, {limit:5, windowSec:900, failClosed:true})` and `rateLimit("school-code-ip:"+clientIp(req), {limit:30, windowSec:3600, failClosed:true})`. Either one: 429 `"Too many tries. Wait 15 minutes, or tap the link in the email while signed in."`
6. `!verifySchoolEmailCode(...)`: 400 `{ok:false, code:"code_invalid", error:"That code didn't match. Check the newest email — codes work for 30 minutes."}`
7. `applySchoolEmailVerification`, returning its body and status.

**Contract C-8: `rate-limit.ts`** (backward compatible)
```ts
rateLimit(key, { limit, windowSec, failClosed?: boolean })  // on RPC error/throw: allowed = !failClosed, retryAfterSec = failClosed ? 60 : 0
tooManyRequests(result, message = "Too many requests. Try again shortly.")
```

**`request/route.ts`:**
- **New order:**
  1. auth
  2. terms
  3. JSON
  4. normalize
  5. allowlist
  6. profile load
  7. already-verified: `{ ok:true, alreadyVerified:true, message:"This school email is already verified on your account." }`
  8. **rate limits**
  9. 409 lookup
  10. sign token and code
  11. send
- Why this order: the limits move after the already-verified early return, so resubmits that send nothing don't burn budget. They must stay **before** the 409 lookup, or the "already linked to another account" answer becomes an unlimited enumeration oracle.
- **429 copy:**
  - per user: "You've asked for 3 emails this hour. Use the code or link from the newest one, or try again later this hour."
  - per IP: "Lots of verification emails from this network right now. Try again later this hour."
- **Send failure:** log the raw error, and return 503 "We couldn't send the email right now. Try again in a minute." instead of the provider message (`:175-177`).
- **Success:** `{ ok:true, message:"Check your IU inbox for a code and a link.", sentTo: schoolEmail, codeLength: 8, codeMinutes: 30 }`

**Contract C-9: `resend-transactional.ts`**
- `sendSchoolVerificationEmail(to: string, verifyUrl: string, code: string): Promise<void>`
- Subject: "Verify your IU email on Vibe".
- Adds a `text` part (today it is HTML only, `:43-53`).
- HTML and text say:
  - "Your Vibe verification code: {code}"
  - "Type it on the Vibe page where you asked for this email. It works for 30 minutes."
  - "Or tap Verify IU email while you're signed in to Vibe on this device. The link works for 48 hours."
  - "Never share this code. Vibe will never ask you for it."
  - "If you didn't start this, ignore this email."
- `code` is digits only, so it needs no escaping.

**Checks:**
- **Scratchpad unit script** (`node --conditions=react-server --experimental-strip-types`, env `SCHOOL_EMAIL_VERIFY_SECRET=local-test-secret-0123456789`, copies of `school-email-token.ts` and `school-email-domains.ts` with the relative import rewritten to `.ts`):
  - Output is 8 digits and deterministic for fixed `nowSec`.
  - A different userId or email is rejected.
  - Window w-1 is accepted and w-2 rejected.
  - `"1234 5678"` is rejected by `verify` (the route strips spaces first).
  - An existing `signSchoolEmailToken` round-trip still verifies.
- **Anonymous curls** on localhost:
  - `curl -s -o /dev/null -w '%{http_code}' -X POST localhost:3000/api/auth/school-email/confirm-code -H 'content-type: application/json' -d '{"schoolEmail":"a@iu.edu","code":"12345678"}'` returns `401`.
  - The same for `/confirm` returns 401. GET on `/confirm` returns 405. POST `/request` returns 401.
- **Read-only SQL** afterwards (the dev DB is prod): `select count(*) from public.rate_limits where key like 'school-code%';` stays `0`, which proves the 401 comes before the write.
- Signed-in B paths can't run locally without prod writes and real email, so they are covered by B1-B5 after deploy.

### Batch 5: B client surfaces

**Files:**
- MODIFY `src/app/auth/school-email/page.tsx`
- MODIFY `src/app/auth/verify-school/page.tsx`

**`school-email/page.tsx`:**
- **`ok` with `alreadyVerified`:** `window.location.assign("/onboarding")`. The onboarding server page forwards users who are already onboarded (`post-login.ts:18-20`).
- **`ok` with `sentTo`:** keep the form's address and show the sent panel:
  - Banner "We sent a code and a link to {sentTo}."
  - Code input (8 digits, same input rules as C-4) with button "Verify with code". It POSTs `/api/auth/school-email/confirm-code` `{schoolEmail: sentTo, code}`:
    - ok: `window.location.assign("/onboarding")`
    - 401: "You were signed out. Sign in, then type the same code again — it still works for 30 minutes." with a link to `/auth/login?next=/auth/school-email`
    - otherwise: `data.error`
  - Button "Send again" with a 60s countdown, resubmitting `sentTo`.
  - Link "Use a different address" resets the form.
  - Tip "Not there after a minute? Check Junk, and IU Outlook's Quarantine. Opened it on your phone? Just type the code here."
- **Any non-ok:** show `data.error`; the server copy is now specific. If the panel was already showing, keep the code box visible on a 429.

**`verify-school/page.tsx`:**
- **401:** replace the instant `router.replace` (`:40-47`) with `status "login"` and a card:
  - Headline "Almost there."
  - Body "This link has to open where you're signed in to Vibe. Email apps often open links in their own browser, which isn't signed in."
  - Primary "Sign in here to finish", linking to `/auth/login?next=${encodeURIComponent(pathname+search)}`.
  - Tip "Or go back to the Vibe tab where you asked for the email and type the 8-digit code from the same email."
- **403:** heading "This link is for a different Vibe account." Body "Sign in with the account that asked for it — or type the code there."
- **Other errors:** heading "Couldn't verify your IU email" (was "Could not verify"). The link text changes to "Send a new code".
- No change to the success path.

**Checks:**
- `/auth/verify-school?token=a.b.c` signed out on localhost: a real 401 from localhost with no DB write. The "Almost there." card stays (no redirect), and the Sign in link's `next` round-trips through `sanitizeLoginNextParam` (`login-next.ts:37-42`).
- Stub `fetch("/api/auth/school-email/confirm")` with 403 and 400 and check each card.
- Phone preset: no horizontal scroll.
- `school-email/page.tsx` requires a signed-in user (`:52-87`), so its panel is verified in B1-B5.

---

## 6. Post-deploy verification (Franky runs these; no agent creates accounts or sends email)

Use fresh addresses of your own, for example new Gmail `+` aliases. Delete the test accounts afterwards from Supabase Auth, Users.

**A0: old template, just after step 2 and before the template switch.**
1. On the phone, sign up in Safari with alias #1.
2. Open the email in the **Gmail app** and tap Confirm.
3. Expect "Your email is confirmed. This link opened in a different browser…", **not** "invalid or expired".
4. Tap Sign in and log in. Expect the IU email step.

**After the template switch (record `SWITCH_TS`):**
- **A1.** Safari: sign up with alias #2. The pending screen shows the address, a code box, and "Send again in …s".
- **A2.** Gmail app: open the email. Expect the button, the 8-digit code, and "expires in 1 hour". Tap Confirm. The Gmail in-app browser shows the button page with no auto-confirm. Tap it. Expect "You're confirmed" and then the IU email step, inside the Gmail browser.
- **A3.** Tap the email's button again. Expect the button page, then after tapping "You're already signed in." with Continue. Copy the link into Safari and tap. Expect "This link was already used or has expired."
- **A4.** Safari: sign up with alias #3. Wait out the countdown, then tap "Send a new email". In Gmail, tap the **older** email: expect "already used or expired". Type the **newer** email's code into Safari's code box: expect confirmation in Safari.
- **A5.** Safari: try "Create account" again with alias #2, which is already confirmed. Expect "This email may already have an account." and no new email.
- **A6. IU Outlook scanner test.** Sign up with an address that is not yet a Vibe login email and is delivered to IU Outlook, for example an IU address with no Vibe account.
  1. Wait **3 minutes** so Safe Links scans it, then open it in the **Outlook app** and tap Confirm, then the button. Expect confirmation.
  2. Check Junk and Quarantine placement and note where it landed.
  3. On desktop Outlook on the web, hover the link: a `safelinks.protection.outlook.com` wrapper is expected and fine.

**B1-B5** (after Batches 4-5; needs an IU inbox that isn't linked to any Vibe account yet, for example a cofounder's):
- **B1.** Signed in on phone Safari, go to `/auth/school-email` and send. Expect the panel with the address, the code box, and a countdown.
- **B2.** Read the code in the Outlook app without tapping, type it in Safari. Expect verified, then onboarding.
- **B3.** On a second not-yet-linked account (or after unlinking), tap the link inside the Outlook app. Expect "Almost there." Tap "Sign in here to finish", sign in, and expect verified.
- **B4.** Send 3 times in an hour. The 4th shows the "You've asked for 3 emails this hour…" copy. The first email's code and link still work.
- **B5.** Type a wrong code 5 times. The 6th try shows "Too many tries…".

**Read-only checks** (Supabase MCP `execute_sql` and `query_logs`; substitute `SWITCH_TS` and `DEPLOY_TS`):
```sql
-- A: every confirmation since the switch should get a session within seconds, and none stay confirmed-but-never-signed-in
select left(a.id::text,8) as uid, split_part(lower(a.email),'@',2) as domain, a.created_at, a.email_confirmed_at,
       extract(epoch from ((select min(s.created_at) from auth.sessions s where s.user_id=a.id) - a.email_confirmed_at))::int as confirm_to_first_session_s,
       a.last_sign_in_at is not null as signed_in
from auth.users a where a.created_at > 'SWITCH_TS' order by a.created_at;

select count(*) as confirmed_never_signed_in
from auth.users where created_at > 'SWITCH_TS' and email_confirmed_at is not null and last_sign_in_at is null;   -- expect 0
```
```sql
-- auth_logs: POST /verify 200s (token_hash + code) should dominate; GET /verify only from pre-switch emails
select log_attributes['path'], log_attributes['method'], log_attributes['status'], log_attributes['error_code'], count()
from logs where source='auth_logs' and log_attributes['path'] in ('/verify','/resend','/signup','/token')
group by 1,2,3,4;

-- edge_logs: scanners should no longer reach Supabase /verify with POST (they only GET the Vercel page)
select timestamp, log_attributes['request.method'], log_attributes['response.status_code'], log_attributes['request.cf.asOrganization']
from logs where source='edge_logs' and log_attributes['request.path'] like '%/auth/v1/verify%'
  and log_attributes['request.cf.asOrganization'] in ('Microsoft Corporation','Google LLC') order by timestamp;
```
```sql
-- B: code attempts and outcomes since deploy
select split_part(key,':',1) as bucket, count(*) as windows, max(count) as max_in_window
from public.rate_limits where key like 'school-code%' and window_start > 'DEPLOY_TS' group by 1;

select count(*) filter (where u.school_verified) as verified, count(*) as total
from public.users u join auth.users a on a.id=u.id where a.created_at > 'DEPLOY_TS';
```
- In the Vercel dashboard, go to Logs, filter `/api/auth/school-email/confirm-code`, and check the status mix (200 vs 400 `code_invalid` vs 429).
- Two students are already stuck: `1b25c91e` (gmail) and `d09cf6a8` (iu.edu) are confirmed but have never signed in, and `2c9552eb` never confirmed. Once A is live, a personal "your account is confirmed, just sign in" note would recover them. That is Franky's call; nothing is sent automatically.

---

## 7. Open questions for the founder

1. **The IU email step (B): add a typed code and keep the link tied to the signed-in account? (Recommended.)** The alternative is making the link work while signed out, which lets one careless click verify someone else's account with a student's IU address. If you pick that anyway, Batches 4-5 change to a single-use stored token and a table migration.
2. **An IU address used as the login email at signup: a soft hint (recommended) or a block?** With the tap-to-confirm page, IU mail no longer burns the link, so a hint is enough. A block adds a validation error and copy to Batch 3.
3. **Remember the pending signup address in that browser for 24h** (`localStorage`, never in a URL) so "Send a new email" can be one tap? If no, the resend and code boxes always ask for the address, and `pending-signup.ts` is dropped from Batch 1.

---

**Not in scope, flagged:** password-reset links have the same one-time GET weakness. 3 of the 8 "One-time token not found" errors were on `/auth/update-password` (`generateLink` at `password-reset/route.ts:68`; hash handling at `update-password/page.tsx:19-45`). The same fix applies there: `hashed_token`, an `/auth/update-password?token_hash=…&type=recovery` link, and a tap-to-continue button.
