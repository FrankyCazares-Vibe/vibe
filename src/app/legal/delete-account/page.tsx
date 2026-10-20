import Link from "next/link";
import type { ReactNode } from "react";

import {
  LegalH2,
  LegalLayout,
  LegalOL,
  LegalP,
  LegalUL,
} from "@/components/legal/LegalLayout";

// Google Play's account-deletion URL (Data safety asks for a public page where
// someone can ask for deletion without the app), and the page /support links
// to. Under /legal/ on purpose: the proxy's restrictedPageAllowed lets /legal/*
// through, so a suspended or banned student can read it too.
//
// The wording follows the Privacy Policy published on October 5, 2026
// (src/app/legal/privacy), sections 8 and 9, line for line. The policy uses
// two words with care, and so does this page: "deleted" means gone from our
// systems, "removed" means hidden by the Vibe team or a club and still stored.
// Change the two pages together. What each part rests on:
//   - the flow: DELETE /api/me (src/app/api/me/route.ts): Vibe+ closed first
//     (Stripe customer deleted, no refund, fail closed), then purgeUserUploads,
//     then auth.admin.deleteUser, whose cascade deletes every users-keyed row.
//     A failure in the first two keeps the account; a failure in the third
//     leaves the files already deleted and a retry finishes;
//   - the files: purgeUserUploads sweeps the account's own folders. It keeps
//     every `quarantine/<uid>/**` file (the evidence files) and misses the
//     kinds the policy lists in section 8: a deleted message's file, group
//     chat photos and the files of posts made as a club. So no "every file"
//     and no "erased from storage" here;
//   - the steps: SettingsClient.tsx DangerZone ("Delete account…", type the
//     handle, "Permanently delete"), and "Delete account" on the Verify your
//     campus screen and on the suspension notice (suspended-actions.tsx);
//   - what stays: reports.target_owner_id + target_snapshot and
//     reports.reporter_id ON DELETE SET NULL; account_restrictions keyed on
//     identity_key (src/lib/moderation/identity.ts); moderation_actions and
//     billing_events carry no FK; email_sends keeps recipient_domain and
//     provider_message_id and drops recipient_hash (it never had an address
//     column); orgs.owner_id is ON DELETE SET NULL; the signup_allowlist
//     row is deleted by DELETE /api/me; auth.audit_log_entries has no FK to auth.users.
// One number of days only: the abuse counts (rate_limits) are deleted within
// three days, by rate_limits_purge from both daily crons; policy 3d says the
// same. Nothing else gets one: the evidence and report records have no end
// date until the lawyer sets one, there are no database backups, and nobody
// has confirmed how long Vercel, Sentry and Resend keep their logs.
// Still open, and each one would let a line leave this page (rows of
// page-and-code-changes.md): 51 the sign-in log bullet, 52 the allow-list
// bullet, 57 a tool for the emailed request (done by hand today, files first).
export const metadata = {
  title: "Delete Your Account · Vibe",
  description:
    "How to delete your Vibe account, in the app or by email, what is deleted, and what is kept.",
};

const ACCENT_LINK = {
  color: "var(--tag-ink)",
  fontWeight: 700,
  textDecoration: "none",
} as const;

const HELP_EMAIL = "help@connectvibe.app";
const HELLO_EMAIL = "hello@connectvibe.app";

function Email({ to }: { to: string }) {
  return (
    <a href={`mailto:${to}`} style={ACCENT_LINK}>
      {to}
    </a>
  );
}

function HelpEmail() {
  return <Email to={HELP_EMAIL} />;
}

/** A link into the Privacy Policy. `to` is one of its anchors: "section-8",
 *  "section-9", or "waitlist" for section 11. */
function PolicyLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link href={`/legal/privacy#${to}`} style={ACCENT_LINK}>
      {children}
    </Link>
  );
}

export default function DeleteAccountPage() {
  return (
    <LegalLayout
      eyebrow="Your data"
      title="Delete your account"
      effectiveDate="October 5, 2026"
    >
      <LegalP>
        This page is for <strong>Vibe</strong>, the campus app run by{" "}
        <strong>CONNECTVIBE. LLC</strong>. You can delete your Vibe account
        yourself, in the app, at any time. That includes while your account is
        suspended or banned. Deleting is permanent. The account is deleted
        right away when you confirm. There is no waiting period and no undo,
        and we cannot bring the account back.
      </LegalP>

      <LegalH2>Delete it in the app</LegalH2>
      <LegalOL>
        <li>
          Open <strong>Settings</strong>. On a phone, go to your profile and tap
          the gear. On a computer, choose <strong>Settings</strong> in the menu
          on the left.
        </li>
        <li>
          Scroll to <strong>Delete your account</strong>, under Danger zone,
          and choose <strong>Delete account…</strong>
        </li>
        <li>Type your handle to confirm, without the @.</li>
        <li>
          Choose <strong>Permanently delete</strong>. You are signed out and
          the account is deleted.
        </li>
      </LegalOL>
      <LegalP>
        Not verified a school email yet? The{" "}
        <strong>Verify your campus</strong> screen has its own{" "}
        <strong>Delete account</strong> button. If your account is suspended or
        banned, the notice you see when you open Vibe has one too.
      </LegalP>

      <LegalH2>Or ask us by email</LegalH2>
      <LegalP>
        If you cannot sign in, write to <HelpEmail /> and ask us to delete your
        account. That covers an account that never confirmed its email or
        never finished setting up. Write from the address you sign in with if
        you can, so we can find the account.
      </LegalP>
      <LegalP>
        We reply to your sign-in email, and we delete the account only after
        you answer that reply. If you can no longer read mail at that address,
        we ask for other proof that the account is yours. The cofounder with
        direct access to our systems then deletes the account by hand: its
        files first, then its records. We write back when it is done.
      </LegalP>
      <LegalP>
        If you can still sign in, use the button. It works right away.
      </LegalP>

      <LegalH2>Delete one thing, not the whole account</LegalH2>
      <LegalP>
        You do not have to delete your account to delete one thing. To delete a
        post, open its menu and choose <strong>Delete post</strong>. You can
        delete a message you sent from the message itself. Both are deleted
        right away, for everyone. You cannot delete a post the Vibe team
        removed. To take a résumé file off your profile, or to replace your
        profile photo or cover, edit your profile.
      </LegalP>
      <LegalP>
        A comment has no delete button yet. Your messages in a chat or club you
        have left are out of your reach too. To have either deleted, write to{" "}
        <HelpEmail /> from your sign-in email. We reply to that address, and
        once you answer that reply we aim to delete the comment or the messages
        by hand.
      </LegalP>
      <LegalP>
        Some files stay in our storage after the post, message or photo they
        belonged to is deleted. The{" "}
        <PolicyLink to="section-8">Privacy Policy, section 8</PolicyLink>, says
        which.
      </LegalP>

      <LegalH2>Only on the waitlist?</LegalH2>
      <LegalP>
        Joining the waitlist does not make an account, so the steps above are
        not for you. Open our newest waitlist email and use the{" "}
        <strong>Take me off the list</strong> link. Tap{" "}
        <strong>Yes, take me off</strong>, and your entry is deleted right
        away. If the link does not work, or you have no email from us, write
        to <Email to={HELLO_EMAIL} /> from the address you joined with. We
        reply to that address, and take you off by hand once you answer that
        reply. The{" "}
        <PolicyLink to="waitlist">Privacy Policy, section 11</PolicyLink>, says
        how long an entry is kept and what stays after it.
      </LegalP>

      <LegalH2>What is deleted</LegalH2>
      <LegalP>All of this is deleted right away when you confirm:</LegalP>
      <LegalUL bullets>
        <li>
          <strong>Your profile:</strong> name, handle, photo and cover, school
          and campus, year, major, bio, links, experience, skills, résumé, and
          your answers to Otto&apos;s set-up questions.
        </li>
        <li>
          <strong>What you posted:</strong> posts, comments, reposts and the
          events you created, including the posts and events you made as a
          club. Other people&apos;s comments, likes and reposts on your posts
          go with the posts. Each event takes everyone&apos;s RSVPs,
          check-ins and its whole chat with it.
        </li>
        <li>
          <strong>Your messages:</strong> every message you sent in direct
          chats, group chats and club rooms, including the copy the other
          people in that chat see, plus your reactions. Any pins on those
          messages, the replies under your Board posts and the votes on polls
          you posted go with them.
        </li>
        <li>
          <strong>Your activity:</strong> likes, saves, poll votes, follows and
          followers, club memberships and roles, join requests and invites,
          RSVPs, event check-ins and personal calendar entries, blocks and
          mutes,
          notifications, and the records of what you viewed and of who viewed
          you.
        </li>
        <li>
          <strong>Your sign-in:</strong> both email addresses saved on your
          account (sign-in and school), the scrambled version of your
          password, and the record of when you agreed to the Terms and the
          Privacy Policy. One log is not tied to the account, so deleting does
          not reach it. It can still hold your email address (see &quot;The
          sign-in log&quot; below).
        </li>
        <li>
          <strong>Your waitlist entry,</strong> if you have one, your address
          on the list of addresses that can sign up without an access code, if
          it is there, and the record of which club link let you in, if one
          did.
        </li>
        <li>
          <strong>Your files:</strong> the photos, videos and documents in your
          own folders are deleted, except files kept because of a report or a
          moderator&apos;s decision (see below). A few other kinds of files
          stay. The{" "}
          <PolicyLink to="section-8">Privacy Policy, section 8</PolicyLink>,
          lists them.
        </li>
      </LegalUL>
      <LegalP>
        A club you owned stays, with no owner. Your posts and your role in it
        are deleted. The photos and videos of posts you made as the club stay
        until the club is deleted (Privacy Policy, section 8).
      </LegalP>
      <LegalP>
        If you have Vibe+, it is cancelled first, with no refund, before
        anything else is deleted. If that step or the file step fails, the
        account is not deleted and you can try again. If the last step fails,
        your files are already deleted, and trying again finishes the job.
      </LegalP>
      <LegalP>
        Your handle is not held for you. Someone else can take it right away.
      </LegalP>

      <LegalH2>What we keep, and why</LegalH2>
      <LegalP>
        Some records stay after the account is deleted. Most are safety
        records, kept so that deleting an account cannot erase what happened
        on it. A few are things deleting does not reach yet.
      </LegalP>
      <LegalUL bullets>
        <li>
          <strong>Reports about you or your content.</strong> The report stays,
          with the copy we took when it was filed: its text, links to its
          photos and videos, and your name and handle as they were then. It
          keeps your old account ID, which no longer leads to an account.
        </li>
        <li>
          <strong>Reports you filed.</strong> They stay, with your name taken
          off.
        </li>
        <li>
          <strong>The moderation log.</strong> This is our record of what
          moderators did. If the Vibe team acted on your account or content,
          the record of what was done and why stays. It holds your old account
          ID, your handle at the time and, for a photo that was removed, the
          old photo&apos;s address.
        </li>
        <li>
          <strong>Evidence files.</strong> These are photos and videos we keep
          because of a report or a moderator&apos;s decision:
          <LegalUL bullets>
            <li>
              the photos and videos of a post, if the Vibe team removed it or
              if a report on it is open or was acted on;
            </li>
            <li>a photo, cover or logo the Vibe team removed;</li>
            <li>
              your profile photo and cover, if a report about you was open.
            </li>
          </LegalUL>
          <LegalP>
            A photo already kept as evidence stays, even if the report was
            dismissed. An evidence file is kept privately, where only the Vibe
            team can open it, with no end date set yet (
            <PolicyLink to="section-9">Privacy Policy, section 9</PolicyLink>
            ). Deleting your account does not delete it.
          </LegalP>
        </li>
        <li>
          <strong>Suspension and ban records.</strong> If your account was
          suspended or banned, we keep which it was, its dates, the reason and
          the team&apos;s private note. We also keep up to two scrambled
          codes: one made from your school email and one from your sign-in
          email. A code cannot be turned back into an address. Our servers
          can still test whether a given address matches it. The code from
          your school email stops that address being verified on another
          account while the suspension or ban lasts.
        </li>
        <li>
          <strong>Files that deleting your account misses.</strong> The photo
          or video on a message you had already deleted, group chat photos,
          and the photos and videos of posts you made as a club. The{" "}
          <PolicyLink to="section-8">Privacy Policy, section 8</PolicyLink>,
          has the full list.
        </li>
        <li>
          <strong>Messages you pinned.</strong> A message someone else wrote
          stays pinned. The record of who pinned it is emptied.
        </li>
        <li>
          <strong>Club records.</strong> Records of things you did as a club
          owner or officer stay, with your name taken off.
        </li>
        <li>
          <strong>Our email log.</strong> For each email our software sent
          you, the log keeps its kind, the part of your address after the @
          (like iu.edu), the time, whether it worked, and the reference number
          our email service (Resend) gave the message. The log never held your
          address, only a scrambled code made from it. That code is erased,
          and so is your account ID.
        </li>
        <li>
          <strong>The sign-in log.</strong> The sign-in system&apos;s log of
          sign-in activity sits in our database at Supabase, the company that
          runs our sign-in. It can hold your email address and IP address (the
          number that identifies your internet connection). It is not tied to
          your account, and nothing in Vibe clears it today.
        </li>
        <li>
          <strong>Abuse counts.</strong> We count how often some actions
          happen. Many counts hold your account ID. A few hold a scrambled
          code made from an email address or from a network (an IP address or
          part of one), not the address itself. We delete each count within
          three days.
        </li>
        <li>
          <strong>Payments, once billing is on.</strong> Vibe+ is not on sale
          yet. Once it is, our list of payment events stays, because a refund
          or a dispute can arrive after an account is deleted.
        </li>
        <li>
          <strong>Anything a court order or the law makes us keep.</strong> If
          we get a valid order to keep an account&apos;s records before you
          delete it, we copy and keep them.
        </li>
      </LegalUL>

      <LegalP>Some information also stays with other companies:</LegalP>
      <LegalUL bullets>
        <li>
          The record our email service (Resend) holds of emails sent to you,
          the visit logs of our hosting company (Vercel), and the reports held
          by Sentry, the service we use to find bugs. We have not confirmed how
          long each is kept.
        </li>
        <li>
          Emails you sent us. They stay in the Gmail inbox that receives our
          mail until they are deleted there.
        </li>
        <li>
          The payment records of Stripe, our payment company, once billing is
          on.
        </li>
      </LegalUL>
      <LegalP>
        We keep no database backups. Deleted information can still sit in our
        providers&apos; logs until those expire.
      </LegalP>
      <LegalP>
        <strong>No end date yet.</strong> Reports, the moderation log,
        suspension and ban records and evidence files have no end date today.
        We will set one with our lawyer and write it in the Privacy Policy and
        on this page. Until then you can ask <HelpEmail /> to delete a report
        copy or an evidence file that is about you or that shows you. You do
        not need an account to ask. We will, unless safety, the law or an open
        case needs it.
      </LegalP>
      <LegalP>
        The{" "}
        <Link href="/legal/privacy" style={ACCENT_LINK}>
          Privacy Policy
        </Link>{" "}
        covers the rest of what we collect and why.{" "}
        <PolicyLink to="section-8">Section 8</PolicyLink> says how long things
        are kept, and <PolicyLink to="section-9">section 9</PolicyLink> says
        what deleting does.
      </LegalP>

      <LegalH2>Questions</LegalH2>
      <LegalP>
        Anything about deleting your account or your data: <HelpEmail />. For
        everything else, see{" "}
        <Link href="/support" style={ACCENT_LINK}>
          Support
        </Link>
        .
      </LegalP>
    </LegalLayout>
  );
}
