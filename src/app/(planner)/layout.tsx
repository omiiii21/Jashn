import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { routes } from "@/contracts/routes";
import { getSignedInUser } from "@/server/auth/session";

type PlannerLayoutProps = { children: ReactNode };

/**
 * Sends signed-out users to /login; nothing else (architecture 4.1). Membership of a wedding
 * is checked by each page (`requireMember`) and by the guard on every command and read.
 */
export default async function PlannerLayout({ children }: PlannerLayoutProps) {
  await connection();
  if (!(await getSignedInUser())) redirect(routes.login());
  return <>{children}</>;
}
