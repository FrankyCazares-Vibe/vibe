import Link from "next/link";
import type { ReactNode } from "react";

import { LegalH2 } from "@/components/legal/LegalLayout";

// The small pieces the Privacy Policy's section files share. Not a route:
// only page.tsx is one.

// The coral accent the other legal pages give their links (their ACCENT_LINK),
// through the theme token instead of the raw colour.
const ACCENT_LINK = {
  color: "var(--coral)",
  fontWeight: 700,
  textDecoration: "none",
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

// The fifteen section titles, once. The headings and the "On this page" list
// both read them, so the two cannot drift apart.
const SECTION_TITLES = [
  "Who we are and who can reach your data",
  "Who can use Vibe, and what “verified” means",
  "What we collect",
  "How we use it",
  "Who can see what",
  "Outside services",
  "Cookies and what is stored on your device",
  "How long we keep things, and what happens to files",
  "Your choices, and deleting your account",
  "Security",
  "The waitlist",
  "Age",
  "How we record your agreement, and changes",
  "Where you live",
  "Contact",
] as const;

/** What LegalToc takes: "1. Who we are…" → #section-1, and so on. */
export const SECTION_LINKS = SECTION_TITLES.map((title, index) => ({
  href: `#section-${index + 1}`,
  label: `${index + 1}. ${title}`,
}));

/** The h2 of section `n` (1 to 15), with its #section-n anchor. */
export function SectionH2({ n }: { n: number }) {
  return (
    <LegalH2 id={`section-${n}`}>{`${n}. ${SECTION_TITLES[n - 1]}`}</LegalH2>
  );
}

/** A jump to another section of this page: `<Sec to="5h">section 5h</Sec>`. */
export function Sec({ to, children }: { to: string; children: ReactNode }) {
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
