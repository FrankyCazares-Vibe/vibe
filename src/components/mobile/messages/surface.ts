"use client";

import { createContext, useContext } from "react";

/**
 * Which surface a chat piece is drawn on
 * (handoffs/chat-redesign/wave-3-desktop/contract.md 3.1, section 6).
 *
 * Only the desktop Messages page provides `"desktop"`. The phone tree never
 * provides anything, so every phone screen reads the default and renders and
 * behaves exactly as before. A piece that must differ on a laptop (a sheet
 * that becomes a dialog, chips that wrap) reads `useChatSurface()` and
 * branches there; nothing is drilled through props.
 */
export type ChatSurface = "phone" | "desktop";

export const ChatSurfaceContext = createContext<ChatSurface>("phone");

export function useChatSurface(): ChatSurface {
  return useContext(ChatSurfaceContext);
}
