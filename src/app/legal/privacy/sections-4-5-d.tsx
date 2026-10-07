import { LegalOL, LegalP } from "@/components/legal/LegalLayout";

import { PageLink, Sec, SubH3 } from "./parts";

/** Privacy Policy section 5h. Wording: privacy-policy-final.md. */
export function Section5h() {
  return (
    <>
      <SubH3 n="5h" />
      <LegalP>
        Messages are not end-to-end encrypted. End-to-end encryption is a lock
        that lets only the people in a chat read it. Vibe does not have it. The
        cofounder with direct access (<Sec to="1">section 1</Sec>) could open
        any message.
      </LegalP>
      <LegalP>
        We do not open private messages to learn about you. We read them only in
        these six cases:
      </LegalP>
      <LegalOL>
        <li>when one is reported to us;</li>
        <li>
          when someone in the chat asks us to or agrees, for example for a copy
          of their own data;
        </li>
        <li>
          when we have specific evidence that a conversation is being used for
          spam, threats, exploitation or another serious break of the{" "}
          <PageLink href="/legal/terms">Terms</PageLink>;
        </li>
        <li>when the law requires it;</li>
        <li>
          when a fault in Vibe&apos;s chat cannot be found or fixed any other
          way. Then we open as few messages as possible;
        </li>
        <li>
          when we believe someone is in danger of death or serious injury, or a
          child is at risk (<Sec to="5i">section 5i</Sec>).
        </li>
      </LegalOL>
      <LegalP>
        The admin tools only ever show a message that was reported (case 1). The
        other five cases need direct access, so they fall to that one cofounder.
        This is a rule we keep ourselves. No system enforces or records it.
      </LegalP>
      <LegalP>
        Outside these cases, a copy of a message&apos;s text could reach Sentry,
        the service we use to find bugs. Until our release of October 5, 2026,
        about one message in ten could be copied this way as it was sent.{" "}
        <Sec to="3d">Section 3d</Sec> says what that release changed, and what
        we have not yet confirmed. The cofounder with direct access can read
        Sentry&apos;s reports. <Sec to="6">Section 6</Sec> says when the AI
        coding assistant may be shown one.
      </LegalP>
      <LegalP>
        Before a message is saved, software checks its text against a short list
        of blocked words and refuses the message on a match (
        <Sec to="3e">section 3e</Sec>).
      </LegalP>
      <LegalP>
        <strong>Reports.</strong> When you report something, we keep a copy of
        it as it was: its text, links to its photos and videos, and the
        owner&apos;s name and handle. All three cofounders can see that copy. A
        new report also emails the three cofounders that one came in, without
        its content. The person reported is not told about the report or who
        filed it, though they may guess. People on the Vibe team decide reports,
        suspensions and bans, not software. We aim to look at each report within
        24 hours.
      </LegalP>
      <LegalP>
        <strong>Removed content.</strong> If the Vibe team removes your post or
        comment, you still see its text, marked as removed with the reason. A
        message they remove also stays visible to you and to nobody else, marked
        as removed. A removed
        post&apos;s photo is hidden from everyone, and the comments under it are
        hidden from everyone but their writers. Nobody else sees removed
        content, apart from the Vibe team.
      </LegalP>
    </>
  );
}
