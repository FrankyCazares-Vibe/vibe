import { redirect } from "next/navigation";

import { choosePasswordHref, resolveChooseNext } from "@/lib/auth/choose-password-path";
import { passwordMissing, readPasswordFlag } from "@/lib/auth/password-needed";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { ChoosePasswordForm } from "./choose-password-form";

export const metadata = {
  title: "Choose your password · Vibe",
  description: "Your email is confirmed. Choose the password you will sign in with.",
};

/**
 * `/auth/choose-password` — "Choose your password" (pre-registration fix,
 * Oct 2026).
 *
 * The first confirmation of an address Vibe emailed removes any password
 * chosen before the inbox was proven, along with the starter name and the
 * Terms tick, and stamps `users.password_needed_at`
 * (`auth_hooks.first_confirm_drops_password`; see
 * src/lib/auth/password-needed.ts). The sign-up page and the login code box
 * set the password again right after the code. Everyone who confirmed some
 * other way (`/auth/confirm`, an old link, a reload after the code, the store
 * app) is sent here by `/auth/terms`, and the sign-up page and login box come
 * here with `?again=1` when their own save failed.
 *
 * One screen holds the password AND the Terms box, so the person who proved
 * the inbox chooses both. Then on to `?next=` (never this page or the Terms
 * page; see resolveChooseNext).
 *
 * It is never a change-password page: with no flag it forwards to `next`,
 * and with a password already stored it hands over to the Terms page, which
 * decides from there. Only when there is no password, or the check could not
 * tell, does the form show (setting a password from one's own session is
 * harmless), so a flapping check can never bounce someone between the two
 * pages: the Terms page sends here only on a definite "no password".
 *
 * Signed-in only, so no cookie notice; under `/auth`, so a new build never
 * reloads it mid-typing (src/lib/build/build-refresh.ts).
 */
export default async function ChoosePasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = resolveChooseNext(params.next);
  const again = params.again === "1";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(choosePasswordHref(next))}`);
  }

  // The flag column and the password check are service-role only; both
  // reads are scoped to the signed-in user's id, and both read any doubt as
  // "nothing owed" / "could not tell".
  const service = createSupabaseServiceClient();
  if (!(await readPasswordFlag(service, user.id))) {
    redirect(next);
  }
  if ((await passwordMissing(service, user.id)) === false) {
    redirect(`/auth/terms?next=${encodeURIComponent(next)}`);
  }

  // `userId` lets the form refuse to save once another tab has signed this
  // browser in to someone else (the session lives in shared cookies).
  return <ChoosePasswordForm userId={user.id} email={user.email ?? ""} next={next} again={again} />;
}
