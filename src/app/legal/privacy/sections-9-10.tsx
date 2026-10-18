import { LegalOL, LegalP, LegalUL } from "@/components/legal/LegalLayout";

import { Mail, PageLink, Sec, SectionH2 } from "./parts";

/** Privacy Policy sections 9 and 10. The wording is privacy-policy-final.md's:
 *  do not reword it here. */
export function Sections9To10() {
  return (
    <>
      <SectionH2 n={9} />
      <LegalP>
        <strong>See and change.</strong> You can edit your profile, and hide
        five parts of it: bio, experience, skills, &ldquo;Working on&rdquo; and
        résumé. Your name, handle, photos, tagline, location line, website
        link, interest tags, major, year, campus, verified badge, three counts
        (followers, following and connections) and posts cannot be hidden.
        Your clubs show on your profile unless you hide one, and hiding one
        takes it off at once. You can also hide the title a club gave you, and
        choose the order your clubs show in. The club&apos;s members still see
        you in its member list. When you leave a club, you choose whether to
        keep following it. If you do, you can read its Board as a follower can
        (<Sec to="5e">section 5e</Sec>).{" "}
        <PageLink href="/settings">Settings</PageLink> shows your sign-in and
        school emails. To change your sign-in email, write to{" "}
        <Mail box="help" /> from your current sign-in email. We reply to that
        address, and change it only after you answer that reply.
      </LegalP>
      <LegalP>
        <strong>Block, mute, report.</strong> Block or mute someone from their
        profile. Mute a club&apos;s posts from its page or from one of its
        posts: they leave your feed, you stay in its chats, and the club is not
        told. Any account that has accepted the{" "}
        <PageLink href="/legal/terms">Terms</PageLink> can report, verified or
        not, unless it is suspended or banned.
      </LegalP>
      <LegalP>
        <strong>A copy of your data.</strong> Email <Mail box="hello" /> from
        your sign-in email. There is no export tool. The cofounder with direct
        access (<Sec to="1">section 1</Sec>) puts the copy together by hand,
        and has to open your records to do it, messages included. We aim to
        send it within 30 days. We send it only to your sign-in email, never to
        another address.
      </LegalP>
      <LegalP>
        <strong>Taking back your agreement.</strong> You agreed by checking the
        box at sign-up. To take that back, delete your account. That is the
        only way, because Vibe cannot run an account without the information
        on this page. On the waitlist, use &ldquo;Take me off the list&rdquo;.
        In the phone apps, once they are out, you can turn off the camera,
        microphone, photos and notifications for Vibe at any time. You do that
        in your phone&apos;s settings, and Vibe keeps working without them.
      </LegalP>
      <LegalP>
        <strong>Delete your account.</strong> In{" "}
        <PageLink href="/settings">Settings</PageLink>, under &ldquo;Danger
        zone&rdquo;, type your handle to confirm. The account is deleted right
        away, with no waiting period and no undo. The same button is on the
        &ldquo;verify your campus&rdquo; screen and the suspended notice.
      </LegalP>
      <LegalP>
        If you cannot sign in, write to <Mail box="help" /> or see{" "}
        <PageLink href="/legal/delete-account">
          connectvibe.app/legal/delete-account
        </PageLink>
        . We reply to your sign-in email and delete only after you answer that
        reply. If you can no longer read mail at that address, we ask for other
        proof that the account is yours (<Sec to="3g">section 3g</Sec>). The
        cofounder with direct access then deletes the account by hand: its
        files first, then its records.
      </LegalP>
      <LegalP>
        <strong>The yearly school check-in.</strong> A school closes your
        school inbox after you leave, and nothing tells us when. So if you sign
        in with a school email and have not added a personal email, once a year
        we email a code to your school email. If you type it into Vibe, nothing
        changes for another year. If you do not within 14 days, a 90-day
        countdown starts, and Vibe shows you its last day each time you open
        Campus. Typing the code or adding a personal email (
        <Sec to="3a">section 3a</Sec>) ends the countdown. If you do neither by
        that day, we delete your account and what is in it, as in the steps
        below. An account that signs in with a personal email, or has added
        one, is never checked.
      </LegalP>
      <LegalP>What happens, in order:</LegalP>
      <LegalOL>
        <li>Vibe+, if you have it, is cancelled with no refund.</li>
        <li>
          Your files are deleted, except evidence files (below) and the files{" "}
          <Sec to="8">section 8</Sec> says we miss.
        </li>
        <li>
          Your account is deleted from the sign-in system, and with it every
          record tied to the account:
          <LegalUL bullets>
            <li>
              both email addresses, your profile and your proof of agreement;
            </li>
            <li>everything you posted, sent, liked, saved or voted on;</li>
            <li>
              your follows, club memberships and titles, RSVPs, blocks and
              mutes, club mutes included;
            </li>
            <li>the records of what you viewed and of who viewed you;</li>
            <li>
              your notifications, and your waitlist entry.
            </li>
          </LegalUL>
          <LegalP>
            One log is not tied to the account, so step 3 does not reach it. It
            can still hold your email address (see &ldquo;The sign-in
            log&rdquo; below).
          </LegalP>
        </li>
      </LegalOL>
      <LegalP>
        If step 1 or 2 fails, the account is not deleted and you can try again.
        If step 3 fails, your files are already deleted, and trying again
        finishes the job.
      </LegalP>
      <LegalP>
        <strong>What do other people lose when I delete my account?</strong>{" "}
        Messages you sent are deleted from other people&apos;s chats, with any
        pins on them, the replies under your Board posts and the votes on polls
        you posted. Other people&apos;s comments, likes and reposts on your
        posts go with the posts. Posts and events you made as a club are
        deleted, and each event takes everyone&apos;s RSVPs and its whole chat
        with it.
      </LegalP>
      <LegalP>
        <strong>What stays with Vibe after deletion.</strong>
      </LegalP>
      <LegalUL bullets>
        <li>
          <strong>Suspension and ban records.</strong> For either one we keep
          which it was, its dates, the reason and the team&apos;s private note.
          We also keep up to two scrambled codes (
          <Sec to="3d">section 3d</Sec>): one made from your school email and
          one from your sign-in email. The scrambled code from your school
          email stops that address being verified on another account while the
          suspension or ban lasts.
        </li>
        <li>
          <strong>Reports about you,</strong> with the copy of what was
          reported. Reports you filed stay, with your name taken off.
        </li>
        <li>
          <strong>The moderation log:</strong> your old account ID, your handle
          at the time and, for a photo that was removed, the old photo&apos;s
          address.
        </li>
        <li>
          <strong>Evidence files.</strong> These are:
          <LegalUL bullets>
            <li>
              the photos and videos of a post, if the Vibe team removed it or if
              a report on it is open or was acted on;
            </li>
            <li>
              a photo or video you sent in a chat, if the Vibe team or a
              club&apos;s owner, admin or mod removed that message or if a report
              on it is open or was acted on;
            </li>
            <li>a photo, cover or logo the Vibe team removed;</li>
            <li>
              your profile photo and cover, if a report about you was open.
            </li>
          </LegalUL>
          <LegalP>
            A photo already kept as evidence stays, even if the report was
            dismissed.
          </LegalP>
        </li>
        <li>
          <strong>The files that deleting your account misses</strong> (
          <Sec to="8">section 8</Sec>).
        </li>
        <li>
          <strong>Messages you pinned.</strong> A message someone else wrote
          stays pinned. The record of who pinned it is emptied.
        </li>
        <li>
          <strong>
            Club records of things you did as a club owner, admin or mod,
          </strong>{" "}
          such as titles you gave and followers you removed, with your name
          taken off. A club you owned stays, with no owner.
        </li>
        <li>
          <strong>Our email log,</strong> without the scrambled code or your
          account ID. It keeps the reference number Resend gave each message.
        </li>
        <li>
          <strong>The sign-in log.</strong> The sign-in system&apos;s log of
          sign-in activity (<Sec to="3d">section 3d</Sec>) sits in our database
          at Supabase. It can hold your email address and IP address. It is not
          tied to your account, and nothing in Vibe clears it today.
        </li>
        <li>
          <strong>Abuse counts,</strong> until they are cleared.
        </li>
        <li>
          <strong>Our list of payment events,</strong> once billing is on.
        </li>
        <li>
          <strong>
            Anything a court order or the law makes us keep.
          </strong>{" "}
          If we get a valid order to keep an account&apos;s records before you
          delete it, we copy and keep them.
        </li>
      </LegalUL>
      <LegalP>
        <strong>What stays with other companies.</strong>
      </LegalP>
      <LegalUL bullets>
        <li>
          Resend&apos;s record of emails sent to you, Vercel&apos;s visit logs
          and Sentry&apos;s reports. We have not confirmed how long each is
          kept.
        </li>
        <li>
          Emails you sent us. They stay in the Gmail inbox until they are
          deleted there.
        </li>
        <li>Stripe&apos;s payment records, once billing is on.</li>
      </LegalUL>
      <LegalP>
        Your handle is not held for you. Someone else can take it right away.
      </LegalP>
      <LegalP>
        <strong>No end date yet.</strong> Reports, the moderation log,
        suspension and ban records and evidence files have no end date today.
        We will set one with our lawyer and write it here. Until then you can
        ask <Mail box="help" /> to delete a report copy or an evidence file
        that is about you or that shows you. You do not need an account to ask.
        We will, unless safety, the law or an open case needs it.
      </LegalP>
      <LegalP>
        <strong>If we suspend or ban your account.</strong> You can still sign
        in, read the notice and the legal pages, sign out and delete your
        account. Everyone else stops seeing your profile, posts and comments,
        but messages you already sent stay visible in chats. Your name, handle
        and photo can still show in the member list of a club you are in. The
        notice gives the kind, the end date of a suspension and the reason, not
        the private note. To appeal, email <Mail box="help" />. A ban cancels
        Vibe+ with no refund.
      </LegalP>

      <SectionH2 n={10} />
      <LegalP>
        <strong>What we do.</strong> Everything sent between your device and
        Vibe travels over an encrypted connection (HTTPS). Résumés, chat photos
        and videos and group chat photos are served through links that expire.
        Vibe is built so that no other user can read your email addresses
        (apart from the starter name in <Sec to="3a">section 3a</Sec>), your
        proof of agreement or your moderation records. One gap is named below.
      </LegalP>
      <LegalP>
        <strong>What we do not have.</strong> Sign-in is by email and password,
        with no second sign-in step such as a code on your phone. Messages are
        not end-to-end encrypted (<Sec to="5h">section 5h</Sec>). We keep no
        backups (<Sec to="8">section 8</Sec>), and no log of what is read
        through direct access (<Sec to="1">section 1</Sec>).
      </LegalP>
      <LegalP>
        <strong>One more gap.</strong> A signed-in person who types a school
        email at the &ldquo;verify your campus&rdquo; step is told if that
        address is already on another account. They are also told if it cannot
        be used on Vibe, which means a suspension or ban. They are not told
        whose account it is. Each account gets three tries an hour.
      </LegalP>
      <LegalP>
        <strong>
          If someone gets at your personal information without permission,
        </strong>{" "}
        and we learn of it, we will email each person affected at the address
        we hold. We will also put a notice on this page. We will say what
        happened, what information was involved and what we are doing about it.
        We will do that as fast as we reasonably can, and no later than 30 days
        after we find out. Two things can change that: the police may ask us to
        wait, or the law may set a shorter time. Vibe keeps few records of who
        read what (<Sec to="1">section 1</Sec>), so we may not be able to tell
        exactly whose information was reached. If we cannot tell, we tell
        everyone. Where a state&apos;s law requires it, we also tell that
        state&apos;s attorney general.
      </LegalP>
    </>
  );
}
