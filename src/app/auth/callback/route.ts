import { NextResponse } from "next/server";

import { POST_EMAIL_CONFIRM_PATH } from "@/lib/auth/email-confirm-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeSameOriginPath(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return null;
  }
  return next;
}

/**
 * PKCE email confirm / OAuth code exchange — Supabase redirects here with ?code=.
 */
export async function GET(request: Request) {
  const reqUrl = new URL(request.url);
  const code = reqUrl.searchParams.get("code");
  const nextParam = safeSameOriginPath(reqUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const path = nextParam ?? POST_EMAIL_CONFIRM_PATH;
      return NextResponse.redirect(new URL(path, reqUrl.origin).toString());
    }
  }

  return NextResponse.redirect(
    new URL("/auth/login?error=auth_callback", reqUrl.origin).toString(),
  );
}
