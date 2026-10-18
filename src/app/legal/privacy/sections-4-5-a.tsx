import { LegalP, LegalUL } from "@/components/legal/LegalLayout";

import { Sec, SubH3 } from "./parts";

/** Privacy Policy sections 5a to 5d. Wording: privacy-policy-final.md. */
export function Sections5aTo5d() {
  return (
    <>
      <SubH3 n="5a" />
      <LegalP>No account is needed to see these:</LegalP>
      <LegalUL bullets>
        <li>
          <strong>Your profile page:</strong> your name, handle, photos,
          tagline, location line, website link, interest tags, major and year,
          campus and the verified badge. It also shows three counts: your
          followers, the people you follow, and your connections (people you
          follow who follow you back). Your published posts that were not made
          as a club show too, including which one you pinned. So do your bio,
          experience, skills and &ldquo;Working on&rdquo;, unless you hid them
          (<Sec to="9">section 9</Sec>). It also lists the clubs you are in,
          each with any title the club gave you and the month you joined it on
          Vibe, unless you hid that club or the title. Your role in a club is
          not shown there. Not shown: either email address, résumés,
          &ldquo;here for&rdquo; answers, the clubs you hid or your list of the
          clubs you follow.
        </li>
        <li>
          <strong>Photos and videos:</strong> anyone who has the exact link can
          open a profile photo, a cover, a logo, or a photo or video on a post
          or club page. For most photos that link does not expire.
        </li>
        <li>
          <strong>A post&apos;s share link:</strong> you must sign in to open a
          post from its link, though a post you made as yourself also shows on
          your public profile. The preview that shows when the link is shared
          gives the author&apos;s name, up to 140 characters of the text, and
          the photo.
        </li>
        <li>
          <strong>Club pages:</strong> name, description, links, logo, banner,
          who can join, and the member and follower counts once each reaches 5.
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
        These need a signed-in account, or more (<Sec to="5b">5b</Sec> to{" "}
        <Sec to="5g">5g</Sec>): your reposts, follower and following lists,
        chats, RSVP lists and member lists. A club the Vibe team has hidden, or
        the profile of a suspended or banned account, looks like a page that
        does not exist.
      </LegalP>
      <LegalP>
        <strong>Blocks.</strong> A block only works while the other person is
        signed in. Signed out, they still see your public profile and posts.
        Vibe does not notify a person you block. If they open your profile while
        signed in, though, Vibe tells them this account has restricted them.
      </LegalP>

      <SubH3 n="5b" />
      <LegalP>
        This means every account, verified or not, at every campus.
      </LegalP>
      <LegalUL bullets>
        <li>
          Everything above, plus your comments and reposts, and the lists of the
          people you follow and who follows you.
        </li>
        <li>
          Totals of likes, views and saves on each post. The author gets a
          notification naming each liker. Vibe shows nobody else who liked, and
          shows nobody who saved.
        </li>
        <li>Club events, with Going and Interested totals.</li>
        <li>
          Search finds verified accounts that finished setting up, across both
          universities. The Map lists people by campus and major. For a club
          that anyone can join, it also lists the members who show that club on
          their profile.
        </li>
        <li>
          For any account: when it was made, when its handle last changed and
          its total profile views. No screen
          shows the department or school an account typed at set-up, but a
          signed-in account could still read it.
        </li>
      </LegalUL>

      <SubH3 n="5c" />
      <LegalP>
        Another person can open your résumé only if all four of these are true:
      </LegalP>
      <LegalUL bullets>
        <li>they are signed in with a verified school email;</li>
        <li>neither of you has blocked the other;</li>
        <li>you are not suspended or banned;</li>
        <li>you have not hidden it.</li>
      </LegalUL>
      <LegalP>
        If you drew redaction bars on a file, they get a copy with the bars made
        permanent, not the original. An outside link you drew bars on is not
        shown to others. Any other outside link you give as a résumé or work
        logo loads from that site, which then sees the viewer&apos;s IP address.
      </LegalP>

      <SubH3 n="5d" />
      <LegalP>
        Every signed-in view is recorded (<Sec to="3d">section 3d</Sec>). Any
        signed-in account sees how many views a profile or post has. With Vibe+,
        the person you looked at also sees who looked and when: profile viewers
        for the last 90 days, post viewers with no time limit. The names leave
        out anyone they blocked, anyone who blocked them and anyone they muted.
        Those views still count in the total.
      </LegalP>
      <LegalP>
        Vibe+ is not on sale yet. We can give it to an account ourselves, and
        any account that has it sees names today.
      </LegalP>
    </>
  );
}
