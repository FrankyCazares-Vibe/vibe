import type { ChatMessage } from "@/lib/chat/types";
import type { RoomPoll } from "@/lib/chat/use-room-poll";

/**
 * Today's reaction flow (`ConversationView`'s `toggleReaction`), moved as
 * is: an optimistic count on the row, a raw fetch to
 * `POST | DELETE …/messages/<id>/react`, a rollback when the fetch throws.
 * One helper for the Lounge / event chat (`RoomThread`, text rows and
 * cards) and the Board (`BoardView`, a card post's picker and chips):
 * INT-ADJUDICATE-2 / INT-PRODUCER-CONSUMER-2.
 */
export async function toggleReactionOn(poll: Pick<RoomPoll, "replace">, roomId: string, m: ChatMessage, emoji: string): Promise<void> {
  const existing = m.reactions ?? [];
  const found = existing.find((r) => r.emoji === emoji);
  const willAdd = !found?.viewer_reacted;
  const apply = (row: ChatMessage, add: boolean) => {
    const list = row.reactions ?? [];
    const cur = list.find((r) => r.emoji === emoji);
    if (cur) {
      const next = list
        .map((r) => (r.emoji === emoji ? { ...r, count: add ? cur.count + 1 : cur.count - 1, viewer_reacted: add } : r))
        .filter((r) => r.count > 0);
      return { ...row, reactions: next };
    }
    return add ? { ...row, reactions: [...list, { emoji, count: 1, viewer_reacted: true }] } : row;
  };
  const optimistic = apply(m, willAdd);
  poll.replace(m.id, optimistic);
  try {
    await fetch(`/api/me/threads/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(m.id)}/react`, {
      method: willAdd ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
  } catch {
    poll.replace(m.id, apply(optimistic, !willAdd));
  }
}
