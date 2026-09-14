"use client";

import { useCallback, useState } from "react";
import { Drawer } from "vaul";

import {
  UserRow,
  type FollowState,
  type ListUser,
} from "@/components/mobile/NetworkMobile";
import {
  PostAudienceList,
  type PostAudienceKind,
  type PostAudienceUser,
} from "@/components/posts/PostAudienceList";

/**
 * The phone's "Who saw this" / "Who saved this" sheet — Screen C (wave plan,
 * handoffs/2026-09-14-wave-plan-metrics-screens.md).
 *
 * A bottom drawer over the post viewer, mounted only while it is open (see
 * PostViewerMobile) so the owner-only fetch never fires for a sheet nobody
 * asked for. All of the data behaviour — the free/paid split, the day
 * grouping, "Show more", and the rule that a refused read never paints a 0 —
 * lives in <PostAudienceList>; this file is the chrome and the people row.
 *
 * Rows go through NetworkMobile's exported <UserRow>, so the avatar, the meta
 * line and the Connect / Following buttons are the same ones the Network tab
 * shows. Follow taps are kept here as an override map rather than pushed back
 * into the list: <PostAudienceList> owns the rows it fetched, and the tidiest
 * way for a caller to react to a tap in its own row is to re-render with a
 * different `renderRow`.
 *
 * LAYERS. This sheet and PostViewerMobile's full-screen drawer both portal to
 * <body>, so they are siblings in the root stacking context and z-index alone
 * decides which one the student sees: the viewer sits at 10000, so anything
 * lower opens invisibly *behind* it and reads as the tap doing nothing. These
 * numbers match SharePostSheet's, which opens from the same viewer and can
 * never be on screen at the same time as this one. Still below the toasts
 * (11600 static, 12000 ToastHost), so a refusal shows over an open sheet.
 */
const AUDIENCE_SHEET_OVERLAY_Z = 10400;
const AUDIENCE_SHEET_CONTENT_Z = 10401;

const TITLE: Record<PostAudienceKind, string> = {
  viewers: "Who saw this",
  savers: "Who saved this",
};

export function PostAudienceSheet({
  postId,
  kind,
  nested = false,
  onClose,
}: {
  postId: string;
  kind: PostAudienceKind;
  /** True when mounted inside an already-open vaul drawer (the post viewer).
   *  vaul's iOS body-scroll lock is a module-level global shared by every
   *  Drawer.Root, and without this flag closing this sheet hands the lock
   *  back while the viewer underneath is still full-screen — the page jumps
   *  behind it. See the Nesting note in SharePostSheet. */
  nested?: boolean;
  onClose: () => void;
}) {
  // Follow taps land here, keyed by user id, and are laid over the fetched
  // row on the way into <UserRow>. A refused follow rolls itself back by
  // calling this again with the previous state.
  const [followOverrides, setFollowOverrides] = useState<Record<string, FollowState>>({});

  const onStateChange = useCallback((id: string, next: FollowState) => {
    setFollowOverrides((prev) => ({ ...prev, [id]: next }));
  }, []);

  const renderRow = useCallback(
    (user: PostAudienceUser, key: string) => {
      // Field by field on purpose: the row carries the ledger's `viewed_on` /
      // `saved_at`, which is the sheet's business and not the people row's.
      const row: ListUser = {
        id: user.id,
        name: user.name,
        handle: user.handle,
        avatar_url: user.avatar_url,
        banner_gradient: user.banner_gradient,
        major: user.major,
        year: user.year,
        mutual_count: user.mutual_count,
        follow_state: followOverrides[user.id] ?? user.follow_state,
      };
      return <UserRow key={key} user={row} onStateChange={onStateChange} />;
    },
    [followOverrides, onStateChange],
  );

  return (
    <Drawer.Root
      open
      nested={nested}
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
            zIndex: AUDIENCE_SHEET_OVERLAY_Z,
          }}
        />
        <Drawer.Content
          aria-describedby={undefined}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: "80dvh",
            background: "#FAF7F2",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
            zIndex: AUDIENCE_SHEET_CONTENT_Z,
            outline: "none",
            display: "flex",
            flexDirection: "column",
          }}
        >
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
          <Drawer.Title
            style={{
              margin: 0,
              padding: "6px 18px 10px",
              fontFamily: "Fraunces, serif",
              fontSize: 17,
              fontWeight: 800,
              color: "#1C1C1E",
            }}
          >
            {TITLE[kind]}
          </Drawer.Title>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: "4px 16px 18px",
            }}
          >
            {/* Keyed so a different post — or the other question about the
                same post — is a fresh list rather than one holding the last
                answer's rows while its own load is still in flight. */}
            <PostAudienceList
              key={`${postId}:${kind}`}
              postId={postId}
              kind={kind}
              renderRow={renderRow}
            />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
