// The text of this page is handoffs/legal-2026-10-03-privacy/
// privacy-policy-publish.md, fact-checked sentence by sentence against the
// code. Change the wording there first, then here: the two must read the same.
// The sections live in the sibling sections-*.tsx files; parts.tsx holds the
// section titles and the link helpers.
import {
  LegalCallout,
  LegalLayout,
  LegalP,
  LegalToc,
  LegalUL,
} from "@/components/legal/LegalLayout";

import { PageLink, Sec, SECTION_LINKS } from "./parts";
import { Sections1To3 } from "./sections-1-3";
import { Sections4To5 } from "./sections-4-5";
import { Sections6To8 } from "./sections-6-8";
import { Sections9To10 } from "./sections-9-10";
import { Sections11To15 } from "./sections-11-15";

// Set on the day the page goes live.
const EFFECTIVE_DATE = "October 5, 2026";

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
        <strong>CONNECTVIBE. LLC</strong>, an Indiana limited liability company
        (&ldquo;we&rdquo;, &ldquo;us&rdquo;). Vibe is independent. It is not run
        or backed by Indiana University, Purdue University, or any campus,
        school or club.
      </LegalP>
      <LegalP>
        This page says what Vibe knows about you, who can see it and how to
        delete it. It covers connectvibe.app and the Vibe apps for iPhone and
        Android once they are in the stores.
      </LegalP>
      <LegalP>
        <strong>
          Only on the waitlist? Go to <Sec to="11">section 11</Sec>. It is all
          you need.
        </strong>
      </LegalP>

      <LegalCallout id="short-version" title="The short version">
        <LegalUL bullets>
          <li>
            Most of your profile, including your posts, is open to anyone on
            the internet, and search engines can list it.
          </li>
          <li>
            Club pages are public too, with their 12 newest posts and who wrote
            them.
          </li>
          <li>
            When you are signed in, we record each profile you open and each
            post you open or pause on. You cannot turn this off. The owner sees
            the count and, with Vibe+ (a paid plan, not on sale yet), who.
          </li>
          <li>
            All three cofounders moderate Vibe, and a reported message is
            copied for them (<Sec to="1">section 1</Sec>).
          </li>
          <li>
            One cofounder can reach everything Vibe stores. We read private
            messages only in the cases in <Sec to="5h">section 5h</Sec>.
          </li>
          <li>
            We do not sell your information. Vibe has no ads and no AI
            features, and we do not train AI on what you post.
          </li>
          <li>
            Photos and videos you send in chats or post as a club can still say
            where they were taken.
          </li>
          <li>
            You can delete your account in{" "}
            <PageLink href="/settings">Settings</PageLink>, right away. Your
            messages vanish from other people&apos;s chats too.{" "}
            <Sec to="8">Sections 8</Sec> and <Sec to="9">9</Sec> list what
            stays.
          </li>
          <li>
            &ldquo;Verified&rdquo; means the account could once read mail at an
            @iu.edu or @purdue.edu address. It does not prove enrollment or
            identity.
          </li>
          <li>
            Vibe is for people 18 or older. You confirm it with a checkbox.
          </li>
        </LegalUL>
      </LegalCallout>

      <LegalToc items={SECTION_LINKS} />

      <Sections1To3 />
      <Sections4To5 />
      <Sections6To8 />
      <Sections9To10 />
      <Sections11To15 />
    </LegalLayout>
  );
}
