import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyOpsBearer } from "./ops-bearer";

const TOKEN = "test-jobs-token-0123456789abcdef";

describe("verifyOpsBearer (EX-05)", () => {
  const saved = process.env.JOBS_API_TOKEN;
  beforeEach(() => {
    process.env.JOBS_API_TOKEN = TOKEN;
  });
  afterEach(() => {
    process.env.JOBS_API_TOKEN = saved;
  });

  it("accepts exactly Bearer and the token, the scheme in any case", async () => {
    expect(await verifyOpsBearer(`Bearer ${TOKEN}`)).toBe(true);
    expect(await verifyOpsBearer(`bearer ${TOKEN}`)).toBe(true);
  });

  it("refuses every variant EX-05 lists", async () => {
    for (const header of [
      null,
      "",
      `Basic ${TOKEN}`,
      "Bearer not-the-token",
      `Bearer  ${TOKEN}`,
      `Bearer ${TOKEN} `,
      ` Bearer ${TOKEN}`,
      `Bearer\t${TOKEN}`,
      "Bearer",
      "Bearer ",
      "Bearer jobs-token-old-value-that-was-rotated-out",
    ]) {
      expect(await verifyOpsBearer(header), JSON.stringify(header?.replace(TOKEN, "<token>"))).toBe(false);
    }
  });

  it("refuses everything when JOBS_API_TOKEN is unset", async () => {
    delete process.env.JOBS_API_TOKEN;
    expect(await verifyOpsBearer(`Bearer ${TOKEN}`)).toBe(false);
  });
});
