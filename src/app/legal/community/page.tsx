// LAWYER MUST CONFIRM before launch: the "Intimate images shared without
// consent" section is our reading of the TAKE IT DOWN Act (notice, what a
// valid request needs, removal within 48 hours); James takes it to the lawyer
// (security report 2026-09-27, finding #4). /support carries the same process
// in short: change both together.
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
  color: "var(--tag-ink)",
  fontWeight: 700,
  textDecoration: "none",
} as const;

export default function CommunityGuidelinesPage() {
  return (
    <LegalLayout
      eyebrow="Safety"
      title="Community Guidelines"
      effectiveDate="October 5, 2026"
    >
      <LegalP>
        Vibe is a campus app. Everyone who posts here verified a school email
        address. These guidelines sit alongside the{" "}
        <Link href="/legal/terms" style={ACCENT_LINK}>
          Terms of Service
        </Link>
        . The Terms are the contract. This page is the plain-English version
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
        Counts are public. The{" "}
        <Link href="/legal/privacy#section-5" style={ACCENT_LINK}>
          Privacy Policy
        </Link>{" "}
        says who can see who did what.
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
          <strong>Intimate images shared without consent.</strong> A nude or
          sexual photo or video of someone who didn&apos;t agree to it being
          shared, including one that&apos;s edited or fake. How to get one
          taken down is{" "}
          <a href="#intimate-images" style={ACCENT_LINK}>
            below
          </a>
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
        harassment, sexual content, an intimate image shared without consent,
        child sexual abuse or exploitation, hate, self-harm, or something else
        — and add a sentence in your own
        words if there&apos;s context we&apos;d miss. You can report a post, a
        comment, a message, a chat, a club or a person, and you can block or
        mute anyone from their profile at the same time.
      </LegalP>
      <LegalP>
        Reports are not public. The person you report is never told who
        reported them.
      </LegalP>

      <LegalH2>What happens after a report</LegalH2>
      <LegalP>
        <strong>
          We aim to review reports within 24 hours; reports of child
          exploitation or self-harm go first.
        </strong>{" "}
        A report goes straight to the Vibe team and lands in a queue, where a
        person reads it against these guidelines and the Terms and decides what
        happens. We look at the reported thing and the account behind it, not
        just the words in the report. An intimate image shared without consent
        has its own process and a 48-hour promise:{" "}
        <a href="#intimate-images" style={ACCENT_LINK}>
          see below
        </a>
        .
      </LegalP>
      <LegalP>Depending on what we find, one of these happens:</LegalP>
      <LegalUL>
        <li>
          <strong>Nothing.</strong> The report doesn&apos;t hold up, and the
          content stays.
        </li>
        <li>
          <strong>The content is removed.</strong> It comes down: nobody else
          sees it, and it stops counting toward likes, comments and views. A
          single photo can also be taken down on its own: a profile photo or
          cover, the small logos on a profile&apos;s experience and
          working-on entries, a club&apos;s logo or banner, or a group
          chat&apos;s photo. The account or club can set a new one.
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

      {/* The anchor the legal footer and /support link to. A wrapping
          section carries the id so LegalH2 keeps its one shape. */}
      <section id="intimate-images" style={{ scrollMarginTop: 24 }}>
        <LegalH2>Intimate images shared without consent</LegalH2>
        <LegalP>
          If a nude or sexual photo or video of you is on Vibe and you
          didn&apos;t agree to it being shared, including one that&apos;s
          edited or fake, you can ask us to take it down. You don&apos;t need a
          Vibe account to ask, and you can ask for someone else if they&apos;ve
          asked you to act for them.
        </LegalP>
        <LegalP>
          <strong>We remove it within 48 hours of a valid request</strong>,
          along with any identical copies of it we find on Vibe. These
          requests go to the front of the queue.
        </LegalP>
        <LegalP>There are two ways to ask:</LegalP>
        <LegalUL>
          <li>
            <strong>In the app.</strong> Open the <strong>⋯</strong> menu on
            the post, message or profile, choose <strong>Report</strong> and
            pick <strong>An intimate image shared without consent</strong>. If
            you don&apos;t see that choice, pick <strong>Sexual content</strong>{" "}
            and say in the box that it&apos;s an intimate image shared without
            consent.
          </li>
          <li>
            <strong>By email, no account needed.</strong> Write to{" "}
            <a
              href="mailto:help@connectvibe.app?subject=Intimate%20image%20removal"
              style={ACCENT_LINK}
            >
              help@connectvibe.app
            </a>{" "}
            with the subject &ldquo;Intimate image removal.&rdquo;
          </li>
        </LegalUL>
        <LegalP>A valid request includes four things:</LegalP>
        <LegalUL>
          <li>
            <strong>Your signature</strong>, on paper or electronic. Typing
            your full name at the end of an email counts. If you&apos;re asking
            for someone else, sign with your own name and say who you&apos;re
            acting for.
          </li>
          <li>
            <strong>Where the image is on Vibe.</strong> A link, the handle of
            the account that posted it, or a description that lets us find it.
          </li>
          <li>
            <strong>A good-faith statement</strong> that the image was shared
            without the consent of the person in it. For example: &ldquo;I
            believe in good faith that this image of me was shared without my
            consent.&rdquo;
          </li>
          <li>
            <strong>How to reach you.</strong> An email address works.
          </li>
        </LegalUL>
        <LegalP>
          A report in the app already tells us where the image is and how to
          reach you. Put your name and the good-faith statement in the box.
        </LegalP>
        <LegalP>
          Please don&apos;t send us the image itself. A link or a description is
          enough. If we can&apos;t find it from what you sent, we&apos;ll write
          back to ask. If the person in the image is under 18, follow our{" "}
          <Link href="/legal/child-safety" style={ACCENT_LINK}>
            Child Safety Standards
          </Link>{" "}
          as well. If someone is in immediate danger, call 911 or campus police
          first.
        </LegalP>
      </section>

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
