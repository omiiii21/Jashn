import { describe, expect, it } from "vitest";

import { exponentField, parseJsonObjectBody } from "./raw-json";

describe("exponentField", () => {
  it("names the key of the first number in exponent form", () => {
    expect(exponentField('{"bytes":1e6}')).toBe("bytes");
    expect(exponentField('{"a":1,"input":{"amount_inr":1.5E+3}}')).toBe("amount_inr");
    expect(exponentField("[4e4]")).toBeNull();
  });

  it("ignores an e inside a string, an escaped quote, and true, false and null", () => {
    expect(exponentField('{"note":"4e4 is text","flag":true,"other":false,"none":null,"n":40000}')).toBeUndefined();
    expect(exponentField('{"note":"a \\"1e3\\" quote","n":1}')).toBeUndefined();
  });
});

describe("parseJsonObjectBody", () => {
  it("returns the object, and {} for an empty body", () => {
    expect(parseJsonObjectBody('{"bytes":1000}', 100)).toEqual({ ok: true, body: { bytes: 1000 } });
    expect(parseJsonObjectBody("  ", 100)).toEqual({ ok: true, body: {} });
  });

  it("refuses exponent forms before JSON.parse (AT-5.6)", () => {
    expect(parseJsonObjectBody('{"bytes":1e6}', 100)).toEqual({
      ok: false,
      error: { code: "validation_failed", message: "not_integer", field: "bytes" },
    });
  });

  it("refuses a body over the limit, bad JSON and anything but an object", () => {
    expect(parseJsonObjectBody(`{"a":"${"x".repeat(100)}"}`, 50)).toMatchObject({ ok: false, error: { message: "too_long" } });
    expect(parseJsonObjectBody("{bad", 100)).toMatchObject({ ok: false, error: { message: "unknown_value", field: null } });
    expect(parseJsonObjectBody("[1,2]", 100)).toMatchObject({ ok: false, error: { message: "unknown_value" } });
    expect(parseJsonObjectBody('"text"', 100)).toMatchObject({ ok: false, error: { message: "unknown_value" } });
    expect(parseJsonObjectBody("null", 100)).toMatchObject({ ok: false, error: { message: "unknown_value" } });
  });
});
