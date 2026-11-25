import { describe, expect, it } from "vitest";
import { FIXTURE_TARA_TOKEN, fixtureGuestActor, fixtureIds, getDemoFixture } from "@/contracts/fixtures";
import { fixtureServices, type GuestTokenResolver, type RateLimiter } from "@/contracts/services";
import { seededId } from "@/db/ids";
import { createGuestRoutes, GUEST_NOT_FOUND_BODY, guestRateKey } from "./guest-routes";

const resolve: GuestTokenResolver = async (token) => (token === FIXTURE_TARA_TOKEN ? fixtureGuestActor("demo") : null);
const allowAll: RateLimiter = async () => ({ allowed: true });

function routesWith(limit: RateLimiter = allowAll) {
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
    const keys: string[] = [];
    const deny: RateLimiter = async (key) => {
      keys.push(key);
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
    expect(keys[0]).toBe(guestRateKey(FIXTURE_TARA_TOKEN));
    expect(keys.some((key) => key.includes(FIXTURE_TARA_TOKEN))).toBe(false);
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
