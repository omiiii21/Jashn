import type { VersionPollBody } from "@/contracts/api";
import { getDemoFixture } from "@/contracts/fixtures";
import { getDb } from "@/db/client";
import { SAMPLE_COPIES, isUuidShaped } from "@/db/ids";
import { getSignedInUser, isLiveAuth } from "@/server/auth/session";
import { GUARD_MESSAGES, errorResponse } from "@/server/authz/guard";
import { readMemberVersion } from "@/server/live/version";

/**
 * `GET /api/w/{wedding_id}/version`: the planner poll (architecture 2.4, domain 5.6).
 * `{"version": n}` for an active member; 401 when signed out, 403 for anyone else,
 * including a removed member. One query, and no Flagsmith call.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Fixture mode (no database or Supabase keys yet): the D0 version of the sample copy with this id. */
function fixtureVersion(wedding_id: string): number | null {
  for (const copy of SAMPLE_COPIES) {
    const fixture = getDemoFixture(copy);
    if (fixture.wedding.wedding_id === wedding_id) return fixture.wedding.version;
  }
  return null;
}

export async function GET(_request: Request, context: { params: Promise<{ wedding_id: string }> }) {
  const { wedding_id } = await context.params;
  const user = await getSignedInUser();
  if (!user) return errorResponse({ code: "unauthenticated", message: GUARD_MESSAGES.unauthenticated, field: null });

  const forbidden = () => errorResponse({ code: "forbidden", message: GUARD_MESSAGES.not_member, field: null });
  if (!isUuidShaped(wedding_id)) return forbidden();

  const version = isLiveAuth() ? await readMemberVersion(getDb(), user.user_id, wedding_id) : fixtureVersion(wedding_id);
  if (version === null) return forbidden();

  const body: VersionPollBody = { version };
  return Response.json(body, { headers: NO_STORE });
}
