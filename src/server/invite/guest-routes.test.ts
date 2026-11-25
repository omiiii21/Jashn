import { describe, expect, it } from "vitest";
import { FIXTURE_TARA_TOKEN, fixtureGuestActor, fixtureIds, getDemoFixture } from "@/contracts/fixtures";
import { fixtureServices, type GuestTokenResolver } from "@/contracts/services";
import { seededId } from "@/db/ids";
import { createGuestRoutes, GUEST_NOT_FOUND_BODY, guestTokenHash, type GuestLimiter } from "./guest-routes";

const resolve: GuestTokenResolver = async (token) => (token === FIXTURE_TARA_TOKEN ? fixtureGuestActor("demo") : null);
const allowAll: GuestLimiter = async () => ({ allowed: true });

function routesWith(limit: GuestLimiter = allowAll) {
  return createGuestRoutes({ services: fixtureServices, resolve, limit });
}

const ids = fixtureIds("demo");
let keySeq = 0;
const freshKey = () => `test-key-${Date.now()}-${(keySeq += 1)}`;

function post(body: unknown): Request {
  return new Request("http://localhost/api/i/x/rsvp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const get = () => new Request("http://localhost/api/i/x/revision");

async function read(response: Response): Promise<{ status: number; text: string; json: Record<string, unknown> }> {
  const text = await response.text();
  return { status: response.status, text, json: JSON.parse(text) as Record<string, unknown> };
}

const receptionYes = (extra: Record<string, unknown> = {}) => ({
  guest_id: ids.tara_guest_id,
  event_id: ids.reception_event_id,
  rsvp_status: "attending",
  plus_ones: 0,
  ...extra,
});

const NOT_FOUND_TEXT = JSON.stringify(GUEST_NOT_FOUND_BODY);

describe("guest routes: one 404 for every bad token (AT-9.4)", () => {
  const routes = routesWith();
  const badTokens = [
    // Right format, unknown.
    `fixture-tara-h16-${"B".repeat(26)}`,
    // 42 characters.
    "A".repeat(42),
    "abc%2Fdef",
    "abc.def",
    "%",
    ".",
  ];

  for (const token of badTokens) {
    it(`answers the same body for ${JSON.stringify(token)}`, async () => {
      const revision = await read(await routes.revision(get(), token));
      const rsvp = await read(await routes.rsvp(post({ idempotency_key: freshKey(), responses: [receptionYes()] }), token));
      const dietary = await read(
        await routes.dietary(post({ idempotency_key: freshKey(), guest_id: ids.tara_guest_id, dietary_note: "Jain" }), token),
      );
      for (const answer of [revision, rsvp, dietary]) {
        expect(answer.status).toBe(404);
        expect(answer.text).toBe(NOT_FOUND_TEXT);
      }
    });
  }
});

describe("guest routes: revision (AT-4.1 records)", () => {
  it("answers { revision: 2 } and nothing else for Tara's link", async () => {
    const answer = await read(await routesWith().revision(get(), FIXTURE_TARA_TOKEN));
    expect(answer.status).toBe(200);
    expect(answer.json).toEqual({ revision: 2 });
  });
});

describe("guest routes: RSVP checks (AT-4.6)", () => {
  const routes = routesWith();
  const send = (body: unknown) => routes.rsvp(post(body), FIXTURE_TARA_TOKEN).then(read);

  it("refuses pending with 422 on the rsvp_status field", async () => {
    const answer = await send({ idempotency_key: freshKey(), responses: [receptionYes({ rsvp_status: "pending" })] });
    expect(answer.status).toBe(422);
    const error = answer.json.error as { code: string; field: string };
    expect(error.code).toBe("validation_failed");
    expect(error.field).toMatch(/rsvp_status$/);
  });

  it("hides an uninvited function (EVT-MEH) behind the same 404", async () => {
    const answer = await send({
      idempotency_key: freshKey(),
      responses: [receptionYes({ event_id: seededId("demo", "events", "EVT-MEH") })],
    });
    expect(answer.status).toBe(404);
    expect(answer.text).toBe(NOT_FOUND_TEXT);
  });

  it("hides another household's guest (Nikhil Jain, H13) behind the same 404", async () => {
    const nikhil = getDemoFixture("demo").guests.find((guest) => guest.full_name === "Nikhil Jain");
    expect(nikhil).toBeDefined();
    const answer = await send({ idempotency_key: freshKey(), responses: [receptionYes({ guest_id: nikhil?.guest_id })] });
    expect(answer.status).toBe(404);
    expect(answer.text).toBe(NOT_FOUND_TEXT);
  });

  it("hides another copy's ids (copy a) behind the same 404", async () => {
    const other = fixtureIds("a");
    const answer = await send({
      idempotency_key: freshKey(),
      responses: [{ guest_id: other.tara_guest_id, event_id: other.reception_event_id, rsvp_status: "attending", plus_ones: 0 }],
    });
    expect(answer.status).toBe(404);
    expect(answer.text).toBe(NOT_FOUND_TEXT);
  });

  it("refuses plus_ones above the invitation's limit", async () => {
    const answer = await send({ idempotency_key: freshKey(), responses: [receptionYes({ plus_ones: 1 })] });
    expect(answer.status).toBe(422);
    expect(answer.json.error).toEqual({ code: "plus_ones_exceeds_limit", message: "out_of_range", field: "responses.0.plus_ones" });
  });

  it("requires the idempotency key", async () => {
    const answer = await send({ responses: [receptionYes()] });
    expect(answer.status).toBe(422);
    expect(answer.json.error).toEqual({ code: "validation_failed", message: "required", field: "idempotency_key" });
  });

  it("refuses a short key", async () => {
    const answer = await send({ idempotency_key: "short", responses: [receptionYes()] });
    expect(answer.status).toBe(422);
    expect((answer.json.error as { field: string }).field).toBe("idempotency_key");
  });

  it("refuses 21 items", async () => {
    const answer = await send({ idempotency_key: freshKey(), responses: Array.from({ length: 21 }, () => receptionYes()) });
    expect(answer.status).toBe(422);
    expect((answer.json.error as { code: string }).code).toBe("validation_failed");
  });

  it("answers 422 for a body that isn't JSON", async () => {
    const answer = await send("not json");
    expect(answer.status).toBe(422);
    expect(answer.json.error).toEqual({ code: "validation_failed", message: "unknown_value", field: null });
  });

  it("answers 429 rate_limited with Retry-After when the limiter denies, before resolving the token", async () => {
    const keys: (string | null)[] = [];
    const deny: GuestLimiter = async (input) => {
      keys.push(input.token_hash);
      return { allowed: false, retry_after_s: 42 };
    };
    const limitedRoutes = routesWith(deny);
    for (const token of [FIXTURE_TARA_TOKEN, "unknown-token-value"]) {
      for (const response of [
        await limitedRoutes.rsvp(post({ idempotency_key: freshKey(), responses: [receptionYes()] }), token),
        await limitedRoutes.revision(get(), token),
      ]) {
        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("42");
        const answer = await read(response);
        expect((answer.json.error as { code: string }).code).toBe("rate_limited");
      }
    }
    // The key is the token's hash, never the token.
    expect(keys[0]).toBe(guestTokenHash(FIXTURE_TARA_TOKEN));
    expect(keys[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(keys.some((key) => key?.includes(FIXTURE_TARA_TOKEN))).toBe(false);
  });
});

describe("guest routes: replay (AT-4.3) and the response shape (AT-9.1)", () => {
  const routes = routesWith();

  it("answers applied, then replayed for the same key and body", async () => {
    const body = { idempotency_key: freshKey(), responses: [receptionYes()] };
    const first = await read(await routes.rsvp(post(body), FIXTURE_TARA_TOKEN));
    const second = await read(await routes.rsvp(post(body), FIXTURE_TARA_TOKEN));
    expect(first.status).toBe(200);
    expect(first.json.outcome).toBe("applied");
    expect(second.status).toBe(200);
    expect(second.json.outcome).toBe("replayed");
  });

  const ALLOWED = new Set([
    "ok",
    "outcome",
    "command",
    "result",
    // The guest view's allowlist (domain 4.6).
    "revision",
    "wedding",
    "bride_name",
    "groom_name",
    "city",
    "wedding_date",
    "heading_hi",
    "wording_en",
    "wording_hi",
    "blessing_line",
    "theme",
    "typeface",
    "layout",
    "photo_frame",
    "photo_url",
    "household",
    "name",
    "guests",
    "guest_id",
    "full_name",
    "dietary_note",
    "functions",
    "event_id",
    "event_kind",
    "title",
    "title_hi",
    "starts_at",
    "ends_at",
    "muhurat_at",
    "dress_code",
    "description",
    "venue",
    "place_name",
    "locality",
    "address",
    "map_url",
    "responses",
    "rsvp_status",
    "plus_ones",
    "max_plus_ones",
  ]);

  function keysOf(value: unknown, out: string[] = []): string[] {
    if (Array.isArray(value)) value.forEach((item) => keysOf(item, out));
    else if (value && typeof value === "object") {
      for (const [key, inner] of Object.entries(value)) {
        out.push(key);
        keysOf(inner, out);
      }
    }
    return out;
  }

  it("carries only the view's fields: no money, no version, no activity id, no warnings", async () => {
    const rsvp = await read(
      await routes.rsvp(post({ idempotency_key: freshKey(), responses: [receptionYes()] }), FIXTURE_TARA_TOKEN),
    );
    const dietary = await read(
      await routes.dietary(post({ idempotency_key: freshKey(), guest_id: ids.tara_guest_id, dietary_note: "Mushroom allergy" }), FIXTURE_TARA_TOKEN),
    );
    for (const answer of [rsvp, dietary]) {
      expect(answer.status).toBe(200);
      const keys = keysOf(answer.json);
      expect(keys.filter((key) => key.endsWith("_inr"))).toEqual([]);
      expect(keys.filter((key) => !ALLOWED.has(key))).toEqual([]);
      expect(answer.text).not.toContain("₹");
      const result = answer.json.result as { functions: { event_id: string }[]; household: { guests: { full_name: string }[] } };
      expect(result.functions.map((fn) => fn.event_id).sort()).toEqual([ids.reception_event_id, ids.sangeet_event_id].sort());
      expect(result.household.guests.map((guest) => guest.full_name)).toEqual(["Tara Bhat"]);
    }
  });
});

describe("guest routes: dietary (AT-4.9)", () => {
  const routes = routesWith();
  const send = (body: unknown) => routes.dietary(post(body), FIXTURE_TARA_TOKEN).then(read);

  it("hides another household's guest behind the same 404", async () => {
    const nikhil = getDemoFixture("demo").guests.find((guest) => guest.full_name === "Nikhil Jain");
    const answer = await send({ idempotency_key: freshKey(), guest_id: nikhil?.guest_id, dietary_note: "Jain" });
    expect(answer.status).toBe(404);
    expect(answer.text).toBe(NOT_FOUND_TEXT);
  });

  it("clears the note with null, and with an emptied field", async () => {
    for (const dietary_note of [null, "", "   "]) {
      const answer = await send({ idempotency_key: freshKey(), guest_id: ids.tara_guest_id, dietary_note });
      expect(answer.status).toBe(200);
      expect(answer.json.command).toBe("set_dietary");
    }
  });

  it("answers with the guest view as the result", async () => {
    const answer = await send({ idempotency_key: freshKey(), guest_id: ids.tara_guest_id, dietary_note: "Mushroom allergy" });
    expect(answer.status).toBe(200);
    expect((answer.json.result as { revision: number }).revision).toBe(2);
  });

  it("refuses a note over 200 characters", async () => {
    const answer = await send({ idempotency_key: freshKey(), guest_id: ids.tara_guest_id, dietary_note: "x".repeat(201) });
    expect(answer.status).toBe(422);
    expect(answer.json.error).toEqual({ code: "validation_failed", message: "too_long", field: "dietary_note" });
  });

  it("requires the idempotency key", async () => {
    const answer = await send({ guest_id: ids.tara_guest_id, dietary_note: "Jain" });
    expect(answer.status).toBe(422);
    expect((answer.json.error as { field: string }).field).toBe("idempotency_key");
  });
});

describe("guest routes: the same-origin couple photo (AT-9.5, G6)", () => {
  const SIGNED = "https://storage.example.invalid/object/sign/photos/couple.jpg?token=signed-secret-value";
  const withPhoto: typeof fixtureServices = {
    ...fixtureServices,
    async guestInvitationView(token) {
      const view = await fixtureServices.guestInvitationView(token);
      return view ? { ...view, wedding: { ...view.wedding, photo_url: SIGNED } } : null;
    },
  };
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const photoGet = () => new Request("http://localhost/api/i/x/photo?r=2");

  function photoRoutes(fetchImage: (url: string) => Promise<Response>, limit: GuestLimiter = allowAll, services = withPhoto) {
    return createGuestRoutes({ services, resolve, limit, fetchImage });
  }

  it("streams the image from the app's origin with the guest headers, never the signed URL", async () => {
    const asked: string[] = [];
    const routes = photoRoutes(async (url) => {
      asked.push(url);
      return new Response(jpeg, { headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length) } });
    });
    const response = await routes.photo(photoGet(), FIXTURE_TARA_TOKEN);
    expect(response.status).toBe(200);
    expect(asked).toEqual([SIGNED]);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpeg);
    for (const [, value] of response.headers) expect(value).not.toContain("signed-secret-value");
  });

  it("answers the page's 404 for a bad token, no photo, a failed fetch or a non-image", async () => {
    const image = async () => new Response(jpeg, { headers: { "Content-Type": "image/jpeg" } });
    const cases: Response[] = [
      await photoRoutes(image).photo(photoGet(), "unknown-token-value"),
      await photoRoutes(image, allowAll, fixtureServices).photo(photoGet(), FIXTURE_TARA_TOKEN),
      await photoRoutes(async () => new Response("nope", { status: 403, headers: { "Content-Type": "image/jpeg" } })).photo(photoGet(), FIXTURE_TARA_TOKEN),
      await photoRoutes(async () => new Response("<html>", { headers: { "Content-Type": "text/html" } })).photo(photoGet(), FIXTURE_TARA_TOKEN),
      await photoRoutes(async () => {
        throw new Error("network");
      }).photo(photoGet(), FIXTURE_TARA_TOKEN),
    ];
    for (const response of cases) {
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(NOT_FOUND_TEXT);
    }
  });

  it("counts on its own per-token budget, before reading the view", async () => {
    const seen: (string | null)[] = [];
    let fetched = 0;
    const deny: GuestLimiter = async (input) => {
      seen.push(input.token_hash);
      return { allowed: false, retry_after_s: 7 };
    };
    const response = await photoRoutes(async () => {
      fetched += 1;
      return new Response(jpeg, { headers: { "Content-Type": "image/jpeg" } });
    }, deny).photo(photoGet(), FIXTURE_TARA_TOKEN);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("7");
    expect(seen).toEqual([`photo:${guestTokenHash(FIXTURE_TARA_TOKEN)}`]);
    expect(fetched).toBe(0);
  });
});
