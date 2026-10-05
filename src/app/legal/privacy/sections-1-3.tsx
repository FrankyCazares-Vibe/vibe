import { LegalP, LegalUL } from "@/components/legal/LegalLayout";

import { PageLink, Sec, SectionH2, SubH3 } from "./parts";
import { Section3d } from "./sections-1-3-b";
import { Sections3eTo3h } from "./sections-1-3-c";

/** Privacy Policy sections 1 to 3. The wording is privacy-policy-final.md's
 *  (see page.tsx): do not reword it here. Section 3d is in sections-1-3-b.tsx
 *  and 3e to 3h in sections-1-3-c.tsx, to keep each file short. */
export function Sections1To3() {
  return (
    <>
      <SectionH2 n={1} />
      <LegalP>
        Vibe is built and run by the three cofounders of CONNECTVIBE. LLC. This
        policy calls them &ldquo;the Vibe team&rdquo; when they moderate.{" "}
        <strong>All three moderate Vibe.</strong> Their admin tools show them:
      </LegalP>
      <LegalUL bullets>
        <li>
          every report, with the reporter&apos;s words and handle (their @name)
          and a copy of what was reported;
        </li>
        <li>
          for any account: handle, name, verified or not, join date, any
          suspension or ban with its reason and private note, and the
          moderation actions about it;
        </li>
        <li>every club and its posts, hidden ones included;</li>
        <li>
          the photos an account, club or group chat shows. For two minutes at a
          time they can also open a photo that was removed, including the photo
          or video of a removed post;
        </li>
        <li>
          the waitlist (<Sec to="11">section 11</Sec>).
        </li>
      </LegalUL>
      <LegalP>
        They can look an account up by its exact email address, and the result
        does not show the address. The admin tools do not show email addresses
        (except on the waitlist), passwords, résumés or billing details. They
        do not show messages that were not reported, who viewed what, or IP
        addresses. An IP address is the number that identifies your internet
        connection.
      </LegalP>
      <LegalP>
        <strong>One cofounder also has direct access</strong> to the systems
        that store Vibe&apos;s information and to our accounts at the companies
        in <Sec to="6">section 6</Sec>. This policy calls that person
        &ldquo;the cofounder with direct access&rdquo;. With that access, the
        person can read everything Vibe stores, including both your email
        addresses, every message and the sign-in records in{" "}
        <Sec to="3d">section 3d</Sec>. The other two cofounders do not have it.
        The same cofounder&apos;s personal Gmail inbox receives the mail you
        send us (<Sec to="3g">section 3g</Sec>).
      </LegalP>
      <LegalP>
        Vibe&apos;s own database does not log what is read through direct
        access or in the admin tools. One exception: each time a full waitlist
        address is shown, that is logged first.
      </LegalP>
      <LegalP>
        When and why we read private messages is in{" "}
        <Sec to="5h">section 5h</Sec>.
      </LegalP>

      <SectionH2 n={2} />
      <LegalP>
        <strong>Age and agreement.</strong> You must be 18 or older (
        <Sec to="12">section 12</Sec>). Sign-up has one checkbox:
        &ldquo;I&apos;m 18 or older and I agree to the Terms of Service and
        Privacy Policy.&rdquo; Checking it is how you agree to this policy. We
        do not ask for a date of birth or check age any other way.
      </LegalP>
      <LegalP>
        <strong>Making an account.</strong> Sign-up asks for an email address,
        a password and the checkbox. While we let people in one group at a time
        (a wave), it also asks for the access code we emailed you. You then
        confirm your sign-in email, verify a school email and set up a profile.
      </LegalP>
      <LegalP>
        <strong>What &ldquo;verified&rdquo; means.</strong> We send a link and a
        verification code to your school email and you use either one. That
        proves you could read mail at that address at that moment. It does not
        prove that you are enrolled, employed or admitted, or that you are who
        your profile says. A school email here means an address whose part after
        the @ is iu.edu or purdue.edu, or ends in .iu.edu or .purdue.edu.
        University staff and faculty have these addresses too. We do not contact
        the university. One school email is meant to verify one account. Your
        campus is your own choice, and we do not check it.
      </LegalP>
      <LegalP>
        One exception: we can mark a test account that we run ourselves as
        verified by hand, such as the account an app store&apos;s reviewer signs
        in with. Those accounts are not students.
      </LegalP>
      <LegalP>
        <strong>Without a verified school email</strong> you cannot post,
        comment, message or join a club. You can still like, save, follow and
        report. Verifying does not hide anything from other accounts. An account
        that has not verified can still read everything in{" "}
        <Sec to="5b">section 5b</Sec>. It cannot open résumés (
        <Sec to="5c">section 5c</Sec>).
      </LegalP>

      <SectionH2 n={3} />
      <SubH3 n="3a" />
      <LegalUL bullets>
        <li>
          <strong>Sign-in email.</strong> Shown to you in{" "}
          <PageLink href="/settings">Settings</PageLink>. No other user is shown
          it. The one exception is your starter name, below.
        </li>
        <li>
          <strong>Password.</strong> We never store the password itself.
          Supabase, the company that runs our sign-in, stores a scrambled
          version that cannot be read back.
        </li>
        <li>
          <strong>Starter name.</strong> Until you choose a name, your display
          name is the part of your sign-in email before the @. Anyone who sees
          your name on Vibe can read it.
        </li>
        <li>
          <strong>School email.</strong> Stored once you confirm it. No other
          user is shown it. <Sec to="10">Section 10</Sec> names one gap.
        </li>
        <li>
          <strong>Proof that you agreed</strong> (<Sec to="13">section 13</Sec>)
          and, if you joined with an access code, a record of it (
          <Sec to="11">section 11</Sec>).
        </li>
      </LegalUL>

      <SubH3 n="3b" />
      <LegalP>Your profile holds:</LegalP>
      <LegalUL bullets>
        <li>
          everything on your profile page (<Sec to="5a">section 5a</Sec>);
        </li>
        <li>
          what you typed in the optional &ldquo;Department / school&rdquo; box
          at set-up. It is stored but not shown on your profile page (
          <Sec to="5b">section 5b</Sec>);
        </li>
        <li>
          up to three résumé or portfolio documents. Each is a file or an
          outside link;
        </li>
        <li>
          the redaction bars you draw on them. These are black bars that cover
          parts of a résumé;
        </li>
        <li>
          the list of profile parts you hid (<Sec to="9">section 9</Sec>);
        </li>
        <li>your &ldquo;What are you here for?&rdquo; answers.</li>
      </LegalUL>

      <SubH3 n="3c" />
      <LegalUL bullets>
        <li>Posts, drafts, comments, likes, reposts and saves.</li>
        <li>Who you follow and who follows you.</li>
        <li>
          Clubs: memberships and roles, clubs you follow, requests to join with
          your message, and invites. If a club&apos;s owner or admin takes you
          out of the club or adds you to a room, we store who did it and when.
        </li>
        <li>
          Club events, your RSVPs (Going or Interested) and personal calendar
          entries.
        </li>
        <li>Messages and everything in them.</li>
        <li>
          Which messages are pinned in a chat, who pinned each one, and when.
        </li>
        <li>
          Your settings in each chat, and your poll votes and sign-ups in club
          rooms.
        </li>
        <li>
          Reports you file, your block and mute lists, and the suggested people
          you dismissed.
        </li>
        <li>
          Otto settings, your answers to Otto&apos;s set-up questions, and
          reminders. Otto, Vibe&apos;s built-in helper, runs on our own
          software, not an AI service.
        </li>
      </LegalUL>
      <LegalP>
        <strong>Photo details.</strong> A camera saves hidden details inside a
        photo or video, such as where it was taken.
      </LegalP>
      <LegalUL bullets>
        <li>
          <strong>We strip them from:</strong> your profile photo and cover,
          photos on your own posts, work logos and résumé images. Photos
          uploaded before late September 2026 may still carry theirs.
        </li>
        <li>
          <strong>We do not strip them from:</strong> videos, photos on a
          club&apos;s posts, club logos and banners, photos and videos sent in
          chats, group chat photos, and résumé PDFs.
        </li>
      </LegalUL>
      <LegalP>
        Posts and club pages are public (<Sec to="5a">section 5a</Sec>), so a
        location inside one of those files is public too.
      </LegalP>

      <Section3d />
      <Sections3eTo3h />
    </>
  );
}
