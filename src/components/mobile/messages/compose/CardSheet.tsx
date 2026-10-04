"use client";

import { useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";

import { DesktopDialog } from "@/components/desktop/messages/DesktopDialog";
import type { ChatMessage, CreateCardBody, CreateCardResponse } from "@/lib/chat/types";
import { useHideTabBar } from "@/lib/chat/use-hide-tabbar";
import { useLayerHistory } from "@/lib/chat/use-layer-history";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

import { clubGradient } from "../avatar";
import { toastSendFailure } from "../send-failure";
import { vaulContentStyle, vaulHandleStyle, vaulOverlayStyle } from "../sheet-styles";
import { useChatSurface } from "../surface";
import { FONT, palette, SERIF } from "../v2-tokens";

/**
 * The shared chrome of the three card sheets (wave-2 contract 11.7, 1.2
 * "The tray and the three sheets"; mockups W0_NewPoll / W0_NewSignup /
 * W0_ShareEvent, MK:9): a vaul drawer (`Drawer.NestedRoot`, because the
 * composer always sits inside `ClubSpace`'s or `EventChat`'s `Drawer.Root`
 * and a plain root closing inside another drawer runs vaul's unlock —
 * ConversationView's note, RsvpSheet's precedent; it is the same vaul root
 * with `nested`), `role="dialog"` and `aria-labelledby` from vaul's dialog
 * and its `Title` plus `aria-modal="true"` set here (Radix never writes it;
 * S3-CONTRACT-1), the 40×5 handle, the 25px/800 title, the
 * `<club> · <room>` line, the 44px close (`aria-label="Close"`), the 50px
 * gradient CTA (`aria-disabled` while the body is invalid, `Posting…` in
 * flight). `var(--paper)` surface, radius 28 on top. It calls
 * `useHideTabBar()`; focus lands in the sheet (vaul's trap) and goes back to
 * the composer's "+" (`returnFocusTo`) when it unmounts.
 * The sheet has its own history entry (`useLayerHistory`; S71 amendment 3,
 * A): Back closes the sheet and nothing under it; the X, the scrim, the drag
 * and a posted card step back off that entry.
 *
 * `useCardPost` is the ONE `POST …/cards` of the three sheets with 1.2's
 * refusal table: `content_blocked` → 1.2's line and the named field
 * outlined (S3-notes STOPPED 3); `invalid_card` → its sentence and the field
 * outlined; `board_officers_only` / `room_closed` / `not_found` → the
 * sentence and the sheet closes; `try_again` (503, from anywhere in the
 * POST) → the sentence, the sheet closes (`onClose`, the hook's own) and
 * the room's `reload()` (the row may exist; never a re-submit, N8);
 * `room_posters_only` (wave-3 contract 4c.4) → the same as `try_again`: the
 * reload brings the room's `post_line` to the composer at once; a 201 →
 * `onPosted(message)`. Any other failure (401, 403 "Not a member", 429, a
 * 5xx, the network) shows its mapped line and the sheet stays. While a
 * POST is in flight the sheet ignores the X, the scrim and the drag: a
 * sheet closed mid-request could be followed by a second one posting a
 * second card (S3-SECURITY-1). Back is the same: while posting, the history
 * steps forward onto the sheet's entry again and the sheet stays (`canPop`).
 *
 * On the desktop surface (wave-3 contract 6.3) `CardSheet` draws the same
 * title, room line, children and CTA in a `DesktopDialog` (440 wide, `busy`
 * while posting): no vaul root (there is no drawer above it on a laptop, and
 * a `Drawer.NestedRoot` without one throws), the CTA in the dialog's footer,
 * so it stays on screen while a long poll scrolls. The history entry, the
 * posting guard and the focus return to the "+" are the ones above; the
 * three sheets that mount it do not know which form they are in. The phone
 * surface is the drawer described above, unchanged.
 */

/** 1.2's exact toast line for a 422 `content_blocked` (the server's own `error`). */
export const CONTENT_BLOCKED_LINE = "That includes words that aren't allowed on Vibe";

export type CardPost = {
  posting: boolean;
  /** The input the last refusal named (`question`, `options.<n>`, `note`, `event_id`, …); null once edited again. */
  field: string | null;
  clearField: () => void;
  post: (body: CreateCardBody) => Promise<void>;
};

export function useCardPost(args: {
  roomId: string;
  /** The fallback line for a failure without a chat code (a network failure, a 5xx). */
  failure: string;
  onPosted: (message: ChatMessage) => void;
  onReload: () => void;
  onClose: () => void;
}): CardPost {
  const { roomId, failure, onPosted, onReload, onClose } = args;
  const [posting, setPosting] = useState(false);
  const [field, setField] = useState<string | null>(null);
  // Set once the sheet is on its way out (a 201, a closing refusal, a 503):
  // the form is never re-submitted from the same sheet (11.7, N8).
  const doneRef = useRef(false);

  const post = async (body: CreateCardBody) => {
    if (posting || doneRef.current) return;
    setPosting(true);
    setField(null);
    const r = await vibeRequest<CreateCardResponse>(`/api/me/threads/${encodeURIComponent(roomId)}/cards`, {
      json: body,
      failure,
      quiet: true,
    });
    if (doneRef.current) return;
    setPosting(false);
    if (r.ok) {
      doneRef.current = true;
      const message = r.data?.message;
      if (message && typeof message.id === "string") onPosted(message);
      else onReload();
      return;
    }
    switch (r.code) {
      case "content_blocked":
        toast({ message: r.error?.trim() || CONTENT_BLOCKED_LINE, tone: "error" });
        setField(r.field ?? null);
        return;
      case "invalid_card":
        toastSendFailure(r);
        setField(r.field ?? null);
        return;
      case "board_officers_only":
      case "room_closed":
      case "not_found":
        toastSendFailure(r);
        doneRef.current = true;
        onClose();
        return;
      // `room_posters_only`: the room's who-can-post rule changed under the
      // open sheet. The room is read again at once, as after a refused send
      // (`refusedSend`, club/helpers.ts): only that read brings the
      // `post_line` the composer under this sheet should turn into.
      case "room_posters_only":
      case "try_again":
        toastSendFailure(r);
        doneRef.current = true;
        onClose();
        onReload();
        return;
      default:
        toastSendFailure(r);
    }
  };

  return { posting, field, clearField: () => setField(null), post };
}

export type CardSheetProps = {
  /** `New poll` / `New sign-up` / `Share an event`. */
  title: string;
  /** `<club> · the Lounge` (sheet-rules `sheetRoomLine`). */
  roomLine: string;
  /** The club's id for the 14px dot on the room line; absent → no dot (S3-notes REQUESTS 1). */
  orgId?: string | null;
  night: boolean;
  /** `Post poll` / `Post sign-up` / `Share to …`. */
  cta: string;
  ctaDisabled: boolean;
  posting: boolean;
  onSubmit: () => void;
  onClose: () => void;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  /** The gap above the CTA: 14 (W0_NewSignup, W0_ShareEvent); the poll sheet's 10 (W0_NewPoll:156). */
  ctaGap?: number;
  children: React.ReactNode;
};

export function CardSheet({ title, roomLine, orgId, night, cta, ctaDisabled, posting, onSubmit, onClose, returnFocusTo, ctaGap = 14, children }: CardSheetProps) {
  useHideTabBar();
  const surface = useChatSurface();
  const t = palette(night);
  const disabled = ctaDisabled || posting;
  // No close while the POST is in flight (S3-SECURITY-1).
  const close = () => {
    if (!posting) onClose();
  };
  // Its own history entry while it is on screen (it is mounted only then).
  useLayerHistory(true, onClose, () => !posting);

  // Focus back to the composer's "+" once the sheet is gone (11.0), after
  // vaul has finished its own unmount work.
  useEffect(() => {
    // The "+" is mounted for the sheet's whole life, so it is read once here.
    const el = returnFocusTo?.current ?? null;
    return () => {
      if (el) window.setTimeout(() => el.focus(), 0);
    };
  }, [returnFocusTo]);

  if (surface === "desktop") {
    return (
      <DesktopDialog
        title={title}
        onClose={close}
        width={440}
        busy={posting}
        ownsHistory={false}
        footer={
          <button
            type="button"
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (!disabled) onSubmit();
            }}
            style={{
              height: 40,
              minWidth: 132,
              boxSizing: "border-box",
              padding: "0 20px",
              borderRadius: 999,
              border: "none",
              background: disabled ? "rgba(var(--scrim-rgb),0.07)" : t.coralButton.bg,
              color: disabled ? t.muted : t.coralButton.ink,
              fontFamily: "inherit",
              fontSize: 14.5,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: disabled ? "default" : "pointer",
            }}
          >
            {posting ? "Posting…" : cta}
          </button>
        }
      >
        {/* A column, as the sheet's body is: the three sheets' blocks stack and stretch the same way. */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: t.muted, whiteSpace: "nowrap", overflow: "hidden" }}>
            {orgId ? <span aria-hidden style={{ width: 14, height: 14, flexShrink: 0, borderRadius: 999, background: clubGradient(orgId) }} /> : null}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{roomLine}</span>
          </span>
          {children}
        </div>
      </DesktopDialog>
    );
  }

  return (
    <Drawer.NestedRoot
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay style={{ ...vaulOverlayStyle, zIndex: 1210, background: t.scrim }} />
        <Drawer.Content
          style={{
            ...vaulContentStyle,
            zIndex: 1211,
            background: t.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderTop: `1px solid ${t.fieldBorder}`,
            boxShadow: night ? "0 -18px 44px rgba(0,0,0,0.6)" : "0 -18px 44px rgba(20,20,22,0.18)",
            maxHeight: "92dvh",
            display: "flex",
            flexDirection: "column",
            fontFamily: FONT,
            color: t.ink,
          }}
          aria-modal="true"
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Drawer.Handle style={{ ...vaulHandleStyle, margin: "8px auto 7px", width: 40, height: 5, background: "rgba(var(--scrim-rgb),0.24)" }} />
          <div style={{ minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", boxSizing: "border-box", padding: "0 16px 20px", display: "flex", flexDirection: "column" }}>
            <header style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <Drawer.Title style={{ margin: 0, fontFamily: SERIF, fontWeight: 800, fontSize: 25, lineHeight: 1.05, letterSpacing: -0.5 }}>{title}</Drawer.Title>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: t.muted, whiteSpace: "nowrap", overflow: "hidden" }}>
                  {orgId ? <span aria-hidden style={{ width: 14, height: 14, flexShrink: 0, borderRadius: 999, background: clubGradient(orgId) }} /> : null}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{roomLine}</span>
                </span>
              </div>
              <button
                type="button"
                aria-label="Close"
                aria-disabled={posting || undefined}
                onClick={close}
                style={{ width: 44, height: 44, flexShrink: 0, marginRight: -6, boxSizing: "border-box", borderRadius: 999, border: "1px solid rgba(var(--scrim-rgb),0.10)", background: "rgba(var(--scrim-rgb),0.04)", color: t.secondary, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
              >
                <CloseX size={18} />
              </button>
            </header>
            {children}
            <button
              type="button"
              aria-disabled={disabled || undefined}
              onClick={() => {
                if (!disabled) onSubmit();
              }}
              style={{
                marginTop: ctaGap,
                height: 50,
                flexShrink: 0,
                boxSizing: "border-box",
                borderRadius: 999,
                border: "none",
                background: disabled ? "rgba(var(--scrim-rgb),0.07)" : t.coralButton.bg,
                color: disabled ? t.muted : t.coralButton.ink,
                fontFamily: "inherit",
                fontSize: 15.5,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: disabled ? "none" : "0 6px 16px rgba(255,92,53,0.28)",
                cursor: disabled ? "default" : "pointer",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {posting ? "Posting…" : cta}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.NestedRoot>
  );
}

// ── The field parts the three sheets share ───────────────────────────────────

export function CloseX({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

export function PlusIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MinusIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
      <path d="M5 12h14" />
    </svg>
  );
}

/** The field chrome: 48px, radius 14, the tint, 16px text (11.0's iOS zoom guard); a refused field is outlined in coral. */
export function fieldStyle(night: boolean, invalid: boolean): React.CSSProperties {
  const t = palette(night);
  return {
    height: 48,
    boxSizing: "border-box",
    padding: "0 14px",
    borderRadius: 14,
    border: invalid ? `1.5px solid ${t.coral}` : "1px solid rgba(var(--scrim-rgb),0.10)",
    background: "rgba(var(--scrim-rgb),0.04)",
    color: t.ink,
    fontFamily: "inherit",
    fontSize: 16,
    fontWeight: 600,
    outline: "none",
    width: "100%",
  };
}

/** A section label (`Question`, `Options`, `Title`, `Slots`, `Upcoming events`): 12.5px/700 secondary. */
export function FieldLabel({ id, htmlFor, night, children }: { id?: string; htmlFor?: string; night: boolean; children: React.ReactNode }) {
  const t = palette(night);
  const style: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, color: t.secondary };
  return htmlFor ? (
    <label id={id} htmlFor={htmlFor} style={style}>
      {children}
    </label>
  ) : (
    <span id={id} style={style}>
      {children}
    </span>
  );
}

/** The character counter `<n> / 200` with `aria-label="<n> of 200 characters"`. */
export function Counter({ n, max, night }: { n: number; max: number; night: boolean }) {
  const t = palette(night);
  return (
    <span aria-label={`${n} of ${max} characters`} style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: n > max ? t.coralText : t.muted }}>
      {n} / {max}
    </span>
  );
}

/** The 44px coral text button with a plus: `Add option` / `Add slot`. */
export function AddButton({ text, disabled, night, onClick }: { text: string; disabled: boolean; night: boolean; onClick: () => void }) {
  const t = palette(night);
  return (
    <button
      type="button"
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onClick();
      }}
      style={{ height: 44, padding: "0 4px 0 2px", border: "none", background: "transparent", color: disabled ? t.muted : t.coralText, fontFamily: "inherit", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, cursor: disabled ? "default" : "pointer", WebkitTapHighlightColor: "transparent" }}
    >
      <PlusIcon size={16} />
      {text}
    </button>
  );
}

/**
 * The 44×44 transparent X: `Remove <label>` / `Remove <slot>`. `into` is how far
 * it reaches into the sheet's 16px gutter (−8 as the mockup; the sign-up sheet
 * uses −12 so its slot input keeps ≥ 165px of text beside the stepper, VIS-S3-2).
 * The hit stays 44×44 (11.0).
 */
export function RemoveButton({ label, night, into = -8, onClick }: { label: string; night: boolean; into?: number; onClick: () => void }) {
  const t = palette(night);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{ width: 44, height: 44, flexShrink: 0, marginRight: into, borderRadius: 999, border: "none", background: "transparent", color: t.muted, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
    >
      <CloseX size={16} />
    </button>
  );
}

/** `role="switch"`: the word `Off` / `On` and the 52×32 track (the inverted chip colours when on). */
export function Switch({ on, labelledBy, describedBy, night, onToggle }: { on: boolean; labelledBy: string; describedBy?: string; night: boolean; onToggle: () => void }) {
  const t = palette(night);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={onToggle}
      style={{ height: 44, flexShrink: 0, padding: 0, border: "none", background: "transparent", fontFamily: "inherit", display: "flex", alignItems: "center", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: on ? t.ink : t.muted }}>{on ? "On" : "Off"}</span>
        <span
          aria-hidden
          style={{
            width: 52,
            height: 32,
            boxSizing: "border-box",
            padding: 2,
            borderRadius: 999,
            border: on ? `1px solid ${t.activeChip.bg}` : "1px solid rgba(var(--scrim-rgb),0.14)",
            background: on ? t.activeChip.bg : "rgba(var(--scrim-rgb),0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: on ? "flex-end" : "flex-start",
            transition: "background 160ms ease",
          }}
        >
          <span style={{ width: 26, height: 26, borderRadius: 999, background: on ? t.activeChip.ink : t.muted, color: t.activeChip.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {on ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            ) : null}
          </span>
        </span>
      </span>
    </button>
  );
}
