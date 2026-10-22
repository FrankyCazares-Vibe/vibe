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
          <strong>A message.</strong> When you delete a message:
          <LegalUL bullets>
            <li>
              its words, its photo or video, any poll or sign-up in it (with
              the votes and names), its reactions, any pin on it and the
              notifications about it are deleted right away, for everyone. A
              post or event it shared is not touched. A notification already on
              someone&apos;s phone or computer can still show it there;
            </li>
            <li>
              a grey &ldquo;Message deleted&rdquo; note stays in its place
              (&ldquo;Post deleted&rdquo; on the Board). The note keeps that a
              message was there, who sent it and when, and we store when it was
              deleted. The note is kept as long as a message would be (the
              table above);
            </li>
            <li>the replies under a Board post you delete stay;</li>
            <li>
              we then try to delete its photo or video file. If the Vibe team or
              a club removed the message, or a report about it is open or was
              acted on, the file is kept as evidence. It is also kept while
              another message in the chat points to the same file. If the
              delete fails, the file stays in our storage, even after you
              delete your account.
              While the file is still stored, a link to it opened before the
              delete can work for up to an hour.
            </li>
          </LegalUL>
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
        <li>
          A request to join a club once its owner or officers have answered it.
          While it is still waiting you can cancel it, which also takes back the
          follow it made. Asking also follows the club. If the club says no, you
          keep following until you unfollow, and you can ask again after 14
          days.
        </li>
        <li>
          The date you first followed a club. It stays after you unfollow,
          until the club or your account is deleted. While you are not
          following, no other user is shown it. If you follow again, the
          club&apos;s owner and officers see that first date (
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
