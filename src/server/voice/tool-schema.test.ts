import { describe, expect, it } from "vitest";

import {
  ACTION_FIELDS,
  PROPOSE_ACTIONS_PARAMETERS,
  PROPOSE_ACTIONS_TOOL,
  parseToolArguments,
  proposeActionsSchema,
} from "./tool-schema";
import { ASK_KINDS, WRITE_KINDS } from "./types";

// voice.md 2.7
const M01 = {
  intent: "act",
  reply_language: "en",
  missing_fields: [],
  reply: "Shall I save both?",
  actions: [
    {
      kind: "record_commitment",
      vendor_id: "VEN-CAT",
      pricing: "per_unit",
      unit: "plate",
      unit_price_inr: 800,
      quantity: 250,
      heard: [
        { field: "unit_price_inr", phrase: "eight hundred per person" },
        { field: "quantity", phrase: "250 people" },
      ],
    },
    {
      kind: "record_payment",
      vendor_id: "VEN-CAT",
      amount_inr: 50000,
      payment_kind: "advance",
      heard: [
        { field: "amount_inr", phrase: "fifty-thousand" },
        { field: "payment_kind", phrase: "advance" },
      ],
    },
  ],
};

const S01 = {
  intent: "act",
  reply_language: "en",
  missing_fields: ["year", "bride_name", "groom_name"],
  reply: "Which year is it, and what are the couple's names?",
  actions: [
    {
      kind: "set_wedding_profile",
      date_text: "14 December",
      city: "Bengaluru",
      budget_inr: 1200000,
      expected_guests: 250,
      heard: [
        { field: "date_text", phrase: "14 December" },
        { field: "budget_inr", phrase: "twelve lakh" },
        { field: "expected_guests", phrase: "roughly 250 guests" },
      ],
    },
  ],
};

const O03 = {
  intent: "ask",
  reply_language: "hinglish",
  missing_fields: [],
  reply: "",
  actions: [
    { kind: "query_event", event_id: "EVT-REC", detail: "venue" },
    { kind: "query_balance", scope: "vendor", vendor_id: "VEN-CAT" },
  ],
};

// voice.md 6.4's M-03 fixture
const M03 = {
  intent: "act",
  reply_language: "hinglish",
  missing_fields: [],
  reply: "",
  actions: [
    { kind: "correct_payment", vendor_id: "VEN-CAT", payment_kind: "advance", amount_inr: 40000, heard: [{ field: "amount_inr", phrase: "चालीस हज़ार" }] },
  ],
};

describe("proposeActionsSchema", () => {
  it.each([
    ["M-01", M01],
    ["S-01", S01],
    ["O-03", O03],
    ["M-03", M03],
  ])("accepts the %s example arguments", (_name, args) => {
    const result = proposeActionsSchema.safeParse(args);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.actions.length).toBe(args.actions.length);
  });

  it("covers the 25 kinds", () => {
    for (const kind of [...ASK_KINDS, ...WRITE_KINDS]) {
      expect(proposeActionsSchema.safeParse({ ...O03, actions: [{ kind }] }).success).toBe(true);
    }
    expect(ASK_KINDS.length + WRITE_KINDS.length).toBe(25);
  });

  it("rejects an unknown kind", () => {
    expect(proposeActionsSchema.safeParse({ ...O03, actions: [{ kind: "void_payment" }] }).success).toBe(false);
    expect(proposeActionsSchema.safeParse({ ...O03, actions: [{ kind: "propose_change" }] }).success).toBe(false);
  });

  it("rejects unknown properties on an action and at the top level", () => {
    expect(proposeActionsSchema.safeParse({ ...O03, actions: [{ kind: "query_balance", expected_version: 3 }] }).success).toBe(false);
    expect(proposeActionsSchema.safeParse({ ...O03, actions: [{ kind: "add_vendor", contact_phone: "+91 90000 02001" }] }).success).toBe(false);
    expect(proposeActionsSchema.safeParse({ ...O03, wedding_id: "x" }).success).toBe(false);
    expect(
      proposeActionsSchema.safeParse({ ...M03, actions: [{ ...M03.actions[0], heard: [{ field: "amount_inr", phrase: "x", extra: 1 }] }] }).success,
    ).toBe(false);
  });

  it("rejects more than 12 heard items and over-long phrases", () => {
    const heard = Array.from({ length: 13 }, (_, index) => ({ field: "amount_inr", phrase: `phrase ${index}` }));
    expect(proposeActionsSchema.safeParse({ ...M03, actions: [{ kind: "record_payment", heard }] }).success).toBe(false);
    expect(
      proposeActionsSchema.safeParse({ ...M03, actions: [{ kind: "record_payment", heard: [{ field: "amount_inr", phrase: "x".repeat(81) }] }] })
        .success,
    ).toBe(false);
  });

  it("rejects wrong types and missing top-level fields", () => {
    expect(proposeActionsSchema.safeParse({ ...M03, actions: [{ kind: "record_payment", amount_inr: "40000" }] }).success).toBe(false);
    expect(proposeActionsSchema.safeParse({ ...M03, actions: [{ kind: "record_payment", amount_inr: 400.5 }] }).success).toBe(false);
    expect(proposeActionsSchema.safeParse({ ...M03, actions: [{ kind: "set_wedding_profile", month: 13 }] }).success).toBe(false);
    const noLanguage: Partial<typeof M03> = { ...M03 };
    delete noLanguage.reply_language;
    expect(proposeActionsSchema.safeParse(noLanguage).success).toBe(false);
    expect(proposeActionsSchema.safeParse({ ...M03, intent: "confirm" }).success).toBe(false);
  });

  it("caps actions at 6 and missing_fields at 12", () => {
    expect(proposeActionsSchema.safeParse({ ...O03, actions: Array.from({ length: 6 }, () => ({ kind: "query_rsvp" })) }).success).toBe(true);
    expect(proposeActionsSchema.safeParse({ ...O03, actions: Array.from({ length: 7 }, () => ({ kind: "query_rsvp" })) }).success).toBe(false);
    expect(proposeActionsSchema.safeParse({ ...O03, missing_fields: Array.from({ length: 13 }, () => "year") }).success).toBe(false);
  });

  it("normalises dates and times and cuts an over-long reply", () => {
    const result = proposeActionsSchema.safeParse({
      ...M03,
      reply: "x".repeat(260),
      actions: [{ kind: "create_event", event_kind: "sangeet", event_date: "2026-12-3", start_time: "7:00" }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.actions[0].event_date).toBe("2026-12-03");
    expect(result.data.actions[0].start_time).toBe("07:00");
    expect(result.data.reply.length).toBe(200);
  });

  it("does not let range checks fail the schema (the resolver asks instead)", () => {
    expect(proposeActionsSchema.safeParse({ ...M03, actions: [{ kind: "record_payment", amount_inr: 50 }] }).success).toBe(true);
    expect(proposeActionsSchema.safeParse({ ...M03, actions: [{ kind: "record_payment", amount_inr: 99_000_000_000 }] }).success).toBe(true);
  });
});

describe("parseToolArguments", () => {
  it("parses a JSON string", () => {
    const result = parseToolArguments(JSON.stringify(M03));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.actions[0].kind).toBe("correct_payment");
  });

  it("refuses bad JSON and schema breaks with a reason", () => {
    const bad = parseToolArguments("{intent: act");
    expect(bad).toEqual({ ok: false, reason: "arguments are not valid JSON" });
    const schema = parseToolArguments(JSON.stringify({ ...M03, actions: [{ kind: "nope" }] }));
    expect(schema.ok).toBe(false);
    if (!schema.ok) expect(schema.reason).toMatch(/^schema: actions\.0\.kind/);
  });
});

type Node = { [key: string]: unknown };

function walk(node: unknown, visit: (node: Node, path: string) => void, path = "$") {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child, index) => walk(child, visit, `${path}[${index}]`));
    return;
  }
  visit(node as Node, path);
  for (const [key, child] of Object.entries(node)) walk(child, visit, `${path}.${key}`);
}

describe("PROPOSE_ACTIONS_TOOL", () => {
  it("is one forced-call function named propose_actions", () => {
    expect(PROPOSE_ACTIONS_TOOL.type).toBe("function");
    expect(PROPOSE_ACTIONS_TOOL.function.name).toBe("propose_actions");
  });

  it("has no null unions, no type arrays and no open objects", () => {
    const problems: string[] = [];
    walk(PROPOSE_ACTIONS_PARAMETERS, (node, path) => {
      if (Array.isArray(node.type)) problems.push(`${path}: type array`);
      if (node.type === "null") problems.push(`${path}: null type`);
      if ("anyOf" in node || "oneOf" in node || "allOf" in node) problems.push(`${path}: union`);
      if (node.type === "object") {
        if (node.additionalProperties !== false) problems.push(`${path}: additionalProperties not false`);
        if (!node.properties) problems.push(`${path}: no properties`);
      }
    });
    expect(problems).toEqual([]);
  });

  it("lists every field and requires only kind on an action", () => {
    const actions = (PROPOSE_ACTIONS_PARAMETERS.properties as Node).actions as Node;
    const items = actions.items as Node;
    const properties = items.properties as Node;
    for (const field of Object.keys(ACTION_FIELDS)) expect(properties[field]).toBeDefined();
    expect(items.required).toEqual(["kind"]);
    for (const forbidden of ["expected_version", "expected_draft_version", "idempotency_key", "wedding_id", "venue_id", "contact_phone", "email", "phone"]) {
      expect(properties[forbidden]).toBeUndefined();
    }
    expect(PROPOSE_ACTIONS_PARAMETERS.required).toEqual(["intent", "actions", "missing_fields", "reply", "reply_language"]);
  });
});

describe("cleaning what the model filled but nobody said", () => {
  it("drops empty strings, other kinds' fields, a zero claim and a question's amount", () => {
    // V-T4, O-01: sarvam-105b filled the trailing helper slots on a query_balance.
    const raw = JSON.stringify({
      intent: "ask",
      reply_language: "hinglish",
      missing_fields: [],
      reply: "",
      actions: [{ kind: "query_balance", scope: "vendor", vendor_id: "VEN-CAT", user_claim_inr: 0, date_text: "", month: 11, amount_inr: 0 }],
    });
    const parsed = parseToolArguments(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.actions[0]).toEqual({ kind: "query_balance", scope: "vendor", vendor_id: "VEN-CAT" });
  });

  it("keeps every field that belongs to the kind, and a real claim", () => {
    const raw = JSON.stringify({
      intent: "act",
      reply_language: "en",
      missing_fields: [],
      reply: "",
      actions: [
        { kind: "set_wedding_profile", date_text: "14 December", city: "Bengaluru", budget_inr: 1200000, month: 12 },
        { kind: "query_balance", vendor_id: "VEN-VEN", user_claim_inr: 150000 },
      ],
    });
    const parsed = parseToolArguments(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.actions[0]).toMatchObject({ date_text: "14 December", city: "Bengaluru", budget_inr: 1200000, month: 12 });
    expect(parsed.value.actions[1]).toMatchObject({ vendor_id: "VEN-VEN", user_claim_inr: 150000 });
  });
});

describe("a payment's amount in the claim slot", () => {
  it("moves user_claim_inr to amount_inr on a payment write, with its heard item", () => {
    const raw = JSON.stringify({
      intent: "act",
      reply_language: "hinglish",
      missing_fields: [],
      reply: "",
      actions: [{ kind: "correct_payment", vendor_id: "VEN-CAT", user_claim_inr: 40000, heard: [{ field: "user_claim_inr", phrase: "चालीस हज़ार" }] }],
    });
    const parsed = parseToolArguments(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.actions[0]).toEqual({ kind: "correct_payment", vendor_id: "VEN-CAT", amount_inr: 40000, heard: [{ field: "amount_inr", phrase: "चालीस हज़ार" }] });
  });

  it("sends heard last in the JSON schema", () => {
    const props = Object.keys((PROPOSE_ACTIONS_PARAMETERS as { properties: { actions: { items: { properties: Record<string, unknown> } } } }).properties.actions.items.properties);
    expect(props[0]).toBe("kind");
    expect(props.at(-1)).toBe("heard");
  });
});
