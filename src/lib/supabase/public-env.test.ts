import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * AT-9.8 and G8 at the source level: only `NEXT_PUBLIC_SUPABASE_URL` and
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` can reach the browser. The freeze-time search of the built
 * bundle stays the lead's (acceptance AT-9.8); this keeps the source honest on every run.
 */

const SRC = path.resolve(__dirname, "../..");
const PUBLIC_NAMES = new Set(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
/** Architecture 5.1: a `NEXT_PUBLIC_` name that server code alone reads (the flag drawer's label). */
const SERVER_READ_PUBLIC_NAMES = new Set(["NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID"]);
/** G8's server-only names: never behind a `NEXT_PUBLIC_` prefix. */
const SECRET_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "DATABASE_URL_SESSION",
  "JOBS_API_TOKEN",
  "SARVAM_API_KEY",
  "FLAGSMITH_SERVER_KEY",
  "FLAGSMITH_ORG_API_KEY",
  "FLAGSMITH_ID_SALT",
  "INTERNAL_USER_EMAILS",
  "RENDER_TOKEN_SECRET",
  "NUDGEBEE_EXPORT_WEBHOOK_URL",
  "SEED_PASSWORD",
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const files = sourceFiles(SRC).map((file) => ({ file: path.relative(SRC, file), text: readFileSync(file, "utf8") }));
const isClientModule = (text: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(text);

describe("public environment names (AT-9.8, G8)", () => {
  it("finds the client modules it checks", () => {
    expect(files.filter((entry) => isClientModule(entry.text)).map((entry) => entry.file)).toContain(
      path.join("components", "auth", "JoinForm.tsx"),
    );
  });

  it("lets client modules read only the two public Supabase names", () => {
    for (const { file, text } of files.filter((entry) => isClientModule(entry.text))) {
      const names = [...text.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((match) => match[1]);
      for (const name of names) expect(PUBLIC_NAMES.has(name), `${file} reads ${name}`).toBe(true);
      expect(text, `${file} imports server code`).not.toMatch(/from\s+["']@\/(server|db)\//);
      expect(text, `${file} imports the admin client`).not.toMatch(/lib\/supabase\/admin/);
    }
  });

  it("uses no other NEXT_PUBLIC_ name anywhere, and puts no secret behind the prefix", () => {
    for (const { file, text } of files) {
      for (const match of text.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
        const name = match[0];
        expect(PUBLIC_NAMES.has(name) || SERVER_READ_PUBLIC_NAMES.has(name), `${file} uses ${name}`).toBe(true);
        expect(SECRET_NAMES.some((secret) => name === `NEXT_PUBLIC_${secret}`), `${file} uses ${name}`).toBe(false);
      }
    }
  });
});
