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
          totals of how Vibe is used, such as sign-ups, posts and chat messages
          per day. The totals do not say who did what, but on a quiet day a
          daily total can come from one person;
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
        <strong>Making an account.</strong> Sign-up asks for your school email,
        a password and the checkbox. While we let people in one group at a time
        (a wave), it also asks for the access code we emailed you. Signing up
        through a club link needs no access code (
        <Sec to="11">section 11</Sec>). We email a code to your school email. Typing it confirms your account and verifies
        your school email in one step. The password that works is the one
        chosen by the person who types the code, so confirming removes any
        password set for your address before then. If you type the code on
        the page where you just typed your password (the sign-up page or Log
        in), Vibe sets that password again at once. If you confirm anywhere
        else, Vibe asks you to choose a password. Unless you confirm on the
        sign-up page, Vibe also asks you to check the box again. You then set
        up a profile. Some
        accounts sign in with a different email and verify a school email as a
        separate step: accounts made before sign-up worked this way, and a few
        that we add ourselves.
      </LegalP>
      <LegalP>
        <strong>What &ldquo;verified&rdquo; means.</strong> We send a
        verification code to your school email and you type it into Vibe. That
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
        comment, message or join a club, or read a club&apos;s Board as a
        follower. You can still like, save, follow and report. Verifying does not hide anything from other accounts. An account
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
          it. The one exception is your starter name, below. A short form of it
          (its first character and the part after the @) can also be emailed to
          your own school email or personal email (
          <Sec to="4">section 4</Sec>). Whoever can read that inbox can read the
          short form.
        </li>
        <li>
          <strong>Password.</strong> We never store the password itself.
          Supabase, the company that runs our sign-in, stores a scrambled
          version that cannot be read back. When confirming your email
          removes a password, we note the time until you have chosen one and
          accepted the Terms.
        </li>
        <li>
          <strong>Starter name.</strong> If you made your account before
          October 8, 2026 and have not chosen a name, your display name is the
          part of your sign-in email before the @. Anyone who sees your name on
          Vibe can read it. An account made since then starts with the name
          &quot;Member&quot;.
        </li>
        <li>
          <strong>School email.</strong> Stored once you confirm it. No other
          user is shown it. <Sec to="10">Section 10</Sec> names one gap.
        </li>
        <li>
          <strong>Personal email.</strong> Optional. After sign-up you can add
          a personal email, so that your account stays yours when your school
          closes your school inbox. We email it a code first, and store it once
          you type the code. It is shown to you in Settings, where you can
          remove it. No other user is shown it.
        </li>
        <li>
          <strong>Proof that you agreed</strong> (<Sec to="13">section 13</Sec>)
          and, if you joined with an access code or a club link, a record of
          it (
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
        <li>
          which of your clubs show on your profile, in what order, and whether
          the title a club gave you shows (<Sec to="9">section 9</Sec>);
        </li>
        <li>your &ldquo;What are you here for?&rdquo; answers.</li>
      </LegalUL>

      <SubH3 n="3c" />
      <LegalUL bullets>
        <li>Posts, drafts, comments, likes, reposts and saves.</li>
        <li>Who you follow and who follows you.</li>
        <li>
          Clubs: memberships and roles, the title a club&apos;s owner or an
          officer gave you, clubs you follow, requests to join with your
          message, and invites. Asking to join a club also follows it. If a
          club&apos;s owner or an officer takes you out of the club, adds you to a room, gives you a
          title or removes you as a follower, we store who did it and when.
        </li>
        <li>
          Club events, your RSVPs (Going or Interested) and personal calendar
          entries.
        </li>
        <li>
          Event check-ins: the club events you checked in at. You check in
          yourself, with the 4-digit code or the QR code on the club&apos;s
          check-in screen, or the club&apos;s owner or an officer marks you
          as here. Our database does not store the time you checked in or which
          way you did it, but Vercel&apos;s visit logs can show both
          (<Sec to="6">section 6</Sec>).
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
          Reports you file, your block and mute lists (people, and clubs whose
          posts you muted), and the suggested people you dismissed.
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
        <strong>Chat photos.</strong> Since our release of October 12, 2026,
        the app often makes a large photo (over about 1 MB) smaller on your
        device before it is sent in a chat. When it does, only the smaller copy
        is sent. The copy is a new picture and does not carry the hidden
        details the camera saved. This happens on your device, and we do not
        promise it for every photo. GIFs, videos and photos of about 1 MB or
        less are sent exactly as you picked them. So is any photo the app
        leaves as it is, for example a picture with see-through parts, a very
        long or very wide picture such as a scrolling screenshot or a panorama,
        or one your device could not make smaller. Photos sent in chats before
        that release were stored exactly as they were picked.
      </LegalP>
      <LegalP>
        Posts and club pages are public (<Sec to="5a">section 5a</Sec>), so a
        location inside one of those files is public too.
      </LegalP>

      <Section3d />
      <Sections3eTo3h />
    </>
  );
}
