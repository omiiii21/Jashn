import type { CommandRouteRequest } from "@/contracts/api";
import { isCommandName, type CommandErrorBody } from "@/contracts/commands";
import { IDEMPOTENCY_KEY_HEADER, isValidIdempotencyKey } from "@/contracts/jobs";
import { httpStatusOf } from "@/contracts/services";
import { errorResponse, requireMemberForApi } from "@/server/authz/guard";
import { services } from "@/server/services";

/**
 * `POST /api/w/{wedding_id}/commands/{command}`: the generic command route for tests and
 * scripts (domain 3.0 transports). The body is the 3.0 envelope; `wedding_id` and
 * `command` come from the path (the body may repeat them, but must agree). The
 * idempotency key rides in the body or the `Idempotency-Key` header. `source` is `ui`
 * (the default) or `voice` with its `voice_turn_id`. Signed out: 401 for every command.
 *
 * The raw body is checked before `JSON.parse`, which would turn `4e4` into 40000: any
 * number in exponent form is refused (M1, AT-5.6).
 */
export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = 64 * 1024;

function invalid(message: string, field: string | null): Response {
  return errorResponse({ code: "validation_failed", message, field } satisfies CommandErrorBody);
}

/**
 * The key of the first number written in exponent form (`4e4`, `1.5E+3`) outside a string,
 * or undefined when there is none; null when it isn't under a named key. Inside JSON, the
 * only letters outside strings are `true`, `false` and `null`, so an `e` right after a
 * digit can only be an exponent.
 */
function exponentField(text: string): string | null | undefined {
  let inString = false;
  let stringStart = -1;
  let lastKey: string | null = null;
  let lastString: string | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === "\\") {
        index += 1;
      } else if (char === '"') {
        inString = false;
        lastString = text.slice(stringStart + 1, index);
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      stringStart = index;
    } else if (char === ":") {
      lastKey = lastString;
    } else if ((char === "e" || char === "E") && index > 0 && /[0-9.]/.test(text[index - 1])) {
      return lastKey;
    }
  }
  return undefined;
}

export async function POST(request: Request, context: { params: Promise<{ wedding_id: string; command: string }> }) {
  const { wedding_id, command } = await context.params;

  const member = await requireMemberForApi(wedding_id);
  if (!member.ok) return member.response;
  if (!isCommandName(command)) return errorResponse({ code: "not_found", message: "Unknown command.", field: "command" });

  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return invalid("too_long", null);
  const exponent = exponentField(text);
  if (exponent !== undefined) return invalid("not_integer", exponent);

  let body: unknown;
  try {
    body = text.trim() ? JSON.parse(text) : {};
  } catch {
    return invalid("unknown_value", null);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return invalid("unknown_value", null);
  const fields = body as Record<string, unknown>;

  if (fields.wedding_id !== undefined && fields.wedding_id !== null && fields.wedding_id !== wedding_id) {
    return invalid("unknown_value", "wedding_id");
  }
  if (fields.command !== undefined && fields.command !== command) return invalid("unknown_value", "command");

  const input = fields.input ?? {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid("unknown_value", "input");

  const headerKey = request.headers.get(IDEMPOTENCY_KEY_HEADER);
  const bodyKey = fields.idempotency_key ?? null;
  if (bodyKey !== null && typeof bodyKey !== "string") return invalid("unknown_value", "idempotency_key");
  if (bodyKey !== null && headerKey !== null && bodyKey !== headerKey) return invalid("unknown_value", "idempotency_key");
  const idempotency_key = bodyKey ?? headerKey;
  // I1: opaque printable text of 8 to 200 characters, never checked as a UUID.
  if (idempotency_key !== null && !isValidIdempotencyKey(idempotency_key)) return invalid("out_of_range", "idempotency_key");

  const source = fields.source ?? "ui";
  if (source !== "ui" && source !== "voice") return invalid("unknown_value", "source");
  const voice_turn_id = fields.voice_turn_id ?? null;
  if (voice_turn_id !== null && typeof voice_turn_id !== "string") return invalid("unknown_value", "voice_turn_id");

  const envelope = {
    wedding_id,
    command,
    input,
    idempotency_key,
    source,
    voice_turn_id: source === "voice" ? voice_turn_id : null,
  } as CommandRouteRequest;

  const response = await services.dispatch(member.actor, envelope);
  return Response.json(response, { status: httpStatusOf(response), headers: { "Cache-Control": "no-store" } });
}
