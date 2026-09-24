import Link from "next/link";

import {
  LegalH2,
  LegalLayout,
  LegalP,
  LegalUL,
} from "@/components/legal/LegalLayout";

export const metadata = {
  title: "Child Safety Standards · Vibe",
  description:
    "Vibe's standards against child sexual abuse and exploitation, and how to report it.",
};

const ACCENT_LINK = {
  color: "#FF5C35",
  fontWeight: 700,
  textDecoration: "none",
} as const;

export default function ChildSafetyPage() {
  return (
    <LegalLayout
      eyebrow="Safety"
      title="Child Safety Standards"
      effectiveDate="September 23, 2026"
    >
      <LegalP>
        Vibe is a social app for university students. You need a verified
        school email to be here, and the{" "}
        <Link href="/legal/terms" style={ACCENT_LINK}>
          Terms of Service
        </Link>{" "}
        require you to be 18 or older and enrolled at a U.S.-accredited
        college or university. Vibe is not built for children and is not
        marketed to them.
      </LegalP>
      <LegalP>
        This page is our published standard against child sexual abuse and
        exploitation (CSAE). It applies to every part of Vibe: posts,
        comments, events, club pages, profiles, direct messages and group
        chats.
      </LegalP>

      <LegalH2>Zero tolerance</LegalH2>
      <LegalP>
        We do not tolerate child sexual abuse material (CSAM) or any
        sexualization of a minor on Vibe. There is no warning, no strike
        system and no second chance for this. Specifically, all of the
        following are banned:
      </LegalP>
      <LegalUL>
        <li>
          Child sexual abuse material — any image, video, drawing, generated
          image or text that sexually depicts a person under 18.
        </li>
        <li>
          Grooming — building a relationship with a minor in order to sexually
          exploit them, including asking a minor for sexual images, sexual
          talk, or an offline meeting.
        </li>
        <li>
          Sexualizing a minor in any way, including sexual commentary about a
          real minor or content that presents a minor as an object of sexual
          interest.
        </li>
        <li>
          Sextortion — threatening to share someone&apos;s sexual images to get
          money, more images, or anything else.
        </li>
        <li>
          Trafficking, or advertising, soliciting or arranging sexual contact
          with a minor.
        </li>
        <li>
          Linking to, trading, or asking for any of the above, on Vibe or off
          it.
        </li>
      </LegalUL>

      <LegalH2>How to report it</LegalH2>
      <LegalP>
        <strong>Inside the app:</strong> open the <strong>⋯</strong> menu on
        the post, person or message and choose <strong>Report</strong>, then
        pick <strong>Sexual content</strong>. Add whatever context you can in
        your own words. You do not have to be the person affected to report.
      </LegalP>
      <LegalP>
        <strong>By email, any time:</strong>{" "}
        <a href="mailto:help@connectvibe.app" style={ACCENT_LINK}>
          help@connectvibe.app
        </a>
        . This is our named contact for child-safety and CSAM concerns and it
        reaches a person on the Vibe team directly. Write to it if you
        can&apos;t report in the app, if the account is already gone, or if
        you&apos;d rather not use the in-app form.
      </LegalP>
      <LegalP>
        Please don&apos;t download, save, or forward the material to show us —
        send us the handle, the link, or a description of where it is, and
        we&apos;ll take it from there.
      </LegalP>

      <LegalH2>What we do about it</LegalH2>
      <LegalP>
        Reports of child sexual abuse or exploitation go to the operator of
        Vibe, <strong>CONNECTVIBE. LLC</strong>, an Indiana limited liability
        company. We treat them as the most serious reports on Vibe.{" "}
        <strong>
          Every report on Vibe is reviewed and acted on within 24 hours of
          being filed
        </strong>{" "}
        — these go to the front of that queue, whether they come in through the
        app or by email.
      </LegalP>
      <LegalUL>
        <li>We take the content down.</li>
        <li>
          We permanently ban the account. If a school email was verified on it,
          that email can&apos;t be verified on another account.
        </li>
        <li>We keep the records the law requires us to keep.</li>
        <li>
          We escalate to law enforcement and to the National Center for Missing
          &amp; Exploited Children (NCMEC) where the law requires it or where
          we believe a child is at risk.
        </li>
      </LegalUL>
      <LegalP>
        We comply with applicable child-safety laws in the United States,
        including federal reporting obligations for apparent child sexual
        abuse material.
      </LegalP>

      <LegalH2>If you think a minor is on Vibe</LegalH2>
      <LegalP>
        Tell us at{" "}
        <a href="mailto:help@connectvibe.app" style={ACCENT_LINK}>
          help@connectvibe.app
        </a>{" "}
        and we&apos;ll look into it. If the person is under 18, we ban the
        account — it can no longer post, comment, message or react, and if a
        school email was verified on it, that email can&apos;t be verified on a
        new one — and we take its content down. You don&apos;t need proof: a
        reason to think so is enough.
      </LegalP>

      <LegalH2>If a child is in immediate danger</LegalH2>
      <LegalP>
        Call your local emergency number (911 in the United States) or campus
        police first. You can also report directly to the NCMEC CyberTipline at{" "}
        <a
          href="https://report.cybertip.org"
          target="_blank"
          rel="noopener noreferrer"
          style={ACCENT_LINK}
        >
          report.cybertip.org
        </a>{" "}
        or 1-800-843-5678. Reporting to them does not replace telling us, and
        telling us does not replace reporting to them — do both.
      </LegalP>

      <LegalH2>Contact</LegalH2>
      <LegalP>
        Named contact for child-safety and CSAM matters: CONNECTVIBE. LLC,{" "}
        <a href="mailto:help@connectvibe.app" style={ACCENT_LINK}>
          help@connectvibe.app
        </a>
        . Our broader rules for what belongs on Vibe are in the{" "}
        <Link href="/legal/community" style={ACCENT_LINK}>
          Community Guidelines
        </Link>
        .
      </LegalP>
    </LegalLayout>
  );
}
