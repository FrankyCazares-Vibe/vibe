import { LegalP, LegalTable, LegalUL } from "@/components/legal/LegalLayout";

import { Sec, SubH3 } from "./parts";

/** Privacy Policy section 5e (messages and the club-room table). Wording:
 *  privacy-policy-final.md. */
export function Section5e() {
  return (
    <>
      <SubH3 n="5e" />
      <LegalP>
        Vibe has direct chats, group chats and club rooms.
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
          everyone in it, and can unpin it. Everyone in the chat sees the pinned
          messages, including someone added later. Vibe stores who pinned a
          message and when. People in the chat can see when
          a message was pinned, not who pinned it. The panel that shows pinned
          messages also has a &ldquo;Shared&rdquo; list: the photos, videos and
          posts shared in the chat. Club rooms have no pinned messages.
        </li>
        <li>
          <strong>Blocks.</strong> A block stops new messages and new reactions
          both ways, and a
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
            "Every member reads. The club's owner and officers post. Any member can reply under a post. Its followers with a verified school email read the posts too, not the replies, shown as the club's. Not if the club turned that off, removed them as a follower or from the club, or its owner or an officer blocked them",
          ],
          ["Lounge", "Every member reads and posts"],
          [
            "Officers",
            "The club's owner, its officers and people they add. Everyone in it can post",
          ],
          [
            "Extra rooms",
            "The club's owner and officers create them and choose who can open each one: every member, or only people they pick. They also choose who can post: everyone who can open it, only the owner and officers, or the owner, officers and people they pick",
          ],
          [
            "An event's chat",
            "Club members who marked Going or Interested, and the club's owner and officers. Its member list shows their names. The top of the chat shows the first few who marked Going (up to 8)",
          ],
        ]}
      />
      <LegalP>
        In the app, the &ldquo;only the owner and officers&rdquo; choice reads
        &ldquo;Only officers post&rdquo;.
      </LegalP>
      <LegalP>
        New members can read a room&apos;s whole history. A follower who can
        read the Board also sees its earlier posts by the club&apos;s current
        owner and officers. An event marked &ldquo;Members only&rdquo; cannot
        be shared on the Board, and a follower never sees one there. In a room
        where the club chose who can post, you can still read, vote in polls
        and take a sign-up spot. The room tells you the rule, for example
        &ldquo;Only officers post here.&rdquo; It does not list the people who
        were picked.
      </LegalP>
      <LegalUL bullets>
        <li>
          <strong>Polls and sign-ups.</strong> With names on, the members who
          can open the room see who picked what, and sign-ups always show them
          the names. A follower reading the Board sees only the totals. In an
          &ldquo;Anonymous&rdquo; poll nobody in the club can see who voted.
          Your vote is still stored with your account, so the cofounder with
          direct access (<Sec to="1">section 1</Sec>) could see how you voted.
        </li>
        <li>
          <strong>Blocks in club rooms.</strong> You each see a blank in place
          of the other&apos;s messages. One exception: a post on the Board by
          the club&apos;s owner or an officer shows to every member, and to
          every follower who can read the Board, block or not. If the
          club&apos;s owner or an officer blocks a follower, that follower can no
          longer read the Board. The blank only hides messages on screen, so treat what you write in a
          club room as readable by every member, including someone you blocked.
        </li>
        <li>
          <strong>Deleted messages.</strong> When someone deletes a message
          they sent, everyone who can read that chat or room sees a grey
          &ldquo;Message deleted&rdquo; note in its place, with the
          sender&apos;s name and when it was sent. They may also be able to
          tell when it was deleted. On the Board the note reads
          &ldquo;Post deleted&rdquo;, and the replies under the post stay. A
          follower reading the Board sees nothing in its place.
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
