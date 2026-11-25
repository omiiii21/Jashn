import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { RENDER_TOKEN_TTL_S } from "@/contracts/jobs";

/**
 * The render page's token (export-and-recovery 1.6): HMAC-SHA-256 over the job id and an
 * expiry at most 5 minutes ahead, keyed with RENDER_TOKEN_SECRET and minted by the worker.
 * Form: `{expiry_unix_s}.{base64url hmac}`. A wrong, expired or missing token, or an unset
 * secret, fails the check, and the page answers the plain 404.
 */

/** Clock skew tolerated on the "at most 5 minutes ahead" bound. */
const SKEW_S = 5;

function secret(env: Readonly<Record<string, string | undefined>>): string | null {
  const value = env.RENDER_TOKEN_SECRET;
  return value && value.length >= 16 ? value : null;
}

function sign(key: string, job_id: string, expiry: number): Buffer {
  return createHmac("sha256", key).update(`render-card:${job_id}:${expiry}`).digest();
}

export class RenderTokenSecretMissing extends Error {
  constructor() {
    super("RENDER_TOKEN_SECRET is not set");
    this.name = "RenderTokenSecretMissing";
  }
}

/** Mints a token for `job_id`, valid for `ttl_s` seconds (at most 300). */
export function mintRenderToken(
  job_id: string,
  options: { now_ms?: number; ttl_s?: number; env?: Readonly<Record<string, string | undefined>> } = {},
): string {
  const key = secret(options.env ?? process.env);
  if (!key) throw new RenderTokenSecretMissing();
  const ttl = Math.min(Math.max(options.ttl_s ?? RENDER_TOKEN_TTL_S, 1), RENDER_TOKEN_TTL_S);
  const expiry = Math.floor((options.now_ms ?? Date.now()) / 1000) + ttl;
  return `${expiry}.${sign(key, job_id, expiry).toString("base64url")}`;
}

/** True only for a well-formed, unexpired token minted for this job id with the current secret. */
export function verifyRenderToken(
  job_id: string,
  token: string | null | undefined,
  options: { now_ms?: number; env?: Readonly<Record<string, string | undefined>> } = {},
): boolean {
  const key = secret(options.env ?? process.env);
  if (!key || typeof token !== "string") return false;
  const match = /^(\d{9,12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expiry = Number(match[1]);
  const now_s = Math.floor((options.now_ms ?? Date.now()) / 1000);
  if (expiry < now_s) return false;
  if (expiry > now_s + RENDER_TOKEN_TTL_S + SKEW_S) return false;
  const given = Buffer.from(match[2], "base64url");
  const expected = sign(key, job_id, expiry);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
