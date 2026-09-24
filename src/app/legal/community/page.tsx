import Link from "next/link";

import {
  LegalH2,
  LegalLayout,
  LegalP,
  LegalUL,
} from "@/components/legal/LegalLayout";

export const metadata = {
  title: "Community Guidelines · Vibe",
  description: "What Vibe is for, what isn't allowed, and how reporting works.",
};

const ACCENT_LINK = {
  color: "#FF5C35",
  fontWeight: 700,
  textDecoration: "none",
} as const;

export default function CommunityGuidelinesPage() {
  return (
    <LegalLayout
      eyebrow="Safety"
      title="Community Guidelines"
      effectiveDate="September 23, 2026"
    >
      <LegalP>
        Vibe is a campus app. Everyone here verified a school email, which
        means the person on the other end of a post, a comment or a message is
        a real student at a real school. These guidelines are how we keep it
        that way. They sit alongside the{" "}
        <Link href="/legal/terms" style={ACCENT_LINK}>
          Terms of Service
        </Link>{" "}
        — the Terms are the contract, this page is the plain-English version
        of what we expect.
      </LegalP>

      <LegalH2>What Vibe is for</LegalH2>
      <LegalP>
        Finding your people on campus. Clubs and orgs posting what they&apos;re
        doing and who they&apos;re looking for. Events worth showing up to.
        Talking to the people in your major, your dorm, your team. Posting the
        stuff you actually care about, to people who are actually near you.
      </LegalP>
      <LegalP>
        You get to decide how much of yourself is on here. Counts are public;
        who did what is yours. Nothing on this page changes that.
      </LegalP>

      <LegalH2>What isn&apos;t allowed</LegalH2>
      <LegalP>
        None of this belongs on Vibe, in a post, a comment, a club page, an
        event, a message or a profile:
      </LegalP>
      <LegalUL>
        <li>
          <strong>Harassment.</strong> Going after someone, piling on, or
          coming back at a person who has asked you to stop.
        </li>
        <li>
          <strong>Hate.</strong> Attacking people for who they are — race,
          ethnicity, religion, national origin, disability, gender, gender
          identity, sexual orientation.
        </li>
        <li>
          <strong>Threats and violence.</strong> Threatening anyone, on campus
          or off, seriously or &ldquo;as a joke.&rdquo;
        </li>
        <li>
          <strong>Sexual content involving minors.</strong> Zero tolerance,
          full stop. There is a separate page for this:{" "}
          <Link href="/legal/child-safety" style={ACCENT_LINK}>
            Child Safety
          </Link>
          .
        </li>
        <li>
          <strong>Spam.</strong> Bulk posting, engagement farming, bots,
          scams, phishing links, or dragging people off Vibe to something
          sketchy.
        </li>
        <li>
          <strong>Impersonation.</strong> Pretending to be another student, a
          professor, a club you have nothing to do with, or Vibe itself.
        </li>
        <li>
          <strong>Doxxing.</strong> Posting someone&apos;s address, phone
          number, schedule, class location, or anything else meant to help
          people find them.
        </li>
        <li>
          <strong>Illegal sales.</strong> Drugs, alcohol to minors, weapons,
          fake IDs, stolen goods, coursework for sale.
        </li>
      </LegalUL>
      <LegalP>
        A small set of words is blocked before anything is posted. If you see{" "}
        <em>
          &ldquo;That includes words that aren&apos;t allowed on Vibe. Edit it
          and try again,&rdquo;
        </em>{" "}
        that&apos;s the filter, not a person. Edit and post.
      </LegalP>

      <LegalH2>How to report</LegalH2>
      <LegalP>
        Open the <strong>⋯</strong> menu on the thing you want to report and
        choose <strong>Report</strong>. On a club page it&apos;s at the bottom
        of the About panel instead — on a phone, under the{" "}
        <strong>About</strong> tab. Pick the reason that fits — spam,
        harassment, sexual content, hate, self-harm, or something else — and
        add a sentence in your own words if there&apos;s context we&apos;d
        miss. You can report a post, a comment, a message, a chat, a club or a
        person, and you can block or mute anyone from their profile at the same
        time.
      </LegalP>
      <LegalP>
        Reports are not public. The person you report is never told who
        reported them.
      </LegalP>

      <LegalH2>What happens after a report</LegalH2>
      <LegalP>
        <strong>
          We review every report and act on it within 24 hours of it being
          filed.
        </strong>{" "}
        A report goes straight to the Vibe team, it lands in a queue, and
        inside that day a person reads it against these guidelines and the
        Terms and decides what happens. We look at the reported thing and the
        account behind it, not just the words in the report.
      </LegalP>
      <LegalP>Depending on what we find, one of these happens:</LegalP>
      <LegalUL>
        <li>
          <strong>Nothing.</strong> The report doesn&apos;t hold up, and the
          content stays.
        </li>
        <li>
          <strong>The content is removed.</strong> It comes down: nobody else
          sees it, and it stops counting toward likes, comments and views.
        </li>
        <li>
          <strong>The account is suspended.</strong> For a set number of days,
          the only things it can open are the notice explaining the suspension
          and these legal pages — every other page on Vibe sends it back to
          that notice, so there&apos;s no posting, commenting, messaging or
          reacting, and no scrolling campus either. Its profile, posts and
          comments aren&apos;t visible to anyone else until the pause ends.
          Nothing is deleted.
        </li>
        <li>
          <strong>The account is banned.</strong> The same doors close, for
          good. If a school email was verified on it, that email can&apos;t be
          verified on another account either.
        </li>
      </LegalUL>
      <LegalP>
        We don&apos;t send you a play-by-play of what happened to someone
        else&apos;s account — that&apos;s their business, not ours to hand out.
      </LegalP>

      <LegalH2>If we act on your account</LegalH2>
      <LegalP>
        If we suspend or ban your account, you&apos;ll see a notice when you
        open Vibe that says what happened, why, and — for a suspension — when
        it ends. That notice and these legal pages are what you can still
        reach; every other page sends you back to the notice. You keep the
        right to read it and the Terms, to sign out, and to delete your
        account.
      </LegalP>
      <LegalP>
        <strong>Appeals.</strong> If you think we got it wrong, email{" "}
        <a href="mailto:help@connectvibe.app" style={ACCENT_LINK}>
          help@connectvibe.app
        </a>{" "}
        from the address on your account and tell us what we missed. A person
        reads it. If we made a mistake, we undo it.
      </LegalP>

      <LegalH2>Questions</LegalH2>
      <LegalP>
        Anything about these guidelines, a report you filed, or a decision we
        made:{" "}
        <a href="mailto:help@connectvibe.app" style={ACCENT_LINK}>
          help@connectvibe.app
        </a>
        .
      </LegalP>
    </LegalLayout>
  );
}
