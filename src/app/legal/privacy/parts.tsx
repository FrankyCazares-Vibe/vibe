import Link from "next/link";
import type { ReactNode } from "react";

import { LegalH2, LegalH3 } from "@/components/legal/LegalLayout";

// The small pieces the Privacy Policy's section files share. Not a route:
// only page.tsx is one.

// The coral accent the other legal pages give their links (their ACCENT_LINK),
// through the theme token instead of the raw colour. These links are often
// one long word (an email address, connectvibe.app/legal/delete-account):
// `break-word` lets one break rather than stick out of a narrow column, and
// only when it would not fit on a line of its own.
const ACCENT_LINK = {
  color: "var(--coral)",
  fontWeight: 700,
  textDecoration: "none",
  overflowWrap: "break-word",
} as const;

// A reference to another part of this page ("section 5h"). Quieter than an
// accent link: there are about thirty of them, many in the middle of a
// sentence.
const SECTION_REF = {
  color: "inherit",
  textDecoration: "underline",
  textDecorationColor: "var(--ink-muted)",
  textUnderlineOffset: 3,
} as const;

// The fifteen section titles, once: the question headings of
// privacy-policy-final.md, word for word. The headings and the "On this page"
// list both read them, so the two cannot drift apart.
const SECTION_TITLES = [
  "Who runs Vibe, and who there can see my information?",
  "Who can use Vibe, and what does “verified” mean?",
  "What does Vibe collect about me?",
  "What does Vibe do with it?",
  "Who can see what I post, send and do?",
  "Which other companies handle my information?",
  "What does Vibe keep on my phone or computer?",
  "How long does Vibe keep things, and what happens to my files?",
  "How do I see, change or delete my information?",
  "How does Vibe keep my information safe?",
  "I joined the waitlist. What happens to what I sent?",
  "What if someone is under 18?",
  "How do I agree to this policy, and what happens when it changes?",
  "Does it matter where I live, and what are my rights?",
  "How do I reach Vibe?",
] as const;

// The lettered sub-sections of sections 3 and 5, the same way.
const SUBSECTION_TITLES = {
  "3a": "What do I give when I make an account?",
  "3b": "What is on my profile?",
  "3c": "What about the things I post and do?",
  "3d": "What does Vibe record without my typing it?",
  "3e": "What does Vibe not collect?",
  "3f": "What is built but switched off today?",
  "3g": "What if I email Vibe?",
  "3h": "What about the iPhone and Android apps?",
  "5a": "What can anyone on the internet see?",
  "5b": "What can every signed-in account see?",
  "5c": "Who can open my résumé?",
  "5d": "Who can see that I looked at them?",
  "5e": "Who can see my messages?",
  "5f": "What can the people who run a club see?",
  "5g": "What can only I see?",
  "5h": "What can people at Vibe see, and do they read my messages?",
  "5i": "Does Vibe tell my university or the police anything?",
} as const;

type SectionNumber =
  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;
type SubsectionKey = keyof typeof SUBSECTION_TITLES;

/** Every place on this page a `<Sec>` can point at: "1" to "15", "3a" to
 *  "3h", "5a" to "5i". A target that does not exist is a type error. */
export type SectionKey = `${SectionNumber}` | SubsectionKey;

// How far below the top edge a jumped-to section lands: LegalLayout's own
// offset for its headings.
const ANCHOR_OFFSET = 24;

/** What LegalToc takes: "1. Who runs Vibe…" → #section-1, and so on. */
export const SECTION_LINKS = SECTION_TITLES.map((title, index) => ({
  href: `#section-${index + 1}`,
  label: `${index + 1}. ${title}`,
}));

/** The h2 of section `n` (1 to 15), with its #section-n anchor. Section 11
 *  is the one exception: use `<WaitlistSection>`, which draws its heading. */
export function SectionH2({ n }: { n: SectionNumber }) {
  return (
    <LegalH2 id={`section-${n}`}>{`${n}. ${SECTION_TITLES[n - 1]}`}</LegalH2>
  );
}

/** The h3 of a lettered sub-section, with its anchor: `<SubH3 n="5h" />`
 *  draws "5h. What can people at Vibe see…" with id="section-5h", which is
 *  where `<Sec to="5h">` lands. */
export function SubH3({ n }: { n: SubsectionKey }) {
  return (
    <LegalH3 id={`section-${n}`}>{`${n}. ${SUBSECTION_TITLES[n]}`}</LegalH3>
  );
}

/** Section 11, whole. The waitlist form and the waitlist emails link to
 *  /legal/privacy#waitlist, so the section answers to two names: the wrapper
 *  carries #waitlist, the heading it draws keeps #section-11, and both land
 *  on the same spot. Put the section's content inside, without a heading. */
export function WaitlistSection({ children }: { children: ReactNode }) {
  return (
    <section id="waitlist" style={{ scrollMarginTop: ANCHOR_OFFSET }}>
      <SectionH2 n={11} />
      {children}
    </section>
  );
}

/** A jump to another section of this page: `<Sec to="5h">section 5h</Sec>`. */
export function Sec({ to, children }: { to: SectionKey; children: ReactNode }) {
  return (
    <a href={`#section-${to}`} style={SECTION_REF}>
      {children}
    </a>
  );
}

/** hello@ or help@connectvibe.app, as a mailto link. */
export function Mail({ box }: { box: "hello" | "help" }) {
  const address = `${box}@connectvibe.app`;
  return (
    <a href={`mailto:${address}`} style={ACCENT_LINK}>
      {address}
    </a>
  );
}

/** A link to another Vibe page the text names (Settings, the Terms). */
export function PageLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} style={ACCENT_LINK}>
      {children}
    </Link>
  );
}
