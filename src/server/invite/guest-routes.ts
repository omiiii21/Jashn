import "server-only";

import { createHash } from "node:crypto";

import {
  COMMAND_ERROR_HTTP_STATUS,
  commandSchemas,
  idempotencyKeySchema,
  validationMessageFor,
  type CommandErrorCode,
  type CommandResponse,
} from "@/contracts/commands";
import type { GuestActor, GuestInvitationView } from "@/contracts/domain";
import { httpStatusOf, type GuestTokenResolver, type Services } from "@/contracts/services";
import { GUEST_NOT_FOUND_BODY as SHARED_NOT_FOUND, GUEST_RESPONSE_HEADERS, guestNotFoundResponse, isWellFormedToken } from "@/server/authz/guest-token";
import { clientIpFrom, rateLimitedResponse, type GuestRequestInput, type RateLimitDecision } from "@/server/authz/rate-limit";
import {
  copyGuestView,
  isGuestView,
  type GuestCommand,
  type GuestErrorBody,
  type GuestReplyBody,
} from "@/components/invite/guest/guest-wire";

/**
 * The guest routes (domain 3.4, 4.6; architecture 3.4): `/api/i/{token}/revision`, `/rsvp`
 * and `/dietary`. The household comes from the token in the path, never from a body,
 * header or cookie (G4). Every write goes through `services.dispatch` as the guest actor
 * with source `guest_link` (AGENTS 4): `dispatchCommand` needs a member session, so the
 * guest transport is this route, not a server action.
 *
 * Lane A's pieces throughout (D57): its token resolver, its single limiter (one call per
 * request, the per-IP ceiling and the per-token-hash limits), its one 404 body and its
 * guest headers. Dependencies are injected so the tests can bind fixtures and a fake
 * limiter; the one binding for the app is in `guest-deps.ts`.
 */

export type GuestLimiter = (input: GuestRequestInput) => Promise<RateLimitDecision>;

export type GuestRouteDeps = {
  services: Services;
  resolve: GuestTokenResolver;
  limit: GuestLimiter;
};

export type GuestRoutes = {
  revision(req: Request, token: string): Promise<Response>;
  rsvp(req: Request, token: string): Promise<Response>;
  dietary(req: Request, token: string): Promise<Response>;
};

/** The one body every bad token and every out-of-scope id gets: Lane A's (G5, R9, AT-9.4). */
export const GUEST_NOT_FOUND_BODY: GuestErrorBody = { ok: false, error: { ...SHARED_NOT_FOUND } };

const GUEST_INTERNAL_ERROR_BODY: GuestErrorBody = {
  ok: false,
  error: { code: "internal_error", message: "Something went wrong. Try again." },
};

/**
 * Dispatcher codes a guest never sees as such: each answers the same 404 (D35). A guest
 * link never gets 403, and never 401 on its own routes.
 */
const HIDDEN_CODES: ReadonlySet<CommandErrorCode> = new Set<CommandErrorCode>([
  "not_found",
  "forbidden",
  "approval_required",
  "not_invited",
  "unauthenticated",
  "invite_invalid",
]);

/** Hex SHA-256 of the raw token: the limiter key never holds the token (D57). */
function sha256hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * The limiter's token key: the token's hex SHA-256 (`GuestActor.token_hash`), null for a
 * malformed token. Computed before the token is resolved, so bad and good tokens are
 * limited alike and the limit is no oracle.
 */
export function guestTokenHash(token: string): string | null {
  return isWellFormedToken(token) ? sha256hex(token) : null;
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: GUEST_RESPONSE_HEADERS });
}

const notFound = () => guestNotFoundResponse();

function validationFailed(message: string, field: string | null): Response {
  const body: GuestErrorBody = { ok: false, error: { code: "validation_failed", message, field } };
  return json(body, 422);
}

/** One limiter call per request; a denial answers Lane A's 429 with Retry-After (D57, D108). */
async function limited(limit: GuestLimiter, req: Request, token: string, kind: "get" | "post"): Promise<Response | null> {
  const decision = await limit({ token_hash: guestTokenHash(token), ip: clientIpFrom(req.headers), kind });
  return decision.allowed ? null : rateLimitedResponse(decision.retry_after_s);
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The idempotency key check (I1); a missing key is `required`, as AT-4.6 expects. */
function keyProblem(value: unknown): Response | null {
  if (value === undefined || value === null) return validationFailed("required", "idempotency_key");
  const parsed = idempotencyKeySchema.safeParse(value);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  return validationFailed(issue ? validationMessageFor(issue) : "unknown_value", "idempotency_key");
}

function issueField(path: readonly PropertyKey[]): string | null {
  return path.length > 0 ? path.map(String).join(".") : null;
}

/**
 * Turns a dispatcher response into the guest body: errors are normalised (hidden codes
 * become the 404, and `current` and `prefill` are dropped), and a success keeps only
 * `ok`, `outcome`, `command` and an allowlist copy of the view (AT-9.1).
 */
export function toGuestBody<C extends GuestCommand>(
  response: CommandResponse<C>,
  view: GuestInvitationView | null,
): { status: number; body: GuestReplyBody<C> } {
  if (!response.ok) {
    const code = response.error.code;
    if (HIDDEN_CODES.has(code)) return { status: 404, body: GUEST_NOT_FOUND_BODY };
    if (code === "internal_error") return { status: 500, body: GUEST_INTERNAL_ERROR_BODY };
    const field = response.error.field ?? null;
    return {
      status: COMMAND_ERROR_HTTP_STATUS[code] ?? 500,
      body: { ok: false, error: { code, message: response.error.message, field } },
    };
  }
  if (!view) return { status: 404, body: GUEST_NOT_FOUND_BODY };
  return {
    status: httpStatusOf(response as CommandResponse),
    body: { ok: true, outcome: response.outcome, command: response.command, result: copyGuestView(view) },
  };
}

function guarded(handler: (req: Request, token: string) => Promise<Response>) {
  return async (req: Request, token: string): Promise<Response> => {
    try {
      return await handler(req, token);
    } catch (error) {
      // Never the token, the body or a URL: only the error's name.
      console.error(`[guest] route failed: ${error instanceof Error ? error.name : "error"}`);
      return json(GUEST_INTERNAL_ERROR_BODY, 500);
    }
  };
}

export function createGuestRoutes({ services, resolve, limit }: GuestRouteDeps): GuestRoutes {
  async function viewAfter(response: CommandResponse, token: string): Promise<GuestInvitationView | null> {
    if (!response.ok) return null;
    // submit_rsvp returns the refreshed view; set_dietary's result is untyped, so re-read.
    return isGuestView(response.result) ? response.result : services.guestInvitationView(token);
  }

  async function begin(req: Request, token: string): Promise<Response | { actor: GuestActor; body: Record<string, unknown>; key: string }> {
    const denied = await limited(limit, req, token, "post");
    if (denied) return denied;
    const actor = await resolve(token);
    if (!actor) return notFound();
    const body = await readJson(req);
    if (!body) return validationFailed("unknown_value", null);
    const problem = keyProblem(body.idempotency_key);
    if (problem) return problem;
    return { actor, body, key: body.idempotency_key as string };
  }

  return {
    revision: guarded(async (req, token) => {
      const denied = await limited(limit, req, token, "get");
      if (denied) return denied;
      const revision = await services.guestRevision(token);
      if (revision === null) return notFound();
      return json({ revision }, 200);
    }),

    rsvp: guarded(async (req, token) => {
      const started = await begin(req, token);
      if (started instanceof Response) return started;
      const { actor, body, key } = started;

      const parsed = commandSchemas.submit_rsvp.safeParse({ responses: body.responses });
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return validationFailed(issue ? validationMessageFor(issue) : "unknown_value", issue ? issueField(issue.path) : null);
      }

      // Scope pre-check (R2, R9): every pair must be one of this household's invitations.
      const view = await services.guestInvitationView(token);
      if (!view) return notFound();
      const responses = parsed.data.responses;
      for (const [index, item] of responses.entries()) {
        const fn = view.functions.find((entry) => entry.event_id === item.event_id);
        const invited = fn?.responses.find((entry) => entry.guest_id === item.guest_id);
        if (!invited || !actor.guest_ids.includes(item.guest_id)) return notFound();
        if ((item.plus_ones ?? 0) > invited.max_plus_ones) {
          const failure: GuestErrorBody = {
            ok: false,
            error: { code: "plus_ones_exceeds_limit", message: "out_of_range", field: `responses.${index}.plus_ones` },
          };
          return json(failure, 422);
        }
      }

      const response = await services.dispatch(actor, {
        wedding_id: actor.wedding_id,
        command: "submit_rsvp",
        input: { responses },
        idempotency_key: key,
        source: "guest_link",
      });
      const { status, body: out } = toGuestBody(response, await viewAfter(response, token));
      return json(out, status);
    }),

    dietary: guarded(async (req, token) => {
      const started = await begin(req, token);
      if (started instanceof Response) return started;
      const { actor, body, key } = started;

      // An emptied field clears the note: text(200) rejects "", so send null.
      const note = typeof body.dietary_note === "string" && body.dietary_note.trim() === "" ? null : body.dietary_note;
      const parsed = commandSchemas.set_dietary.safeParse({ guest_id: body.guest_id, dietary_note: note });
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return validationFailed(issue ? validationMessageFor(issue) : "unknown_value", issue ? issueField(issue.path) : null);
      }
      if (!actor.guest_ids.includes(parsed.data.guest_id)) return notFound();

      const response = await services.dispatch(actor, {
        wedding_id: actor.wedding_id,
        command: "set_dietary",
        input: parsed.data,
        idempotency_key: key,
        source: "guest_link",
      });
      const { status, body: out } = toGuestBody(response, await viewAfter(response, token));
      return json(out, status);
    }),
  };
}
