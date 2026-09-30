/**
 * `snapshotCard` (handoffs/chat-redesign/wave-2-contracts.md 5.3): what a
 * report's message snapshot carries for a card, read with the service role
 * after `readTarget` proved the reporter can read the message on their own
 * client. No voter names, no ids of people; the snapshot never returns to
 * the reporter. `null` for a text message, a missing card row, or a
 * database without migration B.
 *
 * SIGNATURE STUB (W2-B2's first commit): answers null; the body is filled
 * by W2-B2.
 */

import "server-only";

import type { CardSnapshot } from "../types";

export async function snapshotCard(messageId: string): Promise<CardSnapshot | null> {
  // filled by W2-B2
  void messageId;
  return null;
}
