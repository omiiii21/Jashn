/**
 * The database client (architecture 3.1, 7.1 traps 1 and 2; domain 0.1).
 *
 * - Runtime: `DATABASE_URL`, the 6543 transaction pooler, so prepared statements are off;
 *   pool max 5, idle 20 s, one client on `globalThis` in development.
 * - Migrations and the seed use `DATABASE_URL_SESSION` (5432) through `createDb`.
 * - int8 and numeric are parsed as JavaScript numbers. Every SQL aggregate is still cast to
 *   bigint (`sum(x)::bigint`), and read models assert safe integers.
 *
 * No `server-only` here: the seed (tsx) and Vitest import it. Browser code never does.
 */
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = PostgresJsDatabase<Schema>;
/** The transaction handle a command handler receives (`CommandHandlerContext.tx`). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Either a database or an open transaction: read models and helpers accept both. */
export type DbOrTx = Db | Tx;

export type CreateDbOptions = {
  /** Pool size; the runtime uses 5, scripts 1 or 2. */
  max?: number;
  idle_timeout_s?: number;
  /** Prepared statements; off for the 6543 transaction pooler. */
  prepare?: boolean;
};

/** Parses int8 (20) and numeric (1700) as numbers (domain 0.1). */
const numberTypes = {
  bigint: {
    to: 20,
    from: [20, 1700],
    serialize: (value: number | bigint | string) => String(value),
    parse: (value: string) => Number(value),
  },
};

export function createDb(url: string, options: CreateDbOptions = {}): { db: Db; client: postgres.Sql } {
  const client = postgres(url, {
    prepare: options.prepare ?? false,
    max: options.max ?? 5,
    idle_timeout: options.idle_timeout_s ?? 20,
    connect_timeout: 10,
    types: numberTypes,
    onnotice: () => {},
  });
  return { db: drizzle(client, { schema }), client };
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

type GlobalDb = { __jashnDb?: { url: string; db: Db; client: postgres.Sql } };

/** The runtime database (lazy singleton). Throws when `DATABASE_URL` is unset. */
export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const holder = globalThis as unknown as GlobalDb;
  if (!holder.__jashnDb || holder.__jashnDb.url !== url) {
    const { db, client } = createDb(url, { max: 5, idle_timeout_s: 20, prepare: false });
    holder.__jashnDb = { url, db, client };
  }
  return holder.__jashnDb.db;
}

export { schema };
