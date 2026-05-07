import Link from "next/link";

import {
  LegalH2,
  LegalLayout,
  LegalP,
  LegalUL,
} from "@/components/legal/LegalLayout";

export const metadata = {
  title: "Terms of Service · Vibe",
  description: "The rules for using Vibe.",
};

export default function TermsPage() {
  return (
    <LegalLayout
      eyebrow="Legal"
      title="Terms of Service"
      effectiveDate="May 7, 2026"
    >
      <LegalP>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of Vibe
        (the &ldquo;Service&rdquo;), operated by the Vibe team
        (&ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our&rdquo;). By creating an
        account or using the Service, you agree to these Terms. If you
        don&apos;t agree, don&apos;t use Vibe.
      </LegalP>
      <LegalP>
        <em>
          This is a baseline draft intended for our early college rollout.
          Review with qualified legal counsel before broad public launch or
          before relying on it in any dispute.
        </em>
      </LegalP>

      <LegalH2>1. Eligibility</LegalH2>
      <LegalP>To use Vibe, you must:</LegalP>
      <LegalUL>
        <li>Be at least 18 years old;</li>
        <li>Be currently enrolled at, or affiliated with, a U.S.-accredited college or university;</li>
        <li>Have a working &ldquo;.edu&rdquo; email address from that institution; and</li>
        <li>Not be barred from receiving services under applicable law.</li>
      </LegalUL>

      <LegalH2>2. Your account</LegalH2>
      <LegalP>
        You are responsible for maintaining the confidentiality of your login
        credentials and for everything that happens under your account. Tell us
        immediately if you suspect unauthorized access. You may only have one
        active account at a time. Provide accurate, current information when
        you sign up and keep it up to date.
      </LegalP>

      <LegalH2>3. Acceptable use</LegalH2>
      <LegalP>You agree not to:</LegalP>
      <LegalUL>
        <li>Harass, threaten, dox, or impersonate others;</li>
        <li>Post hate speech, sexually explicit content involving minors, or content that promotes self-harm;</li>
        <li>Post content that is illegal where you, the Service, or the recipient is located;</li>
        <li>Spam, scrape, or otherwise overload the Service;</li>
        <li>Reverse-engineer, decompile, or interfere with the Service&apos;s security;</li>
        <li>Use the Service to deceive, defraud, or mislead;</li>
        <li>Sell, transfer, or rent your account.</li>
      </LegalUL>
      <LegalP>
        We may remove content or suspend accounts that violate these rules or
        that we reasonably believe pose a risk to other users.
      </LegalP>

      <LegalH2>4. Your content</LegalH2>
      <LegalP>
        You own the posts, clips, comments, messages, and other content you
        upload (&ldquo;Your Content&rdquo;). By posting Your Content on Vibe,
        you grant us a worldwide, non-exclusive, royalty-free license to host,
        store, display, transmit, and adapt Your Content solely for the
        purpose of operating and improving the Service. This license ends when
        you delete the content or your account, except for copies retained in
        backups for a limited period.
      </LegalP>
      <LegalP>
        You represent that you have all rights necessary to grant this license
        and that Your Content does not infringe anyone&apos;s rights.
      </LegalP>

      <LegalH2>5. Reporting and moderation</LegalH2>
      <LegalP>
        If you see content that violates these Terms, use the in-app report
        flow. We review reports in good faith but make no guarantee about
        response time or outcome. We may, but are not obligated to, monitor or
        moderate content proactively.
      </LegalP>

      <LegalH2>6. Termination</LegalH2>
      <LegalP>
        You can delete your account anytime from{" "}
        <Link
          href="/settings"
          style={{ color: "#FF5C35", fontWeight: 700, textDecoration: "none" }}
        >
          Settings
        </Link>
        . We may suspend or terminate your access if we reasonably believe
        you&apos;ve violated these Terms or pose a risk to other users or to
        the Service. Sections of these Terms that by their nature should
        survive termination (ownership, disclaimers, liability limits, dispute
        resolution) survive.
      </LegalP>

      <LegalH2>7. Service &ldquo;as is&rdquo;</LegalH2>
      <LegalP>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as
        available,&rdquo; without warranties of any kind, express or implied.
        We don&apos;t warrant that the Service will be uninterrupted,
        error-free, or secure, or that content posted by other users is
        accurate or appropriate.
      </LegalP>

      <LegalH2>8. Limitation of liability</LegalH2>
      <LegalP>
        To the fullest extent permitted by law, Vibe and its operators will
        not be liable for any indirect, incidental, special, consequential, or
        punitive damages, or for any loss of profits, data, goodwill, or other
        intangible losses, arising out of or related to your use of (or
        inability to use) the Service. Our total liability for any claim
        relating to the Service is limited to one hundred U.S. dollars
        ($100).
      </LegalP>

      <LegalH2>9. Indemnification</LegalH2>
      <LegalP>
        You agree to defend, indemnify, and hold us harmless from any claim,
        liability, damage, or expense (including reasonable attorneys&apos;
        fees) arising from Your Content or your violation of these Terms or
        the rights of any third party.
      </LegalP>

      <LegalH2>10. Governing law and disputes</LegalH2>
      <LegalP>
        These Terms are governed by the laws of the State of Indiana, without
        regard to conflict-of-laws principles. Any dispute will be resolved in
        the state or federal courts located in Monroe County, Indiana, and you
        consent to personal jurisdiction there.
      </LegalP>

      <LegalH2>11. Changes</LegalH2>
      <LegalP>
        We may update these Terms from time to time. If a change is material,
        we&apos;ll give you reasonable notice (e.g., an in-app notice or
        email). Continued use of the Service after the effective date of the
        update means you accept the updated Terms.
      </LegalP>

      <LegalH2>12. Contact</LegalH2>
      <LegalP>
        Questions or notices about these Terms? Email us at{" "}
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
