import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { NextRequest } from "next/server";

import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth/email-confirm-redirect";
import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Otto onboarding lives in `public/html/onboarding.html` as a static page, but
 * we serve it through the clean `/onboarding` URL (no `.html` in the address
 * bar). Auth checks happen here instead of in a layout file because Route
 * Handlers don't compose with `app/<segment>/layout.tsx`.
 *
 * `?replay=1` bypasses the "already complete" redirect so users can revisit
 * the flow after they've finished it; the static page reads the same param
 * and skips the API save so a replay doesn't overwrite their saved answers.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const replay = url.searchParams.get("replay") === "1";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.redirect(
      new URL("/auth/login?next=/onboarding", request.url),
      302,
    );
  }

  const { data: row } = await supabase
    .from("users")
    .select("school_verified, otto_answers")
    .eq("id", user.id)
    .maybeSingle();

  if (!row?.school_verified) {
    return Response.redirect(
      new URL("/auth/school-email", request.url),
      302,
    );
  }
  if (!replay && isOttoOnboardingComplete(row?.otto_answers)) {
    return Response.redirect(
      new URL(DEFAULT_POST_LOGIN_PATH, request.url),
      302,
    );
  }

  const htmlPath = join(
    process.cwd(),
    "public",
    "html",
    "onboarding.html",
  );
  const html = await readFile(htmlPath, "utf-8");
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
