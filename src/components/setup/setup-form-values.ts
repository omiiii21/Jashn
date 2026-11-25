/**
 * The typed setup form's values (domain 3.1, acceptance AT-1.3 and AT-1.4): parsing, the
 * client-side checks (the same schema the dispatcher uses) and the prefill mapping (AT-1.6).
 * Pure and browser-safe: no server imports.
 */
import { setWeddingProfileCreateSchema, type CommandInput } from "@/contracts/commands";
import type { JsonObject } from "@/contracts/domain";
import { groupIndian } from "@/contracts/money";

export const SETUP_FIELDS = ["bride_name", "groom_name", "day", "month", "year", "city", "budget", "guests"] as const;
export type SetupField = (typeof SETUP_FIELDS)[number];
export type SetupValues = Record<SetupField, string>;

export const EMPTY_SETUP_VALUES: SetupValues = {
  bride_name: "",
  groom_name: "",
  day: "",
  month: "",
  year: "",
  city: "",
  budget: "",
  guests: "",
};

/** "12,00,000", "1200000", "₹12,00,000" or "12 00 000" → 1200000; null when blank; NaN when unreadable. */
export function parseRupees(raw: string): number | null {
  const cleaned = raw.trim().replace(/^₹|^rs\.?\s*/i, "").replace(/[,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

/** A whole count ("250" or "1,200"); null when blank; NaN when unreadable. */
export function parseCount(raw: string): number | null {
  const cleaned = raw.trim().replace(/[,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

/** Day, month and year → "YYYY-MM-DD"; null when any part is blank (the year is never filled in). */
export function joinDate(day: string, month: string, year: string): string | null {
  const d = day.trim();
  const m = month.trim();
  const y = year.trim();
  if (d === "" || m === "" || y === "") return null;
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || !/^\d{4}$/.test(y)) return "invalid";
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Field key (form) → the message the form shows under it. */
export type SetupErrors = Partial<Record<SetupField | "date", string>>;

const MESSAGES: Record<string, string> = {
  bride_name: "Add the bride's name.",
  groom_name: "Add the groom's name.",
  date: "Add the full date: day, month and year.",
  date_range: "Pick a real date between 2026 and 2030.",
  city: "Keep the city under 60 characters.",
  budget: "Type the budget in rupees, like 12,00,000.",
  guests: "Type the number of guests, up to 5,000.",
};

/**
 * The create input for `set_wedding_profile` from the form, checked like the dispatcher checks
 * it (setWeddingProfileCreateSchema). Errors are keyed by form field.
 */
export function buildCreateInput(
  values: SetupValues,
  setup_opened_at: string | null,
): { ok: true; input: CommandInput<"set_wedding_profile"> } | { ok: false; errors: SetupErrors } {
  const errors: SetupErrors = {};
  const input: Record<string, unknown> = {};
  const bride = values.bride_name.trim();
  const groom = values.groom_name.trim();
  if (bride) input.bride_name = bride;
  if (groom) input.groom_name = groom;
  const date = joinDate(values.day, values.month, values.year);
  if (date === null || date === "invalid") errors.date = MESSAGES.date;
  else input.wedding_date = date;
  const city = values.city.trim();
  if (city) input.city = city;
  const budget = parseRupees(values.budget);
  if (budget !== null) {
    if (Number.isNaN(budget)) errors.budget = MESSAGES.budget;
    else input.budget_inr = budget;
  }
  const guests = parseCount(values.guests);
  if (guests !== null) {
    if (Number.isNaN(guests)) errors.guests = MESSAGES.guests;
    else input.expected_guests = guests;
  }
  if (setup_opened_at) input.setup_opened_at = setup_opened_at;

  const parsed = setWeddingProfileCreateSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key === "bride_name") errors.bride_name ??= MESSAGES.bride_name;
      else if (key === "groom_name") errors.groom_name ??= MESSAGES.groom_name;
      else if (key === "wedding_date") errors.date ??= input.wedding_date ? MESSAGES.date_range : MESSAGES.date;
      else if (key === "city") errors.city ??= MESSAGES.city;
      else if (key === "budget_inr") errors.budget ??= MESSAGES.budget;
      else if (key === "expected_guests") errors.guests ??= MESSAGES.guests;
    }
  }
  if (Object.keys(errors).length > 0 || !parsed.success) return { ok: false, errors };
  return { ok: true, input: parsed.data as CommandInput<"set_wedding_profile"> };
}

/** The form fields a voice prefill fills (AT-1.6), and which ones it touched. */
export function valuesFromPrefill(input: JsonObject): { values: Partial<SetupValues>; filled: SetupField[] } {
  const values: Partial<SetupValues> = {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (str(input.bride_name)) values.bride_name = str(input.bride_name);
  if (str(input.groom_name)) values.groom_name = str(input.groom_name);
  const date = str(input.wedding_date);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match) {
    values.year = match[1];
    values.month = String(Number(match[2]));
    values.day = String(Number(match[3]));
  }
  if (str(input.city)) values.city = str(input.city);
  if (typeof input.budget_inr === "number" && Number.isFinite(input.budget_inr)) values.budget = groupIndian(input.budget_inr);
  if (typeof input.expected_guests === "number" && Number.isFinite(input.expected_guests)) values.guests = String(input.expected_guests);
  return { values, filled: Object.keys(values) as SetupField[] };
}

/** The new wedding's id from the `set_wedding_profile` result, when it carries one. */
export function weddingIdFromResult(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return null;
  const id = (result as { wedding_id?: unknown }).wedding_id;
  return typeof id === "string" && id !== "" ? id : null;
}
