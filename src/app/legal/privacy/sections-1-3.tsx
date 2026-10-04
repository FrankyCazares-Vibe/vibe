import { LegalH3, LegalP, LegalUL } from "@/components/legal/LegalLayout";

import { PageLink, Sec, SectionH2 } from "./parts";

/** Privacy Policy sections 1 to 3. The wording is privacy-policy-publish.md's
 *  (see page.tsx): do not reword it here. */
export function Sections1To3() {
  return (
    <>
      <SectionH2 n={1} />
      <LegalP>
        Vibe is built and run by the three cofounders of CONNECTVIBE. LLC
        (&ldquo;the Vibe team&rdquo;). <strong>All three moderate Vibe.</strong>{" "}
        Their admin tools show them:
      </LegalP>
      <LegalUL bullets>
        <li>
          every report, with the reporter&apos;s words and handle (their @name)
          and a copy of what was reported (<Sec to="5h">section 5h</Sec>);
        </li>
        <li>
          for any account: handle, name, verified or not, join date, any
          suspension or ban with its reason and private note, and the
          moderation actions about it;
        </li>
        <li>every club and its posts, hidden ones included;</li>
        <li>
          the photos an account, club or group chat shows, and briefly ones
          that were taken down, including a removed post&apos;s media;
        </li>
        <li>
          the waitlist (<Sec to="11">section 11</Sec>).
        </li>
      </LegalUL>
      <LegalP>
        They can look an account up by its exact email address, and the result
        does not show the address. The admin tools do not show email addresses
        (except on the waitlist), passwords, résumés, messages that were not
        reported, who viewed what, billing details or IP addresses (the number
        that identifies your internet connection).
      </LegalP>
      <LegalP>
        <strong>One cofounder also has direct access</strong> to the systems
        that store Vibe&apos;s data and to our accounts at the companies in{" "}
        <Sec to="6">section 6</Sec>. That access can read everything Vibe
        stores, including both your email addresses and every message.
        Vibe&apos;s own database keeps no record of what is read this way or in
        the admin tools, except that showing a full waitlist address is logged
        first.
      </LegalP>

      <SectionH2 n={2} />
      <LegalP>
        <strong>Age and agreement.</strong> You must be 18 or older. Sign-up
        has one checkbox: &ldquo;I&apos;m 18 or older and I agree to the Terms
        of Service and Privacy Policy.&rdquo; Checking it is how you agree to
        this policy. We do not ask for a date of birth or check age any other
        way.
      </LegalP>
      <LegalP>
        <strong>Making an account.</strong> Sign-up asks for an email address,
        a password and the checkbox. While we let people in one group at a time
        (a wave), it also asks for the access code from your invite email. You
        then confirm your sign-in email, verify a school email and set up a
        profile.
      </LegalP>
      <LegalP>
        <strong>What &ldquo;verified&rdquo; means.</strong> We send a link and
        a code to your school email and you use one. That proves you could read
        mail at that address at that moment. It does not prove that you are
        enrolled, employed or admitted, or that you are who your profile says.
        We do not contact the university. One school email verifies one
        account. Your campus is your own choice, and we do not check it.
      </LegalP>
      <LegalP>
        <strong>Without a verified school email</strong> you cannot post,
        comment, message or join a club. You can still like, save, follow and
        report. Verifying hides nothing: an unverified account can read
        everything in <Sec to="5b">section 5b</Sec>, except résumés.
      </LegalP>

      <SectionH2 n={3} />
      <LegalH3 id="section-3a">3a. Your account</LegalH3>
      <LegalUL bullets>
        <li>
          <strong>Sign-in email.</strong> Shown to you in{" "}
          <PageLink href="/settings">Settings</PageLink>. Other people are not
          shown it, apart from the starter name below.
        </li>
        <li>
          <strong>Password.</strong> We never store it. Supabase, our sign-in
          provider, stores a scrambled version that cannot be read back.
        </li>
        <li>
          <strong>Starter name.</strong> Until you choose a name, your display
          name is the part of your sign-in email before the @, and anyone who
          opens your profile can read it.
        </li>
        <li>
          <strong>School email.</strong> Stored once you confirm it. Other
          people never see it.
        </li>
        <li>
          <strong>Proof that you agreed</strong> (
          <Sec to="13">section 13</Sec>) and, if you joined with an access
          code, a record of it (<Sec to="11">section 11</Sec>).
        </li>
      </LegalUL>

      <LegalH3 id="section-3b">3b. Your profile</LegalH3>
      <LegalP>
        Everything on your profile page (<Sec to="5a">section 5a</Sec>), plus
        up to three résumé or portfolio documents (a file or an outside link),
        the redaction bars you draw on them (black bars that cover parts of a
        résumé), the sections you hid, and your &ldquo;What are you here
        for?&rdquo; answers.
      </LegalP>

      <LegalH3 id="section-3c">3c. What you post and do</LegalH3>
      <LegalUL bullets>
        <li>Posts, drafts, comments, likes, reposts and saves.</li>
        <li>Who you follow and who follows you.</li>
        <li>
          Clubs: memberships and roles, clubs you follow, requests to join with
          your message, invites, and, if a club officer removes you, who did it
          and when.
        </li>
        <li>
          Club events, your RSVPs (Going or Interested) and personal calendar
          entries.
        </li>
        <li>
          Messages and everything in them, your settings in each chat, and poll
          votes and sign-ups in club chats.
        </li>
        <li>Reports you file, and your block and mute lists.</li>
        <li>
          Otto settings and reminders. Otto, Vibe&apos;s built-in helper, runs
          on our own code, not an AI service.
        </li>
      </LegalUL>
      <LegalP>
        <strong>Photo details.</strong> A camera saves hidden details inside a
        photo or video, such as where it was taken.
      </LegalP>
      <LegalUL bullets>
        <li>
          <strong>We remove them from:</strong> your profile photo and cover,
          photos on your own posts, work logos and résumé images. Photos
          uploaded before late September 2026 may still carry theirs.
        </li>
        <li>
          <strong>We do not remove them from:</strong> videos, photos on a
          club&apos;s posts, club logos and banners, photos and videos sent in
          chats, group chat pictures, and résumé PDFs.
        </li>
      </LegalUL>

      <LegalH3 id="section-3d">3d. What Vibe records by itself</LegalH3>
      <LegalUL bullets>
        <li>
          <strong>Views.</strong> When you are signed in and open a profile,
          open a post, or a post stays on your screen in the feed for about a
          second, we record who you are, what you viewed and the day, once per
          day. For a profile we also record the time of your first look that
          day. Your own views and signed-out views are not recorded.
        </li>
        <li>
          <strong>Last active.</strong> While the Campus page is open, we store
          the latest time your browser checked in.
        </li>
        <li>
          <strong>Abuse limits.</strong> We count how often some actions
          happen, mostly per account. A few counts hold an IP address or part
          of one. Nowhere else in Vibe&apos;s own tables holds one. Counts are
          cleared on no fixed schedule and can stay for weeks.
        </li>
        <li>
          <strong>Email log.</strong> We log each email our code sends: its
          kind, your account if there is one, the part of the address after the
          @, the time and whether it worked. In place of the address, the log
          holds a scrambled code. The code cannot be turned back into the
          address, but with a secret key held on our servers we can test
          whether a given address matches.
        </li>
        <li>
          <strong>Error reports.</strong> When something breaks, and for about
          one in ten page loads and server requests, a report goes to Sentry.
          Our code does not tag reports with your account or email, and strips
          sign-in links, access codes and profile handles from web addresses. A
          report can still include a club&apos;s handle, a post&apos;s number
          or search words. One about a failed server request can include the
          sign-in details your browser sent, which identify your account.
        </li>
        <li>
          <strong>Search words</strong> are not stored in our database, but our
          hosting company can log them as part of the web address.
        </li>
      </LegalUL>

      <LegalH3 id="section-3e">3e. What we do not collect</LegalH3>
      <LegalUL bullets>
        <li>No tool that tracks what you tap, and no advertising tracker.</li>
        <li>
          No location from your device or your IP address. Some photos and
          videos you upload do carry a location inside the file (
          <Sec to="3c">section 3c</Sec>).
        </li>
        <li>
          No date of birth, phone number, contact list or card number, and no
          sign-in through Google, Apple or anyone else.
        </li>
      </LegalUL>
      <LegalP>
        One automated check exists: a small set of words is blocked before text
        is saved, in messages too.
      </LegalP>

      <LegalH3 id="section-3f">
        3f. Features that are switched off today
      </LegalH3>
      <LegalP>
        <strong>Vibe+ (paid).</strong> Once billing is on, you pay on
        Stripe&apos;s own pages and card numbers never reach us. We send Stripe
        only your Vibe account number, and we store your Stripe customer and
        subscription numbers, your Vibe+ status and a list of payment events.
        Vibe+ is not sold inside the iPhone or Android app.
      </LegalP>
      <LegalP>
        <strong>Notifications to your phone or browser.</strong> If you turn
        them on, we store the address your device gives us until you sign out,
        turn them off or delete your account. A notification shows the
        sender&apos;s name and, with previews on, up to 100 characters of the
        message. Browser notifications travel encrypted through the browser
        maker&apos;s service (Google, Apple, Mozilla or Microsoft). App
        notifications go through Google&apos;s Firebase and, on iPhone, Apple,
        which can read them. After your first yes in the app, Firebase contacts
        Google each time the app opens, even after you turn notifications off
        or sign out.
      </LegalP>
      <LegalP>
        <strong>The store apps.</strong> The iPhone app asks for the camera,
        microphone and photo library only when you take, pick or save a photo
        or video, and for notifications when you turn them on. The Android app
        asks only for notifications. Neither has location, contacts, tracking
        or ad code.
      </LegalP>

      <LegalH3 id="section-3g">3g. If you write to us</LegalH3>
      <LegalP>
        You need no account to email us a report, an intimate-image removal
        request or a child-safety tip. To recover an account we may ask for
        proof that it is yours. What you send stays in our support inbox, which
        the Vibe team reads, until one of us deletes it. We aim to delete
        recovery proof within 90 days after the request closes, though nothing
        does this automatically.
      </LegalP>
    </>
  );
}
