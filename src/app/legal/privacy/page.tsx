import Link from "next/link";

import {
  LegalH2,
  LegalLayout,
  LegalP,
  LegalUL,
} from "@/components/legal/LegalLayout";

export const metadata = {
  title: "Privacy Policy · Vibe",
  description: "What we collect, how we use it, and your rights.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout
      eyebrow="Legal"
      title="Privacy Policy"
      effectiveDate="May 7, 2026"
    >
      <LegalP>
        This Privacy Policy explains what information Vibe collects, how we
        use it, and the choices you have. By using Vibe, you agree to the
        practices described here.
      </LegalP>
      <LegalP>
        <em>
          This is a baseline draft for our early college rollout. Review with
          qualified legal counsel before broad public launch.
        </em>
      </LegalP>

      <LegalH2>1. Information we collect</LegalH2>
      <LegalP>
        <strong>Account info you give us.</strong> Name, handle, sign-in email,
        school, school-verified &ldquo;.edu&rdquo; email, year, major,
        department, profile bio, links, headline, location, banner gradient or
        photo, avatar, work history, skills, interests, and similar profile
        fields you choose to add.
      </LegalP>
      <LegalP>
        <strong>Content you create.</strong> Posts, clips, comments, replies,
        reactions, reposts, RSVPs, calendar events, direct messages and
        channel messages, attachments and media you upload, and the metadata
        attached to those (timestamps, edits, view counts).
      </LegalP>
      <LegalP>
        <strong>Connections.</strong> Who you follow, who follows you, mutuals,
        organizations you belong to, and the org-level events you attend.
      </LegalP>
      <LegalP>
        <strong>Usage and device data.</strong> Pages you visit on Vibe,
        actions you take, IP address (used for abuse prevention and
        rate-limiting), browser, OS, and approximate location derived from IP.
      </LegalP>
      <LegalP>
        <strong>Cookies.</strong> We use a small number of strictly necessary
        cookies for sign-in sessions and CSRF protection. We do not run
        third-party advertising trackers.
      </LegalP>

      <LegalH2>2. How we use it</LegalH2>
      <LegalUL>
        <li>To run the Service: authenticate you, render your profile, deliver your messages, fan out notifications, and show you content from people you follow.</li>
        <li>To improve the Service: aggregate usage analytics that help us understand which features people use.</li>
        <li>To keep people safe: investigate and respond to reports of harassment, spam, or other abuse, and enforce our Terms.</li>
        <li>To communicate with you: account-related emails (verification, password reset, security notices). We will not send marketing email without your consent.</li>
      </LegalUL>

      <LegalH2>3. Who we share it with</LegalH2>
      <LegalP>
        We <strong>do not sell</strong> your personal information. We share it
        only as needed:
      </LegalP>
      <LegalUL>
        <li>
          <strong>Other Vibe users</strong> see your public profile, posts,
          comments, reactions, RSVPs, and the messages you send them or
          channels you participate in.
        </li>
        <li>
          <strong>Service providers</strong> who help us run Vibe: Supabase
          (database, auth, storage), Vercel (hosting and serverless functions),
          and Cloudflare R2 (media storage). They process data on our
          instructions under their own security commitments.
        </li>
        <li>
          <strong>Legal and safety</strong> requests: we may disclose
          information when we reasonably believe it&apos;s needed to comply
          with the law, enforce our Terms, or protect users from imminent
          harm.
        </li>
      </LegalUL>

      <LegalH2>4. Your choices and rights</LegalH2>
      <LegalUL>
        <li>
          <strong>Access and correction.</strong> View and edit your profile
          on{" "}
          <Link
            href="/profile"
            style={{ color: "#FF5C35", fontWeight: 700, textDecoration: "none" }}
          >
            your profile page
          </Link>
          .
        </li>
        <li>
          <strong>Delete your account.</strong> From{" "}
          <Link
            href="/settings"
            style={{ color: "#FF5C35", fontWeight: 700, textDecoration: "none" }}
          >
            Settings → Danger zone
          </Link>
          . Deletion permanently removes your profile, posts, comments,
          reactions, connections, RSVPs, messages, and chat reactions.
        </li>
        <li>
          <strong>Export.</strong> Email{" "}
          <a
            href="mailto:hello@vibe-app.vercel.app"
            style={{ color: "#FF5C35", fontWeight: 700, textDecoration: "none" }}
          >
            hello@vibe-app.vercel.app
          </a>{" "}
          and we&apos;ll send you a copy of the personal data we hold on you.
        </li>
        <li>
          <strong>Block and report.</strong> Block users from their profile;
          report content from the post or comment menu.
        </li>
      </LegalUL>

      <LegalH2>5. Data retention</LegalH2>
      <LegalP>
        We keep your account data for as long as your account is active. When
        you delete your account, we remove your data from our live systems
        immediately. Encrypted backups may retain copies for up to 30 days,
        after which they are overwritten in the normal course of operations.
      </LegalP>
      <LegalP>
        We may retain limited information longer when required to comply with
        legal obligations, resolve disputes, or enforce our Terms (for
        example, retaining a record of a banned account&apos;s identifier so
        the same actor can&apos;t simply re-register).
      </LegalP>

      <LegalH2>6. Security</LegalH2>
      <LegalP>
        We use industry-standard practices to protect your data: TLS in
        transit, encryption at rest with our cloud providers, role-based
        access for our team, and Supabase row-level security to enforce who
        can read what. No system is perfectly secure — please use a strong,
        unique password and turn on multi-factor authentication if your
        account email supports it.
      </LegalP>

      <LegalH2>7. Children</LegalH2>
      <LegalP>
        Vibe is for users 18 and older who are affiliated with a U.S.
        college. We do not knowingly collect information from anyone under
        13. If you believe a minor has signed up, contact us and we will
        promptly remove the account.
      </LegalP>

      <LegalH2>8. Changes</LegalH2>
      <LegalP>
        If we make material changes to this Policy, we&apos;ll give you
        reasonable notice (in-app or by email) before they take effect.
      </LegalP>

      <LegalH2>9. Contact</LegalH2>
      <LegalP>
        Questions about your privacy? Email us at{" "}
        <a
          href="mailto:hello@vibe-app.vercel.app"
          style={{ color: "#FF5C35", fontWeight: 700, textDecoration: "none" }}
        >
          hello@vibe-app.vercel.app
        </a>
        .
      </LegalP>
    </LegalLayout>
  );
}
