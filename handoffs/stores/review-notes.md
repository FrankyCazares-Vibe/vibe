# Store review notes — template

**Updated Oct 7, 2026** for what changed since Sept 24: sign-up is closed behind a waitlist, the new
club chat is on for every account (the review accounts too), and the one exception to blocking.

**Plain English.** This is what we paste into App Store Connect ("App Review Information") and Play
Console ("App access" and the review notes) for every submission. It says how a reviewer signs in,
which parts of Vibe are native, and where to try Report, Block and Delete account. Fill the
`{{…}}` placeholders per build.

**No credentials in this file, ever.** `handoffs/` is in git (a private repo) and mirrored into the Obsidian vault.
The review emails and passwords live in the founders' password manager and are typed straight into
App Store Connect / Play Console. The seed script reads them from your shell, never from a file.

---

## Before every submission

1. In your shell, set `REVIEW_EMAIL_1/_2`, `REVIEW_SCHOOL_EMAIL_1/_2` and `NEXT_PUBLIC_SUPABASE_URL`
   with a plain `export`. Don't put anything in a file in the repo.
   The secrets never go on the command line. `export REVIEW_PASSWORD_1=…` typed at the prompt lands in
   plain text in `~/.zsh_history`. Read each one in silently instead, then paste it and press Return:
   ```
   IFS= read -rs REVIEW_PASSWORD_1 && export REVIEW_PASSWORD_1
   IFS= read -rs REVIEW_PASSWORD_2 && export REVIEW_PASSWORD_2
   IFS= read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY
   IFS= read -rs RESTRICTION_PEPPER && export RESTRICTION_PEPPER
   ```
   `RESTRICTION_PEPPER` is the one in Vercel's environment settings. Without it the seed refuses
   while any school-address ban is in force anywhere, because it can't tell whose it is. Close
   the terminal when you're done, so none of these stay in the shell.
2. Dry run: `node scripts/seed-review-accounts.mjs --production --i-have-frankys-yes`, then type the
   project ref. Read what it would write. Franky only.
3. Apply: the same with `--apply`. It re-creates an account the last reviewer deleted. It refuses
   while either account, or either school address, has a suspension or ban in force (lift it in the
   admin desk first). A ban on a school address outlives the account it was placed on.
4. Sign in as each account on a phone and check: the feed loads, account 2's post and comment show,
   Report opens.
5. By hand, the parts the seed doesn't do:
   - account 2 sends account 1 a direct message, so "Report this message" can be tried;
   - account 1 and account 2 both join a live club with an upcoming event (Rylan's clubs), so the
     Events tab isn't empty and the club's Board and Lounge can be opened. An officer of that club
     posts once on the Board and account 2 writes once in the Lounge, so Report can be tried there.
   - Sign-up is closed (`signup_open` false). The seed creates the accounts with the service role,
     so the waitlist gate doesn't stop it. Check that **Log in** still works for both.
6. Tell the other founders the dates: reviewers sometimes file a real report, and it has to be acted
   on within 24 hours like any other.

---

## Sign-in (App Store Connect → App Review Information · Play Console → App access)

| Field | Value |
|---|---|
| Sign-in required | Yes |
| User name (account 1, "reviewer") | entered in App Store Connect / Play Console only |
| Password (account 1) | entered in App Store Connect / Play Console only |
| Second account (account 2, "friend") | entered in the notes field of App Store Connect / Play Console only |
| How to sign in | Open the app → **Log in** → email and password. No code, no 2FA, no magic link. |

---

## Notes for the reviewer (paste, then fill the placeholders)

> Vibe is a social app for students at IU Indianapolis and Purdue Indianapolis. New accounts must
> verify an @iu.edu or @purdue.edu school email before they can see the campus, so we have provided
> a demo account that is already verified. Sign in with email and password; there is no code or 2FA.
>
> **Vibe is opening in waves.** Sign-up is closed for now: a new visitor joins a waitlist with their
> school email and later receives an access code by email. "Create your account" without a code is
> refused on purpose. Please use **Log in** with the demo account; it needs no code.
>
> A second demo account, "Vibe Review Friend" (@{{REVIEW_HANDLE_2, default vibe_review_pal}}), has
> posted, commented on your post and follows you, so you can try reporting and blocking on real
> content. Its sign-in, if you need it: {{typed here in the console only, never in this file}}.
>
> **Native features in this build** (list only what ships in {{build number}}):
> - {{e.g. The tab bar at the bottom (Campus, Messages, Otto, Profile) is native.}}
> - {{e.g. Push notifications: after sign-in, allow notifications; a like or message opens the right screen.}}
> - {{e.g. Tap Share on any post, profile or event to open the iOS share sheet / Android share menu.}}
> - {{e.g. Adding a photo to a post opens the system photo picker or camera.}}
> - {{e.g. Turn on airplane mode to see the offline screen.}}
> - {{e.g. connectvibe.app links (a profile or post) open the app.}}
>
> **Report content** (Guideline 1.2):
> - Post: on the Campus feed, tap **⋯** on the friend's post → **Report post** → pick a reason →
>   send. The sheet then offers **Block Vibe Review Friend**. The post leaves your feed when the
>   sheet closes.
> - Comment: open your own post, find the friend's comment and tap its report button
>   (**Report this comment**).
> - Message: open the chat with the friend, long-press their message → **Report**.
> - Club chat: Messages → the demo club → **Lounge** (members' chat) or **Board** (announcements
>   from the club's officers). Long-press a message or a Board post → **Report**.
> - Event: tap **Report** on an event card. Profile: open the friend's profile → **⋯** → **Report**.
>
> **Block or mute:** on the friend's profile → **⋯** → **Block** or **Mute**. On a phone a post's
> **⋯** menu also has **Block author**. Undo in Settings → **Blocked users**. A blocked person
> can't message you and you stop seeing each other's posts. In a club you both belong to, their
> messages and replies are hidden and no longer count as unread. One exception: a club's official
> announcements, posted by its owner or admins on the club's Board, stay visible to every member.
>
> Every report is reviewed by our team and acted on within 24 hours. Posts and profiles also pass an
> automatic text filter before they are published.
>
> **Delete account** (Guideline 5.1.1(v)): Profile → gear icon (Settings) → **Delete account…** →
> type your handle (@{{REVIEW_HANDLE_1, default vibe_review}}) → **Permanently delete**.
> {{Once S1C is live: A new account that hasn't verified a school email can delete itself from the
> "Verify your campus" screen.}} The same steps, and what is kept, are at
> https://www.connectvibe.app/legal/delete-account. If you delete the demo account we re-create it
> before the next submission.
>
> **Not in this build:** {{keep what is true: paid plans (Vibe+) are not on sale and nothing in the
> app takes payment · push notifications are off}}.
>
> Support: https://www.connectvibe.app/support · help@connectvibe.app
> Privacy: https://www.connectvibe.app/legal/privacy · Terms: https://www.connectvibe.app/legal/terms

---

## Play Console only

- **App access:** "All or some functionality is restricted" → add the instructions above with the
  account-1 sign-in (entered in Play Console only).
- **Account deletion URL** (Data safety): https://www.connectvibe.app/legal/delete-account
- **Demo video:** {{link to the 60–90 s screen recording, if attached}}

## After the review

- **Re-run the seed before the next submission, every time.** A review uses the pair up, and the
  re-run puts it back. The dry run lists each of these:
  - an account the reviewer deleted is created again;
  - a block or mute between the two accounts is deleted (what Unblock / Unmute do), and then the
    follows go back in, since a block deletes them;
  - a seeded post the other account reported, or one a moderator removed, gets a fresh copy, and
    the friend's comment goes on it. The old copy stays where it is, because the report or removal
    points at it. The feed hides a reported post from the person who reported it for good, whatever
    the report's status, so closing the report doesn't bring the post back. A removed comment gets a
    fresh copy the same way.
- Check the admin desk for reports filed during the review and close them (for the record; see above).
- Change `REVIEW_PASSWORD_1/_2` in the password manager and re-run the seed if a password was ever
  shared outside the store consoles.
