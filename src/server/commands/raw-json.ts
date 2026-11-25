import "server-only";

import type { CommandErrorBody } from "@/contracts/commands";

/**
 * Reading a JSON request body the way the command routes need it (domain 3.0, M1, AT-5.6).
 * `JSON.parse` turns `4e4` into 40000, so the raw text is checked first and any number in
 * exponent form is refused with `validation_failed` / `not_integer`, naming its key.
 *
 * The same scan as the generic command route's (`/api/w/{wedding_id}/commands/{command}`);
 * that route can import this module instead of its own copy.
 */

/**
 * The key of the first number written in exponent form (`4e4`, `1.5E+3`) outside a string,
 * or undefined when there is none; null when it isn't under a named key. Inside JSON, the
 * only letters outside strings are `true`, `false` and `null`, so an `e` right after a
 * digit can only be an exponent.
 */
export function exponentField(text: string): string | null | undefined {
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

export type JsonObjectBody = { ok: true; body: Record<string, unknown> } | { ok: false; error: CommandErrorBody };

function invalid(message: string, field: string | null): JsonObjectBody {
  return { ok: false, error: { code: "validation_failed", message, field } };
}

/**
 * A request body that must be one JSON object: at most `max_chars` characters, no number in
 * exponent form, valid JSON, an object (not an array or a scalar). An empty body is `{}`.
 */
export function parseJsonObjectBody(text: string, max_chars: number): JsonObjectBody {
  if (text.length > max_chars) return invalid("too_long", null);
  const exponent = exponentField(text);
  if (exponent !== undefined) return invalid("not_integer", exponent);
  let body: unknown;
  try {
    body = text.trim() ? JSON.parse(text) : {};
  } catch {
    return invalid("unknown_value", null);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return invalid("unknown_value", null);
  return { ok: true, body: body as Record<string, unknown> };
}
