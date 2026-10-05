import { LegalP, LegalUL } from "@/components/legal/LegalLayout";

import { Sec, SubH3 } from "./parts";

/** Privacy Policy sections 5f and 5g. Wording: privacy-policy-final.md. */
export function Sections5fTo5g() {
  return (
    <>
      <SubH3 n="5f" />
      <LegalP>
        A club is run by its owner, its admins and its mods (moderators the club
        picks).
      </LegalP>
      <LegalUL bullets>
        <li>
          <strong>Every member</strong> sees the club&apos;s member list: name,
          handle, photo, role and join date.
        </li>
        <li>
          <strong>The club&apos;s owner and admins</strong> see four more lists:
          <LegalUL bullets>
            <li>followers, with the date each first followed;</li>
            <li>invites and their outcome;</li>
            <li>who RSVP&apos;d to the club&apos;s events;</li>
            <li>the people added to a room, with the date each was added.</li>
          </LegalUL>
          <LegalP>
            They can drop a follower without that person being told, and delete
            any post made as the club.
          </LegalP>
        </li>
        <li>
          <strong>The club&apos;s owner, admins and mods</strong> see pending
          requests to join, with your message. If the club took you out before,
          the request carries a &ldquo;Removed before&rdquo; mark. Mods can also
          read the list of people added to a room. Owners, admins and mods can
          remove a club room message. It is then hidden from everyone but its
          author, not deleted, and we record who removed it.
        </li>
        <li>
          Nobody who runs a club is shown email addresses or reports. If they
          try to remove a message that has an open report, the app tells them
          one is open.
        </li>
      </LegalUL>

      <SubH3 n="5g" />
      <LegalP>No other user is shown these:</LegalP>
      <LegalUL bullets>
        <li>drafts and saved posts;</li>
        <li>personal calendar entries;</li>
        <li>your notifications;</li>
        <li>your mute list and the suggested people you dismissed;</li>
        <li>Otto settings and reminders;</li>
        <li>
          your redaction bars, your list of hidden profile parts and your
          &ldquo;here for&rdquo; answers.
        </li>
      </LegalUL>
      <LegalP>
        The cofounder with direct access (<Sec to="1">section 1</Sec>) could
        still reach them.
      </LegalP>
    </>
  );
}
