import { REFUSAL_SENTENCES, type RefusalCode } from "@/lib/chat/types";
import { type VibeFailure } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

/**
 * Club chat v1: a refusal is matched on its `code`, never on the status or
 * the sentence, and the line shown is the one the server sent ("Only
 * officers post here."). Null for any other failure, which keeps the line
 * vibeRequest mapped for it.
 */
export function chatRefusalLine(r: VibeFailure): string | null {
  if (!r.code || !Object.prototype.hasOwnProperty.call(REFUSAL_SENTENCES, r.code)) return null;
  return r.error?.trim() || REFUSAL_SENTENCES[r.code as RefusalCode];
}

/** The toast of a send that was refused (the requests themselves are quiet). */
export function toastSendFailure(r: VibeFailure) {
  const line = chatRefusalLine(r);
  toast({ message: line ?? r.message, tone: "error", action: line ? undefined : r.action });
}
