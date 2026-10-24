import { LegalP, LegalTable } from "@/components/legal/LegalLayout";

import { PageLink, Sec, SectionH2 } from "./parts";
import { CompanyList } from "./sections-6-8-companies";
import { DeleteOneThing, NotDeletedYet } from "./sections-6-8-delete";

/** Privacy Policy sections 6 to 8. The wording is privacy-policy-final.md's:
 *  do not reword it here. The company list (section 6) and the two delete
 *  lists (section 8) sit in sibling files, sections-6-8-*.tsx. */
export function Sections6To8() {
  return (
    <>
      <SectionH2 n={6} />
      <LegalP>
        These outside companies hold your information or are contacted by your
        device. We use them to run Vibe. Each works under its own published
        terms and privacy policy. We have given none of them permission to sell
        your information or to use it for advertising. Vibe uses no advertising
        company. Each company your browser contacts sees your IP address and
        browser.
      </LegalP>
      <CompanyList />
      <LegalP>
        Not in use today: Stripe and the notification services (
        <Sec to="3f">section 3f</Sec>). Apple and Google will join this list as
        app stores when the apps are published (
        <Sec to="3h">section 3h</Sec>).
      </LegalP>
      <LegalP>
        These companies use providers of their own. Supabase and Resend, for
        example, run on Amazon&apos;s servers.
      </LegalP>
      <LegalP>
        <strong>Where.</strong> Our database and the files Supabase stores are
        in the United States (Ohio). We have not confirmed where each of the
        other companies keeps what it holds. Cloudflare, Vercel and Google also
        use servers around the world to deliver files quickly. Ask and we will
        tell you what we know.
      </LegalP>

      <SectionH2 n={7} />
      <LegalP>
        <strong>Cookies.</strong> The only cookies Vibe sets are the ones that
        keep you signed in. Our sign-in software, which is made by Supabase,
        sets them on connectvibe.app. They last up to 400 days and are
        refreshed as you use Vibe. There are no advertising or tracking
        cookies. A short notice on the signed-out pages of the website says
        so. When you close it, your browser remembers that, so it is not shown
        again. Nothing about that is sent to us.
      </LegalP>
      <LegalP>
        <strong>Kept in your browser.</strong> To load faster, Vibe keeps
        copies of some of your own information in your browser, such as your
        profile card, your own posts, follow list, recent searches and which of
        the clubs you run your Profile tab shows. They are cleared when you sign out or delete your account in that browser, and
        stay in your other browsers until you sign out there. Your theme, the
        email you just signed up with, the note that you closed the cookie
        notice and a few similar notes can stay until you clear your browser
        data for Vibe. Cloudflare&apos;s check that you
        are a person may keep its own data in your browser, inside its box and
        under Cloudflare&apos;s own address. Vibe cannot read it. The check
        sets no cookie under connectvibe.app.
      </LegalP>
      <LegalP>
        <strong>Sign out.</strong> Signing out in{" "}
        <PageLink href="/settings">Settings</PageLink> signs your account out
        on every device. Another device can stay signed in for about an hour
        more.
      </LegalP>
      <LegalP>
        <strong>Do Not Track.</strong> Vibe does not follow you from site to
        site. So it works the same whether or not your browser sends a
        &ldquo;Do Not Track&rdquo; or &ldquo;Global Privacy Control&rdquo;
        signal. We have put no advertising software in Vibe, and nothing that
        follows you to other sites. The companies in{" "}
        <Sec to="6">section 6</Sec> do see your IP address and browser when your
        device contacts them.
      </LegalP>

      <SectionH2 n={8} />
      <LegalP>
        The two words again: <strong>deleted</strong> means gone from
        Vibe&apos;s systems. <strong>Removed</strong> means hidden by the Vibe
        team or by a club, and still stored.
      </LegalP>
      <LegalP>
        Vibe does not delete things just because they are old. They stay until
        you, a club or we delete them. Three things are deleted on a schedule
        today: waitlist entries and any place on a club&apos;s link that was
        never tied to an account (<Sec to="11">section 11</Sec>), and the
        abuse counts, within three days (<Sec to="3d">section 3d</Sec>). The page-open
        tally and the use totals (<Sec to="3d">section 3d</Sec>) are not
        deleted either, and deleting an account does not take anything out of
        them. They hold day and week totals, with no account in them.
      </LegalP>
      <LegalTable
        head={["What", "Kept until"]}
        rows={[
          [
            "Who viewed a profile or post",
            "Either account or the post is deleted",
          ],
          [
            "Messages",
            "The sender deletes the message (a \u201cMessage deleted\u201d note stays in its place) or their account. In club rooms, also when the room, the event or the club is deleted, or the account that wrote the Board post above it",
          ],
          [
            "A pin on a message",
            "Someone in the chat unpins it, the message is deleted, or the Vibe team removes the message",
          ],
          [
            "An event's chat",
            "Deleted with the event. It closes to new messages 7 days after the event ends",
          ],
          [
            "RSVPs",
            "You take yours back, or the event, the club or your account is deleted. For an upcoming event, also when the club takes you out, when you leave the club and the event is marked \u201cMembers only\u201d, or when the club marks it \u201cMembers only\u201d while you are not a member",
          ],
          [
            "Event check-ins",
            "You remove yours, the club's owner or an officer takes it off or clears the event's check-ins, or the event, the club or your account is deleted. Leaving the club, or being taken out of it, does not remove them",
          ],
          [
            "Events",
            "An owner or officer cancels the event, or the club or the account that made it is deleted",
          ],
          [
            "Join requests and invites",
            "The club or your account is deleted",
          ],
          [
            "A title a club gave you",
            "An owner or officer changes or removes it, you leave or are taken out of the club, or the club or your account is deleted",
          ],
          [
            "A mute on a club's posts",
            "You unmute it, or the club or your account is deleted",
          ],
          [
            "A club removing you as a follower",
            "You join the club, or the club or your account is deleted",
          ],
        ]}
      />
      <DeleteOneThing />
      <NotDeletedYet />
      <LegalP>
        <strong>Backups.</strong> We keep no database backups, and our plan
        with Supabase, our database company, includes none. So we cannot bring
        back something you delete by mistake. And if the database were ever
        lost or damaged, we could not restore it: accounts, posts and messages
        would be gone. We cannot speak for short-lived copies our providers may
        keep inside their own systems.
      </LegalP>
    </>
  );
}
