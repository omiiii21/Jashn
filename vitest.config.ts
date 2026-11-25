import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "vitest/config";

// Tests read .env.local the way Next does (decision D103).
loadEnvConfig(process.cwd());

const runDbTests = process.env.RUN_DB_TESTS === "1";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // server-only throws outside Next (architecture 7.1, trap 11).
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    // Database tests run only with RUN_DB_TESTS=1 (npm run test:db); CI never sees a database.
    exclude: ["node_modules/**", ".next/**", "e2e/**", ...(runDbTests ? [] : ["**/*.db.test.ts"])],
  },
});
