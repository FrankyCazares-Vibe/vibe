import type { ReactNode } from "react";

import { enforceSchoolEmailPage } from "@/lib/auth/campus-access";

export default async function SchoolEmailLayout({
  children,
}: {
  children: ReactNode;
}) {
  await enforceSchoolEmailPage();
  return children;
}
