import Link from "next/link";

import {
  LegalH2,
  LegalLayout,
  LegalP,
  LegalUL,
} from "@/components/legal/LegalLayout";

// Google Play's account-deletion URL (Data safety asks for a public page where
// someone can ask for deletion without the app), and the page /support links
// to. Under /legal/ on purpose: the proxy's restrictedPageAllowed lets /legal/*
// through, so a suspended or banned student can read it too.
//
// Every claim here was checked against the code on 2026-09-24. Keep it true
// when these change:
//   - the flow: DELETE /api/me (src/app/api/me/route.ts): Stripe customer
//     deleted first and fail closed, then purgeUserUploads, then
//     auth.admin.deleteUser, whose cascade removes every users-keyed row;
//   - the steps: SettingsClient.tsx DangerZone ("Delete account…", type the
//     handle, "Permanently delete"), and "Delete account" on the Verify your
//     campus screen and on the suspension notice (suspended-actions.tsx);
//   - what survives: reports.target_owner_id + target_snapshot and
//     reports.reporter_id ON DELETE SET NULL; account_restrictions keyed on
//     identity_key (src/lib/moderation/identity.ts); moderation_actions and
//     billing_events carry no FK, and moderation_actions is append-only, with
//     meta.handle on user_suspend, user_ban and user_lift (the admin restrict
//     and lift routes); email_sends keeps recipient_domain and
//     provider_message_id and drops recipient_hash (trigger
//     email_sends_forget_recipient), while Resend keeps the address under that
//     message id; orgs.owner_id is ON DELETE SET NULL;
//     auth.audit_log_entries has no FK to auth.users, so
//     deleteUser leaves its rows, which carry the email address (traits,
//     actor_username) and, on hosted Supabase, the IP address.
// TODO(Franky): no backup-retention number until you confirm the Supabase
// plan's backup window (and whether PITR is on). The same goes for how long
// Vercel, Sentry and Resend keep their logs. Page text stays number-free.
// TODO(Franky): in the Supabase dashboard (Auth settings), check whether
// production writes auth audit logs to the database and how long they are
// kept. If it does, either purge a deleted user's rows (DELETE /api/me) or turn
// the database copy off; until then the security-log bullet below must stay and
// the page must not say the email address is gone.
// TODO(Franky): an emailed request has no admin tool yet; today a founder
// would have to run the same Stripe → files → auth-user sequence by hand.
export const metadata = {
  title: "Delete Your Account · Vibe",
  description:
    "How to delete your Vibe account, in the app or by email, what is deleted, and what is kept.",
};

const ACCENT_LINK = {
  color: "#FF5C35",
  fontWeight: 700,
  textDecoration: "none",
} as const;

const HELP_EMAIL = "help@connectvibe.app";

function HelpEmail() {
  return (
    <a href={`mailto:${HELP_EMAIL}`} style={ACCENT_LINK}>
      {HELP_EMAIL}
    </a>
  );
}

export default function DeleteAccountPage() {
  return (
    <LegalLayout
      eyebrow="Your data"
      title="Delete your account"
      effectiveDate="September 24, 2026"
    >
      <LegalP>
        This page is for <strong>Vibe</strong>, the campus app run by{" "}
        <strong>CONNECTVIBE. LLC</strong>. You can delete your Vibe account
        yourself, inside the app, at any time, including while your account is
        suspended. Deleting is permanent: it happens the moment you confirm,
        there is no waiting period, and we can&apos;t bring the account back.
      </LegalP>

      <LegalH2>Delete it in the app</LegalH2>
      <ol style={{ margin: "0 0 12px", paddingLeft: 22 }}>
        <li>
          Open <strong>Settings</strong>. On a phone, go to your profile and tap
          the gear. On a computer, choose <strong>Settings</strong> in the menu
          on the left.
        </li>
        <li>
          Scroll to <strong>Delete your account</strong> and choose{" "}
          <strong>Delete account…</strong>
        </li>
        <li>Type your handle to confirm, without the @.</li>
        <li>
          Choose <strong>Permanently delete</strong>. You&apos;re signed out and
          the account is gone.
        </li>
      </ol>
      <LegalP>
        Haven&apos;t verified a school email yet? The{" "}
        <strong>Verify your campus</strong> screen has its own{" "}
        <strong>Delete account</strong> button. If your account is suspended or
        banned, the notice you see when you open Vibe has one too.
      </LegalP>

      <LegalH2>Or ask us by email</LegalH2>
      <LegalP>
        If you can&apos;t get into the app, email <HelpEmail /> from the address
        you sign in with and ask us to delete your account. We&apos;ll check
        that the request comes from the account&apos;s owner, delete it the
        same way the button does, and write back when it&apos;s done. If you
        can still sign in, the button is faster: it works instantly.
      </LegalP>

      <LegalH2>What is deleted</LegalH2>
      <LegalP>All of this goes the moment you confirm:</LegalP>
      <LegalUL>
        <li>
          <strong>Your profile:</strong> name, handle, photo and banner, school
          and campus, year, major, bio, links, work history, skills, résumé, and
          your answers to Otto&apos;s questions.
        </li>
        <li>
          <strong>What you posted:</strong> posts, photos, videos, comments,
          reposts, and the events you created.
        </li>
        <li>
          <strong>Your messages:</strong> every message you sent in direct
          messages, group chats and club chats, including the copy the other
          people in that chat see, plus your reactions and the photos and videos
          you sent.
        </li>
        <li>
          <strong>Your activity:</strong> likes, saves, follows and followers,
          club memberships and roles, RSVPs and calendar entries, blocks and
          mutes, notifications, and the record of which profiles and posts you
          viewed.
        </li>
        <li>
          <strong>Your sign-in:</strong> your password, the sign-in and school
          email saved on your account, and the record of when you accepted the
          Terms. Our sign-in provider&apos;s security log still keeps the
          address you used (see below).
        </li>
        <li>
          <strong>Your files:</strong> every photo, video and document you
          uploaded is erased from storage, not just hidden.
        </li>
      </LegalUL>
      <LegalP>
        A club you started stays up for its other members; your posts, uploads
        and role in it are removed. If you pay for Vibe+, the subscription is
        canceled before anything else is removed. If we can&apos;t confirm it
        was canceled, nothing is deleted and you&apos;re asked to try again, so
        a deleted account can never go on being charged.
      </LegalP>

      <LegalH2>What we keep, and why</LegalH2>
      <LegalP>
        A few safety and payment records outlive the account, so that deleting
        an account can&apos;t erase what happened on it:
      </LegalP>
      <LegalUL>
        <li>
          <strong>Reports about you or your content.</strong> The report stays,
          with the copy we took when it was filed: the reported words, and your
          name and handle as they were then. It points at your old account by
          an internal ID that no longer leads anywhere.
        </li>
        <li>
          <strong>Reports you filed.</strong> They stay, with your name taken
          off.
        </li>
        <li>
          <strong>Our moderation log.</strong> If a moderator acted on your
          account or content, the record of what was done and why stays, with
          that same internal ID and, for a suspension or ban (or lifting one),
          your handle as it was then.
        </li>
        <li>
          <strong>Suspensions and bans.</strong> If your account was suspended
          or banned, that record stays (the reason, the dates and the
          moderator&apos;s note), filed under a scrambled code made from your
          school email and sign-in email. The code can&apos;t be turned back
          into an address. For a ban, it&apos;s what stops that school email
          from being verified on a new account.
        </li>
        <li>
          <strong>Payments.</strong> If you ever paid for Vibe+, Stripe, our
          payment processor, keeps its own records of your payments. Our
          billing log keeps the payment events Stripe sent us, by internal ID
          only, because a refund or a dispute can arrive after an account is
          gone.
        </li>
        <li>
          <strong>Our email log.</strong> For the verification and
          password-reset emails we sent you, we keep the email&apos;s domain
          (like iu.edu), whether sending worked, and our email sender&apos;s ID
          for that message. The address, and the scrambled copy we used to look
          it up, are erased from it.
        </li>
        <li>
          <strong>Our sign-in provider&apos;s security log.</strong> A record
          of sign-ups, sign-ins and password-reset requests, with the email
          address used and the IP address the request came from. It isn&apos;t
          tied to your account, so deleting the account doesn&apos;t reach it.
        </li>
      </LegalUL>
      <LegalP>
        Deleted data can also sit in our hosting provider&apos;s routine
        backups, and in our service providers&apos; logs (such as our email
        sender&apos;s delivery log and our error reports), until those expire.
        The{" "}
        <Link href="/legal/privacy" style={ACCENT_LINK}>
          Privacy Policy
        </Link>{" "}
        covers the rest of what we collect and why.
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
