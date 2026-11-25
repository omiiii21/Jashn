/**
 * Test helpers shared by the `*.db.test.ts` files (D103, D120).
 *
 * Tests that apply seed state to a whole sample copy (they reset it to D0 with stand-in Auth
 * user ids) must never run against the shared Supabase database: `npm run test:db` loads
 * `.env.local`, and a reset there would wipe a lane's rehearsal copy or the demo copy.
 * Those files run only when `DATABASE_URL` points at a local Postgres.
 */
import postgres from "postgres";

/** True for a database URL on this machine (127.0.0.1, localhost or ::1). */
export function isLocalDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

/** `DATABASE_URL` when it is local, else undefined (so `describe.skipIf(!url)` skips). */
export function localDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  return isLocalDatabaseUrl(url) ? url : undefined;
}

/**
 * Takes turns on one sample copy. Vitest runs test files in parallel, so two files that seed,
 * reset or count rows on the same copy (`demo.db.test.ts` and `members.db.test.ts` both use
 * copy "a") would trample each other. Each holds this session-level advisory lock, on its own
 * connection, from its `beforeAll` to its `afterAll`. Returns the release.
 */
export async function lockSampleCopy(url: string, copy: string): Promise<() => Promise<void>> {
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const name = `jashn-db-test-copy:${copy}`;
  await sql`select pg_advisory_lock(hashtextextended(${name}, 0))`;
  return async () => {
    try {
      await sql`select pg_advisory_unlock(hashtextextended(${name}, 0))`;
    } finally {
      await sql.end();
    }
  };
}
