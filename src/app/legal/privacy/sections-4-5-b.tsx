import { LegalP, LegalTable, LegalUL } from "@/components/legal/LegalLayout";

import { Sec, SubH3 } from "./parts";

/** Privacy Policy section 5e (messages and the club-room table). Wording:
 *  privacy-policy-final.md. */
export function Section5e() {
  return (
    <>
      <SubH3 n="5e" />
      <LegalP>
        Vibe has direct chats, group chats and club rooms. The new club rooms
        and pinned messages are being switched on for a few clubs and accounts
        at a time, so you may not have them yet.
      </LegalP>
      <LegalUL bullets>
        <li>
          <strong>Direct and group chats.</strong> Everyone in the chat sees
          every message, photo, video, shared post and reaction. They also see
          who is in the chat, when the other side last read it and who is
          typing. Someone added later can read the whole history. A direct
          message from someone you are not connected with arrives as a request.
          (Connected means you follow each other.) The sender can see when you
          read it. In a group chat, a person you are connected with can add you
          with no request first. The others in that chat may be people you are
          not connected with.
        </li>
        <li>
          <strong>Pinned messages.</strong> In a direct or group chat, anyone
          who has accepted the chat can pin a message, yours included, for
          everyone in it, and can unpin it. Everyone in the chat who has pinned
          messages switched on sees them, including someone added later. Seeing,
          pinning and unpinning all need that switch. A person who does not have
          it yet cannot see a pin or unpin it, even on their own message. Vibe
          stores who pinned a message and when. People in the chat can see when
          a message was pinned, not who pinned it. The panel that shows pinned
          messages also has a &ldquo;Shared&rdquo; list: the photos, videos and
          posts shared in the chat. Club rooms have no pinned messages.
        </li>
        <li>
          <strong>Blocks.</strong> A block stops new messages both ways, and a
          direct chat disappears from both inboxes. No message or chat is
          deleted. The block does delete the follows between the two of you, and
          unblocking does not bring them back. In a shared group chat, old
          messages stay visible and neither of you can send or pin while the
          block lasts.
        </li>
      </LegalUL>

      <LegalP>
        <strong>Club rooms.</strong> Each club has these rooms:
      </LegalP>
      <LegalTable
        head={["Room", "Who can read it, and who can post"]}
        rows={[
          [
            "Board",
            "Every member reads. The club's owner and admins post. Any member can reply under a post",
          ],
          ["Lounge", "Every member reads and posts"],
          [
            "Officers",
            "The club's owner, its admins and people they add. Everyone in it can post",
          ],
          [
            "Extra rooms",
            "The club's owner and admins create them and choose who can open each one: every member, or only people they pick. They also choose who can post: everyone who can open it, only the owner and admins, or the owner, admins and people they pick",
          ],
          [
            "An event's chat",
            "Club members who marked Going or Interested, and the club's owner and admins. Its member list shows their names. The top of the chat shows the first few who marked Going (up to 8)",
          ],
        ]}
      />
      <LegalP>
        In the app, the &ldquo;only the owner and admins&rdquo; choice reads
        &ldquo;Only officers post&rdquo;. There, &ldquo;officers&rdquo; means
        the club&apos;s owner and admins, not its mods.
      </LegalP>
      <LegalP>
        New members can read a room&apos;s whole history. In a room where the
        club chose who can post, you can still read, vote in polls and take a
        sign-up spot. The room tells you the rule, for example &ldquo;Only
        officers post here.&rdquo; It does not list the people who were picked.
      </LegalP>
      <LegalUL bullets>
        <li>
          <strong>Polls and sign-ups.</strong> With names on, the room sees who
          picked what, and sign-ups always show names. In an
          &ldquo;Anonymous&rdquo; poll nobody in the club can see who voted.
          Your vote is still stored with your account, so the cofounder with
          direct access (<Sec to="1">section 1</Sec>) could see how you voted.
        </li>
        <li>
          <strong>Blocks in club rooms.</strong> You each see a blank in place
          of the other&apos;s messages. One exception: a post on the Board by
          the club&apos;s owner or an admin shows to every member, block or not.
          The blank only hides messages on screen, so treat what you write in a
          club room as readable by every member, including someone you blocked.
        </li>
        <li>
          <strong>Your chat settings.</strong> Other members of a chat may be
          able to tell when you last read it. They may also be able to tell
          whether you muted it, pinned it to the top of your list, hid it or
          cleared it.
        </li>
      </LegalUL>
    </>
  );
}
