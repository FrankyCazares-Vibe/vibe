import { LegalP, LegalTable, LegalUL } from "@/components/legal/LegalLayout";

import { Mail, PageLink, Sec, SectionH2 } from "./parts";
import { Section11Waitlist } from "./sections-11-15-waitlist";

/** Privacy Policy sections 11 to 15. The wording is
 *  privacy-policy-final.md's (see page.tsx): do not reword it here. Section 11
 *  is long, so it sits in sections-11-15-waitlist.tsx. */
export function Sections11To15() {
  return (
    <>
      <Section11Waitlist />

      <SectionH2 n={12} />
      <LegalP>
        Vibe is for adults. You must be 18 or older to join the waitlist or to
        make an account, even if you already have a school email. Some people
        start college at 17, and some high-school students are given an IU or
        Purdue email address. Vibe is not for them until they turn 18.
      </LegalP>
      <LegalP>
        We ask for no date of birth, so we rely on the checkbox and on what
        people tell us. Vibe is not meant for children. We do not knowingly
        collect information from anyone under 18. That includes children under
        13.
      </LegalP>
      <LegalP>
        If we learn an account belongs to someone under 18, we ban it, which
        hides its profile, posts and comments at once. We then delete the
        account, which also deletes its messages from other people&apos;s chats.
        We aim to do that within 7 days, unless a report or the law needs
        something kept first. We keep the ban record and the scrambled codes in{" "}
        <Sec to="9">section 9</Sec>, and anything the law requires us to keep.
        That school email cannot be verified again until the person is 18 and
        asks <Mail box="help" />. If we learn a waitlist entry belongs to
        someone under 18, we delete the entry.
      </LegalP>
      <LegalP>
        If you think someone under 18 is on Vibe, report something of theirs
        and choose &quot;This person is under 18&quot;, or write to{" "}
        <Mail box="help" />. If you are their parent or guardian, write to{" "}
        <Mail box="help" />.
      </LegalP>

      <SectionH2 n={13} />
      <LegalP>
        When you check the box at sign-up we record the{" "}
        <PageLink href="/legal/terms">Terms</PageLink> version and the time on
        our server, and we record it again once you confirm your email, because
        only then do we know the box was checked by the person who reads that
        inbox. We also record that you confirmed you are 18 or older, and
        whether you accepted at sign-up, after confirming your email or on a
        later screen. The record is deleted with your account.
      </LegalP>
      <LegalP>
        <strong>One version.</strong> Your checkbox covers the{" "}
        <PageLink href="/legal/terms">Terms</PageLink> and this policy together.
        We record the two as one version number. When that number changes, Vibe
        asks you to accept again the next time you open it. Using Vibe does not
        count as agreeing.
      </LegalP>
      <LegalP>
        <strong>This version.</strong> We published this policy on October 5,
        2026 without changing that number. So if you made your account before
        that day, Vibe has not asked you to accept it. Until it does, this page
        is our notice to you. Vibe will ask you the next time the number
        changes, which we expect when the{" "}
        <PageLink href="/legal/terms">Terms</PageLink> change later in October
        2026.
      </LegalP>
      <LegalP>
        <strong>If you decline a new version,</strong> you cannot use Vibe
        beyond <PageLink href="/settings">Settings</PageLink>, where you can
        still delete your account.
      </LegalP>
      <LegalP>
        <strong>How you hear about changes.</strong> When we change this page we
        put the new date at the top. For a change that matters, we also aim to
        tell people with accounts in the app or by email. If you are on the
        waitlist or just visiting, the date at the top is how you can tell.
      </LegalP>

      <SectionH2 n={14} />
      <LegalP>
        <strong>Vibe is run from Indiana, in the United States.</strong> Your
        information is handled there and on the servers of the companies in{" "}
        <Sec to="6">section 6</Sec>, wherever they run them. If you use Vibe
        from another country, your information comes to the United States, where
        the law may protect it less than the law at home.
      </LegalP>
      <LegalP>
        <strong>Rights for everyone.</strong> Wherever you live, you can ask us
        to do any of these, at no cost:
      </LegalP>
      <LegalUL bullets>
        <li>tell you what we hold about you and send you a copy;</li>
        <li>fix something that is wrong;</li>
        <li>
          delete your account or your waitlist entry, or a comment or message
          you cannot delete yourself (<Sec to="8">section 8</Sec>);
        </li>
        <li>stop an optional use, such as Vibe news.</li>
      </LegalUL>
      <LegalP>
        <Sec to="9">Section 9</Sec> says how. Write from the email address on
        your account or waitlist entry. Before we delete or change anything, we
        reply to that address and wait for your answer. If you have no account
        and think Vibe holds something about you, write to{" "}
        <Mail box="help" />.
      </LegalP>
      <LegalP>
        <strong>Who answers, and when.</strong> The cofounder with direct access
        (<Sec to="1">section 1</Sec>) does the work, because nobody else can
        reach the records. We aim to answer within 30 days, and within 45 at the
        latest. If we need more than 30, we tell you. If we cannot do what you
        ask, we say why, and you can ask us to look again. We never charge for a
        request or treat you worse for making one.
      </LegalP>
      <LegalP>
        <strong>State privacy laws.</strong> Some states, Indiana and California
        among them, have laws that give people rights over their personal
        information. Most of those laws cover companies much bigger than Vibe is
        today. We give the rights above to everyone anyway.
      </LegalP>
      <LegalP>
        <strong>Outside the United States.</strong> Vibe is built for two
        universities in Indiana and is not aimed at people in other countries.
        If European or UK data protection law does apply to you, these are our
        reasons for using your information:
      </LegalP>
      <LegalUL bullets>
        <li>to run the service you asked for;</li>
        <li>to keep Vibe safe and working;</li>
        <li>
          because you said yes, where we ask (the waitlist, Vibe news,
          notifications);
        </li>
        <li>because the law requires it.</li>
      </LegalUL>
      <LegalP>
        You can also object to a use or ask us to limit it, and you can complain
        to the data protection authority where you live. We have no office or
        representative outside the United States.
      </LegalP>

      <SectionH2 n={15} />
      <LegalP>
        <strong>CONNECTVIBE. LLC</strong>, an Indiana limited liability company.
        We have no office. To send us legal papers, use our registered agent.
        That is the person the state lists to receive them, named in the Indiana
        Secretary of State&apos;s public business records.
      </LegalP>
      <LegalTable
        head={["Write to", "For"]}
        rows={[
          [
            <Mail key="hello" box="hello" />,
            "Questions about Vibe or this policy, and a copy of your data",
          ],
          [
            <Mail key="help" box="help" />,
            "Safety, reports, appeals, requests to take something down, copyright complaints, child safety and account help",
          ],
        ]}
      />
      <LegalP>
        Both addresses reach the same inbox (<Sec to="3g">section 3g</Sec>).
      </LegalP>
      <LegalP>
        This policy:{" "}
        <PageLink href="/legal/privacy">connectvibe.app/legal/privacy</PageLink>
        . Terms:{" "}
        <PageLink href="/legal/terms">connectvibe.app/legal/terms</PageLink>.
      </LegalP>
    </>
  );
}
