import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Old static landing CTAs and bookmarks still hit this path; real accounts start at Supabase sign up.
  // Prototype demo: /html/onboarding.html?legacy=1
  if (
    pathname === "/html/onboarding.html" &&
    searchParams.get("legacy") !== "1"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/signup";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
