# The human check (Turnstile): policy lines and the founder steps, ready to use

Written Oct 12, 2026 (session 76). The code is live with the check OFF (no site key). These Privacy Policy sentences are NOT published yet: they go out in the same deploy that first carries the site key, so the policy never describes a check that is not on. Publishing needs the text file, the page (`src/app/legal/privacy/`), the date at the top and `check/checks.mjs` changed together, then the page-equals-text check.

## Privacy Policy sentences (final, after the reviewer's corrections)

1. Section 3e (What does Vibe not collect?), replace 'Sentry is the one outside tool that measures anything: errors, speed and visits (section 3d).' with: 'Sentry is the one outside tool that measures how Vibe is used: errors, speed and visits (section 3d). One other outside tool looks at your browser, for one job: Cloudflare's check that you are a person on the sign-in and sign-up pages (section 6).'

2. Section 6, Cloudflare row, change the label to '(media storage, incoming mail and the check that you are a person)' and add after '...looks after the connectvibe.app name.': 'It also runs the check that you are a person. The sign-up page, the sign-in page and any page that shows "Send a new email" load a small box straight from Cloudflare. The check starts when the page shows the box, not when you press the button. So on the "Check your email" screen it runs even if you never ask for a new email. Through the box Cloudflare sees your IP address, details of your browser and device, the address of the Vibe page you are on, and which of the three forms it is. We send Cloudflare nothing you type. Cloudflare says it uses what it sees only to tell people from bots and to make the check better. The box gives your browser a one-time code that lasts five minutes, and your browser sends that code to Supabase with the form. Cloudflare tells us pass or fail for each try. We also see totals of passes and fails, never who. We have turned off the box's link for sending feedback to Cloudflare. Cloudflare's own notice for this check is at https://www.cloudflare.com/turnstile-privacy-policy/.'

3. Section 6, Supabase row, add: 'When you sign in, sign up or ask for a new email, Supabase sends the one-time code from the check, with your IP address, to Cloudflare to confirm it.'

4. Section 7 (Kept in your browser), add: 'Cloudflare's check that you are a person may keep its own data in your browser, inside its box and under Cloudflare's own address. Vibe cannot read it. The check sets no cookie under connectvibe.app.'

5. Section 3h (the iPhone and Android apps), optional one line: 'The check that you are a person (section 6) runs inside the apps too, because they show the same sign-in pages.'

6. Timing note for the main session, not policy text: the 3e, Cloudflare-row and section 7 sentences become true the day the site key is live in production. The Supabase-row sentence becomes true the day Supabase's Captcha switch is turned on. Publishing all of them with the key deploy is harmless.

7. Condition note for the main session, not policy text: 'sets no cookie under connectvibe.app' holds only while the Cloudflare site's pre-clearance stays No. If that is ever turned on, the sentence must change the same day.

8. Corrections taken from the reviewer: the claim that Cloudflare does not read what you type is gone, replaced by what our code does ('We send Cloudflare nothing you type'). 'Pass or fail and nothing else' is now 'pass or fail for each try' plus the totals line. Nothing says Cloudflare stores nothing.

## Steps, in order (from the builder's verify list)

1. LOCAL, key off (today's state): open http://localhost:3000/auth/login and /auth/signup. There is no box, the buttons read 'Sign in' and 'Create account' as before, and sign-in works. I checked on the running local site that neither page has a frame or any mention of challenges.cloudflare.com.
2. LOCAL, key on: add NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA to .env.local and restart the local server (the value is built in at start). At 375px open /auth/login. The box spans the form (269 wide, about 59 tall, not a 150px square). The button reads 'Checking you're a person…' for a second or two, then 'Sign in', and sign-in still works. Repeat on /auth/signup and on the 'Check your email' view after a sign-up.
3. LOCAL, the second box: on /auth/login sign in with an unconfirmed address, then open 'Need a new confirmation email?'. Its box is drawn only when the section opens.
4. LOCAL, sizes and themes: widen the window past 406px and the box fills the column at full size. Turn the phone and the box follows. At 320px the compact box appears. Switch Night and Light and the box redraws in the new theme.
5. LOCAL, the tick: use 3x00000000000000000000FF. The button reads 'Tick the box above first'. Tick it at 375px and the button becomes 'Sign in'. I did not do this step.
6. LOCAL, failures: with 2x00000000000000000000AB the box fails and a plain sentence with 'Try again' shows under it. With challenges.cloudflare.com blocked in the browser's developer tools you get 'The check that you're a person didn't load…' with 'Try again', and the button is not left dead. Remove the line from .env.local afterwards.
7. TESTS: node --test src/lib/auth/captcha.test.ts (16 pass) and node --test src/lib/security/csp.test.ts (23 pass).
8. FOUNDER step 1: deploy this code with no key. Nothing changes for anyone.
9. FOUNDER step 2: Cloudflare dashboard > Turnstile > Add widget. Hostname connectvibe.app (it covers www), widget mode Managed, pre-clearance No. Copy the site key and the secret key.
10. FOUNDER step 3: Vercel > the project > Environment Variables. Add NEXT_PUBLIC_TURNSTILE_SITE_KEY with the site key, no quotes, Production only. Then make a new deploy (Redeploy, or push code; a handoff-only push does not redeploy). The key is baked in at build time. Publish the Privacy Policy change with this deploy.
11. FOUNDER step 4: check the box shows on https://www.connectvibe.app/auth/login and /auth/signup. To check the header: curl -sI https://www.connectvibe.app/auth/login | grep -i content-security-policy should now show https://challenges.cloudflare.com in frame-src.
12. FOUNDER step 5: sign in three times and watch the button go from 'Checking you're a person…' to 'Sign in' each time: once in a phone browser, once inside the iPhone app, once inside the Android app. Nothing is enforced yet, so a failure here locks nobody out. If any of the three fails, stop and do not do step 6.
13. FOUNDER step 6, only then: Supabase > Authentication > Attack Protection > turn on Captcha protection, provider Turnstile, paste the secret key, save. Flipping this before steps 3 to 5 locks everyone out of sign-in.
14. FOUNDER step 7, right after: sign out and back in on desktop and on a phone. Ask for a new confirmation email once. Check 'Forgot password' still sends (it goes through our own server and needs no box).
15. TO TURN IT OFF: Supabase's Captcha switch first (it is instant), then remove the key on Vercel and redeploy. Never remove or change the key while Supabase's switch is on. If that happens, students see 'Vibe needs to check you're a person, and this page couldn't run that check. Reload the page. If it still doesn't work, email help@connectvibe.app.' and nobody can sign in until the switch is off.

## Things to know (from the builder and the reviewer)

- Main session: before the key goes on, put NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA in .env.local, restart the local server and walk /auth/login, /auth/signup and the 'Check your email' view at 375 and 390, Night and Light. Then take the line out again. Nobody has seen the real pages with a key.
- Privacy Policy: the sentences in 'policy' go into src/app/legal/privacy/** and handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md. Publish them no later than the deploy that carries the site key.
- The audit handoff (item 18) says to create the Turnstile site for www.connectvibe.app. Use connectvibe.app instead: Cloudflare's hostname rule covers subdomains from the root, but www alone does not cover the root.
- Vercel: set the key for Production only. A preview deploy on another hostname is not on the Cloudflare site's list, so its box would show 'Something is wrong with the check on our side'. Once Supabase's switch is on, a preview that talks to the production database could not sign in.
- mobile/ (not my files): nobody has seen the box pass inside the apps. If it fails there, Cloudflare's mobile guide lists what a web view must allow: challenges.cloudflare.com, frames at about:blank and about:srcdoc, script on, storage and cookies kept between sessions, and one browser signature for the whole session. Ours is fixed by appendUserAgent, which should be fine.
- src/components/auth/EmailLinkProblem.tsx (not my file) shows ResendConfirmation, so the box also appears on the /auth/confirm and /auth/callback problem screens. No code change is needed; include them in the walk.
- No twin is out of step: no page under public/html has a sign-in form, and the apps show these same pages.
- Optional, not built: when the 'this page couldn't run that check' sentence fires, it means the live build has no key while Supabase's switch is on. A Sentry report from that branch would tell the founders at once.
