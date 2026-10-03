import { LegalP, LegalTable, LegalUL } from "@/components/legal/LegalLayout";

import { Mail, PageLink, Sec, SectionH2 } from "./parts";

/** Privacy Policy sections 6 to 8. The wording is privacy-policy-publish.md's
 *  (see page.tsx): do not reword it here. */
export function Sections6To8() {
  return (
    <>
      <SectionH2 n={6} />
      <LegalP>
        These outside services hold your information or are contacted by your
        device. Each works under its own published terms and privacy policy.
      </LegalP>
      <LegalUL bullets>
        <li>
          <strong>Supabase</strong> (database, sign-in, file storage). The
          whole database, your sign-in (email, scrambled password and a log of
          sign-in activity), public photos, private résumés and evidence files.
          Your browser talks to it directly when you sign in and each time a
          profile or post photo loads, so it sees your IP address and browser.
          It sends the &ldquo;confirm your account&rdquo; email.
        </li>
        <li>
          <strong>Vercel</strong> (hosting). It runs the site and our server
          code. Its visit logs record the web address requested, your IP
          address and browser. Some web addresses carry personal details, such
          as search words or the link in one of our emails.
        </li>
        <li>
          <strong>Cloudflare</strong> (media storage). Post videos, club media,
          chat photos and videos, and group pictures. It also serves the small
          program that shows a résumé PDF.
        </li>
        <li>
          <strong>Resend</strong> (sending email). The address and full content
          of every email our code sends.
        </li>
        <li>
          <strong>Sentry</strong> (finding bugs). Error reports and speed
          measurements (<Sec to="3d">section 3d</Sec>), with your IP address,
          browser and the page address.
        </li>
        <li>
          <strong>Google</strong> (fonts). Your IP address and browser on
          almost every page, and when a mail app loads the fonts in one of our
          emails.
        </li>
        <li>
          <strong>Our email inbox.</strong> Mail you send us is held by the
          email service that hosts our inbox.
        </li>
        <li>
          <strong>AI coding tools.</strong> We build and maintain Vibe with
          them. When the cofounder with direct access uses one to look into a
          problem, the database records it reads pass through that tool&apos;s
          provider.
        </li>
      </LegalUL>
      <LegalP>
        Off today: <strong>Stripe</strong> and the notification services (
        <Sec to="3f">section 3f</Sec>), and the{" "}
        <strong>Apple App Store and Google Play</strong> once the apps are
        published.
      </LegalP>
      <LegalP>
        Each company decides where its servers are. Ask and we will tell you
        what we know.
      </LegalP>

      <SectionH2 n={7} />
      <LegalP>
        <strong>Cookies.</strong> Only the ones that keep you signed in, set by
        our sign-in provider. They last up to 400 days and are refreshed as you
        use Vibe. There are no advertising or tracking cookies, so there is no
        cookie banner.
      </LegalP>
      <LegalP>
        <strong>Kept in your browser.</strong> To load faster, Vibe keeps
        copies of some of your own information in your browser, such as your
        profile card, your own posts, follow list and recent searches. They are
        cleared when you sign out or delete your account in that browser, and
        stay in your other browsers until you sign out there. Your theme, the
        email you just signed up with and a few similar notes can stay until
        you clear your browser data for Vibe.
      </LegalP>
      <LegalP>
        <strong>Sign out.</strong> Signing out in{" "}
        <PageLink href="/settings">Settings</PageLink> signs your account out
        on every device, though another device can keep working for up to about
        an hour.
      </LegalP>

      <SectionH2 n={8} />
      <LegalP>
        Vibe does not delete things just because they are old. They stay until
        you, a club or we delete them. The one clean-up on a schedule today is
        the waitlist&apos;s (<Sec to="11">section 11</Sec>).
      </LegalP>
      <LegalTable
        head={["What", "Kept until"]}
        rows={[
          [
            "Who viewed a profile or post",
            "Either account or the post is deleted",
          ],
          [
            "Messages",
            "The sender deletes the message or their account. In club chats, also when the post above it, the room, the event or the club is deleted",
          ],
          [
            "An event's chat",
            "Deleted with the event. It closes to new messages 7 days after the event ends",
          ],
          [
            "RSVPs",
            "You take it back, an officer removes you from the club, or the event, the club or your account is deleted",
          ],
          [
            "Events, join requests, invites",
            "The event, the club or your account is deleted",
          ],
        ]}
      />
      <LegalP>
        <strong>Deleting one thing.</strong>
      </LegalP>
      <LegalUL bullets>
        <li>
          <strong>A post</strong> is deleted right away with its likes,
          comments, saves, reposts and view records. We then try to remove its
          files. If that fails, they stay until your account (or the club, for
          a club post) is deleted. If a report about the post is open, its
          files are kept as evidence. Temporary copies of a public photo can
          linger on our storage provider&apos;s network for a time we have not
          measured. You cannot delete or edit a post the Vibe team removed.
        </li>
        <li>
          <strong>An edit</strong> replaces the old text. A report filed before
          the edit keeps the text as it was.
        </li>
        <li>
          <strong>A message</strong> is deleted right away for everyone, with
          its reactions and, for a Board post, every reply under it.
        </li>
        <li>
          <strong>A profile photo or cover</strong> you replace is deleted, or
          kept as evidence if a report about you is open. A résumé file is
          deleted when you remove it.
        </li>
      </LegalUL>
      <LegalP>
        <strong>What Vibe does not delete yet.</strong>
      </LegalP>
      <LegalUL bullets>
        <li>
          The photo or video on a message you deleted. The app stops showing
          it, but the file stays in our storage, even after you delete your
          account. A link opened before the delete can work for up to an hour.
        </li>
        <li>Group chat pictures.</li>
        <li>
          A work logo you replaced, and a photo you uploaded but never used.
          They stay at their public links until you delete your account.
        </li>
        <li>
          Photos and videos you posted as a club, until the club is deleted.
        </li>
        <li>
          Comments. There is no delete button. A comment goes when its post or
          your account does.
        </li>
        <li>Your messages in a chat or club you have left.</li>
        <li>
          A direct or group chat itself. &ldquo;Clear chat history&rdquo; and
          &ldquo;Delete conversation&rdquo; only clear your view.
        </li>
        <li>A request to join a club. You cannot take it back.</li>
        <li>
          An account that never confirmed its email or never finished setting
          up. If you cannot sign in to delete it, write to <Mail box="help" />.
        </li>
        <li>Our email log, the abuse limit counts and emails you send us.</li>
        <li>
          Reports, the moderation log, suspension and ban records, and evidence
          files. No end date is set (<Sec to="9">section 9</Sec>).
        </li>
      </LegalUL>
      <LegalP>
        <strong>Backups.</strong> We keep no database backups, so we cannot
        bring back something you delete by mistake.
      </LegalP>
    </>
  );
}
