import { describe, expect, it } from "vitest";
import { mintRenderToken, RenderTokenSecretMissing, verifyRenderToken } from "./render-token";

// EX-18, token part: a bad or expired token gets the plain 404 (export-and-recovery 1.6).
const env = { RENDER_TOKEN_SECRET: "test-secret-for-render-tokens-0123456789" };
const NOW = Date.UTC(2026, 10, 25, 8, 0, 0);

describe("render token", () => {
  it("verifies a token minted for the same job", () => {
    const token = mintRenderToken("probe", { now_ms: NOW, env });
    expect(verifyRenderToken("probe", token, { now_ms: NOW, env })).toBe(true);
    expect(verifyRenderToken("probe", token, { now_ms: NOW + 299_000, env })).toBe(true);
  });

  it("refuses another job id, an expired token and a tampered one", () => {
    const token = mintRenderToken("probe", { now_ms: NOW, env });
    expect(verifyRenderToken("5b1e0c2a-7d3f-4c1e-9a52-0f6c2d8e4b17", token, { now_ms: NOW, env })).toBe(false);
    expect(verifyRenderToken("probe", token, { now_ms: NOW + 301_000, env })).toBe(false);
    const [expiry, mac] = token.split(".");
    const flipped = `${expiry}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`;
    expect(verifyRenderToken("probe", flipped, { now_ms: NOW, env })).toBe(false);
    expect(verifyRenderToken("probe", `${Number(expiry) + 1}.${mac}`, { now_ms: NOW, env })).toBe(false);
  });

  it("refuses a token whose expiry is more than 5 minutes ahead", () => {
    const farFuture = mintRenderToken("probe", { now_ms: NOW + 3_600_000, env });
    expect(verifyRenderToken("probe", farFuture, { now_ms: NOW, env })).toBe(false);
  });

  it("caps the lifetime at 5 minutes", () => {
    const token = mintRenderToken("probe", { now_ms: NOW, env, ttl_s: 3_600 });
    expect(Number(token.split(".")[0])).toBe(NOW / 1000 + 300);
  });

  it("refuses missing and malformed tokens, and anything when the secret is unset", () => {
    for (const bad of [null, undefined, "", "abc", "123.abc", "1764057600"]) {
      expect(verifyRenderToken("probe", bad, { now_ms: NOW, env })).toBe(false);
    }
    const token = mintRenderToken("probe", { now_ms: NOW, env });
    expect(verifyRenderToken("probe", token, { now_ms: NOW, env: {} })).toBe(false);
    expect(verifyRenderToken("probe", token, { now_ms: NOW, env: { RENDER_TOKEN_SECRET: "other-secret-0123456789abc" } })).toBe(false);
    expect(() => mintRenderToken("probe", { env: {} })).toThrow(RenderTokenSecretMissing);
  });
});
