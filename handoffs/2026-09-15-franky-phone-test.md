# Email verification — phone test (after deploy + template switch)

About 15 minutes. Use your iPhone. Make fresh test addresses with Gmail "+" aliases, e.g. `fgcazares04+vibe1@gmail.com`, `+vibe2`, `+vibe3`. Delete the test accounts afterwards in Supabase → Authentication → Users.

## A. Account confirmation

1. **Other app (the bug students hit).** In Safari, sign up with `+vibe1`.
   - Expect: "Check your email." with the address, an 8-digit code box, and "Send again in …s".
   - Open the email in the **Gmail app** and tap **Confirm my account**. A Vibe page opens with a button; nothing happens until you tap it. Tap it.
   - Expect: "You're confirmed. Signed in as …+vibe1@gmail.com" → Continue → the IU email step.

2. **Same browser.** In Safari, sign up with `+vibe2`. Long-press the email's button → Copy Link → paste into Safari → tap Confirm.
   - Expect: straight to the IU email step (no "invalid or expired").

3. **Tap twice.** Open the same `+vibe2` email link again and tap Confirm.
   - Expect: "This browser is signed in as …+vibe2…" with Continue / Not you? Sign out. Never "invalid or expired… sign up again".

4. **Code instead of link.** Sign up with `+vibe3` in Safari. Don't tap the email. Type its 8-digit code into the Safari screen.
   - Expect: confirmed, IU email step.

5. **Resend.** Still on a pending screen, wait for the countdown, tap **Send a new email**. Tap the **older** email's link → expect "already used or has expired". The **newer** one works.

6. **Existing account.** Try "Create account" again with `+vibe1`.
   - Expect: "This email may already have an account." No false "check your inbox".

## B. IU email (needs an IU address not linked to any Vibe account — a cofounder's works)

1. Signed in as a test account in Safari → IU step → "Send my code".
   - Expect: "Adding an IU email to …", "We sent a code and link to …", a code box, a countdown.
2. Read the code in the **Outlook app** without tapping anything; type it into Safari.
   - Expect: verified → onboarding.
3. (Another test account) tap the IU link **inside Outlook**.
   - Expect: "Almost there." card, not a silent bounce. "Sign in here to finish" works.

## C. Password reset

1. Log in page → Forgot? → your test address → open the email in Gmail → tap Set a new password.
   - Expect: a New password form (nothing happens until you submit). Set one → "Password updated for …" → into the app.
2. Tap the same reset email again → expect "This reset link was already used or has expired" with "Send a new reset link".

## D. Clubs, from a non-member account (use the `+vibe1` test account from part A)

You own all five clubs, so your own account can't test what a stranger sees. From the test account, signed in on your phone:

1. Open `connectvibe.app/orgs/sae`.
   - Expect: SAE's page loads, with no chat channels and no join button — it's invite only.
   - You should NOT see the red "Couldn't load this org's channels."
2. Open `connectvibe.app/orgs/test-f7ae4129` (a hidden test club).
   - Expect: not found.
3. In the clubs list (Campus → Orgs), expect SAE listed and none of the `test-…` clubs.
4. Tell me what each screen said. These three paths are the ones I can't check myself.

## Tell Claude
- Any screen that showed raw text ("Unauthorized", "Load failed", "Auth session missing!") — screenshot it.
- Where each email landed (Inbox / Promotions / Junk / Quarantine) and roughly how long it took.
