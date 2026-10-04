import {
  LegalH3,
  LegalOL,
  LegalP,
  LegalUL,
} from "@/components/legal/LegalLayout";

import { PageLink, Sec, SectionH2 } from "./parts";

/** Privacy Policy sections 4 and 5. The wording is privacy-policy-publish.md's
 *  (see page.tsx): do not reword it here. */
export function Sections4To5() {
  return (
    <>
      <SectionH2 n={4} />
      <LegalP>
        We use your information to run Vibe, including suggesting people and
        clubs from who you follow and your major. We use it to keep accounts
        secure, to review reports and act on them, to fix bugs, and to answer
        you. We email you only to confirm your account, reset your password,
        verify your school email, confirm your waitlist spot and send your
        access code. There is no marketing or activity email.
      </LegalP>
      <LegalP>
        We do not sell your personal information, share it with advertisers, or
        use it to train AI models.
      </LegalP>

      <SectionH2 n={5} />

      <LegalH3 id="section-5a">
        5a. Anyone on the internet, with no account
      </LegalH3>
      <LegalUL bullets>
        <li>
          <strong>Your profile page:</strong> everything on it that you have
          not hidden, such as your name, handle, bio, major and year, campus,
          photos, work experience, the verified badge, and your follower and
          following counts. Also your published posts that were not made as a
          club. Not shown: either email address, résumés or &ldquo;here
          for&rdquo; answers.
        </li>
        <li>
          <strong>Photos and videos:</strong> profile photos, covers, logos,
          and the photos and videos on posts and club pages open for anyone who
          has the exact link. For most photos the link keeps working.
        </li>
        <li>
          <strong>A post&apos;s share link:</strong> the page asks for sign-in,
          but its preview shows the author&apos;s name, up to 140 characters of
          the text, and the photo.
        </li>
        <li>
          <strong>Club pages:</strong> name, description, links, logo, banner,
          who can join, member count, and follower count once it reaches 5.
          Also the 12 newest posts with each author&apos;s name, handle and
          photo, even for clubs you must ask or be invited to join.
        </li>
        <li>
          <strong>Search engines and link previews:</strong> profile and club
          pages can appear in search results and in link previews. We cannot
          pull back those copies.
        </li>
      </LegalUL>
      <LegalP>
        Not public: your reposts, follower and following lists, chats, RSVP
        lists and member lists. A hidden club, or the profile of a suspended or
        banned account, looks like a page that does not exist. A block only
        works while the other person is signed in. Signed out, they still see
        your public profile and posts.
      </LegalP>

      <LegalH3 id="section-5b">
        5b. Every signed-in account, verified or not, at every campus
      </LegalH3>
      <LegalUL bullets>
        <li>
          Everything above, plus your comments and reposts, and the lists of
          who you follow and who follows you.
        </li>
        <li>
          Totals of likes, views and saves on each post. The author gets a
          notification naming each liker. Nobody else sees who liked, and
          nobody sees who saved.
        </li>
        <li>Club events, with Going and Interested totals.</li>
        <li>
          Search finds verified accounts that finished setting up, across both
          universities. The Map lists people by campus and major, and the
          members of a club that anyone can join.
        </li>
        <li>
          For any account: the day it was made, roughly when it was last
          active, when its handle last changed and its total profile views.
        </li>
      </LegalUL>

      <LegalH3 id="section-5c">5c. Résumés</LegalH3>
      <LegalP>
        Another person can open your résumé only if they are signed in with a
        verified school email, there is no block between you, you are not
        suspended or banned, and you have not hidden it. If you drew redaction
        bars, they get a copy with the bars made permanent, not the original.
        An outside link you give as a résumé or work logo loads from that site,
        which then sees the viewer&apos;s IP address.
      </LegalP>

      <LegalH3 id="section-5d">5d. Who viewed you</LegalH3>
      <LegalP>
        You see how many people viewed your profile and each of your posts.
        With Vibe+ you also see who and when: profile viewers for the last 90
        days, post viewers with no time limit. People on either side of a
        block, and people you muted, are left off the names but still counted.
        We can give Vibe+ to an account ourselves.
      </LegalP>

      <LegalH3 id="section-5e">5e. People in your chats</LegalH3>
      <LegalUL bullets>
        <li>
          <strong>Direct and group chats.</strong> Members see every message,
          photo, video, shared post and reaction, who is in the chat, when the
          other side last read it and who is typing. Someone added later can
          read the whole history. Anyone in the chat can pin a message for
          everyone in it, and we store who pinned it and when. A message from
          someone you are not connected with (you do not follow each other)
          arrives as a request, and the sender sees when you read it.
        </li>
        <li>
          <strong>Blocks.</strong> A block stops new messages both ways, and a
          one-to-one chat leaves both inboxes. Nothing is deleted. In a shared
          group chat, old messages stay visible and neither of you can send
          while the block lasts.
        </li>
        <li>
          <strong>Club chats.</strong> Each club has a Board and a Lounge for
          every member, an Officers room for the club owner, club admins and
          people they add, and any rooms they create. Each event has a chat for
          club members who marked Going or Interested and for the club&apos;s
          owners and admins, and its member list names them. New members can
          read a room&apos;s whole history.
        </li>
        <li>
          <strong>Polls and sign-ups.</strong> With names on, the room sees who
          picked what, and sign-ups always show names. In an
          &ldquo;Anonymous&rdquo; poll no member or officer can see who voted.
          The vote is still stored with your account, so the direct access in{" "}
          <Sec to="1">section 1</Sec> could.
        </li>
        <li>
          <strong>Blocks in club chats.</strong> You each see a blank in place
          of the other&apos;s messages. This only hides them on screen, so
          treat what you write in a club room as readable by every member,
          including someone you blocked.
        </li>
        <li>
          <strong>Your chat settings.</strong> Other members of a chat may be
          able to tell when you last read it and whether you muted, pinned, hid
          or cleared it.
        </li>
      </LegalUL>

      <LegalH3 id="section-5f">5f. Club owners, admins and mods</LegalH3>
      <LegalP>
        &ldquo;Officers&rdquo; means a club&apos;s owner, admins and mods.
      </LegalP>
      <LegalUL bullets>
        <li>
          <strong>Every member</strong> sees the club&apos;s member list: name,
          handle, photo, role and join date.
        </li>
        <li>
          <strong>Club owners and admins</strong> see the follower list with
          the date each person first followed, invites and their outcome, and
          who RSVP&apos;d to the club&apos;s events. They can remove a follower
          without that person being told, and delete any post made as the club.
        </li>
        <li>
          <strong>All officers</strong> see pending requests to join with your
          message, and a &ldquo;Removed before&rdquo; mark. They can remove a
          club chat message. It is then hidden from everyone but its author,
          not deleted, and we record who removed it.
        </li>
        <li>
          Officers are not shown email addresses or reports. If they try to
          remove a chat message that has an open report, the app tells them one
          is open.
        </li>
      </LegalUL>

      <LegalH3 id="section-5g">5g. Only you</LegalH3>
      <LegalP>
        Drafts, saved posts, personal calendar entries, your notifications,
        your mute list, Otto settings and reminders, your redaction bars, your
        hidden-sections list and your &ldquo;here for&rdquo; answers. The
        person you block gets no notification, but if they open your profile
        while signed in, Vibe tells them the account has restricted them.
      </LegalP>

      <LegalH3 id="section-5h">5h. What we at Vibe can see</LegalH3>
      <LegalP>
        Messages are not end-to-end encrypted (locked so that only the people
        in a chat can read them). The admin tools show a private message only
        when it was reported. The cofounder with direct access (
        <Sec to="1">section 1</Sec>) could open any message. We read private
        messages only:
      </LegalP>
      <LegalOL>
        <li>when one is reported to us;</li>
        <li>when you ask us to, for example for a copy of your data;</li>
        <li>
          when we have specific evidence that a conversation is being used for
          spam, threats, exploitation or another serious break of the{" "}
          <PageLink href="/legal/terms">Terms</PageLink>;
        </li>
        <li>when the law requires it.</li>
      </LegalOL>
      <LegalP>
        This is a rule we keep ourselves. No system enforces or records it.
      </LegalP>
      <LegalP>
        <strong>Reports.</strong> When you report something, we keep a copy of
        it as it was: its text, links to its media, and the owner&apos;s name
        and handle. The person reported is not told about the report or who
        filed it, though they may guess. People on the Vibe team decide
        reports, not software. We aim to look at each within 24 hours.
      </LegalP>
      <LegalP>
        <strong>Removed content.</strong> If the Vibe team removes your post,
        comment or message, you still see its text, marked as removed with the
        reason. A removed post&apos;s photo is taken offline for everyone, and
        the comments under it are hidden from everyone but their writers.
        Nobody else sees removed content, apart from the Vibe team.
      </LegalP>

      <LegalH3 id="section-5i">
        5i. Universities, emergencies and the law
      </LegalH3>
      <LegalP>
        Vibe sends nothing to IU or Purdue automatically. Emails to your school
        email are delivered by the university&apos;s mail system, which can see
        them.
      </LegalP>
      <LegalP>
        We hand over information when the law requires it, for example under a
        subpoena or court order. We may also go to the police, emergency
        services or the National Center for Missing &amp; Exploited Children
        (NCMEC) ourselves when we believe someone is in danger or a child is at
        risk.
      </LegalP>
      <LegalP>
        If Vibe is ever sold or merged, we aim to tell you before your
        information moves to a new owner.
      </LegalP>
    </>
  );
}
