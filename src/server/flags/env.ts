import "server-only";

import { EXPORT_FAILURE_DRILL_ENV, INTERNAL_USER_EMAILS_ENV } from "@/contracts/flags";

/**
 * The Flagsmith environment variables (architecture 5.1, flagsmith 6.10), read lazily on each
 * call so a restarted dev server or a test's stubbed env is picked up. Values are never logged.
 * An empty string counts as unset.
 */

function read(name: string): string | null {
  const value = process.env[name];
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** The Development `ser.` key locally; the Production key on Vercel. */
export function flagsmithServerKey(): string | null {
  return read("FLAGSMITH_SERVER_KEY");
}

/** The HMAC key for identity keys (2.2). Never changed after the experiment starts. */
export function flagsmithIdSalt(): string | null {
  return read("FLAGSMITH_ID_SALT");
}

/** The team's real emails, lowercase, comma-separated (2.3). Personal data: never logged. */
export function internalUserEmails(): Set<string> {
  const raw = read(INTERNAL_USER_EMAILS_ENV);
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry !== ""),
  );
}

/** `EXPORT_FAILURE_DRILL`: a sample wedding id, used only when Flagsmith can't be read (3.6). */
export function exportFailureDrillEnv(): string | null {
  return read(EXPORT_FAILURE_DRILL_ENV);
}
