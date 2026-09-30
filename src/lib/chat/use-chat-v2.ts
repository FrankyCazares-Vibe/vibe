"use client";

import { useEffect, useState } from "react";

import type { FeaturesResponse } from "@/lib/chat/types";
import { vibeRequest } from "@/lib/feedback/request";

/**
 * How a phone screen learns the `chat_v2` flag
 * (handoffs/chat-redesign/wave-2-contracts.md 2.1; D5).
 *
 * On mount, one `GET /api/me/features` through `vibeRequest` (`no-store`,
 * quiet: no toast, the screen decides what to show). `null` until the answer
 * arrives; `true` only when the body is `{ ok: true, chat_v2: true }`; any
 * failure or any other body is `false`, logged once. Nothing is cached across
 * mounts: a second mount asks again (the answer is per person and changes
 * when a list changes). The switch and its lists are server-only env values,
 * so this request is the only way in.
 *
 * Fail closed: a screen that cannot learn the flag shows the old chat
 * (`MessagesMobile` renders today's list on `false`), never a blank page.
 */

let logged = false;

function isOn(body: FeaturesResponse | undefined): body is FeaturesResponse {
  return !!body && typeof body === "object" && body.ok === true && body.chat_v2 === true;
}

export function useChatV2(): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const r = await vibeRequest<FeaturesResponse>("/api/me/features", {
        cache: "no-store",
        quiet: true,
        failure: "Couldn't check your chat features.",
      });
      if (!live) return;
      const next = r.ok && isOn(r.data);
      if (!next && !logged) {
        logged = true;
        console.warn(
          "[chat_v2] off:",
          r.ok ? `body ${JSON.stringify(r.data)}` : `status ${r.status}${r.code ? ` ${r.code}` : ""}`,
        );
      }
      setOn(next);
    })();
    return () => {
      live = false;
    };
  }, []);

  return on;
}
