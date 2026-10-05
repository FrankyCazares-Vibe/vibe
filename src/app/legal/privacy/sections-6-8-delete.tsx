import { LegalP, LegalUL } from "@/components/legal/LegalLayout";

import { Mail, Sec } from "./parts";

/** The two delete lists of Privacy Policy section 8: "Deleting one thing" and
 *  "What Vibe does not delete yet". Split out of sections-6-8.tsx for length;
 *  the wording is privacy-policy-final.md's: do not reword it here. */
export function DeleteOneThing() {
  return (
    <>
      <LegalP>
        <strong>Deleting one thing.</strong>
      </LegalP>
      <LegalUL bullets>
        <li>
          <strong>A post.</strong> When you delete a post:
          <LegalUL bullets>
            <li>
              it is deleted right away, with its likes, comments, saves,
              reposts and view records;
            </li>
            <li>
              we then try to delete its files. If that fails, they stay until
              your account is deleted, or until the club is, for a club post;
            </li>
            <li>
              if a report about the post is open, its files are kept as
              evidence;
            </li>
            <li>
              The servers Supabase uses to deliver files can hold temporary
              copies of a public photo for longer. We have not measured how
              long.
            </li>
          </LegalUL>
          <LegalP>You cannot delete or edit a post the Vibe team removed.</LegalP>
        </li>
        <li>
          <strong>An edit</strong> replaces the old text. A report filed before
          the edit keeps the text as it was.
        </li>
        <li>
          <strong>A message</strong> is deleted right away for everyone, with
          its reactions, any pin on it and, for a Board post, every reply under
          it.
        </li>
        <li>
          <strong>A profile photo, cover or résumé file.</strong> When you
          replace a profile photo or cover, we try to delete the old file, or we
          keep it as evidence if a report about you is open. When you take a
          résumé file off your profile, we try to delete it. If a delete fails,
          the file stays until you delete your account.
        </li>
      </LegalUL>
    </>
  );
}

export function NotDeletedYet() {
  return (
    <>
      <LegalP>
        <strong>What Vibe does not delete yet.</strong>
      </LegalP>
      <LegalUL bullets>
        <li>
          The photo or video on a message you deleted. The app stops showing it,
          but the file stays in our storage, even after you delete your
          account. A link opened before the delete can work for up to an hour.
        </li>
        <li>Group chat photos.</li>
        <li>
          A work logo you replaced, and a photo you uploaded but never used.
          They stay at their public links until you delete your account.
        </li>
        <li>
          The files of posts you made as a club, when you delete your account.
          The posts go. The files stay until the club is deleted.
        </li>
        <li>
          Comments. There is no delete button. A comment goes when its post or
          your account does.
        </li>
        <li>
          Your messages in a chat or club you have left. They go when you delete
          your account.
          <LegalP>
            For a comment, or for your messages in a chat or club you have left,
            you need not delete your account. Write to <Mail box="help" /> from
            your sign-in email. We reply to that address, and once you answer
            that reply we aim to delete the comment or the messages by hand.
          </LegalP>
        </li>
        <li>
          A direct or group chat itself. &ldquo;Clear chat history&rdquo; and
          &ldquo;Delete conversation&rdquo; only clear your view.
        </li>
        <li>A request to join a club. You cannot take it back.</li>
        <li>
          The date you first followed a club. It stays after you unfollow,
          until the club or your account is deleted. While you are not
          following, no other user is shown it. If you follow again, the
          club&apos;s owner and admins see that first date (
          <Sec to="5f">section 5f</Sec>).
        </li>
        <li>
          An account that never confirmed its email or never finished setting
          up. If you cannot sign in to delete it, write to{" "}
          <Mail box="help" />.
        </li>
        <li>
          Our email log, the abuse counts, the sign-in log and emails you send
          us (<Sec to="9">section 9</Sec>).
        </li>
        <li>
          Reports, the moderation log (our record of what moderators did),
          suspension and ban records, and evidence files. No end date is set
          yet (<Sec to="9">section 9</Sec>).
        </li>
      </LegalUL>
    </>
  );
}
