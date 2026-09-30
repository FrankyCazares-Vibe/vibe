"use client";

import { Drawer } from "vaul";

import type { RoomKind } from "@/lib/chat/types";
import { useHideTabBar } from "@/lib/chat/use-hide-tabbar";

import { vaulOverlayStyle, visuallyHiddenStyle } from "../sheet-styles";
import { useNightTheme } from "../theme";
import { FONT, palette } from "../v2-tokens";

/**
 * The club space (handoffs/chat-redesign/wave-2-contracts.md 11.3; W2-S2) —
 * W0_Club, W0_Club_Light. Opened by a club row tap, `?channel=<id>` (2.3), or
 * underneath an event chat layer.
 *
 * W2-S2's first commit (13.1): the shell with the 11.3 props, so W2-S1's
 * `MessagesMobile` imports it from its first line. It renders the drawer
 * chrome of `ConversationView` (a `Drawer.Root direction="right"`, overlay
 * 1099 / content 1100), hides the tab bar through the counted
 * `useHideTabBar()` (SCREENS-H1; nothing comes "free" from the drawer), and
 * draws only the 11.3 skeleton: the header (52px + the safe area), the chips
 * row and three bars. The space read, Up next, the chips, the Board strip,
 * the room and the composer follow in the batch's later commits.
 *
 * `initialRoomKind === "event"` will mean: the space on its Lounge with
 * `EventChat` (11.6) mounted on top for `initialRoomId`.
 */
export type ClubSpaceProps = {
  orgHandle: string;
  initialRoomId: string | null;
  initialRoomKind: RoomKind | null;
  onClose: () => void;
};

const SKELETON_DISC = "rgba(var(--scrim-rgb),0.06)";
const SKELETON_BAR = "rgba(var(--scrim-rgb),0.08)";
const SKELETON_BAR_SOFT = "rgba(var(--scrim-rgb),0.05)";

export function ClubSpace({ orgHandle, initialRoomId, initialRoomKind, onClose }: ClubSpaceProps) {
  // Hooks first, always (react-hooks/rules-of-hooks): the tab bar count and
  // the theme.
  useHideTabBar();
  const night = useNightTheme();
  const t = palette(night);

  // Read in the later commits (the space read, the initial room, the event
  // chat layer); named here so the shell's props are the 11.3 props exactly.
  void orgHandle;
  void initialRoomId;
  void initialRoomKind;

  return (
    <Drawer.Root
      open
      direction="right"
      handleOnly
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay style={{ ...vaulOverlayStyle, zIndex: 1099 }} />
        <Drawer.Content
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            background: t.page,
            color: t.ink,
            display: "flex",
            flexDirection: "column",
            zIndex: 1100,
            outline: "none",
            fontFamily: FONT,
          }}
          aria-describedby={undefined}
        >
          <Drawer.Title style={visuallyHiddenStyle}>Club space</Drawer.Title>
          <ClubHeaderSkeleton night={night} onClose={onClose} />
          <ClubBodySkeleton />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/**
 * The 11.3 header, 52px + `env(safe-area-inset-top)`, while the space read is
 * out: Back (44px circle, `aria-label="Back to Messages"`, working), the 40px
 * avatar disc, the name and the `Your hat` line as bars, the right button's
 * disc. Mockup chrome from `W0_Club:15-27` (MK:0.2).
 */
function ClubHeaderSkeleton({ night, onClose }: { night: boolean; onClose: () => void }) {
  const t = palette(night);
  return (
    <header
      style={{
        flexShrink: 0,
        boxSizing: "border-box",
        height: "calc(52px + env(safe-area-inset-top, 0px))",
        padding: "calc(env(safe-area-inset-top, 0px) + 4px) 10px 0 10px",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <button
        type="button"
        aria-label="Back to Messages"
        onClick={onClose}
        style={{
          width: 44,
          height: 44,
          flexShrink: 0,
          boxSizing: "border-box",
          borderRadius: 999,
          border: night ? "1px solid rgba(255,255,255,0.10)" : `1px solid ${t.hairline}`,
          background: night ? "rgba(22,21,21,0.86)" : t.surface,
          color: t.secondary,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <span
        aria-hidden="true"
        style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 999, background: SKELETON_DISC }}
      />
      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ width: "55%", height: 18, borderRadius: 6, background: SKELETON_BAR }} />
        <div style={{ width: "40%", height: 11, borderRadius: 5, background: SKELETON_BAR_SOFT }} />
      </div>
      <span
        aria-hidden="true"
        style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 999, background: SKELETON_DISC }}
      />
    </header>
  );
}

/** The chips row (45px, three pills) and three bars, until the space read answers (11.3 States). */
function ClubBodySkeleton() {
  return (
    <div aria-hidden="true" style={{ flexGrow: 1, minWidth: 0 }}>
      <div style={{ height: 45, boxSizing: "border-box", padding: "5px 12px 4px", display: "flex", gap: 8 }}>
        {[88, 72, 84].map((w, i) => (
          <div key={i} style={{ width: w, height: 36, borderRadius: 999, background: SKELETON_DISC }} />
        ))}
      </div>
      <div style={{ padding: "8px 12px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: ["85%", "60%", "72%"][i],
              height: 14,
              borderRadius: 6,
              background: i === 1 ? SKELETON_BAR_SOFT : SKELETON_BAR,
            }}
          />
        ))}
      </div>
    </div>
  );
}
