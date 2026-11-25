import type { UploadSignResponse } from "@/contracts/api";
import type { CommandErrorBody } from "@/contracts/commands";
import type { SessionActor } from "@/contracts/domain";
import { fixtureServices } from "@/contracts/services";
import { isUuidShaped } from "@/db/ids";
import { getSignedInUser, isLiveAuth, loadMemberActor } from "@/server/auth/session";
import { GUARD_MESSAGES, errorResponse } from "@/server/authz/guard";
import { parseJsonObjectBody } from "@/server/commands/raw-json";
import { parseUploadSignRequest, signUploadForMember } from "@/server/storage/uploads";

/**
 * `POST /api/uploads/sign`: a signed upload URL for a couple photo (domain 3.2, 5.5;
 * architecture 3.6; D121). Members only: 401 when signed out (a guest link is never a
 * session, so it gets 401 here too), 403 for anyone who isn't an active member of the
 * body's wedding. The body is `UploadSignRequest`; the answer is `UploadSignResponse`.
 *
 * The wedding comes from the body, so this is the guard's `requireMemberForApi` with the
 * session read first: nothing from a signed-out caller is parsed. The raw body is checked
 * before `JSON.parse`, which would turn `1e6` into 1000000: a number in exponent form is
 * refused (M1, AT-5.6), as on the command route.
 *
 * The upload limits (`couple_photo`; JPEG, PNG or WebP; 1 byte to 10 MB) are checked here,
 * before either signer, so a GIF or an oversized photo is refused next to its field in
 * fixture mode too (AT-7.1); the fixture signer checks only the size. Only the four request
 * fields reach the signer.
 *
 * Fixture mode (no Supabase or database keys yet) answers from the fixture services, which
 * never sign a real URL. `services.signUpload` takes over this choice once it points at
 * `signUploadForMember`.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/** The request is four short fields. */
const MAX_BODY_CHARS = 4 * 1024;

const NO_STORE = { "Cache-Control": "no-store" };

function failure(error: CommandErrorBody): Response {
  return errorResponse({ ...error, field: error.field ?? null });
}

const forbidden = () => failure({ code: "forbidden", message: GUARD_MESSAGES.not_member });

export async function POST(request: Request) {
  let actor: SessionActor;
  let body: Record<string, unknown>;
  try {
    const user = await getSignedInUser();
    if (!user) return failure({ code: "unauthenticated", message: GUARD_MESSAGES.unauthenticated });

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_BODY_CHARS) {
      return failure({ code: "validation_failed", message: "too_long", field: null });
    }
    const parsed = parseJsonObjectBody(await request.text(), MAX_BODY_CHARS);
    if (!parsed.ok) return failure(parsed.error);
    body = parsed.body;

    const wedding_id = body.wedding_id;
    if (wedding_id === undefined || wedding_id === null || wedding_id === "") {
      return failure({ code: "validation_failed", message: "required", field: "wedding_id" });
    }
    // A malformed id is a 403, as in `requireMemberForApi`: no member row can match it.
    if (typeof wedding_id !== "string" || !isUuidShaped(wedding_id)) return forbidden();

    // The guard's one membership check (domain 6.2): an active `members` row of this wedding.
    const member = await loadMemberActor(user, wedding_id);
    if (!member || !member.role || !member.member_id || member.wedding_id !== wedding_id) return forbidden();
    actor = member;
  } catch {
    // A database outage answers the JSON error envelope, never an HTML 500.
    return failure({ code: "internal_error", message: "Something went wrong. Nothing was saved." });
  }

  // The upload limits, the same for both signers (AT-7.1).
  const checked = parseUploadSignRequest(body);
  if (!checked.ok) return failure(checked.error);

  const sign = isLiveAuth() ? signUploadForMember : fixtureServices.signUpload;
  let response: UploadSignResponse;
  try {
    response = await sign(actor, checked.request);
  } catch {
    return failure({ code: "internal_error", message: "The upload couldn't start. Try again." });
  }
  if (!response.ok) return failure(response.error);
  return Response.json(response, { headers: NO_STORE });
}
