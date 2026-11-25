import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Reads .env.local the way Next does; variables already set in the shell win.
loadEnvConfig(process.cwd());

/**
 * Migrations use the session pooler (5432), never the 6543 transaction pooler and never the
 * IPv6-only direct host (architecture 7.1). drizzle-kit is limited to schema `app`; never
 * run `drizzle-kit push`.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["app"],
  dbCredentials: { url: process.env.DATABASE_URL_SESSION ?? "" },
  migrations: { schema: "app", table: "__drizzle_migrations" },
  strict: true,
  verbose: true,
});
