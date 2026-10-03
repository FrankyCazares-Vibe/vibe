import { LegalOL, LegalP, LegalUL } from "@/components/legal/LegalLayout";

import { Mail, PageLink, Sec, SectionH2 } from "./parts";

/** Privacy Policy sections 9 and 10. The wording is
 *  privacy-policy-publish.md's (see page.tsx): do not reword it here. */
export function Sections9To10() {
  return (
    <>
      <SectionH2 n={9} />
      <LegalP>
        <strong>See and change.</strong> You can edit your profile and hide any
        section of it. <PageLink href="/settings">Settings</PageLink> shows
        your sign-in and school emails. To change your sign-in email, write to{" "}
        <Mail box="help" />.
      </LegalP>
      <LegalP>
        <strong>Block, mute, report.</strong> Block or mute someone from their
        profile. Any account that has accepted the{" "}
        <PageLink href="/legal/terms">Terms</PageLink> can report, verified or
        not, unless it is suspended or banned.
      </LegalP>
      <LegalP>
        <strong>A copy of your data.</strong> Email <Mail box="hello" /> from
        your sign-in address. There is no export tool, so one of us puts it
        together, which means opening your records, messages included. We aim
        to send it within 30 days.
      </LegalP>
      <LegalP>
        <strong>Delete your account.</strong> In{" "}
        <PageLink href="/settings">Settings</PageLink>, under Danger zone, type
        your handle to confirm. The account is deleted right away, with no
        waiting period and no undo. The same button is on the &ldquo;verify
        your campus&rdquo; screen and the suspended notice. If you cannot sign
        in, write to <Mail box="help" /> or see{" "}
        <PageLink href="/legal/delete-account">
          connectvibe.app/legal/delete-account
        </PageLink>
        . One of us then deletes the account&apos;s records and removes its
        files.
      </LegalP>
      <LegalP>What happens, in order:</LegalP>
      <LegalOL>
        <li>Vibe+, if you have it, is cancelled with no refund.</li>
        <li>
          Your files are erased, except evidence files (below) and the files{" "}
          <Sec to="8">section 8</Sec> says we miss.
        </li>
        <li>
          Your sign-in is deleted, and with it every record tied to the
          account: both email addresses, your profile and proof of agreement,
          everything you posted, sent, liked, saved or voted on, your follows,
          club memberships, RSVPs, blocks and mutes, view records in both
          directions, your notifications, and your waitlist entry.
        </li>
      </LegalOL>
      <LegalP>
        If step 1 or 2 fails, the account is not deleted and you can try again.
      </LegalP>
      <LegalP>
        <strong>What your deletion takes from other people.</strong> Messages
        you sent disappear from other people&apos;s chats, with the replies
        under your Board posts and the votes on polls you posted. Other
        people&apos;s comments, likes and reposts on your posts go with the
        posts. Posts and events you made as a club are deleted, and each event
        takes everyone&apos;s RSVPs and its whole chat with it.
      </LegalP>
      <LegalP>
        <strong>What stays after deletion.</strong>
      </LegalP>
      <LegalUL bullets>
        <li>
          <strong>Suspension and ban records,</strong> for both: the kind,
          dates, reason, private note, and up to two scrambled codes (
          <Sec to="3d">section 3d</Sec>) made from your school and sign-in
          emails. The school-email code stops that address being verified on
          another account while the suspension or ban lasts.
        </li>
        <li>
          <strong>Reports about you,</strong> with the copy of what was
          reported. Reports you filed stay, with your name taken off.
        </li>
        <li>
          <strong>The moderation log:</strong> your old account number, your
          handle at the time and, for a photo takedown, the old photo&apos;s
          address.
        </li>
        <li>
          <strong>Evidence files:</strong> the photos and videos of a post the
          Vibe team removed or that has a report open or acted on, a photo,
          cover or logo the team took down, and your photo and cover if a
          report about you was open. Photos already kept as evidence stay even
          if the report was dismissed.
        </li>
        <li>
          <strong>The files that deleting your account misses</strong> (
          <Sec to="8">section 8</Sec>).
        </li>
        <li>
          <strong>Club records where you acted as an officer,</strong> with
          your name removed. A club you owned stays, with no owner.
        </li>
        <li>
          <strong>Our email log</strong> (without the scrambled code or your
          account number), abuse limit counts until they are cleared and, once
          billing is on, Stripe&apos;s payment records and our list of payment
          events.
        </li>
        <li>
          <strong>Logs at our providers:</strong> Supabase&apos;s sign-in log
          (which can hold your email address and IP address), Resend&apos;s
          record of emails sent to you, Vercel&apos;s visit logs and
          Sentry&apos;s reports. We have not confirmed how long each is kept.
        </li>
        <li>
          <strong>Your handle,</strong> which is free for someone else right
          away.
        </li>
      </LegalUL>
      <LegalP>
        <strong>If we suspend or ban your account.</strong> You can still sign
        in, read the notice and the legal pages, sign out and delete your
        account. Everyone else stops seeing your profile, posts and comments,
        but messages you already sent stay visible in chats. The notice gives
        the kind, the end date of a suspension and the reason, not the private
        note. To appeal, email <Mail box="help" />. A ban cancels Vibe+ with no
        refund.
      </LegalP>
      <LegalP>
        <strong>
          If you decline a new version of the{" "}
          <PageLink href="/legal/terms">Terms</PageLink>,
        </strong>{" "}
        you cannot post, comment, message or change your profile.{" "}
        <PageLink href="/settings">Settings</PageLink> stays open, so you can
        still delete your account.
      </LegalP>

      <SectionH2 n={10} />
      <LegalP>
        <strong>What we do.</strong> All traffic uses an encrypted connection
        (HTTPS). Résumés, chat media and group pictures are served through
        links that expire. No other user can read your email addresses (apart
        from the starter name in <Sec to="3a">section 3a</Sec>), your proof of
        agreement or your moderation records.
      </LegalP>
      <LegalP>
        <strong>What we do not have.</strong> Sign-in is by email and password,
        with no second sign-in step such as a code on your phone. Messages are
        not end-to-end encrypted (<Sec to="5h">section 5h</Sec>).
      </LegalP>
      <LegalP>
        <strong>If we learn of a breach</strong> that exposes your personal
        information, we will email the people affected and say what happened,
        what information was involved and what we are doing about it, as fast
        as we reasonably can and within the time Indiana law requires.
      </LegalP>
    </>
  );
}
