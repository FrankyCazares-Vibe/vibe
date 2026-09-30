# Vibe onboarding map (canonical, 2026-09-14, HEAD 917775f)

This map merges seven read-only reports: auth-entry, onboarding-desktop, onboarding-phone, verify-terms, first-run, live-funnel and history. It replaces all seven. Paths are relative to `/Users/franciscocazares/vibe`.

**Short names**
- **OH** = `public/html/onboarding.html` (desktop, loaded in an iframe)
- **OM** = `src/components/mobile/OnboardingMobile.tsx` (phone)
- **IC** = `src/components/ImageCropperModal.tsx`
- **"Phone"** = viewport under 900 CSS px (`src/lib/use-is-mobile.ts:14-16`). That includes iPads in portrait and every in-app browser on a phone.
- **"Desktop"** = 900 px and up, including iPads in landscape.

**Synthesis checks I ran myself (read-only)**
- Re-read the key cited lines: callback, signup, login, verify-school, the school-email request route, onboarding-complete, resume-doc-url, the OM handle check, the OM sticky header, the OM step-1 Skip, the OH Skip / handle check, the tour-flag setters and the trigger migrations. All matched the readers except where section 6 says otherwise.
- Ran one prod SELECT on `auth.flow_state`. It showed `cf123541` has an issued code that was never exchanged, which settles a contradiction between readers (section 6, Q1).

**Five things a fixer should know first**
1. **The confirmation link breaks when opened in a different browser, and that is the biggest leak.** It uses PKCE, so it only signs a student in when opened in the browser they signed up in. 6 of the 9 students who clicked it got `/auth/login?error=auth_callback`. The error copy then says "sign up again", which is a silent no-op for an address that is already confirmed.
2. **Every Sept 14 signup was on an iPhone, mostly inside Snapchat's in-app browser.** Desktop-only bugs currently touch 0 live accounts.
3. **Phone students never get the welcome tour.** They also land in an app with no fresh content: newest post May 19, 0 upcoming events, 0 trending tags.
4. **Nothing in onboarding is saved until Finish.** Refresh, Back, leaving, a sign-in toast, or crossing 900 px (rotation, zoom) wipes everything typed.
5. **The gate order is not what the brief assumed.** It is auth → email confirmed → consent → **school email → Otto onboarding**. Campus (`users.school`) is not a gate at all (section 2).

---

## 1. The journey, step by step

**[DIVERGES]** marks a place where desktop and phone behave differently. "Same" means one shared component.

| # | Step | What the user sees | Desktop file:line | Phone file:line | API | Required? | Persisted when | Failure behavior |
|---|---|---|---|---|---|---|---|---|
| 1 | Landing `/` **[DIVERGES: layout]** | Typewriter intro, orbital "pick a form" game, "Sign up with your school email. Your campus, your career, one profile.", links "New here? Create your account →" and "Already have an account? Log in →", sun link after 3 rings. Footer "vibe · prototype" with no legal links | `src/app/page.tsx:5-7`; `src/components/landing/home-landing.tsx:26-34` (2 lines), `:190-215`, `:218-221`; `landing-orbit.tsx:40,69-74` | Same component. Typewriter uses 3 lines (`home-landing.tsx:26-34`). Hero and orbit are each `min-height:100vh` (`globals.css:395-406,469-479`), so the CTAs sit about 2 screens down | none | No (direct URLs work) | Nothing | Every CTA waits 750 ms for an animation (`home-landing.tsx:12,69-91`). No session check: signed-in students see marketing too. No rule in `src/proxy.ts` |
| 2 | Signup form `/auth/signup` | "Create your account." / "Use your personal email — the one you actually check. Your school .edu is verified separately in the next step." Step pills "1 Account · 2 .edu · 3 Otto". Fields: Personal email ("not your .edu", not enforced); Password ("8–20 characters", no show toggle, no confirm); consent checkbox "I'm 18 or older and I agree to the Terms…" (links open a new tab); Create account stays disabled until checked | `src/app/auth/signup/page.tsx:90-199`; styles `globals.css:1065-1553` | Same component. Breakpoints at 540/460 px (`globals.css:1520-1553`). Back pill overlaps card, step label truncates to "Accou…", submit at the fold | Browser `supabase.auth.signUp` → `POST /auth/v1/signup?redirect_to=…/auth/callback?next=/auth/school-email?account_verified=1` (`:50-63`; `src/lib/auth/email-confirm-redirect.ts:6,14-18`) | Yes (email, password 8–20, checkbox) | On submit: `auth.users` row plus a `public.users` row from trigger `handle_new_user` (`supabase/migrations/20260906120000_terms_acceptances.sql:68-130`), which stamps consent, handle `u<32hex>` (`:82`) and name = email local part (`:105-110`). The PKCE code verifier goes into **this browser's** cookies | Raw Supabase `signErr.message` (`:65-68`). Over 20 chars: "Password must be 20 characters or fewer." (`:41-44`). A second tap within 60 s gives raw 429 "For security purposes, you can only request this after N seconds" and `setMessage(null)` (`:30`) erases the success banner |
| 3 | "Check this inbox" state | Green banner: "Check this inbox for a confirmation link. Once you click it, we'll ask for your campus .edu next." The form stays filled and the button re-enables | `signup/page.tsx:64,74-76` | Same | none | Must leave for the inbox | Nothing new | Nothing listens for auth changes, so this tab never advances. An address that is already confirmed gets this same banner with **no email sent** (Supabase `user_repeated_signup`) |
| 4 | Confirmation email (Supabase via Resend SMTP) | Subject "Confirm your Vibe account"; "This is Vibe, the campus app for IU Indianapolis… Confirm my account… This link expires in 1 hour." | Supabase template (dashboard); `mailer_otp_exp=3600`; `rate_limit_email_sent=30/h` project-wide; `smtp_max_frequency=60s` | Same (usually opened in Gmail / Outlook / Google app, **a different browser**) | `GET /auth/v1/verify?token=pkce_…&type=signup` → 303 `/auth/callback?code=…&next=…` | Yes | `email_confirmed_at` is set **at /verify**, before the app exchanges the code | Expired or already-used token: Supabase redirects with `#error=…` and no `code` → callback → login error. Mail link scanners can use up the single-use token |
| 5 | `/auth/callback` | Unstyled grey text "Signing you in…" then "Continuing…" | `src/app/auth/callback/page.tsx:84-140` (UI `:142-146`) | Same | Browser `exchangeCodeForSession` (PKCE, forced by `@supabase/ssr` 0.6.1, `node_modules/@supabase/ssr/dist/main/createBrowserClient.js:37`), or `setSession` for hash tokens; polls 12×50 ms for a session | Yes | Session cookie; `sessionStorage` lock `vibe_pkce_<code>` (per tab) | Every failure goes to `/auth/login?error=auth_callback`: no code (`:90-92`), exchange error (`:107-110`), setSession error (`:119-121`), no session after polling (`:126-128`). **A different browser from signup always fails**: missing verifier throws client-side and leaves no server log |
| 6 | `/auth/login` (fallback after a failed callback, and for returning students) | "Welcome back." + "Use your personal email…"; fields Personal email, Password, "Forgot?". Banners: `?error=auth_callback` "That confirmation link is invalid or expired. Sign in if you already confirmed your email, or sign up again."; `?school_verified=1` "Campus email verified. Sign in with the personal email you used to sign up…" | `src/app/auth/login/page.tsx:26-117`; server-renders only "Loading…" (`:12,140-152`) | Same | `signInWithPassword` → `POST /auth/v1/token?grant_type=password`; then `getPostLoginDestination` (`src/lib/auth/post-login.ts:22-56`) → `GET /api/me/onboarding-state` (`src/app/api/me/onboarding-state/route.ts:13-40`); `window.location.assign` | Yes, for anyone whose callback failed | Session | Raw "Invalid login credentials" / "Email not confirmed" (`:31-35`); "No session returned — check your email and password." (`:36-40`). The URL error and a new error can both show (`:111-117`). No resend-confirmation control anywhere. No redirect for signed-in users |
| 6b | Password reset branch `/auth/forgot-password` → email → `/auth/update-password` | Unstyled page "Reset password" / "We'll email you a link to set a new password (via Resend)." with field "Email". Then "New password" | `src/app/auth/forgot-password/page.tsx:41-88`; `src/app/api/auth/password-reset/route.ts:21-72`; `src/lib/email/resend-transactional.ts:15-34`; `src/app/auth/update-password/page.tsx:19-110` | Same | `POST /api/auth/password-reset` (5/IP/15 min, 3/email/h) → `admin.generateLink(recovery)` → Resend; `updateUser` | Only if the password is lost | Password on `updateUser` | Always "If an account exists…". A 429 says "Too many requests. Try again shortly." A dead link still shows the form, and submit gives raw "Auth session missing!" (`:24-33,60-65`). Raw 422 "New password should be different…". Success → `router.push('/auth/login')` with no message (`:66-67`). Recovery uses implicit hash tokens, so it **does** work cross-browser |
| 7 | `/auth/terms` (legacy or stale-consent accounts only) | "One quick thing." / "We now record your agreement… and that you're 18 or older… One tap and you won't see this again." Checkbox, "Continue →", tail "delete your account" / "sign out" | `src/app/auth/terms/page.tsx:22-77`; `accept-terms-form.tsx:38-160` | Same | `POST /api/me/accept-terms` (10 per 10 min; version check `:52-62`) | Yes, when `hasRecordedConsent` is false (`src/lib/legal/terms.ts:22-26`) | `users.terms_*` + `terms_acceptances` row on success | 401 → login and back. "Couldn't save your agreement. Please try again." Missing users row → 404 "Profile not found" (`route.ts:94-96`). New signups skip this step: 10 of 10 were stamped by the trigger |
| 8 | `/auth/school-email` | "Loading…" until a client `getUser` succeeds. Banner (once, with `?account_verified=1`): "You're confirmed. Your login email is set. One last verification: add your IU email (@iu.edu or @iupui.edu)…". "Verify your campus." / "…not the one you signed up with". Steps "Account ✓ / iu.edu / Otto". Field "School email" (placeholder you@iu.edu, `autoComplete=email`), "Send verification link →", "← back", "Wrong email used to sign up? Log back in" | Server gate `src/app/auth/school-email/layout.tsx:10` → `src/lib/auth/campus-access.ts:52-79`; page `src/app/auth/school-email/page.tsx:34-242` | Same | Raw `fetch` `POST /api/auth/school-email/request` (`page.tsx:111-137`; route order in step 9 notes) | Yes | **Nothing in the DB** until confirm; only a `rate_limits` counter. The 48 h HMAC token is stateless and reusable (`src/lib/auth/school-email-token.ts:46-61`) | Success: "Check your school inbox for a verification link." and stays put: no resend, countdown, spam hint or polling. 403 `terms_required` → `/auth/terms?next=/auth/school-email` (`:122-127`). Anything else shows `data.error` verbatim (`:128-130`): "Unauthorized", 429 "Try again shortly.", 409, raw Resend error. Network: "Request failed." Client with no session after 20×75 ms + 4 s → `/auth/login?next=/auth/school-email` (`:79-87`) |
| 9 | School-email request route + email | Email subject "Verify your school email on Vibe"; "Confirm this email is your campus (.edu) address…"; "Verify school email"; "Link expires in 48 hours". HTML only | `src/app/api/auth/school-email/request/route.ts:30-178`; `src/lib/email/resend-transactional.ts:37-57`; domains `src/lib/auth/school-email-domains.ts:11-14,60-67` | Same (IU mail = Microsoft 365; often opened in the Outlook app or on a laptop) | Route order: 503 config (`:30-49`) → 401 (`:57-59`) → consent (`:61-62`) → 400 JSON/format (`:64-83`) → 400 non-IU (`:85-93`) → **rate limits 3/user/h then 10/IP/h** (`:101-111`) → 500 profile read (`:117-129`) → 200 already verified (`:131-139`) → **409 linked to another account** (`:155-163`) → sign token → `next` = `/profile` if Otto done else `/onboarding` (`:168-171`) → Resend, 503 raw on failure (`:173-178`) | Yes | — | Budget is spent before the 409 and before Resend failures. `Retry-After` is always 3600 (`src/lib/rate-limit.ts:36,57,62`). Limiter fails open (`:31-40`) and keys on the left-most `X-Forwarded-For` (`:44-52`) |
| 10 | `/auth/verify-school?token&next` | "Verifying your school email…" → "You're verified" (flash) → redirect. Errors: "Could not verify" + message + "Try again" link. No token: bare red "Missing verification token. Open the link from your email." | `src/app/auth/verify-school/page.tsx:21-181` | Same | JS `POST /api/auth/school-email/confirm` (`page.tsx:28-33`; route `confirm/route.ts:31-135`). Scanner-safe: GETs can't use it up | Yes | `users.school_email` + `school_verified=true` at confirm (`confirm/route.ts:121-127`); idempotent on re-click (`:74-90`) | 401 (common when opened in the mail app's browser or another device) → `router.replace('/auth/login?next=<verify URL>')` after one frame (`:40-48`); login shows **no** banner for this case. Errors: invalid/expired (`:53-59`), different account 403 (`:61-70`), non-IU (`:95-103`), claimed 409 (`:105-119`), 500 (`:129-135`). Success: signed in → `next` (normally `/onboarding`) or `/profile?school_verified=1` (`:66-73`). Client can't see the user → `/auth/login?next=…&school_verified=1` (`:76-82`) |
| 11 | `/onboarding` gate and fork **[DIVERGES: component]** | Blank until hydrated. Desktop: full-screen dark iframe. Phone: React flow | `src/app/onboarding/page.tsx:24-63`; `OnboardingSwitch.tsx:23-37` → iframe `/onboarding/classic` (`src/app/onboarding/classic/route.ts:21-80`; repeats the gates, serves OH `no-store`) | `OnboardingSwitch.tsx:19-21` → OM. **The server always renders the desktop branch** (`use-is-mobile.ts:36-38`), so phones start loading the iframe (second gated request + Google Fonts) before swapping | none (server gates); `X-Frame-Options: SAMEORIGIN` (`next.config.ts:57`) | Yes, until `otto_answers` is non-empty | — | Gates: no user → login `?next=/onboarding[?replay=1]` (`:36-38`); no consent → terms (`:50-54`); not verified → `/auth/school-email` (`:55-57`); done and not replay → `/profile` (`:58-60`). Crossing 899↔900 px later remounts the other tree and **loses everything** (`use-is-mobile.ts:18-29`) |
| 12 | Onboarding step 1 "Hello" **[DIVERGES]** | "i'm otto." / "think of me as your campus compass…" / "about two minutes — profile, experience, then your documents"; "Let's go →" | OH:348-363. Header "Skip onboarding" on every step (OH:330); "Maybe later" (OH:360); logo asks before leaving (OH:329,1007-1010); `cursor:none` + custom cursor (OH:22,30,704-726) | OM:536-549, CTA OM:856-864. **No Skip and no "Maybe later" on step 1** (OM:519-529); logo is inert text (OM:515-517); orb animation ignores reduced motion (OM:1046-1091) | none | No fields | Nothing | No Back control anywhere in onboarding; no history entries per step (OH:729-750) |
| 13 | Step 2 "let's pin down your profile" **[DIVERGES]** | "same fields as your Vibe profile — a quick pass now; **photo, banner, and fine-tuning on the next screen**". Name, Handle @ (live check), Bio, Campus (preselected IU Indianapolis), Major, Department/school, Year, Interests, Skills, "What are you here for?". "Continue →" / "Skip to resume →" | OH:366-445 (fields 375-437). Name blank, not prefilled (OH:378). Handle is a white box on a dark form (OH:382-385). **Bloomington** major/school lists (OH:589-611,624-687). Campus default OH:572,583. Handle check via `vibeRequest`, "couldn't check" on failure (OH:792-820). Fixed header over scrolling content (OH:39,62-67) | OM:552-749, CTA OM:865-882. **Indianapolis** lists (OM:17,74-82; `src/lib/iu/majors.ts`, typo "Americansign Language" `:84`). Campus default OM:89-90,179. Handle check raw `fetch`: **"✗ taken" when the check itself fails** (OM:244-263). Labels not linked to inputs (OM:966-969). Header is `position:sticky` inside an `overflow:hidden` root, so it scrolls away (OM:1107,1137-1138). Fixed bottom bar (OM:1441-1455) | `GET /api/handle/check?h=` (`src/app/api/handle/check/route.ts:21-45`) | Nothing required (no client or server gating) | Memory only (OH:548-553; OM:169-202) | Interests cut to 10×40 and skills to 12×30 silently (OH:831-840; OM:342-344) |
| 14 | Step 3 "where have you worked?" | Role 1 + optional Role 2: Company, Title, Dates, Location, "What you did". "Continue →" / "Skip" (both only advance) | OH:448-481 | OM:752-780, CTA OM:883-900 (Role 2 placeholders same as Role 1) | none | No | Memory only | A row with no company **and** no title is silently dropped, description included (OH:768; OM:352; `src/lib/profile/work-experience.ts:19`). "Skip" doesn't discard typed values; they save at Finish |
| 15 | Step 4 "resume or portfolio" **[DIVERGES]** | "Upload PDF or image" button + status; "Or paste a link"; preview below; "Finish & open my profile →" | Upload OH:493-497, 861-893 (accept includes GIF). Preview OH:895-923. Link note on blur OH:506-513, 946-977 ("Links need to start with https://…", "You uploaded a file, so we'll save that instead of this link.") | Upload OM:794-807, 275-303. Link field has **no validation and no note** (OM:812-828). Preview recalculates every keystroke (OM:306-320,830-848). Finish in fixed footer (OM:901-910) | `POST /api/me/profile-upload` multipart `kind=resume` (`src/app/api/me/profile-upload/route.ts:24,35,82-140`): 401 → 30/10 min → terms → kind → size 1 B–8 MB → pdf/jpeg/png/webp → private bucket; returns `/api/resume/<uid>/resume-<uuid>.<ext>`. Preview via `GET /api/resume/<key>` → 307 to 300 s signed URL (`src/app/api/resume/[...path]/route.ts:24,103-108,171`) | No | Storage object at file pick; DB reference only at Finish | Raw server strings ("Invalid file size", "Unsupported file type", "Unauthorized", "Too many requests. Try again shortly.") or "Network error". Input not reset after failure, so the same file can't be re-picked (OH:880-892; OM:290-300). No busy state; upload can't be cleared. Files over 4.5 MB probably hit Vercel's body limit → non-JSON → "Network error" (unverified) |
| 16 | Finish (save) **[DIVERGES]** | "Saving…" → warp → profile | OH:1048-1153. Pre-checks: link (OH:1081-1089), handle format sends back to step 2 with toast (OH:1090-1094). Then save (OH:1102-1113) → localStorage skeleton (OH:1115-1116) → handle PATCH (OH:1123-1144, cooldown copy OH:1131-1137, focus Handle OH:1045) → `__vibeTopNav(next + welcome=1)` after 750 ms (OH:1146-1182) | OM:323-457. **No link pre-check** (OM:363-366). Save OM:382-396. Handle PATCH **only if regex passes; otherwise silently skipped** (OM:403). 409/400 → step 2, focus Name (OM:213,410-423). Other errors → toast (OM:424-426). `location.href = next + "&welcome=1"` after 700 ms (OM:432-439) | `POST /api/me/onboarding-complete {otto_answers, profile}` (`src/app/api/me/onboarding-complete/route.ts:30-99`): 401, 403 terms, 400 JSON / "Invalid otto_answers" / "Invalid profile" via `sanitizeOnboardingProfile` (`src/lib/profile/onboarding-prefill.ts:81-174`), one service-role UPDATE; `next` = `/auth/school-email` if unverified, else `/profile?otto=1` if the patch is non-empty (always, since campus is always sent) or `/profile` (`:89-94`). Then `PATCH /api/me/handle` (`src/app/api/me/handle/route.ts:13-35`; `src/lib/profile/handle-change.ts:40-56`) | `otto_answers` must be an object; profile fields optional | **Profile + `otto_answers` saved in one UPDATE before the handle claim.** Blank fields are omitted and never cleared. Onboarding counts as "done" from that moment (`post-login.ts:7-10`) | Toast copy (`src/lib/feedback/failure-copy.ts:99-144`; desktop `public/html/_persistence.js:129-148`): 400 → "Couldn't save your profile." (no field named); 5xx → "…Try again."; 401 → "You've been signed out…" [Sign in]; 403 → "Accept the Terms first…" [Review Terms]; offline → "Couldn't reach Vibe…". The action buttons navigate the whole page and lose all answers. A handle failure after save leaves the student "done" with `u<hex>` if they leave. Phone link without `http(s)://` → 400 every retry (`src/lib/profile/resume-doc-url.ts:124`) |
| 17 | Skip onboarding **[DIVERGES]** | Dialog/sheet "Skip onboarding?" / "What you've typed here won't be saved. You can fill in your profile any time from your profile page." "Keep going" / "Skip anyway" | OH:525-534, 987-1003 → **`/campus`** (ignores server `next`); Escape closes, backdrop doesn't | OM:459-488, 913-945 → server `next` = **`/profile`**; backdrop closes even mid-skip (OM:917-919); only from step 2 on | `POST /api/me/onboarding-complete {otto_answers}` only | — | `otto_answers` only; school/name/handle stay as trigger defaults (`school=''`) | Failure: button resets + toast. No tour on either path. Only path that still creates campus-less accounts |
| 18 | Landing on profile + welcome tour **[DIVERGES]** | Desktop: "Loading your profile…" → static profile → 4-stop spotlight tour (cover, avatar, bio, composer) → "Take me to campus →". Phone: profile, **no tour, no welcome**; URL keeps `?otto=1&welcome=1` | `src/app/profile/page.tsx:14` → `ProfileSwitch` → `src/app/profile/profile-html-bridge.tsx:29-71` (bootstrap, then `location.replace('/html/profile.html?app=1&welcome=1')`; failure text "We couldn't load your profile row (HTTP …)" `:48-57`) → `public/html/profile.html:10064-10141` (starts from `?welcome=1` or `vibe_tour_pending=profile`; seen key `vibe_profile_tour_seen_v1` `:10078`; sets `vibe_tour_pending=campus` `:10124`) | `ProfileSwitch.tsx:24-29` → `ProfileMobile.tsx:243` `useMobileTour("profile")`, which fires only when `localStorage.vibe_tour_pending === "profile"` (`src/components/mobile/use-mobile-tour.ts:176-183`). Only setter: Settings → Replay (`src/components/settings/SettingsClient.tsx:125`) | `GET /api/me/profile-bootstrap` | — | Tour-seen flags in localStorage, per browser | Desktop welcome banner can never fire: needs `!user.name`, but the trigger always sets a name (`profile.html:7344-7347`). Phone empty profile: "No posts yet" + "Open the feed →" leaves the profile (`ProfileMobile.tsx:2231-2236`). No avatar or banner prompt on either |
| 19 | Desktop tour legs: campus → network **[DIVERGES: desktop only]** | `/campus?welcome=1`: tour of identity chip, feed ("Live posts from your school."), tabs, search → `/network?welcome=1`: tabs + Otto corner, "I'm set →", ending on **Connections: "No mutuals yet"** | `src/app/campus/campus-home.tsx:381-455` (sets `vibe_tour_pending=network` `:441`); `src/components/network/NetworkPageClient.tsx:113,135-190,786-792` | None after onboarding. `CampusMobile.tsx:72` / `NetworkMobile.tsx:82` legs only run after a Settings replay | `/api/feed`, `/api/stats/campus`, suggestions | — | — | Three full page loads; feed is global, newest post 2026-05-19 |
| 20 | "First useful moment": follow someone, or post / RSVP / join an org **[DIVERGES: default tabs and copy]** | Campus feed (composer + months-old posts), Otto strip ("No upcoming events…", "No trending tags yet…"), Events empty "Be the first to post one — hit '+ Create event' above." (button hidden without an org), Network suggestions (include half-onboarded `u<hex>` accounts), Messages empty, Otto Today "here's what caught my eye." at 0/0/0 | `campus-home.tsx:92-97,293-296,3424-3437,4559-4604,7012-7091,11377-11457`; `NetworkPageClient.tsx:93,113,786-807`; `public/html/messages.html:1013-1031`; `src/app/otto/page.tsx:36-50`; `OttoHero.tsx:40-48` | `CampusMobile.tsx:77-83,753-756` ("The feed is quiet… tap the + in the corner."), `:1482-1485` ("Pull to refresh later." — not implemented), `:1644,2325-2328`; `NetworkMobile.tsx:84` (opens on **Discover**), `:592,621-630`; `MessagesMobile.tsx:884-915,3312-3321,3505`; `MapMobile.tsx:398-432` | `/api/me/suggested-connections` (global newest-first slice, no verified/onboarded filter, `route.ts:167-172,310-311`), `/api/users/search` (`route.ts:81-139`), `/api/campus-map` (`route.ts:43-127`), `/api/trending/hashtags`, `/api/stats/campus` (counts all users, `route.ts:28-34`) | — | Follow → `connections` | Live: 3 of 6 new students followed someone; 0 posted, 0 messaged, 0 avatars |

---

## 2. Gate order and loops

### 2.1 Real gate order

Brief's assumption vs the code:

| Brief assumed | Actual order in code |
|---|---|
| auth → email confirm → terms/age → onboarding → school verification → campus | **0a** signed in → **0b** email confirmed (Supabase) → **1** current consent → **2** `school_verified` → **3** `otto_answers` non-empty → **home `/profile`** |

- **School verification comes before Otto onboarding.** The S30 order was flipped.
- **Terms/age is stamped at signup** for everyone created since Sept 6. Only legacy accounts or a future `TERMS_VERSION` bump see `/auth/terms`.
- **Campus (`users.school`) is not a gate.** Onboarding preselects IU Indianapolis. Skip leaves it `''`, and that only degrades the map (asks them to pick a campus) and suggestion ranking.
- **`src/proxy.ts` enforces none of gates 1–3** (`:67-116`). It only refreshes the session and handles `/html/*`, anonymous `/profile`, and signed-in `/feed`.

| Gate | Where enforced | Redirect target | Keeps `next`? | Explains why? |
|---|---|---|---|---|
| 0a Signed in | `campus-access.ts:19-21,57-59`; `onboarding/page.tsx:36-38`; `classic/route.ts:29-34` (drops `?replay=1`); `terms/page.tsx:59-62`; `settings/page.tsx:18-20`; school-email client `page.tsx:79-87`; verify-school client `:40-48` | `/auth/login?next=…` | Yes | No; generic "Welcome back" |
| 0b Email confirmed | Supabase (prod Confirm ON; local `supabase/config.toml:221` OFF) | Callback → login error, or login raw "Email not confirmed" | — | Misleading ("invalid or expired… or sign up again") |
| 1 Consent (`hasRecordedConsent`, `terms.ts:22-26`) | `campus-access.ts:35-37,70-72`; `onboarding/page.tsx:50-54`; `classic/route.ts:47-53`; every write API via `src/lib/legal/require-terms.ts:27-39`; static shells (`profile.html:7291`, `_persistence.js:575-582`) | `/auth/terms?next=<path>` | Yes | Yes |
| 2 `school_verified` | `campus-access.ts:38-40`; `onboarding/page.tsx:55-57`; `classic/route.ts:54-59`; client `post-login.ts:47`; `onboarding-complete` `next` (`route.ts:89-90`) | `/auth/school-email` | **No** | No |
| 3 Otto done | `campus-access.ts:41-43`; `enforceSchoolEmailPage` `:73-78`; `post-login.ts:48` | `/onboarding` | **No** | No |
| Not gated on purpose | `/settings` skips consent (`settings/page.tsx:32-34`); `/auth/verify-school` has no server gate; confirm API checks login only; `/api/me/onboarding-state` ignores consent | — | — | — |

### 2.2 Every redirect edge

- **E1 `/`**: never redirects.
- **E2 `/auth/signup` submit**
  - Session returned (Confirm OFF only) → `/auth/school-email`.
  - Otherwise stays, shows the banner (`signup/page.tsx:69-76`).
  - Back → `/` (`:81`).
- **E3 Confirmation email**
  - Valid token → `/auth/v1/verify` → 303 `/auth/callback?code&next=/auth/school-email?account_verified=1`.
  - Expired, used or superseded token → Supabase error redirect with no `code`.
- **E4 `/auth/callback`**
  - No `code` and no hash tokens → `/auth/login?error=auth_callback` (`:90-92`).
  - Lock present for this code in this tab → `next` (`:101-106`).
  - Exchange error → login error (`:107-110`). setSession error → login error (`:119-121`). No session after 12×50 ms → login error (`:126-128`).
  - Success → `next ?? /auth/school-email?account_verified=1` (`:135-138`).
- **E5 `/auth/login` success** (`post-login.ts:22-56`, `login-next.ts:5,37-42`)
  - Safe `next` (not `/feed` or `/campus`) → `next`.
  - Otherwise onboarding-state: not verified → `/auth/school-email`; no Otto → `/onboarding`; else `/profile`.
  - Any failure → `/onboarding`.
  - Consent is not checked here; the destination page re-checks.
- **E6 `enforceCampusAccess(path)`**, used by `/campus`, `/profile`, `/feed`, `/messages`, `/network`, `/otto`:
  - No user → login `?next=path`.
  - No consent → terms `?next=path`.
  - Unverified → `/auth/school-email` (next dropped).
  - No Otto → `/onboarding` (next dropped).
  - A DB read error sets `row=null`, which gives a spurious terms bounce (`:26-30,64-68`).
- **E7 `enforceSchoolEmailPage`**: no user → login `?next=/auth/school-email`; no consent → terms `?next=/auth/school-email`; verified → `/onboarding` or `/profile` by Otto state, silently.
- **E8 `/auth/school-email` client**
  - No client session after about 5.5 s → login `?next=/auth/school-email`.
  - API 403 `terms_required` → terms.
  - "← back": in-app history → back; otherwise `/campus` → E6 → back here (`page.tsx:97-103,153`).
  - "Log back in" → `/auth/login` with no sign-out (`:237-242`).
- **E9 `/auth/terms`**
  - No user → login `?next=/auth/terms?next=…`.
  - Consent already on record → `next` (same-origin, never terms itself; default `/onboarding`, `page.tsx:22-33,72-74`).
  - Form 401 → login and back. Success → `router.push(next)`.
  - "delete your account" → `/settings#delete-account` (ungated).
- **E10 School-email request** builds a verify link with `next=/profile` if Otto is done, else `/onboarding`.
- **E11 `/auth/verify-school`**
  - Confirm 401 → `/auth/login?next=<this verify URL>` (no banner).
  - Success and the client sees the user → `next`, or `/profile?school_verified=1` when next is `/profile`.
  - Success but the client can't see the user → `/auth/login?next=…&school_verified=1` (banner).
  - Error → "Try again" → `/auth/school-email`.
- **E12 `/onboarding` and `/onboarding/classic`**: gates 0a → 1 → 2 → done-and-not-replay → `/profile`. On the classic route, a redirect renders **inside the iframe**.
- **E13 Finish**
  - Desktop → `window.top` `/profile?otto=1&welcome=1`.
  - Phone → `location.href` same.
  - If unverified, server `next` = `/auth/school-email` (unreachable past the gate).
- **E14 Skip**: desktop → `/campus`; phone → `/profile`; replay → `/profile` on phone, `/campus` on desktop.
- **E15 Toast actions** (Sign in / Review Terms) → top-level `/auth/login` or `/auth/terms` with `next=/onboarding` (`_persistence.js:56-67,82-88,228-233`). All answers are lost.
- **E16 Proxy** (`src/proxy.ts`)
  - `/html/*.html` signed out → `/auth/login?next=<clean route>` (`:71-99`; except `profile.html?handle=`).
  - `/html/onboarding.html` signed in → `/onboarding` (`:32,93,98`).
  - Anonymous `/profile` → login (`:102-107`).
  - Signed-in `/feed` → `/campus` (`:111-113`).
- **E17 Profile**: `/profile` → bridge → `/html/profile.html?app=1&welcome=1` → tour done → `/campus?welcome=1` → `/network?welcome=1`.
- **E18 `messages.html`**: bootstrap not ok, or a 403 that isn't `terms_required` → `/`, the marketing landing (`messages.html:3344,3348`).
- **E19 Static shells**: 403 `terms_required` → `location.replace('/auth/terms?next=…')`.
- **E20 `/the-map`**: signed out → login; non-admin → 404 (`the-map/page.tsx:25-36`).

### 2.3 Loops, strands and dead ends

| ID | Path | Condition | Status |
|---|---|---|---|
| **L1** | Confirm link → callback fails → "…or sign up again" → signup shows "Check this inbox" but sends nothing → wait / repeat | Link opened in a different browser/app/device than signup, and the email is already confirmed | **Proven**: 2 accounts, 9 `user_repeated_signup`. Both people probably escaped by creating second accounts (section 3) |
| **L2** | Re-click the confirm link in a new tab → 403 → login error | Used token; per-tab `sessionStorage` lock | Proven (1b25c91e ×2) |
| **L3** | School-email "← back" → `/campus` → back to `/auth/school-email` | No in-app history (opened from email) | Code-certain; effectively a no-op button |
| **L4** | "Wrong email used to sign up? Log back in" → login (no sign-out, no signed-in redirect) → same account → school-email | Always | Code-certain |
| **L5** | Verify link while signed into another Vibe account → 403 "belongs to a different account" → "Try again" → that account's school-email; no sign-out on any of these pages | Shared device / multiple accounts | Code-certain, 0 seen |
| **L6** | School email "already linked to another account" (409) | Duplicate account already verified that IU address | **Dead end**, no support path. Duplicate pairs exist (d09cf6a8 ↔ 0fa3c2d9) |
| **L7** | `/auth/verify-school` with no token | Truncated link | Dead end, no link out |
| **L8** | Onboarding refresh / Back / leave / toast action → any app route → `/onboarding` step 1 blank | Always (memory-only state) | Code-certain; not infinite, but loses data every time |
| **L9** | Crossing 900 px → other tree mounts → step 1 blank | Rotation (≥900 px landscape phones, iPads), zoom, half-screen laptop | Code-certain |
| **L10** | Handle claim fails after profile save → step 2. If they refresh or leave → `/onboarding` → `/profile` with `u<hex>` handle, no tour | 409 taken / 400 reserved / 429 | Code-certain strand |
| **L11** | Phone step 1 has no exit except forward; no Back on any step | Always | Code-certain |
| **L12** | Desktop iframe gate race → login/terms/school-email render inside the iframe → after login `next=/onboarding` → iframe inside iframe | Session expiry or state change between the two requests | Rare |
| **L13** | Terms → "delete your account" → `/settings` (ungated) → any nav → terms | Legacy students who decline | Code-certain |
| **L14** | Accept-terms 404 "Profile not found" | Missing `users` row | 0 live cases |
| **L15** | Verify-school link in the Outlook/Gmail app → 401 → log in with personal password inside that webview → onboarding continues there; original tab stays on "Check your school inbox" | Mail app opens links in its own browser | Code-certain; cohort bursts consistent |
| **L16** | Password reset: second request invalidates the first link; dead link still shows the form → "Auth session missing!"; success → login with no message | Multiple reset requests | Proven (27fcc6f0) |
| **L17** | `TERMS_VERSION` bump → every student through `/auth/terms` once; static-shell writes 403 → terms | Legal A6 deploy | One pass, not a loop |
| **L18** | `messages.html` bootstrap failure → `/` marketing page, with no signed-in shortcut back | Transient bootstrap error | Code-certain |
| **L19** | Consent DB read error → `/auth/terms` → forwards back once the read succeeds | DB hiccup | Spurious bounce only |

---

## 3. Live funnel (prod Supabase, read-only, measured about 21:00 UTC 2026-09-14)

### 3.1 Totals

| Metric | Value |
|---|---|
| Auth users | **18** (0 deleted/anonymous/banned; 5 hard-deleted May accounts left orphan `flow_state` rows) |
| Created last 30 days | **10**, all on 2026-09-14: nine between 02:54 and 03:38 UTC (10:54–11:38 PM EDT Sept 13, iPhones on the IU network, so an in-person push); one at 12:27 UTC (`cf123541`) |
| Real people in that group | About **8–9**. `d09cf6a8` (iu.edu signup email) = `0fa3c2d9` (confirmed: its auth email is 0fa3c2d9's verified school email). `1b25c91e` ≈ `6b037104` (likely: same prefix, device and network, 8 min apart) |
| Devices | All 10 signups on iPhones: Safari, Chrome iOS (CriOS), Google app (GSA), and **Snapchat's in-app browser for 5** (`1b25c91e`, `d09cf6a8`, `ec07943e`, `0fa3c2d9`, `27fcc6f0`) |
| Admins | 3 (F1 founder, A2, A3), all May |
| Content available to a new student | 19 posts total, **newest 2026-05-19**, 0 in 30 days; **0 upcoming events**; 0 trending; 5 orgs / 7 memberships |

### 3.2 Funnel for the Sept 14 group, in gate order (each step counts only people who passed the step before)

| signup | email confirmed | got a session | consent | school verified | Otto done | campus set | bio/major | followed | avatar / post / message |
|---|---|---|---|---|---|---|---|---|---|
| 10 | 9 | **7** | 7 | 6 | 6 | 6 | 5 | 3 | **0** |

All-time (18): confirmed 17, session 15, current consent 11, Otto 13, verified 14, campus 7, avatar 4, post 4, follow 10, message 5, returned on a later day 5.

### 3.3 Per-account story, Sept 14 group

| Account | Signup browser | Confirmation link | How they got in | School-email sends | Verified | Otto | Social | Stuck at |
|---|---|---|---|---|---|---|---|---|
| `1b25c91e` | Snapchat | `/verify` 303, **code never exchanged** | Never. 6 repeat signups (Snapchat, then Safari), 2 re-clicks of a used link (403) | — | no | no | — | **Confirmed, 0 sessions (L1)**. Likely re-registered as 6b037104 |
| `d09cf6a8` (iu.edu login email) | Snapchat | Token hit by a Microsoft-network / Windows Chrome client plus a `python-requests` HEAD from AWS; code never exchanged | Never. Raw 429 ×2; 3 repeat signups | — | no | no | — | **Confirmed, 0 sessions**. Same person as 0fa3c2d9 |
| `ec07943e` | Snapchat | Exchange failed | Password login in Chrome iOS 11 s later. Later reset: 422 `same_password`, forced re-login, 2 failures | 2 | yes | yes | followed | Onboarded, no post/avatar |
| `0fa3c2d9` | Snapchat | Exchange failed | Password login in Safari about 30 s later | 2 | yes | yes | none | Onboarded, no social |
| `27fcc6f0` | Snapchat | Exchange failed | 3 failed logins, 2 reset requests, reset link opened, 5 more failures, success 03:16:19 (no password change recorded) | 1 | yes | yes | none | Onboarded, no social |
| `cf123541` | unknown (12:27 UTC signup) | Exchange failed (verified in `auth.flow_state`) | Password (2 sessions); the 12:28 `email_not_confirmed` ×2 and a 12:28 signup 429 fit this account | 2 | yes | yes | none | Onboarded, no social |
| `b80adedc` | Safari → Safari | PKCE 200 | Callback | 3 (hit cap) | yes | yes | followed | Onboarded, no post/avatar |
| `6b037104` | Safari → Safari | PKCE 200 | Callback | 3 (hit cap) | yes | yes | followed | Onboarded, no post/avatar |
| `0bb7e17b` | Safari → Safari | PKCE 200 | Callback | 1, never confirmed | **no** | no | — | **At `/auth/school-email`**, last seen 03:40 |
| `2c9552eb` | Safari | Never clicked (3 confirmation sends 03:01–03:03, one 429) | Never | — | no | no | — | **Email never confirmed** |

Where the 18 accounts sit right now:
- 1 never confirmed
- 2 confirmed with 0 sessions
- 1 at school email
- 1 May account verified but no Otto (`a1e46fa3`, last seen Jun 8)
- 6 onboarded before consent capture, who will see `/auth/terms` next visit (A2, A3 and 4 May students; none active since Jun 11)
- 3 fully onboarded with no social action
- 3 onboarded with a follow but no post/message/avatar
- 1 active end to end (F1)

**Real-person reading:** the two "stranded" accounts are probably people who got in with second accounts. So the people actually lost are `2c9552eb` (never confirmed) and `0bb7e17b` (school-email step), maybe `1b25c91e`. The orphaned duplicates still show up in other students' Discover and search (C3).

### 3.4 Timing (Sept 14 group)

| Step | Median | n | Notes |
|---|---|---|---|
| Signup → email confirmed | 15 s | 9 | 12–100 s |
| Confirmed → first session | 18 s | 7 | 0–367 s; the long ones are reset/retry |
| Signup → first session | 82 s | 7 | 13–379 s |
| Signup → school verified | ~5 min 21 s | 6 | Inferred from users-row PATCH logs (low confidence) |
| School verified → Otto | ~1 min 48 s | 5 | Inferred |
| Signup → Otto complete | ~6 min 40 s | 6 | 4:02–12:06, inferred |
| Otto → first follow | 44 s | 3 | 14 s – 4:35 |

### 3.5 Log evidence (Supabase, 7-day retention; **Vercel function logs not covered**)

| Signal (Sept 14) | Count |
|---|---|
| Token grants that succeeded: PKCE (confirmation link) vs password | **3 vs 14** |
| `POST /token` password 400 `invalid_credentials` | **19** (02:55–03:16); one iPhone Safari client 7 in 5 min; one Google-app client 8, plus 2 resets |
| `/verify` redirects carrying 403 "Email link is invalid or has expired" | **8 of 18** |
| `POST /signup` 429 `over_email_send_rate_limit` | 6 events (02:54–12:28) |
| `user_repeated_signup` | 9 (1b25c91e ×6, d09cf6a8 ×3) |
| `user_confirmation_requested` | 17 for 10 accounts (7 resends) |
| `user_recovery_requested` | 3 from 2 accounts |
| `POST /token` 400 `email_not_confirmed` | 2 (12:28) |
| `/verify` oddities | 400 "Verify requires a verification type" from a Microsoft network in the same ms as a successful verify; HEAD 405 from `python-requests` on AWS; 504 from a Google network 0.5 s before a real click; 1 transient 504 |
| School-email sends (`rate_limits`) | 14 across 7 accounts, **about 2.2 per verification**; 2 at the 3/h cap; 1 never confirmed |
| School emails | All 14 `users.school_email` are `@iu.edu` (0 iupui.edu). Signup domains: gmail 15, icloud 1, outlook 1, iu.edu 1 |
| Storage | 1 resume upload (200), 2 signed URLs, 0 avatar uploads; no user-facing upload errors all week |
| Trigger / DB | 0 auth users missing a `public.users` row; no trigger errors |

**Noise to exclude when triaging:**
- One signed-in server-side account gets repeated 504s about every 5 min (Sept 11 onward: ~210/day falling to ~37).
- PostgREST "Thread killed by timeout manager" 8–44/day. These timeouts could hit onboarding requests; not attributed.
- Sept 8–12 Postgres errors from audit/test queries.

### 3.6 Data-quality facts that shape what testers see

- 11 users have an empty `school`: 7 May accounts (verified, never set), plus 4 unverified from today.
- 5 users still have a `u<32hex>` handle and an email-prefix name. All 5 are not onboarded, yet they appear in suggestions and search.
- 9 of 13 onboarded users have no avatar. "18 on Vibe" is shown while 13 are onboarded.
- 1 of 6 new onboarded students has no major, so they are invisible on the campus map.

---

## 4. Friction inventory

**Severity bands, in order:** blocks signup (S) > loses data (D) > confusing (C) > cosmetic (X). Within a band, items are ranked by how many funnel accounts they plausibly touch. "Touch" uses the Sept 14 group (10 accounts, all iPhones) unless stated otherwise. **Desktop-only items touch 0 live accounts today.**

### 4.1 Blocks signup

| ID | What a student feels | Evidence | Step | Viewport | Touch |
|---|---|---|---|---|---|
| S1 | "I clicked the confirmation link and it said it's invalid or expired." | PKCE forced (`@supabase/ssr` `createBrowserClient.js:37`); verifier cookie only in the signup browser; `callback/page.tsx:107-110`; no in-app-browser detection anywhere in `src/` | 4–5 | Both (in practice phone: Snapchat/IG signups, mail app opens link) | **6 of 9 who clicked (proven)** |
| S2 | "It told me to sign up again, said check my inbox, and no email ever came." | `login/page.tsx:112-117` copy; `signup/page.tsx:74-76` shows success for a confirmed address; Supabase sends nothing | 3, 6 | Both | **2 accounts, 9 repeat signups (proven)** |
| S3 | "I just made a password and now it says invalid login credentials." (webview has no Keychain; no show toggle or confirm field; raw errors) | `signup/page.tsx:135-149`; `login/page.tsx:31-35` | 2, 6 | Both (worse in in-app browsers) | **4 accounts; 19 failed logins; 3 reset requests (proven)** |
| S4 | "There's no resend button and no 'already confirmed? log in' path." | grep finds no `auth.resend` in `src/` or `public/html`; login banner is the only guidance | 3–6 | Both | Every S1 case + `2c9552eb` (never confirmed) |
| S5 | "The school verification email never came / I had to send it 3 times / now it says try again later." | No spam, Outlook "Other"-tab, expiry or resend guidance; no auto-advance (`school-email/page.tsx:132,221-225`); 3/user/h (`request/route.ts:101-105`); DMARC `p=none`, first test landed in Gmail spam (handoff) | 8–9 | Both | **7 of 7 senders; 5 resent; 2 at cap; `0bb7e17b` stuck (proven)** |
| S6 | "The link I tapped says expired." (1 h single-use; superseded by resend; re-click in a new tab) | `mailer_otp_exp=3600`; per-tab lock `callback/page.tsx:101-106` | 4–5 | Both | **8 of 18 /verify redirects were 403 (proven events)** |
| S7 | "I tapped the IU verify link in Outlook and it asked me to log in again, and then my app was in a different browser." | `verify-school/page.tsx:40-48`; login has no banner for this 401 path; help text `:167-171` flashes unread | 10 | Mostly phone (Outlook/Gmail app) | Plausibly most IU students; cohort password bursts are consistent but not attributed (Q7) |
| S8 | "Nobody at the signup table can get emails." (project-wide 30 auth mails/h; school-email 10/IP/h behind campus NAT; pw-reset 5/IP/15 min) | Supabase config; `request/route.ts:107-111`; `password-reset/route.ts:27-31`; `rate-limit.ts:44-52` (left-most XFF), `:31-40` (fails open) | 2, 6b, 8 | Both | Latent: 9 signups in 44 min on IU network, 17 confirmation mails + 14 school mails; not hit yet |
| S9 | "Finish just says 'Couldn't save your profile' no matter how many times I tap it." | Phone pasted link without `http(s)://` (e.g. `linkedin.com/in/x`): no client check `OM:363-366` → `resume-doc-url.ts:124` null → `onboarding-prefill.ts:151-152` → 400 `onboarding-complete/route.ts:59-65` → `failure-copy.ts:139-144`. Desktop pre-checks (`OH:927-935,1081-1089`) | 15–16 | **Phone only** | Any phone student who pastes a bare link; 0 confirmed |
| S10 | "It said 'Try again shortly' and an hour later it still wouldn't send." | `rate-limit.ts:36,57,62` (Retry-After 3600, copy "shortly"); school-email shows it raw | 8, 6b | Both | 2 accounts at the cap edge |
| S11 | "I signed up with my IU email and the link didn't work." (M365 Safe Links / scanners use up the single-use Supabase GET link) | Nothing blocks .edu signup (`signup/page.tsx:119-133`); landing says "Sign up with your school email" (`home-landing.tsx:191`); scanner traffic on d09cf6a8 | 2, 4 | Both | 1 (`d09cf6a8`); attribution plausible, not proven |
| S12 | "It says my school email is already linked to another account." | 409 dead end, no support path (`request/route.ts:155-163`; `confirm/route.ts:105-119`); budget spent before it | 8, 10 | Both | Latent for every duplicate account from S1/S2 (2 pairs exist) |
| S13 | "The reset link doesn't work / reset says 'Auth session missing!'" | Second request invalidates first; dead link renders form (`update-password/page.tsx:24-33,60-65`) | 6b | Both | 1 (`27fcc6f0`, 3 link-invalid hits) |
| S14 | "School email page just says 'Unauthorized'." | Session expired: raw 401 text, no redirect (`school-email/page.tsx:128-130`; `request/route.ts:57-59`) | 8 | Both | 0 seen |
| S15 | Raw provider error after pressing Send (budget already spent) | `request/route.ts:173-178` | 8–9 | Both | 0 seen |
| S16 | "This link belongs to a different account" with no way to sign out | `confirm/route.ts:61-70`; `verify-school/page.tsx:115-135` | 10 | Both | 0 (shared devices) |
| S17 | Blank page "Missing verification token." | `verify-school/page.tsx:90-96` | 10 | Both | 0 (truncated links) |
| S18 | Finish fails with a resume link copied from Vibe's own storage | `resume-doc-url.ts:132-133`; desktop pre-check doesn't cover it | 16 | Both | 0 |
| S19 | Terms "Profile not found" | `accept-terms/route.ts:94-96` | 7 | Both | 0 (no missing rows) |
| S20 | "I'm at IU Indianapolis but my email is @purdue.edu and it's refused." | Allowlist iu.edu/iupui.edu (`school-email-domains.ts:11-14`; `request/route.ts:85-93`) | 8 | Both | 0 so far; **product decision** |
| S21 | "I'm 17 and can't sign up." | `signup/page.tsx:151-187`; `terms.ts:2` | 2 | Both | By design; expect as a complaint |
| S22 | Login or terms page appears inside the onboarding frame / frame inside frame | `classic/route.ts:25-65` redirects render in iframe | 11 | Desktop | Rare race |

### 4.2 Loses data

| ID | What a student feels | Evidence | Step | Viewport | Touch |
|---|---|---|---|---|---|
| D1 | "I refreshed / hit Back / switched apps and everything I typed was gone, back to step 1." | Memory-only state (`OH:548-553`; `OM:169-202`); no per-step history (`OH:729-750`); every app route → `/onboarding` (`campus-access.ts:41-43`); no Back control. iOS "Take Photo" may reload the tab (verify live) | 12–16 | Both | Every onboarding student (6 finished) |
| D2 | "It said I was signed out, I tapped Sign in, and my answers were gone." | Toast actions navigate top-level (`_persistence.js:56-67,228-233`; `failure-copy.ts:99-110`); in-app browsers keep separate cookie jars | 16 | Both | Plausible in webviews |
| D3 | "I rotated my phone / resized the window and it restarted." | `use-is-mobile.ts:18-29`; `OnboardingSwitch.tsx:19-38`. iPhone Pro Max landscape 932 px, iPads, half-screen laptop, 150% zoom | 11–16 | Both | Large-phone/iPad/laptop users |
| D4 | "It said my handle was taken, I left, and now my handle is u3f9…" | Profile + `otto_answers` saved before handle PATCH (`OH:1102-1144`; `OM:382-430`); `/onboarding` → `/profile` once done (`onboarding/page.tsx:58-60`) | 16 | Both | Anyone whose handle collides / is reserved |
| D5 | "I picked a handle and it didn't save." (e.g. `john.doe`, `ab`) | `OM:403` skips silently; desktop blocks with copy (`OH:1090-1094`) | 16 | **Phone** | Any phone student with a malformed handle |
| D6 | "My resume didn't attach." (tapped Finish during upload; two quick picks race) | No busy state (`OH:496,884,1055`; OM button stays tappable); orphan storage object | 15–16 | Both | 1 upload seen |
| D7 | "I can't remove the file I uploaded, and my link was ignored." | "unless you clear it" but no clear control (`OH:510,552,955-957`; `OM:826`) | 15 | Both | Uploaders |
| D8 | "My second job didn't show up." (row with no company and no title dropped, description included) | `OH:768`; `OM:352`; `work-experience.ts:19` | 14 | Both | Anyone filling partial rows |
| D9 | "Some of my interests / skills got cut off." | `OH:831-840`; `OM:342-344` (10×40, 12×30) | 13 | Both | Long-list fillers |
| D10 | Signup form wiped on refresh/back; back replays intro | `signup/page.tsx:81`; `page.tsx:5-7` | 2 | Both | Low |
| D11 | Desktop Skip + Finish can both run | Each checks only its own button (`OH:988-989,1049-1050`); phone shares `submitting` | 16–17 | Desktop | Low |
| D12 | Replay Finish overwrites cached identity with a blank name | `OH:1071-1077` | 16 (replay) | Desktop | URL-only replay |

### 4.3 Confusing

| ID | What a student feels | Evidence | Step | Viewport | Touch |
|---|---|---|---|---|---|
| C1 | "I finished and just landed on my profile. What now?" (no welcome, no tour) | `use-mobile-tour.ts:176-183`; only setter `SettingsClient.tsx:125`; `OM:432-439`; desktop reads `?welcome=1` (`profile.html:10068-10076`) | 18 | **Phone** | **All phone finishers (6/6 cohort on iPhone)** |
| C2 | "The app is dead: posts from May, no events, nothing trending, but it says 'Live posts from your school' and 'active now'." | Live data (section 3.1); `campus-home.tsx:381-455` (tour copy), `:11377-11379`, `:11455-11457` | 19–20 | Both | All |
| C3 | "Suggestions are full of people named like emails with handles like u3f9a…" | `suggested-connections/route.ts:167-172,310-311` (no verified/onboarded filter, newest first); search includes unverified (`users/search/route.ts:81-94,118-139`) | 20 | Both | All (5 such accounts incl. 2 orphan duplicates) |
| C4 | Raw Supabase errors ("Invalid login credentials", "Email not confirmed", "email rate limit exceeded", "For security purposes…"); URL error and new error stacked | `signup/page.tsx:65-68`; `login/page.tsx:31-35,111-117` | 2, 6 | Both | 19 + 6 + 2 events |
| C5 | "I tapped Create account and it said wait 57 seconds; the success message vanished, so I thought it failed." | Button re-enables after success (`signup/page.tsx:64,196-199`); `setMessage(null)` (`:30`) | 2–3 | Both | 3–6 events (Q5) |
| C6 | "The page I started on never moves on." (signup tab after confirming elsewhere; school-email tab after verifying in Outlook) | No auth listener on signup; `school-email/page.tsx:132` no polling | 3, 8 | Both | ≥6 (everyone confirming in another app) |
| C7 | "It said 3 steps and 'about two minutes', then 'one last verification', then another whole onboarding." (two inboxes hidden) | `signup/page.tsx:99-116`; `school-email/page.tsx:162-168`; `OH:338,362`; `OM:499-501,546` | 2, 8, 12 | Both | All |
| C8 | "Landing says school email, signup says not your .edu, the next page says not the one you signed up with." ".edu" labels but IU-only | `home-landing.tsx:191`; `signup/page.tsx:93-97,108,122`; `login/page.tsx:65`; `school-email/page.tsx:170-180`; API allows reuse of the signup address (`request/route.ts:141-163`) | 1, 2, 8 | Both | All; 1 iu.edu signup |
| C9 | "It promised a photo and banner on the next screen; there wasn't one, and nothing ever asks for a photo." | `OH:373`; `OM:557`; no avatar step (`onboarding/page.tsx:20-22`); 0/6 new avatars | 13, 18 | Both | All |
| C10 | "No 'you're verified' moment"; "Loading…" for up to ~5.5 s | `?school_verified=1` only read on `/campus` chat views (`campus/page.tsx:15-17`; `campus-home.tsx:740-745`); `?otto=1` read nowhere (`onboarding-complete/route.ts:93`); `school-email/page.tsx:46-95,140-146` | 8, 10, 18 | Both | All |
| C11 | "Events says hit '+ Create event' but there's no button." Phone: "Pull to refresh later" (not implemented) | `campus-home.tsx:7012,7030,7087-7091`; `CampusMobile.tsx:1482-1485` | 20 | Desktop dead CTA; phone false copy | All non-org students (0 new org members) |
| C12 | Otto says "here's what caught my eye" with 0 of everything; no next step; offline has no Retry | `OttoHero.tsx:40-48`; `OttoActivity.tsx:75`; `OttoUpcoming.tsx:49`; `otto/page.tsx:36-50` | 20 | Both | Everyone opening Otto |
| C13 | Skip paths differ (desktop → Campus, phone → Profile), no tour, campus left empty; step "Skip" buttons actually keep typed data | `OH:442,479,1002`; `OM:469-487,868-898` | 13–14, 17 | Both (mismatch) | Skippers |
| C14 | "It put me at IU Indianapolis without asking." | `OH:572,583`; `OM:89-90,179,330-331`; multi-campus design §8 not done | 13 | Both | All non-Indianapolis students |
| C15 | Name shows email prefix / handle `u<hex>` if left blank; desktop doesn't prefill name | Trigger `20260906120000_terms_acceptances.sql:82,105-110`; `OH:378`; nothing required (`OM:866-872`; `OH:441`) | 13, 18 | Both | Latent (0 onboarded now) |
| C16 | "It kicked me to verify my school with no explanation" / generic "Welcome back" on expiry / already-verified silently bounced; deep links lost | `campus-access.ts:20,39,73-78`; `onboarding/page.tsx:56` | gates | Both | Deep-link and expiry cases |
| C17 | "← back does nothing"; "Log back in" doesn't sign me out | `school-email/page.tsx:97-103,153,237-242` | 8 | Both | Plausible |
| C18 | "I'm already signed in but it shows me the intro / asks for my password." Messages failure dumps to landing | `page.tsx:5-7`; `proxy.ts:67-116`; `messages.html:3344,3348` | 1, 6 | Both | Returning students |
| C19 | Password reset: sent to login with no "password updated"; raw 422; unstyled page says "(via Resend)"; field just "Email"; email doesn't state expiry | `update-password/page.tsx:60-67`; `forgot-password/page.tsx:41-55`; `resend-transactional.ts:15-34` | 6b | Both | 2 accounts |
| C20 | No confirm-email / confirm-password; 20-char password max rejects manager passwords | `signup/page.tsx:16,41-44,119-149` | 2 | Both | All |
| C21 | "It says my handle is taken" when the check actually failed (401/500); network error clears silently | `OM:251-263`; desktop "couldn't check" `OH:816` | 13 | **Phone** | Phone students with a flaky check |
| C22 | "Couldn't save your profile." without saying which field | `_persistence.js:145`; `failure-copy.ts:139-144` | 16 | Both | Any 400 |
| C23 | Upload says "Invalid file size" (no limit shown) / "Unsupported file type" (GIF offered but refused, HEIC refused) / "Network error" for >4.5 MB | `profile-upload/route.ts:24,35,118-128`; `OH:493,874-890`; `OM:289-297,797` | 15 | Both | 1 upload seen |
| C24 | Picking the same file after a failure does nothing | `OH:880-892`; `OM:290-300` | 15 | Both | Failed uploaders |
| C25 | Upload button dead in some in-app browsers; PDF preview blank (Android) or first page only (iOS) | `OM:794-807,833-848` (verify live) | 15 | Phone | Webview users |
| C26 | Phone step 1 has no Skip; no Back on any step (desktop has step-1 Skip, still no Back) | `OM:515-529,855-911`; `OH:330,360,440-443` | 12–15 | Both (phone worse) | All |
| C27 | Error toast sits on top of Continue/Finish; tapping dismisses the toast instead | `ToastHost.tsx:40,79`; `toast.ts:46-48` | 13–16 | Phone | Anyone with an error |
| C28 | Bottom bar hides under / fights the keyboard; step change auto-focuses a field and pops the keyboard (step 4: optional link) | `OM:210-218,1441-1455` (verify live) | 13–15 | Phone | All phone |
| C29 | Progress dots and Skip scroll away on the long step 2 | `OM:1107` overflow hidden + `:1137-1138` sticky | 13 | Phone | All phone |
| C30 | Slow first paint / flash of dark desktop frame on phones | `use-is-mobile.ts:36-38`; `OnboardingSwitch.tsx:23-38`; `classic/route.ts:25-79`; campus/network desktop trees also mount for a frame | 11, 20 | Phone | All phone (worse in webviews) |
| C31 | "My major isn't in the list" (Bloomington: Jacobs, Maurer, Eskenazi; no Herron) / typo "Americansign Language" | `OH:589-611,624-687`; `majors.ts:84` | 13 | Desktop list; phone typo | 0 cohort on desktop |
| C32 | Desktop tour: three page loads, ends on "No mutuals yet"; desktop Network opens Connections while phone opens Discover | `NetworkPageClient.tsx:113,786-792`; `NetworkMobile.tsx:84` | 19 | Desktop | 0 cohort |
| C33 | Phone handle cooldown 429 → generic "going a little fast"; after a handle error focus lands on Name | `OM:213,424-425`; `failure-copy.ts:126-128`; desktop `OH:1045,1131-1137` | 16 | Phone | Rare (first claim is free) |
| C34 | Link hints disagree with behavior: desktop "must start with https://" but http accepted; phone no note | `OH:928`; `OM:812-828` | 15 | Both | Link pasters |
| C35 | "18 on Vibe" when 13 are real members | `api/stats/campus/route.ts:28-34` | 20 | Both | All |
| C36 | Wrong/stale copy: "Indiana University" banner; "Events · IU … in space"; "Post a clip"; desktop feed-empty implies follow-based feed; phone tour says follow-ranked feed; messages "connect first" (requests exist) | `campus-home.tsx:293-296,3424-3437,4603-4604,7026-7028`; `NetworkMobile.tsx:592`; `NetworkPageClient.tsx:801`; `use-mobile-tour.ts:94-96,115`; `messages.html:1013-1031` | 20 | Both | All |
| C37 | "The map link is a 404." (`/the-map` is the founder roadmap; the student map is `/campus?tab=map`) | `the-map/page.tsx:25-36` | 20 | Both | URL guessers |
| C38 | "I'm not on the campus map." (requires exact school + major) | `api/campus-map/route.ts:43-72,109-127` | 20 | Both | 1 of 6 new |
| C39 | Phone empty profile "Open the feed →" leaves the profile instead of opening a composer | `ProfileMobile.tsx:2231-2236` | 18 | Phone | All phone |
| C40 | First photo edit: no pinch zoom, Save fails silently, Save off-screen in landscape, ~30 px buttons, backdrop tap cancels; desktop cropper silent on HEIC | `IC:179-212,306-310,331-343,531-569`; `public/html/_imageCropper.js:212-215,282-284,292-331` | post-18 | Both | Avatar attempts (0 so far) |
| C41 | Legacy terms interstitial "We now record…"; spurious terms bounce on DB read error; a `TERMS_VERSION` bump re-gates everyone | `accept-terms-form.tsx:84-93`; `campus-access.ts:26-30`; `terms.ts:1` | 7 | Both | 7 legacy accounts |
| C42 | Desktop tour never shows for a second account in the same browser; desktop welcome banner can't fire | `profile.html:10078,7344-7347` | 18 | Desktop | Shared computers |
| C43 | iPad landscape / touch laptop: `cursor:none` with a mouse-only custom cursor; toast can sit under the iPadOS toolbar | `OH:22,30,704-726`; `_persistence.js:178` | 11–16 | Desktop/tablet | Tablet users |
| C44 | "We couldn't load your profile row (HTTP …)" | `profile-html-bridge.tsx:48-57` | 18 | Desktop | Transient failures |
| C45 | New-message "Suggested" list silently empty on fetch failure | `MessagesMobile.tsx:3312-3321,3505` | 20 | Phone | Low |
| C46 | iOS suggests the personal email in the School email field; domain copy hard-coded vs env | `school-email/page.tsx:165-177,202-217`; `school-email-domains.ts:80-88` | 8 | Both | All (rejection is free) |
| C47 | Verify-school success text / in-app browser help flashes unread | `verify-school/page.tsx:66-73,167-171` | 10 | Both | All |
| C48 | Onboarding on a shared computer fetches the previous account's cached bootstrap; 403 terms there navigates the whole page | `_persistence.js:557-596` | 11 | Desktop | Shared computers |
| C49 | Replay mode only reachable by typing `?replay=1`; classic login redirect drops it | `classic/route.ts:30-33`; no UI link | 11 | Desktop | Low |
| C50 | Skip sheet closes on backdrop even mid-skip (phone); desktop dialog ignores backdrop, Escape only | `OM:917-919`; `OH:1012-1014` | 17 | Both | Low |

### 4.4 Cosmetic

| ID | What a student feels | Evidence | Step | Viewport | Touch |
|---|---|---|---|---|---|
| X1 | Back pill overlaps card; step label "Accou…"; submit at the fold | `globals.css:1100-1124,1417-1425,1520-1544` | 2, 6, 8 | Phone | All phone |
| X2 | Signup link about 2 screens down on landing; 750 ms delay on every tap; no Terms/Privacy links in the landing footer | `globals.css:395-406,469-479`; `home-landing.tsx:12,69-91,218-221` | 1 | Phone layout; delay both | All phone |
| X3 | Unstyled grey callback / verify-school / forgot-password pages | `callback/page.tsx:142-146`; `verify-school/page.tsx:90-135`; `forgot-password/page.tsx:41-88` | 5, 6b, 10 | Both | All |
| X4 | Login server-renders "Loading…" only | `login/page.tsx:12,140-152` | 6 | Both | Slow networks |
| X5 | Desktop handle field white on dark; low-contrast hint; fixed header over content; "N of 4" hidden under 540 px | `OH:39,62-67,266,382-385` | 13 | Desktop | 0 cohort |
| X6 | Phone labels not linked (tap label doesn't focus; VoiceOver); handle field lacks `autoCorrect="off"`; reduced motion ignored; heavy blur on low-end Android | `OM:966-969,574-611,1046-1091,1148,1454,1489` | 12–15 | Phone | All phone |
| X7 | Cursor jumps to end when typing uppercase mid-handle | `OH:798-799`; `OM:227` | 13 | Both | Low |
| X8 | Light Safari toolbar tint over the dark onboarding page | `src/app/layout.tsx:30-31`; `globals.css:35-37` | 11–16 | Phone | All phone |
| X9 | Tab title is the app default; no focus inside the iframe on load; no step-1 autofocus | `onboarding/page.tsx` (no metadata); `OH:12` | 11 | Desktop | Keyboard users |
| X10 | Role 2 placeholders identical to Role 1 | `OM:975-1041` vs `OH:468-472` | 14 | Phone | Low |
| X11 | Fixer note, not student-facing: local dev has confirmations off and a 2/h email cap, so S1–S6 can't be reproduced locally | `supabase/config.toml:194,221` | — | — | — |

---

## 5. Known-but-unfixed (from history)

### 5.1 Recorded issues still open or partly fixed

| Source | Issue | Current status | Maps to |
|---|---|---|---|
| Silent-failure row 17 (`handoffs/2026-09-11-silent-failure-rows.json:150-154`) | Signup with an existing email reports "Check this inbox" | **Open** | S2 |
| Controls inventory (`handoffs/2026-09-10-controls-resorted.md`) | `?error=auth_callback` has no resend | **Open** | S4 |
| Controls | `/auth/verify-school` with no token is a dead end | **Open** | S17 |
| Controls | `/auth/update-password` shows the form without a reset session | **Open** | S13 |
| Controls | Progress dots not clickable; no Back control (resorted `:89` recommends one) | **Open** by design | D1, C26 |
| Controls | Landing footer has no legal links | **Open** | X2 |
| Controls | Pasted Drive/Notion link silently ignored | Fixed on desktop; **open on phone** (no note, no pre-check) | S9, C34 |
| Controls | School-email "← back" to logged-out landing | Fixed `5b4abf1`; residual: with no history it reloads itself | L3, C17 |
| Report-2 Sept 9 #16 | `/auth/login` server-renders only "Loading…" | **Open** | X4 |
| Broken report Sept 7 #1/#10 | School-email limiter ran before validation | **Partly fixed** `8869df0`: still before the already-verified and 409 lookups and before the Resend send; "Try again shortly" for 3600 s unchanged | S10, S12, S15 |
| Broken #15 | Phone resume PDF preview is a raw iframe | **Open**, never tested on a phone | C25 |
| Broken #38 | Per-IP school-email cap shared behind campus NAT | **Open** | S8 |
| Broken #7 / #33 | Settings campus/handle raw 403; profile-bootstrap 403 read as no data (terms fallout) | Not re-verified; journal still lists #7 open | — |
| Silent rows (phone) | Phone malformed handle silent; live check says "taken" on failure | **Partly fixed** (Finish login fallback gone; 409/400 handled) | D5, C21 |
| S57 leftovers (`handoffs/2026-09-11-session-57-dm-media-silent-failures.md`) | Desktop Skip can race Finish | **Open** (phone mitigated) | D11 |
| S57 | Link note appears for links the server rejects (own-Supabase host) | **Open** | S18 |
| S57 | Phone handle cooldown line | **Open**, rare | C33 |
| S57 | Drive/Notion resume link rendered as a PDF in `profile.html` | Not re-verified | — |
| Risk report Sept 3 #12 | School verification token replayable for 48 h | **Open** (security, pre-app-store) | — |
| Risk #13 | Endpoint reveals which IU emails have accounts | **Partly fixed**: IU-only now, distinct 409 remains | S12 |
| Risk (auth) | Limiter fails open and trusts client `X-Forwarded-For` | **Open**; ROADMAP `:11` | S8 |
| Risk (auth) | Raw error text echoed | **Open** for the school-email send | S15 |
| Multi-campus design `2026-09-12-design-multi-campus.md` §8 / `:247` | Onboarding silently stamps IU Indianapolis; make the first option an explicit unset | **Open** | C14 |
| Multi-campus §2 / §6 #9 | "N students haven't set a campus yet" map copy; school-scoped headcount | **Open** | C35 |
| Multi-campus §2 | Trending strict-equality bug (`src/app/api/trending/hashtags/route.ts:57`) | Not re-checked | C2 |
| Empty-states design `2026-09-11` §4 | `/otto` offline has no Retry; compose suggestions raw fetch → `[]` | **Open** (listed as acceptable) | C12, C45 |
| S44 | Replay only via URL/Settings; tour-seen flags per device | Accepted | C42, C49 |

### 5.2 Carried TODOs never done

- **Real-phone QA of onboarding and the Otto tour.** Carried since S49/S50 (S49 handoff `:304,:322`; S50 `:135`; S55 `:244-246`; ROADMAP `:12`). It would have caught C1.
- **Manual QA of password reset, confirmation deep links and in-app browsers (Instagram).** S30 `:41`; `QA_CHECKLIST.md:72` unchecked. It would have caught S1.
- **Confirm email + Resend.** Done Sept 6 (`40cc5d5`). Leftovers:
  - no resend-confirmation UI
  - post-DMARC inbox vs spam placement unconfirmed (S54 `:13`, S55 §4-9)
  - HIBP deferred (S53 `:131`)
  - local config drift
- **Legal A6.** Publishing the final pages and bumping `TERMS_VERSION` re-gates every student once (S54 `:26`). Apple age rating comes before the app store.
- **Teammate accounts without Terms.** Parked "until real testers arrive", which is now. These are the 6 legacy onboarded accounts that will see `/auth/terms`.
- **Per-campus majors taxonomy** (S55 `:246`); the desktop list is still Bloomington.
- **Security before app store:**
  - single-use, shorter-lived school tokens (risk report `:432`)
  - enumeration 409 (`:434`)
  - trusted client IP and fail-closed limiter (`:433`; ROADMAP `:11`)
- **Journal nextSteps item** "Real .edu verification with one-time-link email send" is stale: verification exists, single-use doesn't.

### 5.3 Already fixed — don't reopen without new evidence

| Fix | Commit / evidence |
|---|---|
| Desktop finish/skip navigating inside the iframe | `a2b3f0d`; `OH:1002,1008,1152`; `_persistence.js:56-66` |
| Anonymous `/html/onboarding.html` | `2ebc276`; `proxy.ts:93,98` |
| Landing had no signup link | `2ebc276`; `home-landing.tsx:197-203` |
| `maxLength=20` truncating pasted passwords | `8869df0` |
| Any `.edu` accepted | `df4858c`, IU-only now |
| No age gate / terms at signup | `0f39bcc`; checkbox + trigger stamp |
| "Skip anyway" going to `/` | `a2b3f0d` / `0adb0eb` |
| Onboarding logo loading the landing inside the iframe | `OH:329,1007-1010` |
| Desktop Finish falling through to login; handle claim swallowed | `a2b3f0d` |
| Settings "Replay tour" on phone | `5b4abf1` |
| Settings "Not yet verified" unlinked | Fixed |
| `X-Frame-Options: DENY` breaking onboarding and resume previews | `1f883ef`; `next.config.ts:57` |

### 5.4 Stale docs that will mislead a fixer

- `QA_CHECKLIST.md`:
  - §1 `:18-27` assumes the retired anonymous demo rewrites.
  - §2 `:36` says ".edu"; `:37` says the bridge navigates to `/html/onboarding.html`.
  - §2 has no consent step.
  - `:41` expects a campus banner from `?school_verified=1`.
  - §5 `:76` references `/profile/maya`.
- `DOCS/ROADMAP.md:23` and journal "05 — Onboarding" describe a 6-step onboarding with voice training and platform OAuth.
- `DOCS/PHASE_1.md:89-131` design vs code:
  - Otto was meant to ask questions one at a time; the code shows an 11-field form.
  - It promised a draft profile to review; answers write straight to `users`.
  - It promised a photo/banner "fun moment"; there is none.
  - Skip was meant to open a prefilled manual editor; nothing is prefilled.
  - School verification was meant to be an Otto question; it is a separate pre-step.

---

## 6. Open questions and contradictions between readers

| # | Question | Claim A | Claim B | Which is stronger / status |
|---|---|---|---|---|
| Q1 | Which confirmation exchanges failed? | auth-entry: 5 of 5 Snapchat signups failed; `cf123541` was Safari→Safari with PKCE 200 | verify-terms + live-funnel: 6 of 9 failed, including `cf123541`; only 3 PKCE grants logged | **Resolved for B.** My SELECT on `auth.flow_state` shows `cf123541` (created 12:27:51 UTC) with an issued, never-exchanged code and 2 sessions, so it got in by password. The 3 successes are `b80adedc`, `6b037104`, `0bb7e17b`. The 6 failures are the 5 Snapchat signups + `cf123541` (browser unknown) |
| Q2 | Is the email already confirmed when the exchange fails? | history: needs live check | auth-entry: `/verify` marks confirmed immediately (audit `user_signedup`) | **Resolved for auth-entry.** Live-funnel counts 9 confirmed including the two 0-session accounts. So "sign up again" is always wrong for these students |
| Q3 | Does a double-tap on Create account send extra emails? | verify-terms: yes, and the later link supersedes the earlier one | auth-entry: a tap within 60 s returns 429 (`smtp_max_frequency`), so nothing is sent | auth-entry stronger for the double-tap itself (a 429 doesn't send). The 7 resends (`user_confirmation_requested` 17 for 10 accounts) come from repeat signups more than 60 s apart by unconfirmed users. Whether a resend invalidates the earlier PKCE link is **unverified** |
| Q4 | What caused the 8 `/verify` 403s? | auth-entry: re-clicks of used links (1b25c91e ×2) | verify-terms: superseded links after resends; also scanners and expiry | **Unresolved**; probably a mix. Per-event attribution needs auth logs joined to actor + token age |
| Q5 | How many signup 429s? | auth-entry: 3 (d09cf6a8 ×2, 2c9552eb ×1); verify-terms: "3 students" | live-funnel: 6 events 02:54–12:28 | live-funnel stronger (whole-day aggregate). The 12:28 one likely belongs to `cf123541` |
| Q6 | How many failed password logins? | auth-entry: "20+" | live-funnel: 19 | Use **19** (aggregate) |
| Q7 | Why the password-failure bursts? | auth-entry: fallback after the confirmation link failed (S3) | verify-terms §7: school verify link opened in Outlook/Gmail/Google-app browser → 401 → forced login (S7) | **Unresolved.** Bursts at 02:55–03:16 overlap both windows (school verification median about 5 min after signup). Check `auth_audit_logs` login actors against the users-row PATCH times |
| Q8 | Which migration defines the signup trigger? | auth-entry / verify-terms: `20260906100000_terms_acceptance.sql` | history / first-run: `20260906120000_terms_acceptances.sql` | **Resolved:** both exist. `…120000` redefines `handle_new_user` (adds the `terms_acceptances` row) and is current. `20260912102000_users_media_url_host_lock.sql` only mentions it in a comment. Canonical: `20260906120000_terms_acceptances.sql:68-130` (handle `:82`, name `:105-110`) |
| Q9 | Does anything set the phone profile tour flag after onboarding? | history: setters are `SettingsClient.tsx:125` and "the campus leg" `campus-home.tsx:441` | onboarding-phone / first-run: only Settings sets `profile` | **Resolved:** `campus-home.tsx:441` sets `network`, `profile.html:10124` sets `campus`. Only `SettingsClient.tsx:125` sets `profile`. Phone tour never fires post-onboarding (C1) |
| Q10 | Is the verify-school "success but logged out" branch dead? | verify-terms: can't happen, since confirm requires a session; "Continue manually" is dead | Code `verify-school/page.tsx:76-82` redirects to `/auth/login?next=…&school_verified=1` when the client `getUser` fails after a server-authenticated confirm | Mostly dead but reachable when cookie reads diverge between server and client. Login shows the "Campus email verified" banner only in that branch, **not** in the common 401 branch (`:40-48`) |
| Q11 | Are the two "stranded" accounts lost students? | auth-entry / verify-terms: 2 stranded students | live-funnel: about 8–9 real people; `d09cf6a8` = `0fa3c2d9` (confirmed by exact school-email match), `1b25c91e` ≈ `6b037104` (likely) | live-funnel stronger. The accounts are stranded; the people probably are not. Real losses: `2c9552eb`, `0bb7e17b`, maybe `1b25c91e` |
| Q12 | `d09cf6a8` link timeline | auth-entry: token used by a Windows Chrome client 20 s after signup, then a mangled GET 2 ms later | verify-terms / live-funnel: mangled 400 GET from a Microsoft network in the same ms as a successful verify; HEAD 405 about 100 s later from AWS | Both describe scanner-like consumption; which request used the token is unresolved. **Scanner attribution is plausible, not proven** |
| Q13 | Does the phone sticky header pin? | onboarding-phone: no (`overflow:hidden` ancestor) | — | Code confirmed (`OM:1107` overflow hidden, `:1137-1138` sticky), and the root grows with content so the window scrolls. Strong; confirm on device |
| Q14 | Do uploads of 4.5–8 MB fail as "Network error"? | desktop + phone readers: probably (Vercel 4.5 MB body limit) | — | **Unverified** by anyone. Test with a 5 MB PDF on the Vercel deploy |
| Q15 | Can the signed resume URL render in the nested preview iframe, and do phone PDF previews work? | `next.config.ts:50-56` comment says previews work | Phone reader: iOS static first page, Android blank/download | **Unverified** |
| Q16 | In-app browser specifics | Snapchat confirmed in logs | Instagram / TikTok webviews, file pickers, localStorage persistence untested | **Unverified**; only Snapchat appears in logs |
| Q17 | School-verified → Otto timings | live-funnel gives medians | Inferred from users-row PATCH pairs (heartbeats and handle writes also PATCH) | Low confidence; there are no `school_verified_at` / `onboarded_at` columns |
| Q18 | Deliverability of school verification email to IU (M365) | handoffs: DMARC `p=none`, first test in Gmail spam | 2.2 sends per verification suggests delay or loss | **Unverified**; Resend delivery logs not read |
| Q19 | Server-side failure rates for school-email, password-reset, onboarding-complete, profile-upload | — | — | **Not covered:** Vercel function logs weren't available to any reader |
| Q20 | `NEXT_PUBLIC_SHOW_GLOBAL_FEED` in prod; prod `NEXT_PUBLIC_SITE_URL` | first-run: unchecked | auth-entry: edge logs show www `redirect_to`, consistent | Flag unverified; site URL consistent |
| Q21 | Should Purdue-in-Indianapolis (@purdue.edu) students be in scope? | — | — | Product decision (S20) |

---

## 7. Complaint lookup index (for triage)

| If a tester says… | Check first |
|---|---|
| "confirmation link invalid / expired", "never got signed in", "made two accounts" | S1, S2, S4, S6, S11, L1, L2, Q1–Q4 |
| "wrong password" right after signing up, "had to reset" | S3, S13, C19, Q7 |
| "didn't get the email" (Vibe confirmation) | S4, S8, C5, S6 |
| "didn't get the IU / school email", "too many requests" | S5, S8, S10, S15, Q18 |
| "school email already linked" | S12, L6 |
| "link opened in Outlook and asked me to log in" | S7, L15, C6 |
| "stuck loading" on school email | C10, S14 |
| "lost everything I typed", "went back to step 1" | D1, D2, D3, L8, L9 |
| "Couldn't save your profile" | S9 (phone link), S18, C22 |
| "handle didn't save" / "says taken" | D4, D5, C21, C33, L10 |
| "resume upload failed / didn't attach / can't remove" | C23, C24, C25, D6, D7, Q14 |
| "no tour", "didn't know what to do after" | C1, C9, C10, C12 |
| "app is empty / dead" | C2, C11, C12, C35, C36 |
| "weird accounts in suggestions" | C3 |
| "my major isn't listed" | C31 (desktop), C14 |
| "can't skip", "no back button" | C26, C13, L11 |
| "photo step missing", "can't crop" | C9, C40 |
| "keyboard covers button", "toast blocks button", "header disappears" | C27, C28, C29 |
| "asked me to accept terms again" | C41, L17 (legacy accounts) |
| "map 404", "not on map" | C37, C38 |

---

## Critic additions and corrections

Checked read-only against HEAD 917775f. No repo files or databases were touched. Paths are relative to `/Users/franciscocazares/vibe`.

### A. Corrections

**K1. Q3 is resolved the wrong way. A 429 double-tap sends nothing, but it still breaks the first email's link, even in the signup browser.**
- **Mechanism:**
  - `signUp` writes a fresh PKCE verifier *before* it sends the request (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:637-641`).
  - The verifier goes into one fixed per-browser key, `<storageKey>-code-verifier` (`lib/helpers.js:264-270`).
  - So a second tap within 60 s gets a 429 and no email, but it still replaces the verifier that matched the only email that was sent.
  - That link then fails with `auth_callback` in the browser the student signed up in.
- **Same effect:** every repeat signup from that browser, including the "no-op" `user_repeated_signup` for an already-confirmed address.
- **Extra detail:** `_exchangeCodeForSession` deletes the verifier after *any* attempt, success or failure (`GoTrueClient.js:1483,1501`).
- **Correction to S1:** it is not only a "different browser" problem.
- **Plausible touch:** `d09cf6a8` (429 ×2), `2c9552eb` (one 429), and `cf123541`, whose 12:28 signup 429 would explain its failed exchange even if the browser matched (Q1 lists the browser as unknown).
- **Add to C5 / S1:** disable the button after success, and don't call `signUp` again from a browser that is waiting on a link.

**K2. S12's touch is overstated. Today's duplicate pairs block nobody.**
- The 409 lookup only reads `users.school_email` (`src/app/api/auth/school-email/request/route.ts:141-145`; `confirm/route.ts:105-109`). It never reads the other account's *login* email. That is how `d09cf6a8` (login email x@iu.edu) and `0fa3c2d9` (`school_email` x@iu.edu) coexist.
- The stranded duplicates never got a session, so they never stored a school email.
- **It bites in reverse:** if the stranded account's owner later gets in (for example via password reset) and enters the IU address their second account already verified, they hit the 409 dead end.

**K3. C10: both `?school_verified=1` halves are dead.**
- `/profile?school_verified=1` is produced (`src/app/auth/verify-school/page.tsx:68,78,175`), but nothing reads it: no match in `public/html/profile.html` or `src/components/mobile/ProfileMobile.tsx`.
- The `/campus` banner that does read it (`src/app/campus/page.tsx:17` → `campus-home.tsx:740-745`) has no producer anywhere in `src/` or `public/html/`.

**K4. Section 2.1 "Not gated on purpose" is incomplete, and gates 2 and 3 are enforced only on pages.**

Routes with no consent, verified or Otto gate:

| Route | Gate it does have | Evidence |
|---|---|---|
| `/posts/[id]` | Login only | `src/app/posts/[id]/page.tsx:127-131` |
| `/profile/<handle>` and `/html/profile.html?handle=` | None, on purpose | `src/app/profile/[handle]/page.tsx:107-110`; `src/proxy.ts:87` |
| `/orgs/[handle]` | None | `src/app/orgs/[handle]/page.tsx:131-135` |
| `/plus` | None | `src/app/plus/page.tsx:93-100` |
| `/admin` | Admin check only | `src/app/admin/page.tsx:19-30` |
| `/legal/*` | None | — |

- Among the API routes, only org creation checks `school_verified` as a gate (`src/app/api/orgs/route.ts:305`). The write APIs these pages call only require login and Terms (`src/lib/legal/require-terms.ts:27-39`).
- `onboarding-complete` writes `otto_answers` without first checking verification (`src/app/api/me/onboarding-complete/route.ts:73-89`).
- **Result:** a confirmed but unverified, un-onboarded account that opens a shared post, profile or org link lands on a live page instead of the school-email step.

**K5. Minor fixes to row 9 and row 6.**
- `Retry-After` is the route's own window (`src/lib/rate-limit.ts:36`): 3600 for school-email, **900** for the password-reset IP cap (`src/app/api/auth/password-reset/route.ts:27-31`).
- The route-order list in row 9 is missing the 500 "Could not verify email availability." lookup failure (`request/route.ts:141-153`).
- Row 6 / E5: if `getUser` fails right after a successful sign-in, `getPostLoginDestination` returns `/auth/login` (`src/lib/auth/post-login.ts:33`). Login reloads itself with no error.

**K6. C19 understates the reset ending.**
- The recovery session is already live (`src/app/auth/update-password/page.tsx:35-43`).
- Yet success pushes to `/auth/login` (`:66`), and login has no redirect for signed-in users (`src/app/auth/login/page.tsx:21-47`).
- So the student has to type the password they just set a second time.

### B. Missed paths and screens

**M1. The callback never checks for an existing session before failing, and it throws away Supabase's reason.**
- `src/app/auth/callback/page.tsx:90-92,107-110` goes straight to the login error.
- A student who is **already signed in** in that browser and taps the confirmation email again (token used, so no `code`) is told "invalid or expired… or sign up again". Login has no signed-in redirect.
- **Correction to L2:** this is not about new tabs; it happens on every re-tap.
- The callback reads only `code` and hash tokens (`:82-89`). Supabase's `error_code` / `error_description` ("otp_expired", used, and so on) are dropped.
- **Result:** expired, used and scanner-consumed links look identical to the student and never reach Sentry or Vercel logs. This is why Q4 can't be answered from app telemetry.

**M2. Deep links are lost for anyone who signs up from a shared link.**
- `emailRedirectTo` is hard-coded to school-email (`src/lib/auth/email-confirm-redirect.ts:6,14-18`).
- Login's "Create an account" link drops `next` (`login/page.tsx:130-133`).
- The public share pages have no signup call to action at all:
  - there is no `auth/signup` link anywhere in `public/html/`
  - the org page has a login link without `next` (`src/app/orgs/[handle]/page.tsx:309`)
  - the phone profile uses login with `next` (`ProfileMobile.tsx:559`)
- The verified and Otto gates then drop `next` as well (already in the map).
- **Result:** a student recruited through a friend's Snapchat-shared post or profile never lands back on it.
- **Plausible touch:** the Sept 14 in-person cohort, who were mostly in Snapchat.

**M3. The school-email tab stays stuck after verifying elsewhere.**
- A student who verified in the Outlook webview goes back to the original tab and taps Send again with the same address.
- The API returns 200 "This school email is already verified on your account." (`request/route.ts:131-139`).
- The page shows it as a green banner and stays put (`src/app/auth/school-email/page.tsx:132,221-225`). Nothing redirects to `/onboarding`.
- Only a refresh moves them on (layout gate `src/lib/auth/campus-access.ts:73-78`).
- A sharper case of C6 / L15.

**M4. Students who sign up with their iu.edu address get no fast path.**
- The request route never compares the entered address with `user.email` (`request/route.ts:141-163`).
- So the student types the same address again, gets a second email in the same Microsoft 365 inbox (a second Safe Links pass, see S11) and clicks again.
- The page copy "not the one you signed up with" (`school-email/page.tsx:178`) is simply wrong for them.

**M5. Fixer trap: signing up on any host other than `NEXT_PUBLIC_SITE_URL` always fails the confirmation exchange.**
- `emailRedirectTo` prefers `NEXT_PUBLIC_SITE_URL` over `window.location.origin` (`src/app/auth/signup/page.tsx:47-49`).
- The verifier cookie belongs to the host the student signed up on.
- **So:** a signup on a Vercel preview URL confirms into a callback on the production host, where there is no verifier. The result is the S1 error, 100% of the time, for reasons unrelated to the student bug.
- School verify links also point at `getSiteUrl()` (`src/lib/auth/site-url.ts:21-31`). A preview-host tester gets a 401 and is sent to production login.
- The founder tests on phones via Vercel deploys (memory), so test on the production domain before attributing S1.

**M6. No way to change the login email, and almost nowhere to sign out.**
- The only `updateUser` call is for the password (`update-password/page.tsx:60`).
- "Wrong email used to sign up? Log back in" (`school-email/page.tsx:237-242`) leads to nothing that fixes it. The only remedy is Settings → delete account (`src/app/api/me/route.ts:111-115` deletes the auth user and cascades), then signing up again.
- Signup, login, school-email, verify-school and both onboarding trees have no sign-out control. It exists only in Settings (`src/components/settings/SettingsClient.tsx:925-937`) and on the terms page (`src/app/auth/terms/accept-terms-form.tsx:63-76`).
- **Result:** switching accounts on a shared device, or escaping a stranded duplicate (L5), means typing `/settings` by hand.

**M7. Password reset may be an unintended "resend" for never-confirmed accounts (unverified).**
- `password-reset/route.ts:68-72` creates a recovery link without checking `email_confirmed_at`. Recovery uses hash tokens, so it works in any browser (`update-password/page.tsx:22-43`).
- If Supabase's recovery verify confirms an unconfirmed address (GoTrue behavior, not in this repo), then "Forgot?" is today's only working escape for S4 (`2c9552eb`) and for the confirmed accounts with 0 sessions.
- **To verify:** try it on a throwaway unconfirmed account.

**M8. In-app browsers may lose the signup form when the Terms link opens (unverified).**
- The Terms and Privacy links use `target=_blank` (`signup/page.tsx:163-179`).
- Webviews that ignore new windows replace the signup page instead. Back then returns an empty form with the checkbox cleared, because state is memory-only.
- Not tested in Snapchat.

**M9. A server timeout after a successful write looks like failure.**
- `verify-school/page.tsx:34` and `school-email/page.tsx:116` call `res.json()` unguarded. A Vercel HTML 500/504 page throws, which shows "Request failed."
- On verify-school the write may already have landed. "Try again" → `/auth/school-email` then silently forwards the now-verified student with no confirmation moment.

**M10. Latent: a stray `?code=` on the landing page.**
- If Supabase ever falls back to the Site URL (for example a new domain missing from the redirect allowlist), the student lands on `/?code=…`.
- Nothing exchanges it: `src/app/page.tsx:5-7` and `home-landing.tsx` read no URL params. They see the marketing page with no session.
- Q20 says production `redirect_to` is consistent today.

**M11. Additions to X11 (why local dev can't reproduce these).**
- Local `max_frequency = "1s"` (`supabase/config.toml:225`), so K1's 429 verifier overwrite can't happen locally.
- Local `site_url` is `http://127.0.0.1:3000` and `additional_redirect_urls` lists only `https://127.0.0.1:3000` (`config.toml:154,158`), so a `localhost` callback isn't on the allowlist.

### C. Re-checked and confirmed (no change)
- **Handle check on the phone:** 401/500 shows "✗ taken" because `j.ok` is false with no `reason` (`OnboardingMobile.tsx:245-258`); a network error clears silently (`:260-262`).
- **Phone Finish:** skips the handle claim when the regex fails (`:403`) and has no link pre-check (`:363-366`).
- **Desktop:** Skip goes to `/campus` (`onboarding.html:1002`); Finish pre-checks the link and handle (`:1081-1094`).
- **Phone tour flag:** set only by `SettingsClient.tsx:125`. `stripWelcomeParam` runs only when a tour starts (`use-mobile-tour.ts:220`), so `?welcome=1` does stay in the URL.
- **Browser detection:** there is no user-agent or in-app-browser detection in `src/` or `public/html/`.
- **Signup trigger:** `20260906120000_terms_acceptances.sql:68-135`; handle `:82`, name `:104-109`.
- **Skip can't leave a student looping back to onboarding:** `buildOttoConfig` always returns a non-empty object (`OnboardingMobile.tsx:118-126`), so a successful Skip always marks Otto done.

### D. Updates to section 6 questions

| # | Update |
|---|---|
| Q3 | Superseded by K1: the harm of a double-tap is the overwritten verifier, not an extra email. |
| Q4 | Add a likely cause for the 8 `/verify` 403s: a resend replaces the per-user confirmation token server-side (GoTrue keeps one `confirmation_token` per user in `auth.users`), so older emails 403. This is separate from K1, which breaks the *exchange* after a successful `/verify`. |
| Q1 | `cf123541`'s failure may be K1 (its own 12:28 429) rather than a browser switch. |
| Q22 (new) | Does a Supabase recovery link confirm an unconfirmed email and sign the student in (M7)? |
| Q23 (new) | Do Snapchat and Instagram webviews open `target=_blank` legal links in place, wiping the signup form (M8)? |
