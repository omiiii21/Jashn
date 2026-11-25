import { redirect } from "next/navigation";
import { connection } from "next/server";

import { homePathFor } from "@/server/auth/redirects";
import { getSession } from "@/server/auth/session";

/**
 * The app entry (architecture 4.1), moved from `/` so `/` can be the landing page:
 * signed out → /login; a member → their first wedding's home; signed in with no
 * wedding yet → /setup. The landing page's "Go to dashboard" links here.
 */
export default async function AppEntry() {
  await connection();
  redirect(homePathFor(await getSession()));
}
