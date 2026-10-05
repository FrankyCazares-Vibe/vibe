import Link from "next/link";

import {
  LegalH2,
  LegalLayout,
  LegalP,
  LegalUL,
} from "@/components/legal/LegalLayout";

// Apple's Support URL for the App Store listing (App Store Connect requires
// one), and the page a student lands on when they need a person. Public on
// purpose: the proxy has no sign-in gate for it. A suspended or banned
// student is still sent to /account/suspended from here, because the proxy's
// restrictedPageAllowed only lets /legal/* through; that notice prints the
// same help@ address and offers Sign out and Delete (critic-s1 item 15).
//
// help@ is the one address on this page. The legal footer's Contact still
// says hello@, which is LegalLayout's to change, not this page's.
//
// LAWYER MUST CONFIRM before launch: the intimate-image section below is our
// reading of the TAKE IT DOWN Act (security report 2026-09-27, finding #4). It
// is the short copy of /legal/community#intimate-images: change both together.
export const metadata = {
  title: "Support · Vibe",
  description:
    "How to reach the Vibe team, report or block someone, and delete your account.",
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

export default function SupportPage() {
  return (
    <LegalLayout eyebrow="Help" title="Support" effectiveDate="October 5, 2026">
      <LegalP>
        Vibe is run by <strong>CONNECTVIBE. LLC</strong>, an Indiana limited
        liability company. The fastest way to reach a person is email:{" "}
        <HelpEmail />. If it&apos;s about your account, write from the address
        you sign in with, so we can find it.
      </LegalP>

      <LegalH2>Something wrong on Vibe right now</LegalH2>
      <LegalP>
        Report it in the app. Open the <strong>⋯</strong> menu on the post,
        comment, message, chat or profile and choose <strong>Report</strong>.
        On a club page it&apos;s at the bottom of the About panel. Reports are
        private: the person you report is never told who reported them.
      </LegalP>
      <LegalP>
        <strong>
          We aim to review reports within 24 hours; reports of child
          exploitation or self-harm go first.
        </strong>{" "}
        You can also email <HelpEmail /> if you can&apos;t report in the app,
        or if the account is already gone.
      </LegalP>
      <LegalP>
        Our{" "}
        <Link href="/legal/child-safety" style={ACCENT_LINK}>
          Child Safety Standards
        </Link>{" "}
        say how to report child sexual abuse or exploitation. If someone is in
        immediate danger, call 911 or campus police first.
      </LegalP>

      <LegalH2>An intimate image shared without consent</LegalH2>
      <LegalP>
        If a nude or sexual photo or video of you is on Vibe and you
        didn&apos;t agree to it being shared, including one that&apos;s edited
        or fake, ask us to take it down.{" "}
        <strong>We remove it within 48 hours of a valid request.</strong> You
        don&apos;t need a Vibe account to ask.
      </LegalP>
      <LegalP>
        That covers more than posts and messages: our moderators can also take
        down a profile photo or cover, the small logos on a profile, a
        club&apos;s logo or banner, and a group chat&apos;s photo.
      </LegalP>
      <LegalUL>
        <li>
          <strong>In the app:</strong> <strong>⋯</strong> →{" "}
          <strong>Report</strong> → <strong>An intimate image shared without
          consent</strong>. If that choice isn&apos;t there, pick{" "}
          <strong>Sexual content</strong> and say so in the box.
        </li>
        <li>
          <strong>By email, no account needed:</strong>{" "}
          <a
            href={`mailto:${HELP_EMAIL}?subject=Intimate%20image%20removal`}
            style={ACCENT_LINK}
          >
            {HELP_EMAIL}
          </a>
          , subject &ldquo;Intimate image removal.&rdquo;
        </li>
      </LegalUL>
      <LegalP>
        A valid request includes your signature (on paper or electronic; typing
        your full name counts), where the image is on Vibe (a link, the
        poster&apos;s handle or a description), a statement that you believe in
        good faith it was shared without the consent of the person in it, and
        how to reach you. Please don&apos;t send the image itself. The full
        process, including asking for someone else, is in the{" "}
        <Link href="/legal/community#intimate-images" style={ACCENT_LINK}>
          Community Guidelines
        </Link>
        .
      </LegalP>

      <LegalH2>Block or mute someone</LegalH2>
      <LegalUL>
        <li>
          On their profile, open <strong>⋯</strong> and choose{" "}
          <strong>Block</strong> or <strong>Mute</strong>.
        </li>
        <li>
          On a phone, a post&apos;s <strong>⋯</strong> menu also has{" "}
          <strong>Block author</strong>.
        </li>
        <li>After you report someone, the report sheet offers to block them too.</li>
      </LegalUL>
      <LegalP>
        Someone you block can&apos;t message you or find you in search, and
        while they are signed in they can&apos;t see your posts. You stop
        seeing theirs. They aren&apos;t told, but if they open your profile
        while signed in, Vibe says this account has restricted them. To undo
        it, go to <strong>Settings → Blocked users</strong>.
      </LegalP>

      <LegalH2>Trouble signing in</LegalH2>
      <LegalP>
        On the log-in screen, tap <strong>Forgot?</strong> next to the password
        box and we&apos;ll email you a link to set a new one. Vibe also needs a
        school email to verify your campus. If yours won&apos;t verify, or
        you&apos;re still stuck, email <HelpEmail /> from the address you
        signed up with.
      </LegalP>

      <LegalH2>Delete your account</LegalH2>
      <LegalP>
        You can delete your account yourself, from inside the app, at any
        time: <strong>Settings → Delete account…</strong>. It&apos;s permanent.
        The{" "}
        <Link href="/legal/delete-account" style={ACCENT_LINK}>
          delete-your-account page
        </Link>{" "}
        has the exact steps, how to ask us by email instead, and what is
        deleted and what we keep.
      </LegalP>

      <LegalH2>Rules and policies</LegalH2>
      <LegalUL>
        <li>
          <Link href="/legal/community" style={ACCENT_LINK}>
            Community Guidelines
          </Link>{" "}
          — what belongs on Vibe and what happens after a report.
        </li>
        <li>
          <Link href="/legal/child-safety" style={ACCENT_LINK}>
            Child Safety Standards
          </Link>{" "}
          — our zero-tolerance standard and how to report it.
        </li>
        <li>
          <Link href="/legal/terms" style={ACCENT_LINK}>
            Terms of Service
          </Link>{" "}
          — the agreement you accept when you sign up.
        </li>
        <li>
          <Link href="/legal/privacy" style={ACCENT_LINK}>
            Privacy Policy
          </Link>{" "}
          — what we collect and what you can do about it.
        </li>
      </LegalUL>

      <LegalH2>Contact</LegalH2>
      <LegalP>
        CONNECTVIBE. LLC, Indiana · <HelpEmail />. A person on the Vibe team
        reads every email.
      </LegalP>
    </LegalLayout>
  );
}
