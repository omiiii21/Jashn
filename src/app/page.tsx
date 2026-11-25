import { redirect } from "next/navigation";
import { connection } from "next/server";

import { homePathFor } from "@/server/auth/redirects";
import { getSession } from "@/server/auth/session";

/**
 * The root redirect (architecture 4.1): signed out → /login; a member → their first
 * wedding's home; signed in with no wedding yet → /setup.
 */
export default async function Home() {
  await connection();
  redirect(homePathFor(await getSession()));
}
