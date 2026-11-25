import { describe, expect, it } from "vitest";

import { homePathFor, loginPathWithNext, safeNextPath } from "./redirects";

const WEDDING = "0f9a2c1e-1111-4111-8111-111111111111";

describe("homePathFor (the root redirect)", () => {
  it("sends a signed-out visitor to /login", () => {
    expect(homePathFor(null)).toBe("/login");
  });

  it("sends a member to their wedding's home", () => {
    expect(homePathFor({ wedding_id: WEDDING })).toBe(`/w/${WEDDING}`);
  });

  it("sends a signed-in user with no wedding to /setup", () => {
    expect(homePathFor({ wedding_id: null })).toBe("/setup");
  });
});

describe("safeNextPath", () => {
  it("keeps a same-site path with its query", () => {
    expect(safeNextPath("/join/abc")).toBe("/join/abc");
    expect(safeNextPath(`/w/${WEDDING}/money?vendor_id=x`)).toBe(`/w/${WEDDING}/money?vendor_id=x`);
  });

  it.each([
    "https://evil.test/",
    "//evil.test",
    "/\\evil.test",
    "\\\\evil.test",
    "/.//evil.test",
    "/..//evil.test",
    "/a/..//evil.test",
    "/%2e//evil.test",
    "/%2e%2e//evil.test?x=1",
    "evil",
    "",
    "   ",
    "/login",
    "/signup?next=/w/x",
    "/ok\nSet-Cookie: x",
    `/${"a".repeat(600)}`,
  ])("drops %j", (value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it("drops anything that isn't a string", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(42)).toBeNull();
  });
});

describe("loginPathWithNext", () => {
  it("carries a safe next path", () => {
    expect(loginPathWithNext("/join/abc")).toBe("/login?next=%2Fjoin%2Fabc");
  });

  it("drops an unsafe one", () => {
    expect(loginPathWithNext("//evil.test")).toBe("/login");
    expect(loginPathWithNext(null)).toBe("/login");
  });
});
