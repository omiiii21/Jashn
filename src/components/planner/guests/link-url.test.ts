import { describe, expect, it } from "vitest";

import { routes } from "@/contracts/routes";

import { absoluteLinkUrl } from "./link-url";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";

describe("absoluteLinkUrl", () => {
  it("puts the origin in front of the guest site's path", () => {
    expect(absoluteLinkUrl(routes.guestSite(TOKEN), "https://jashn.example.app")).toBe(`https://jashn.example.app/i/${TOKEN}`);
  });

  it("joins with one slash whatever the trailing and leading slashes", () => {
    expect(absoluteLinkUrl(`/i/${TOKEN}`, "http://localhost:3002/")).toBe(`http://localhost:3002/i/${TOKEN}`);
    expect(absoluteLinkUrl(`i/${TOKEN}`, "http://localhost:3002")).toBe(`http://localhost:3002/i/${TOKEN}`);
  });

  it("leaves a full URL as it is", () => {
    const full = `https://jashn.example.app/i/${TOKEN}`;
    expect(absoluteLinkUrl(full, "http://localhost:3002")).toBe(full);
  });
});
