import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { FIXTURE_TARA_TOKEN } from "@/contracts/fixtures";
import { fixtureServices } from "@/contracts/services";

import { GuestInvitation } from "./GuestInvitation";

// The reply form reads the router; a static render has none.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined, replace: () => undefined }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
import { guestPhotoPath } from "./guest-wire";

/** AT-9.5 with a photo set: the page's image comes from the app's own origin, never Storage. */
describe("the guest page's couple photo", () => {
  it("points the image at the same-origin photo route, with no Storage URL anywhere", async () => {
    const SIGNED = "https://storage.example.invalid/object/sign/photos/couple.jpg?token=signed-secret-value";
    const fixture = await fixtureServices.guestInvitationView(FIXTURE_TARA_TOKEN);
    expect(fixture).not.toBeNull();
    const view = { ...fixture!, wedding: { ...fixture!.wedding, photo_url: SIGNED } };
    const html = renderToStaticMarkup(createElement(GuestInvitation, { token: FIXTURE_TARA_TOKEN, lang: "en", view, is_sample: true }));
    const path = guestPhotoPath(FIXTURE_TARA_TOKEN, view.revision);
    expect(path.startsWith("/api/i/")).toBe(true);
    expect(html).toContain(`src="${path.replace(/&/g, "&amp;")}"`);
    expect(html).not.toContain("storage.example.invalid");
    expect(html).not.toContain("signed-secret-value");
    // Every src and href on the page is relative to the app, or a map link opened with no referrer.
    for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      expect(url.startsWith("/") || url.startsWith("#") || /^https:\/\/(www\.)?google\.[a-z.]+\/maps|^https:\/\/maps\./.test(url), url).toBe(true);
    }
  });
});
