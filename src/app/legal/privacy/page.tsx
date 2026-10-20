// The text of this page is handoffs/legal-2026-10-04-privacy-v3/
// privacy-policy-final.md, fact-checked sentence by sentence against the
// code. Change the wording there first, then here: the two must read the same.
// The part above section 1 is here and in page-short-version.tsx. The sections
// live in the sibling sections-*.tsx files; parts.tsx holds the section titles
// and the link helpers.
import {
  LegalLayout,
  LegalP,
  LegalStartHere,
  LegalToc,
} from "@/components/legal/LegalLayout";

import { ShortVersion } from "./page-short-version";
import { Mail, Sec, SECTION_LINKS } from "./parts";
import { Sections1To3 } from "./sections-1-3";
import { Sections4To5 } from "./sections-4-5";
import { Sections6To8 } from "./sections-6-8";
import { Sections9To10 } from "./sections-9-10";
import { Sections11To15 } from "./sections-11-15";

// The day this page last changed. Section 13 promises the new date goes at
// the top with every change, and check/checks.mjs pins the same date.
const EFFECTIVE_DATE = "October 19, 2026";

// The live policy must never show a placeholder where its date goes (section
// 13 promises the real day at the top). A draft may carry one on a laptop or
// a Vercel preview, but a production build stops here until the real day is
// set, in this line and in the text file's line 3. The policy checker can't
// catch it: it compares the page's date with this same line.
if (
  process.env.VERCEL_ENV === "production" &&
  !/^(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}$/.test(
    EFFECTIVE_DATE,
  )
) {
  throw new Error(
    `[privacy] EFFECTIVE_DATE is "${EFFECTIVE_DATE}", not a date. Set the real day in src/app/legal/privacy/page.tsx and line 3 of the policy text before a production build.`,
  );
}

export const metadata = {
  title: "Privacy Policy · Vibe",
  description: "What Vibe knows about you, who can see it and how to delete it.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout
      eyebrow="Legal"
      title="Vibe Privacy Policy"
      effectiveDate={EFFECTIVE_DATE}
    >
      <LegalP>
        Vibe is a campus social app for people with an Indiana University or
        Purdue University email address. It is run by{" "}
        <strong>CONNECTVIBE. LLC</strong>, an Indiana limited liability company.
        In this policy, &ldquo;we&rdquo; means that company. Vibe is
        independent. It is not run or backed by Indiana University, Purdue
        University, or any campus, school or club.
      </LegalP>
      <LegalP>
        This page says what Vibe knows about you, who can see it and how to
        delete it. It covers connectvibe.app and the Vibe apps for iPhone and
        Android once they are in the stores. We wrote it to be read. If a line
        is unclear, write to <Mail box="hello" /> and tell us.
      </LegalP>
      <LegalP>
        <strong>Only on the waitlist?</strong>{" "}
        <Sec to="11">Section 11</Sec> is written for you. In short: we keep your
        entry for up to 40 days. If you never confirm your email and we have not
        sent you an access code, it is up to 30 days. Every waitlist email has a
        &ldquo;Take me off the list&rdquo; link.
      </LegalP>

      <ShortVersion />

      <LegalStartHere
        id="start-here"
        title="Start here"
        items={[
          {
            question: "Who can see what I post?",
            answer: <><Sec to="5">Section 5</Sec>.</>,
          },
          {
            question: "Who can see my messages?",
            answer: <><Sec to="5e">Section 5e</Sec>.</>,
          },
          {
            question: "Does Vibe read my messages?",
            answer: <><Sec to="5h">Section 5h</Sec>.</>,
          },
          {
            question: "What does Vibe record without my typing it?",
            answer: <><Sec to="3d">Section 3d</Sec>.</>,
          },
          {
            question: "Which companies handle my information?",
            answer: <><Sec to="6">Section 6</Sec>.</>,
          },
          {
            question: "What happens when I delete something, or my account?",
            answer: (
              <>
                <Sec to="8">Sections 8</Sec> and <Sec to="9">9</Sec>.
              </>
            ),
          },
          {
            question: "I only joined the waitlist.",
            answer: <><Sec to="11">Section 11</Sec>.</>,
          },
        ]}
        note={
          <>
            <strong>Two words to know.</strong> When this policy says a post,
            comment, message or photo was <strong>removed</strong>, it means
            hidden by the Vibe team or by a club, and still stored.{" "}
            <strong>Deleted</strong> means gone from Vibe&apos;s systems. A
            message you delete leaves a &ldquo;Message deleted&rdquo; note in
            its place (<Sec to="8">section 8</Sec>).
          </>
        }
      />

      <LegalToc items={SECTION_LINKS} />

      <Sections1To3 />
      <Sections4To5 />
      <Sections6To8 />
      <Sections9To10 />
      <Sections11To15 />
    </LegalLayout>
  );
}
