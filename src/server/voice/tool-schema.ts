import "server-only";

import { z } from "zod";

import {
  BUDGET_CATEGORIES,
  COMMITMENT_PRICINGS,
  COMMITMENT_UNITS,
  EVENT_KINDS,
  INVITE_LAYOUTS,
  INVITE_THEMES,
  INVITE_TYPEFACES,
  PAYMENT_KINDS,
  PAYMENT_METHODS,
  PHOTO_FRAMES,
  REQUIREMENT_CATEGORIES,
  RSVP_STATUSES,
  VENDOR_STATUSES,
} from "@/contracts/domain";

import { ASK_KINDS, WRITE_KINDS, type ToolArguments } from "./types";

/**
 * The `propose_actions` tool (voice.md 2). One table of fields drives both the zod check
 * (1.11 step 1) and the JSON schema sent to sarvam-105b, so the two can't drift.
 *
 * Rules the JSON schema keeps (RS B39, voice.md 2): no `["string","null"]` unions, no open
 * objects (`additionalProperties: false` on every object), only explicit optional fields.
 * Numeric ranges are NOT schema rules: an out-of-range amount is the resolver's question
 * (1.11 step 6), never a schema failure that burns the one retry. `month` is the exception
 * (2.2 gives it 1 to 12).
 *
 * The spec wants this schema in `src/contracts/api.ts` eventually (2, "Lane C's request to
 * the lead"); until that contracts PR it lives here.
 */

export const ACTION_KINDS = [...WRITE_KINDS, ...ASK_KINDS] as const;

// ---------------------------------------------------------------------------
// The field table (2.2 and 2.4)
// ---------------------------------------------------------------------------

type FieldSpec =
  | { type: "text"; max: number; description: string }
  | { type: "ref"; description: string }
  | { type: "ref_list"; max: number; description: string }
  | { type: "int"; description: string; min?: number; max?: number }
  | { type: "date"; description: string }
  | { type: "time"; description: string }
  | { type: "enum"; values: readonly string[]; description: string }
  | { type: "bool"; description: string };

/** References are text up to 24 characters (2.4). */
const REF_MAX = 24;

const text = (max: number, description: string): FieldSpec => ({ type: "text", max, description });
const ref = (description: string): FieldSpec => ({ type: "ref", description });
const refList = (max: number, description: string): FieldSpec => ({ type: "ref_list", max, description });
const int = (description: string): FieldSpec => ({ type: "int", description });
const date = (description: string): FieldSpec => ({ type: "date", description });
const time = (description: string): FieldSpec => ({ type: "time", description });
const oneOf = (values: readonly string[], description: string): FieldSpec => ({ type: "enum", values, description });
const bool = (description: string): FieldSpec => ({ type: "bool", description });

/** Every action field except `kind` and `heard`, in 2.4's order, then 2.2's helpers. */
export const ACTION_FIELDS = {
  // set_wedding_profile
  bride_name: text(60, "set_wedding_profile: the bride's name as said, Latin script."),
  groom_name: text(60, "set_wedding_profile: the groom's name as said, Latin script."),
  wedding_date: date("set_wedding_profile: only when day, month and year were all said."),
  city: text(60, "set_wedding_profile: the city as said."),
  budget_inr: int("set_wedding_profile: the budget in whole rupees (1 lakh = 100000)."),
  expected_guests: int("set_wedding_profile: the guest count as said."),
  // functions
  event_kind: oneOf(EVENT_KINDS, "create_event: the function kind."),
  title: text(40, "create_event, update_event: title, only for an `other` function."),
  event_id: ref("A function reference from the snapshot (EVT-...)."),
  event_ids: refList(10, "add_vendor, add_guest: function references from the snapshot."),
  event_date: date("create_event, update_event: the function's date."),
  start_time: time("create_event, update_event: start time."),
  end_time: time("create_event, update_event: end time."),
  muhurat_time: time("create_event, update_event: muhurat time."),
  venue_name: text(80, "create_event, update_event: the venue name as said."),
  dress_code: text(120, "create_event, update_event: the dress code as said."),
  lead_name: text(60, "create_event, update_event: the person leading the function."),
  expected_headcount: int("create_event, update_event: expected headcount as said."),
  // invite style
  theme: oneOf(INVITE_THEMES, "update_invite_style: maroon_gold or peacock_gold."),
  typeface: oneOf(INVITE_TYPEFACES, "update_invite_style: typeface."),
  layout: oneOf(INVITE_LAYOUTS, "update_invite_style: layout."),
  photo_frame: oneOf(PHOTO_FRAMES, "update_invite_style: photo frame."),
  photo_asset_id: ref("update_invite_style: ASSET-NEW for the photo attached to this request."),
  // vendors
  name: text(80, "add_vendor: the vendor's name as said."),
  vendor_category: oneOf(BUDGET_CATEGORIES, "add_vendor: the vendor's category."),
  status: oneOf(VENDOR_STATUSES, "add_vendor: considering, booked or cancelled."),
  contact_name: text(60, "add_vendor: a contact person's name. Never a phone number."),
  notes: text(200, "add_vendor: a short note."),
  vendor_id: ref("A vendor reference from the snapshot (VEN-...)."),
  // money
  pricing: oneOf(COMMITMENT_PRICINGS, "record_commitment, update_commitment: lump_sum or per_unit."),
  unit: oneOf(COMMITMENT_UNITS, "record_commitment, update_commitment: the unit of a per_unit price."),
  unit_price_inr: int("record_commitment, update_commitment: the rate in whole rupees, as said."),
  quantity: int("record_commitment, update_commitment, add_requirement: the count as said."),
  amount_inr: int("An amount in whole rupees, exactly as said (1 lakh = 100000). Never computed."),
  description: text(200, "record_commitment, update_commitment: a basis the person said."),
  due_on: date("record_commitment, update_commitment: the due date."),
  commitment_id: ref("update_commitment: a commitment reference from the snapshot (COM-...)."),
  payment_id: ref("correct_payment: a payment reference from the snapshot (PAY-...)."),
  payment_kind: oneOf(PAYMENT_KINDS, "record_payment, correct_payment: advance, instalment or final."),
  paid_on: date("record_payment, correct_payment: only if a date was said."),
  method: oneOf(PAYMENT_METHODS, "record_payment, correct_payment: how it was paid."),
  note: text(200, "record_payment, correct_payment, record_shagun: a short note."),
  // requirements
  text: text(200, "add_requirement: what is needed, a short English phrase without the count."),
  requirement_category: oneOf(REQUIREMENT_CATEGORIES, "add_requirement: the requirement's category."),
  // notes
  topic: text(40, "add_note, query_note: a short topic in English, one or two words (parking, hotel, horse)."),
  note_text: text(300, "add_note: the fact as the person said it, one short sentence. Never a phone number or an email."),
  note_id: ref("query_note: a note reference from the snapshot (NOTE-...)."),
  // guests
  full_name: text(80, "add_guest: the guest's full name as said."),
  household_id: ref("add_guest, record_shagun: a household reference from the snapshot (H..)."),
  household_name: text(80, "add_guest: a new household's name."),
  relation: text(80, "add_guest: a new household's relation to the couple."),
  max_plus_ones: int("add_guest: plus-ones allowed, as said."),
  dietary_note: text(200, "add_guest, set_dietary: a short English phrase."),
  guest_ids: refList(50, "set_rsvp: guest references from the snapshot (G..)."),
  guest_id: ref("set_dietary: a guest reference from the snapshot (G..)."),
  rsvp_status: oneOf(RSVP_STATUSES, "set_rsvp: attending, declined or pending."),
  plus_ones: int("set_rsvp: plus-ones, only with one guest."),
  // card export
  format: oneOf(["png"], "request_card_export: png."),
  // shagun
  giver_name: text(80, "record_shagun: the giver as said."),
  received_on: date("record_shagun: the date received."),
  how: text(120, "record_shagun: how it was given (home visit, UPI)."),
  // questions
  scope: oneOf(["vendor", "wedding"], "query_balance: one vendor or the whole wedding."),
  detail: oneOf(["venue", "time", "date", "dress_code", "all"], "query_event: what is asked about the function."),
  next_event: bool("query_event: true for 'the next function'."),
  day: text(10, "query_changes: 'today' or a date YYYY-MM-DD."),
  latest: bool("query_changes: true for 'what did X change' (the latest entry)."),
  actor_member_id: ref("query_changes: a member reference from the snapshot (MEM-...)."),
  thanked: bool("query_shagun: false for 'who still needs a thank-you'."),
  budget_category: oneOf(BUDGET_CATEGORIES, "query_budget: the budget category asked about."),
  // helpers (2.2)
  previous_inr: int("correct_payment, update_commitment: the old amount, only when the person said it."),
  user_claim_inr: int("query_balance: an amount the person asserts, to be checked."),
  date_text: text(40, "set_wedding_profile: a day and month said without a year ('14 December')."),
  month: { type: "int", min: 1, max: 12, description: "set_wedding_profile: a month said alone, 1 to 12." },
} as const satisfies Record<string, FieldSpec>;

export type ActionFieldName = keyof typeof ACTION_FIELDS;

const HEARD_MAX = 12;
const HEARD_FIELD_MAX = 40;
const HEARD_PHRASE_MAX = 80;
/** 2.1 says at most 4; the schema allows 6 so the resolver can ask "one or two things at a time" (1.11 step 1). */
export const ACTIONS_SCHEMA_MAX = 6;
const MISSING_MAX = 12;
const MISSING_ITEM_MAX = 40;
const REPLY_MAX = 200;
export const REPLY_LANGUAGES = ["en", "hinglish", "hi"] as const;

// ---------------------------------------------------------------------------
// zod (the server's check, 1.11 step 1)
// ---------------------------------------------------------------------------

const pad2 = (value: string) => value.padStart(2, "0");

/** `YYYY-MM-DD`, tolerating one-digit months and days, normalised. */
const zDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{1,2}-\d{1,2}$/, "expected YYYY-MM-DD")
  .transform((value) => {
    const [y, m, d] = value.split("-");
    return `${y}-${pad2(m)}-${pad2(d)}`;
  });

/** `HH:MM` 24-hour, tolerating a one-digit hour, normalised. */
const zTime = z
  .string()
  .trim()
  .regex(/^\d{1,2}:\d{2}$/, "expected HH:MM")
  .transform((value) => {
    const [h, m] = value.split(":");
    return `${pad2(h)}:${m}`;
  });

const zRef = z.string().trim().min(1).max(REF_MAX);

function zodFor(spec: FieldSpec): z.ZodType {
  switch (spec.type) {
    case "text":
      return z.string().trim().max(spec.max);
    case "ref":
      return zRef;
    case "ref_list":
      return z.array(zRef).max(spec.max);
    case "int": {
      let schema = z.number().int();
      if (spec.min !== undefined) schema = schema.min(spec.min);
      if (spec.max !== undefined) schema = schema.max(spec.max);
      return schema;
    }
    case "date":
      return zDate;
    case "time":
      return zTime;
    case "enum":
      return z.enum(spec.values as [string, ...string[]]);
    case "bool":
      return z.boolean();
  }
}

const heardSchema = z.strictObject({
  field: z.string().trim().min(1).max(HEARD_FIELD_MAX),
  phrase: z.string().trim().min(1).max(HEARD_PHRASE_MAX),
});

const actionShape: Record<string, z.ZodType> = {
  kind: z.enum(ACTION_KINDS),
  heard: z.array(heardSchema).max(HEARD_MAX).optional(),
};
for (const [field, spec] of Object.entries(ACTION_FIELDS)) actionShape[field] = zodFor(spec).optional();

/** One action: a flat strict object (unknown properties rejected). */
export const proposeActionSchema = z.strictObject(actionShape);

/** The tool's top level (2.1). Its output is a `ToolArguments`. */
export const proposeActionsSchema = z
  .strictObject({
    intent: z.enum(["act", "ask", "clarify"]),
    actions: z.array(proposeActionSchema).max(ACTIONS_SCHEMA_MAX),
    missing_fields: z.array(z.string().trim().min(1).max(MISSING_ITEM_MAX)).max(MISSING_MAX),
    // The reply is only "suggested by the model" (2.1): an over-long one is cut, never a retry.
    reply: z.string().transform((value) => value.trim().slice(0, REPLY_MAX)),
    reply_language: z.enum(REPLY_LANGUAGES),
  })
  .transform((value) => value as unknown as ToolArguments);

/**
 * Parses the model's `function.arguments` (a JSON string, RS 3.2) and checks it.
 * A failure here is a schema failure: the one retry with `reasoning_effort` "low" (1.10).
 */
export function parseToolArguments(raw: string): { ok: true; value: ToolArguments } | { ok: false; reason: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "arguments are not valid JSON" };
  }
  const result = proposeActionsSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.length ? issue.path.join(".") : "(top level)";
    return { ok: false, reason: `schema: ${path}: ${issue?.message ?? "invalid"}` };
  }
  return { ok: true, value: cleanToolArguments(result.data) };
}

/**
 * The kinds each field belongs to, read from its description's "kind, kind: ..." prefix.
 * A field without a prefix (event_id, vendor_id, amount_inr) belongs to every kind.
 */
const FIELD_KINDS: Partial<Record<ActionFieldName, ReadonlySet<string>>> = (() => {
  const out: Partial<Record<ActionFieldName, ReadonlySet<string>>> = {};
  for (const [field, spec] of Object.entries(ACTION_FIELDS) as [ActionFieldName, FieldSpec][]) {
    const match = /^([a-z_]+(?:, [a-z_]+)*):/.exec(spec.description);
    if (!match) continue;
    const kinds = match[1].split(", ").filter((kind) => (ACTION_KINDS as readonly string[]).includes(kind));
    if (kinds.length > 0) out[field] = new Set(kinds);
  }
  return out;
})();

/** Write kinds whose amount_inr is the money said. */
const AMOUNT_KINDS = new Set<string>(["record_commitment", "update_commitment", "record_payment", "correct_payment", "record_shagun"]);

/** Amounts a question never carries: a zero there is the model filling a slot, not a value said. */
const ZERO_MEANS_UNSAID = new Set<string>(["user_claim_inr", "previous_inr"]);

/**
 * Drops what the model filled but nobody said: an empty string or list, a field that belongs to
 * other kinds (a `month` on a query_balance), a zero claim or old amount, and an amount on a
 * question. Constrained decoding tends to fill optional slots, and the resolver must not read
 * them as said (voice.md 2.4: "only the fields the person actually said").
 */
export function cleanToolArguments(args: ToolArguments): ToolArguments {
  const actions = args.actions.map((source) => {
    // V-T4, M-03: the model put the said amount of a payment in query_balance's
    // `user_claim_inr` slot. On a write that carries amounts, that number is its amount_inr.
    let action = source;
    const claim = source.user_claim_inr;
    if (typeof claim === "number" && claim > 0 && source.amount_inr === undefined && FIELD_KINDS.user_claim_inr && !FIELD_KINDS.user_claim_inr.has(source.kind) && AMOUNT_KINDS.has(source.kind)) {
      action = {
        ...source,
        amount_inr: claim,
        heard: (source.heard ?? []).map((item) => (item.field === "user_claim_inr" ? { ...item, field: "amount_inr" } : item)),
      };
    }
    const out: Record<string, unknown> = { kind: action.kind };
    for (const [field, value] of Object.entries(action)) {
      if (field === "kind") continue;
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim().length === 0) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      const kinds = FIELD_KINDS[field as ActionFieldName];
      if (kinds && !kinds.has(action.kind)) continue;
      if (value === 0 && ZERO_MEANS_UNSAID.has(field)) continue;
      if (field === "amount_inr" && action.kind.startsWith("query_")) continue;
      out[field] = value;
    }
    return out as ToolArguments["actions"][number];
  });
  return { ...args, actions };
}

// ---------------------------------------------------------------------------
// The JSON schema for the chat call (1.10)
// ---------------------------------------------------------------------------

type JsonSchema = { [key: string]: unknown };

function jsonFor(spec: FieldSpec): JsonSchema {
  switch (spec.type) {
    case "text":
      return { type: "string", maxLength: spec.max, description: spec.description };
    case "ref":
      return { type: "string", maxLength: REF_MAX, description: spec.description };
    case "ref_list":
      return { type: "array", items: { type: "string", maxLength: REF_MAX }, maxItems: spec.max, description: spec.description };
    case "int": {
      const schema: JsonSchema = { type: "integer", description: spec.description };
      if (spec.min !== undefined) schema.minimum = spec.min;
      if (spec.max !== undefined) schema.maximum = spec.max;
      return schema;
    }
    case "date":
      return { type: "string", description: `${spec.description} Format YYYY-MM-DD.` };
    case "time":
      return { type: "string", description: `${spec.description} Format HH:MM, 24-hour, IST.` };
    case "enum":
      return { type: "string", enum: [...spec.values], description: spec.description };
    case "bool":
      return { type: "boolean", description: spec.description };
  }
}

function buildParameters(): JsonSchema {
  const actionProperties: JsonSchema = {
    kind: { type: "string", enum: [...ACTION_KINDS], description: "The action's kind." },
  };
  for (const [field, spec] of Object.entries(ACTION_FIELDS)) actionProperties[field] = jsonFor(spec);
  // `heard` comes last (V-T4): sarvam-105b skipped it when it sat right after `kind`.
  actionProperties.heard = {
    type: "array",
    maxItems: HEARD_MAX,
    description:
      "For every number, amount, date and time in this action: the exact words from the utterance that gave it, copied as written.",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        field: { type: "string", maxLength: HEARD_FIELD_MAX, description: "The field name the words filled." },
        phrase: { type: "string", maxLength: HEARD_PHRASE_MAX, description: "The exact words, as in the transcript." },
      },
      required: ["field", "phrase"],
    },
  };

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      intent: {
        type: "string",
        enum: ["act", "ask", "clarify"],
        description: "act: a change (also a question plus a change). ask: read-only questions. clarify: unclear or not possible.",
      },
      actions: {
        type: "array",
        maxItems: ACTIONS_SCHEMA_MAX,
        description: "In the order spoken. Each is a kind plus only the fields the person actually said.",
        items: { type: "object", additionalProperties: false, properties: actionProperties, required: ["kind"] },
      },
      missing_fields: {
        type: "array",
        maxItems: MISSING_MAX,
        items: { type: "string", maxLength: MISSING_ITEM_MAX },
        description: "Field names you could not fill or had to guess. With several actions, prefix the index: 1:amount_inr.",
      },
      reply: {
        type: "string",
        maxLength: REPLY_MAX,
        description: "One short sentence in the speaker's language, without any number. May be empty.",
      },
      reply_language: { type: "string", enum: [...REPLY_LANGUAGES], description: "The speaker's language: en, hinglish or hi." },
    },
    required: ["intent", "actions", "missing_fields", "reply", "reply_language"],
  };
}

export const PROPOSE_ACTIONS_PARAMETERS: JsonSchema = buildParameters();

/** The chat-completions tool object (1.10). */
export const PROPOSE_ACTIONS_TOOL = {
  type: "function",
  function: {
    name: "propose_actions",
    description:
      "Propose what the wedding planner asked for. The app checks every value and the person confirms before anything is saved. Never invent references, names, dates or amounts: leave the field out and list it in missing_fields.",
    parameters: PROPOSE_ACTIONS_PARAMETERS,
  },
} as const;

/** RS 3.2's fallback (1.10, if T4 fails): the same schema as a strict `json_schema` response format. */
export const PROPOSE_ACTIONS_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: { name: "propose_actions", strict: true, schema: PROPOSE_ACTIONS_PARAMETERS },
} as const;
