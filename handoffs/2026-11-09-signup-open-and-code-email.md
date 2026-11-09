# Sign-up opened, and why the code email is slow or junked (Mon Nov 9, 2026)

## Sign-up is open
Franky, Nov 9: "lets still keep this waitlist", then minutes later "actually no open it, the waitlist code takes way to
long to send". `app_settings.signup_open` set to true at 05:48 UTC. Checked live: /waitlist sends to /auth/signup, the
sign-up page has no access-code field, the landing has no "Join the waitlist". The before-user-created hook stays on
(club links still tracked). To close again: `signup_open` back to false; the site follows within 30 s.
State before opening (counts): 21 accounts, none new since Oct 28; the Oct 26 shared code ended Oct 31 unused; no new
events, RSVPs or club links since Oct 28. Franky has no time frame for anything right now.

## The code email: what three read-only investigators found
- **Records are fine.** SPF passes on `send.connectvibe.app` (Resend's sender), DKIM is signed for connectvibe.app, DMARC
  `p=none` with reports going to Cloudflare; both checks align with the From domain. connectvibe.app is on no blocklist
  (Spamhaus DBL, SURBL, URIBL). The root SPF note from Sep 15 doesn't matter (the root domain never sends).
- **One filter for both schools:** iu.edu and purdue.edu deliver straight to Microsoft 365 (Exchange Online Protection).
  No greylisting; the code email has no links or attachments, so nothing is scanned or held.
- **Why Junk: sender reputation.** A domain registered May 2026, sending a few emails a day from Resend's shared
  servers. Microsoft treats new senders "more suspiciously". Content is at most a small factor: the Oct 13 sign-in note
  had a plain-text copy, no links, plain wording, and was junked too.
- **Why "slow":** measured delivery was 13-100 s (Sep) and about a minute to IU (Oct), which is normal. Microsoft can also
  turn away unknown senders for a few minutes ("try again later"). The bigger risk now that sign-up is open: Supabase
  sends at most **30 auth emails an hour** and Resend's free plan stops at **100 emails a day** (all Vibe mail together);
  past either, a code never arrives.
- **Smaller content points:** Supabase sends the code email as HTML only (no plain-text copy; confirmed in its mailer
  code); every email comes from `noreply@`; the sign-up page says "check Junk" but not "choose Not junk"; the password
  reset email loads Google Fonts and has hidden preview text (marketing traits). Resend's open/click tracking was never
  confirmed off.

## The fix, in order (recommendations)
1. **Franky, 5 min: read Microsoft's verdict.** In your own IU Outlook on the web, open a Vibe email in Junk, then
   ... > View > View message details. Paste only the `X-Forefront-Antispam-Report`, `X-Microsoft-Antispam` and
   `Authentication-Results` lines into a session (no recipient address). CAT:SPM with passing checks = reputation;
   CAT:BULK = the shared pool; a failed dmarc/compauth = a setup bug.
2. **Franky, 2 min:** Resend > Domains > connectvibe.app: open and click tracking OFF.
3. **Franky, 10 min, about $20/mo:** upgrade Resend to Pro (no daily cap) and raise Supabase's auth email rate limit
   (Authentication > Rate Limits) to about 100 an hour. This is what keeps codes from stopping during a rush.
4. **SHIPPED Nov 9 (main 8b0d18ba):** the sign-up "check your email" screen and the school-email code panel now say to
   choose "Not junk" so the next one lands in the Inbox (each student's Not junk is honored by Microsoft). Checked live
   on the sign-up page's served script; the school-email page needs a signed-in visit to see.
5. **SHIPPED Nov 9 (main 0a98266f):** every email now comes from `hello@connectvibe.app` (routed to Franky by
   Cloudflare). Franky changed Supabase's SMTP sender and Vercel's `RESEND_FROM`; the code changed the sign-up page line
   and the example settings. Checked live: the sign-up page names hello@. Not yet seen: a real code email's From line.
6. **Franky, one email (Claude drafts):** ask IU UITS and Purdue IT, ideally through a staff contact, for an allow entry
   for connectvibe.app (sender domain + dmarc=pass), with the header evidence from step 1. Uncertain, likely weeks.
7. **Later:** Supabase Send Email Hook so the code email gets a plain-text copy and a reply address (half a day; small
   gain, do after step 1); the reset email in the plain code-email shape (1 hour); DMARC to `p=quarantine` once
   Cloudflare's reports are clean.

Not worth it now: a dedicated IP (for 3,000+ a day), a new sending subdomain (starts with no history), BIMI, Microsoft
SNDS/JMRP (need servers we control).
