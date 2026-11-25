import "server-only";

import { OPS_ERROR_HTTP_STATUS, OPS_RESPONSE_HEADERS, type OpsErrorBody, type OpsErrorCode } from "@/contracts/api";

/**
 * Responses for the ops routes (export-and-recovery 5.1): JSON, `Cache-Control: no-store`,
 * noindex, no CORS headers, and the strings rule (every scalar a string, nothing null).
 */

export const OPS_HEADERS: Record<string, string> = {
  ...OPS_RESPONSE_HEADERS,
  "X-Robots-Tag": "noindex",
};

export const OPS_ERROR_MESSAGES = {
  unauthenticated: "Missing or invalid bearer token.",
  not_found: "Export job not found.",
} as const;

export function opsJson(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...OPS_HEADERS, ...extra },
  });
}

export function opsError(
  code: OpsErrorCode,
  message: string,
  options: { field?: string; current?: Record<string, string>; headers?: Record<string, string> } = {},
): Response {
  const body: OpsErrorBody = {
    ok: false,
    error: { code, message, field: options.field ?? "", current: options.current ?? {} },
  };
  return opsJson(body, OPS_ERROR_HTTP_STATUS[code], options.headers);
}

export function opsUnauthenticated(): Response {
  return opsError("unauthenticated", OPS_ERROR_MESSAGES.unauthenticated);
}

export function opsNotFound(): Response {
  return opsError("not_found", OPS_ERROR_MESSAGES.not_found);
}
