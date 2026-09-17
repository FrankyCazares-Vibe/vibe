"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";

import { bindMentionPicker } from "@/lib/composer/helpers";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import { editedPostFrom, POST_MAX_CHARS, type EditedPost } from "@/lib/posts/edit";

/**
 * "Edit post" on the phone: a bottom sheet that rewords your own post's
 * caption. Plan `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md`
 * §8 E2.
 *
 * WHAT IT CHANGES. Only the words. It PATCHes `{content}` to
 * `/api/posts/[id]` (batch E1), which trims, caps at 2000 characters,
 * re-derives the #tags from the new text, notifies newly added @mentions
 * once, and returns the row with `edited_at` (stamped by the database, not
 * the client). A photo or video stays as it is; its caption may be cleared.
 * A text-only post may not be emptied. The sheet never sends tags.
 *
 * SAVING. Confirm, then paint: Save waits for the server ("Saving…"), and
 * only a 2xx carrying a usable post for THIS id calls `onSaved`, toasts
 * "Post updated" and closes. The id match ignores letter case: a /posts/<id>
 * link typed in capitals still loads and PATCHes (Postgres uuids), and the
 * route answers with the stored lowercase id. A refusal keeps the sheet and
 * the draft open with Save re-enabled; `vibeRequest` has already toasted why
 * (a 403 `terms_required` carries the Review Terms button). One PATCH per
 * post at a time, across sheets too: E1's mention-once check has no unique
 * index behind it, so a double tap, or a reopened sheet saving while an
 * earlier save is still out, must not send two at once (the later one waits).
 *
 * DISMISSING. Swipe-down, an overlay tap and Escape all close a clean sheet
 * and do nothing while the draft has changes or a save is in flight; Cancel
 * asks "Discard your changes?" first. While a save is in flight Cancel still
 * works, without asking (the change isn't being discarded, it's on its way),
 * so a stalled request on bad campus wifi never pins the sheet over the
 * viewer. That save still lands: `onSaved` patches the caller and "Post
 * updated" toasts, or `vibeRequest` toasts why it didn't.
 *
 * LAYERS AND NESTING. The same z-index pair and `nested` rule as
 * SharePostSheet (see its "Layers" and "Nesting" notes): 10400/10401 clears
 * the tab bar and PostViewerMobile's full-screen drawer (10000), stays under
 * the toasts, and `nested` must be true whenever this opens on top of
 * another open vaul drawer or iOS Safari loses that drawer's body lock.
 *
 * CLICKS. React bubbles events through portals, so a tap in this sheet also
 * reaches the React parents that mount it. The content stops click and
 * pointerdown there. The overlay does not: stopping its click also stops the
 * native click at document.body, and Radix closes a sheet on an outside tap
 * only once that click reaches the document, so a clean sheet could never be
 * dismissed from the scrim. Hosts guard instead: CampusMobile's FeedCard
 * ignores clicks whose target isn't inside the card, and the profile card,
 * the post viewer and the profile Post options sheet have no click handler
 * above this sheet.
 *
 * @MENTIONS. `bindMentionPicker` attaches the shared typeahead
 * (`public/html/_mentionPicker.js`). Its popover lives on <body>, outside
 * this sheet, and a modal vaul/Radix dialog sets `body { pointer-events:
 * none }`, which the popover inherits, so its suggestions couldn't be
 * tapped (critic W3 M5). The inline <style> below turns pointer events back
 * on for it, and a pointerdown on it doesn't count as a tap outside the
 * sheet. Known limit: the dialog's scroll lock still blocks scrolling the
 * suggestion list itself, so a long list is narrowed by typing more.
 *
 * NOT YET WIRED TO THE CARDS (critic W3 L9). Until wave 4 (CM, PM) passes
 * PostViewerMobile's `onEdited`, an edit made in the phone viewer updates the
 * viewer only: the feed or profile card underneath shows the old text until
 * the next load. Expected between the W3 and W4 deploys, not a bug.
 */

/** Same pair as SharePostSheet, and for the same reasons. */
const EDIT_SHEET_OVERLAY_Z = 10400;
const EDIT_SHEET_CONTENT_Z = 10401;

const SAVE_FAILURE = "Couldn't save your changes.";

/**
 * The PATCH still out for each post (lowercased id), so a second save of the
 * same post, from this sheet or a reopened one, waits for it instead of
 * racing it. `vibeRequest` never rejects, so a waiter never throws.
 */
const savesInFlight = new Map<string, Promise<unknown>>();

/**
 * What the sheet allows, from the draft alone. `dirty` compares trimmed text
 * because the route trims before saving, so trailing spaces are no change.
 */
function editSheetState(
  draft: string,
  initialContent: string,
  hasMedia: boolean,
  saving: boolean,
): { dirty: boolean; empty: boolean; canSave: boolean; dismissible: boolean } {
  const dirty = draft.trim() !== initialContent.trim();
  const empty = !hasMedia && draft.trim() === "";
  const tooLong = draft.length > POST_MAX_CHARS;
  return {
    dirty,
    empty,
    canSave: dirty && !empty && !tooLong && !saving,
    dismissible: !dirty && !saving,
  };
}

export function EditPostSheet({
  postId,
  initialContent,
  hasMedia,
  nested = false,
  onClose,
  onSaved,
}: {
  postId: string;
  /** The post's current text (`content ?? ""`). */
  initialContent: string;
  /** The post has a photo or video, so its caption may be cleared. */
  hasMedia: boolean;
  /** True when opened on top of an already-open vaul drawer (the viewer). */
  nested?: boolean;
  onClose: () => void;
  /** Fired once with the saved post, before the sheet closes. The caller
   *  patches its own copy (text, tags, `edited_at`) in place. */
  onSaved: (p: EditedPost) => void;
}) {
  const [draft, setDraft] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  // State lags a double tap by a render; the ref doesn't.
  const savingRef = useRef(false);
  // False once this sheet is gone (Cancel mid-save), so a save that lands
  // afterwards doesn't call `onClose` and shut a sheet opened since.
  const aliveRef = useRef(true);
  const { dirty, empty, canSave, dismissible } = editSheetState(
    draft,
    initialContent,
    hasMedia,
    saving,
  );

  // A callback ref, not a mount effect: the textarea sits inside vaul's
  // portal, which renders a beat after this component mounts, so a ref read
  // in a mount effect would still be null. Binding is idempotent.
  const bindTextarea = useCallback((el: HTMLTextAreaElement | null) => {
    if (el) bindMentionPicker(el);
  }, []);

  // Don't leave an open suggestion list floating after the sheet goes.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      (window as unknown as { vibeMentionPickerClose?: () => void })
        .vibeMentionPickerClose?.();
    };
  }, []);

  const cancel = () => {
    // Mid-save: close without asking; the save carries on (see DISMISSING).
    if (!savingRef.current && dirty && !window.confirm("Discard your changes?")) return;
    onClose();
  };

  const save = async () => {
    if (savingRef.current || !canSave) return;
    savingRef.current = true;
    setSaving(true);
    const key = postId.toLowerCase();
    const earlier = savesInFlight.get(key);
    const content = draft;
    const request = (async () => {
      if (earlier) await earlier;
      return vibeRequest<{ post?: unknown }>(`/api/posts/${postId}`, {
        method: "PATCH",
        json: { content },
        failure: SAVE_FAILURE,
      });
    })();
    savesInFlight.set(key, request);
    const r = await request;
    if (savesInFlight.get(key) === request) savesInFlight.delete(key);
    const saved = r.ok ? editedPostFrom(r.data.post) : null;
    if (saved && saved.id.toLowerCase() === key) {
      onSaved(saved);
      toast({ message: "Post updated", tone: "info" });
      if (aliveRef.current) onClose();
      return;
    }
    // A refusal was already toasted by vibeRequest. A 2xx without a usable
    // post for this id wasn't, and it still isn't a save we can show.
    if (r.ok) toast({ message: SAVE_FAILURE, tone: "error" });
    savingRef.current = false;
    setSaving(false);
  };

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <Drawer.Root
      open
      nested={nested}
      dismissible={dismissible}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.42)",
            zIndex: EDIT_SHEET_OVERLAY_Z,
          }}
        />
        <Drawer.Content
          aria-describedby={undefined}
          onClick={stop}
          onPointerDown={stop}
          // A tap on a mention suggestion is outside this sheet's DOM (the
          // popover is on <body>), and must not read as a tap outside.
          onPointerDownOutside={(e) => {
            const t = e.detail.originalEvent.target;
            if (t instanceof Element && t.closest(".vmp-popover")) e.preventDefault();
          }}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: "85dvh",
            background: "#FAF7F2",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
            zIndex: EDIT_SHEET_CONTENT_Z,
            outline: "none",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* See "@MENTIONS" above: the popover inherits the modal's
              body-wide pointer-events:none without this. */}
          <style>{".vmp-popover{pointer-events:auto}"}</style>
          <div
            aria-hidden
            style={{
              alignSelf: "center",
              margin: "10px auto 4px",
              width: 38,
              height: 4,
              borderRadius: 999,
              background: "rgba(28,28,30,0.18)",
            }}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              padding: "2px 8px 8px",
            }}
          >
            <button
              type="button"
              onClick={cancel}
              style={{
                ...topButtonStyle,
                justifySelf: "start",
                color: "#1C1C1E",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <Drawer.Title
              style={{
                margin: 0,
                fontFamily: "Fraunces, serif",
                fontSize: 16,
                fontWeight: 800,
                color: "#1C1C1E",
              }}
            >
              Edit post
            </Drawer.Title>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!canSave}
              aria-busy={saving || undefined}
              style={{
                ...topButtonStyle,
                justifySelf: "end",
                color: canSave || saving ? "#FF5C35" : "rgba(28,28,30,0.32)",
                fontWeight: 800,
                opacity: saving ? 0.6 : 1,
                cursor: canSave ? "pointer" : "default",
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: "12px 16px 16px",
              borderTop: "1px solid rgba(28,28,30,0.06)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <textarea
              ref={bindTextarea}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, POST_MAX_CHARS))}
              placeholder={hasMedia ? "Write a caption…" : "Say something…"}
              aria-label="Post text"
              readOnly={saving}
              // Selecting text by dragging shouldn't drag a clean sheet shut.
              data-vaul-no-drag
              style={{
                width: "100%",
                boxSizing: "border-box",
                minHeight: 160,
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid rgba(28,28,30,0.10)",
                background: "#fff",
                fontFamily: "DM Sans, sans-serif",
                // 16px keeps iOS Safari from zooming in on focus.
                fontSize: 16,
                lineHeight: 1.5,
                color: "#1C1C1E",
                outline: "none",
                resize: "none",
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                fontFamily: "DM Sans, sans-serif",
                fontSize: 12,
                lineHeight: 1.4,
              }}
            >
              <div
                aria-live="polite"
                style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}
              >
                {hasMedia ? (
                  <span style={{ color: "#8A8580" }}>
                    You can change the words. The photo or video stays.
                  </span>
                ) : null}
                {empty ? (
                  <span style={{ color: "#B83A1A", fontWeight: 600 }}>
                    Your post can&apos;t be empty.
                  </span>
                ) : null}
              </div>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#8A8580", flexShrink: 0 }}>
                {draft.length}/{POST_MAX_CHARS}
              </span>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/** Cancel and Save share a shape; color, weight and cursor vary per button.
 *  44px tall at least, the phone tap-target floor. */
const topButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 64,
  minHeight: 44,
  padding: "10px 10px",
  border: "none",
  background: "transparent",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 15,
  WebkitTapHighlightColor: "transparent",
};
