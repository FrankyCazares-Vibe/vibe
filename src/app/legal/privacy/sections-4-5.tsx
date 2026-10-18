import { LegalP, LegalTable, LegalUL } from "@/components/legal/LegalLayout";

import { Sec, SectionH2 } from "./parts";
import { Sections5aTo5d } from "./sections-4-5-a";
import { Section5e } from "./sections-4-5-b";
import { Sections5fTo5g } from "./sections-4-5-c";
import { Section5h } from "./sections-4-5-d";
import { Section5i } from "./sections-4-5-e";

/** Privacy Policy sections 4 and 5. The wording is privacy-policy-final.md's:
 *  do not reword it here. Section 5's sub-sections 5a to 5i sit in the
 *  sections-4-5-*.tsx files next to this one. */
export function Sections4To5() {
  return (
    <>
      <SectionH2 n={4} />
      <LegalP>
        We use your information to run Vibe. That includes suggesting people and
        clubs to you, based on who you follow, your campus and your major. We
        use it to keep accounts secure, to review reports and act on them, to
        fix bugs, and to answer you. We also count things, so we can see in
        totals how Vibe is used.
      </LegalP>
      <LegalP>
        <strong>Emails.</strong> The automatic emails Vibe sends you are these
        eight: to confirm your account, reset your password, tell you which
        email your account signs in with, verify your school email, confirm a
        personal email you add, check once a year that you still have your
        school inbox, confirm your waitlist spot and send your access code. The
        third one can be sent when someone types your school email or your
        personal email into the Forgot password form and your account signs in
        with a different email. It goes only to the address that was typed, at
        most once per calendar day for that address. It shows the first
        character of your sign-in email and the part after the @ (for example
        g•••@gmail.com). The screen shows the same sentence whether or not the
        address belongs to an account. An account that is suspended or banned
        is not sent it. A person on
        the Vibe team may also write to you. They may answer you, write about a
        report, your account or a club you run, or tell you something you need
        to know. Examples are a security problem or a change to this policy.
        Vibe sends no bulk marketing email and no email about activity on your
        account.
      </LegalP>
      <LegalP>
        <strong>What we do not do.</strong> We do not:
      </LegalP>
      <LegalUL bullets>
        <li>sell your personal information to anyone;</li>
        <li>share it with advertisers;</li>
        <li>give it to other companies for their own marketing;</li>
        <li>
          give it to companies that buy and sell personal information (data
          brokers);
        </li>
        <li>
          use it to train AI models ourselves. <Sec to="6">Section 6</Sec> says
          what our AI coding assistant may see. We have not yet confirmed
          whether the company that makes it may use what it is shown to improve
          its AI models;
        </li>
        <li>track you across other companies&apos; apps or websites.</li>
      </LegalUL>
      <LegalP>
        One paid feature lets a person see who looked at them. With Vibe+, they
        see the names of the signed-in people who viewed their profile and
        posts. Vibe+ is not on sale yet. <Sec to="5d">Section 5d</Sec> says how
        an account can have it today.
      </LegalP>
      <LegalP>
        <strong>Our marketing.</strong> We do not use your name, photo or posts
        in our marketing unless you say yes first. The film on our front page
        was recorded on a test copy of Vibe with made-up accounts. The real
        people in it are the three cofounders and friends in a cofounder&apos;s
        own photos, and they agreed to appear.
      </LegalP>

      <SectionH2 n={5} />
      <LegalTable
        head={["What", "Who can see it"]}
        rows={[
          [
            "Your profile, and posts you made as yourself",
            "Anyone on the internet, signed in or not",
          ],
          [
            "The clubs you are in, each with your title and the month you joined it on Vibe",
            "Anyone on the internet, unless you hide that club or its title",
          ],
          [
            "A club's page and its 12 newest posts, with each author's name",
            "Anyone on the internet",
          ],
          ["Your comments and reposts", "Any signed-in account"],
          ["The people you follow and who follows you", "Any signed-in account"],
          ["Like, view and save totals on a post", "Any signed-in account"],
          ["Who liked a post", "Only the post's author"],
          ["Who saved a post", "No other user"],
          [
            "Who viewed a profile or post",
            "Any signed-in account sees the total. The names go only to the person viewed, and only with Vibe+",
          ],
          [
            "Your résumé",
            "Signed-in accounts with a verified school email, unless you hid it or one of you blocked the other",
          ],
          ["Your messages", "Everyone in that chat, including people added later"],
          [
            "The posts on a club's Board",
            <>
              The club&apos;s members. Also its followers with a verified school
              email, unless the club turned that off. Followers do not see the
              replies (<Sec to="5e">section 5e</Sec>)
            </>,
          ],
          [
            "A club's member list",
            "The club's members. For a club that anyone can join, any signed-in account also sees on the Map the members who show that club on their profile",
          ],
          [
            "A club's follower list, and who RSVP'd to its events",
            "The club's owner and admins. The people in an event's chat also see who is in it, and the first few who marked Going (up to 8)",
          ],
          [
            "Drafts, saved posts, your mute list, your personal calendar, the clubs you hid from your profile and your list of the clubs you follow",
            "Only you. A club's owner and admins still see that you follow it",
          ],
          [
            "Your sign-in email, school email and personal email",
            <>
              Only you, except your starter name (
              <Sec to="3a">section 3a</Sec>). A short form of your sign-in
              email can be emailed to your own school or personal inbox (
              <Sec to="4">section 4</Sec>)
            </>,
          ],
        ]}
      />
      <LegalP>
        The Vibe team and the cofounder with direct access can see more than
        this table shows. <Sec to="1">Sections 1</Sec> and{" "}
        <Sec to="5h">5h</Sec> say what.
      </LegalP>

      <Sections5aTo5d />
      <Section5e />
      <Sections5fTo5g />
      <Section5h />
      <Section5i />
    </>
  );
}
