import { describe, expect, it, vi } from "vitest";

import { CommandFailure, commandSchemas, type CommandEnvelope } from "@/contracts/commands";
import type { SessionActor } from "@/contracts/domain";
import { SEED_KEYS } from "@/contracts/fixtures";
import type { CommandHandlerContext } from "@/contracts/services";
import type { Tx } from "@/db/client";
import { SAMPLE_COPIES, seededId } from "@/db/ids";

import { createResetDemoHandler, demoResetEnabledFromEnv, resetDataset, sampleCopyOf, seedUserIds } from "./demo";

const WEDDING_A = seededId("a", "weddings", SEED_KEYS.wedding);

const owner: SessionActor = {
  kind: "member",
  user_id: "00000000-0000-4000-8000-000000000001",
  email: "mira.a@example.com",
  display_name: "Mira",
  wedding_id: WEDDING_A,
  member_id: seededId("a", "members", SEED_KEYS.members.mira),
  role: "owner",
  is_internal: true,
  is_first_wedding: false,
  preferred_language: "en",
};

/** A tx whose one read returns `row`; any write fails the test. */
function fakeTx(row: { id: string; is_sample: boolean; version: number; seed_key: string | null } | null): Tx {
  const chain = {
    from: () => chain,
    where: () => chain,
    for: async () => (row ? [row] : []),
  };
  const fail = () => {
    throw new Error("unexpected write");
  };
  return { select: () => chain, update: fail, delete: fail, insert: fail } as unknown as Tx;
}

function context(raw: Record<string, unknown>, tx: Tx, wedding_id: string | null = WEDDING_A): CommandHandlerContext<"reset_demo", Tx> {
  return {
    command: "reset_demo",
    actor: owner,
    wedding_id,
    input: raw as CommandHandlerContext<"reset_demo", Tx>["input"],
    envelope: { wedding_id, command: "reset_demo", input: raw, source: "ui", idempotency_key: null } as unknown as CommandEnvelope<"reset_demo">,
    tx,
    now: "2026-11-25T09:30:00.000Z",
  };
}

async function failureOf(promise: Promise<unknown>): Promise<CommandFailure> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CommandFailure) return error;
    throw error;
  }
  throw new Error("expected a CommandFailure");
}

const deps = (enabled = true) => ({ resetEnabled: () => enabled, log: vi.fn() });

describe("sampleCopyOf", () => {
  it("finds every copy by its fixed wedding id", () => {
    for (const copy of SAMPLE_COPIES) expect(sampleCopyOf(seededId(copy, "weddings", SEED_KEYS.wedding))).toBe(copy);
  });
  it("is null for any other wedding", () => {
    expect(sampleCopyOf("7d3c1c1e-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("demoResetEnabledFromEnv", () => {
  it("is on only for exactly true", () => {
    expect(demoResetEnabledFromEnv({ DEMO_RESET_ENABLED: "true" })).toBe(true);
    expect(demoResetEnabledFromEnv({ DEMO_RESET_ENABLED: "TRUE" })).toBe(false);
    expect(demoResetEnabledFromEnv({ DEMO_RESET_ENABLED: "1" })).toBe(false);
    expect(demoResetEnabledFromEnv({})).toBe(false);
  });
});

describe("seedUserIds", () => {
  it("maps the kept members' user ids to the copy's account emails", () => {
    const { user_ids, missing } = seedUserIds("a", [
      { seed_key: SEED_KEYS.members.mira, user_id: "11111111-1111-4111-8111-111111111111" },
      { seed_key: null, user_id: "22222222-2222-4222-8222-222222222222" },
      { seed_key: SEED_KEYS.members.kabir, user_id: "33333333-3333-4333-8333-333333333333" },
      { seed_key: SEED_KEYS.members.diya, user_id: "44444444-4444-4444-8444-444444444444" },
    ]);
    expect(user_ids).toEqual({
      "mira.a@example.com": "11111111-1111-4111-8111-111111111111",
      "kabir.a@example.com": "33333333-3333-4333-8333-333333333333",
      "diya.a@example.com": "44444444-4444-4444-8444-444444444444",
    });
    expect(missing).toEqual([]);
  });

  it("falls back to the seed's stand-in id for a missing member row and names it", () => {
    const { user_ids, missing } = seedUserIds("a", [{ seed_key: SEED_KEYS.members.mira, user_id: "11111111-1111-4111-8111-111111111111" }]);
    expect(missing).toEqual([SEED_KEYS.members.kabir, SEED_KEYS.members.diya]);
    expect(Object.keys(user_ids)).toHaveLength(3);
  });
});

describe("resetDataset", () => {
  const ids = seedUserIds("a", []).user_ids;
  it("d0 keeps the caterer's commitment and advance", () => {
    const d0 = resetDataset("a", "d0", ids);
    expect(d0.wedding_id).toBe(WEDDING_A);
    expect(d0.rows.payments?.some((row) => row.seed_key === "PAY-01")).toBe(true);
    expect(d0.rows.commitments?.some((row) => row.seed_key === "COM-01")).toBe(true);
    expect(d0.rows.quotes?.find((row) => row.seed_key === "QUO-01")?.status).toBe("accepted");
  });
  it("s0 drops COM-01, PAY-01 and their versions and reopens QUO-01", () => {
    const s0 = resetDataset("a", "s0", ids);
    expect(s0.rows.payments?.some((row) => row.seed_key === "PAY-01")).toBe(false);
    expect(s0.rows.paymentVersions?.some((row) => row.seed_key === "PAY-01/v1")).toBe(false);
    expect(s0.rows.commitments?.some((row) => row.seed_key === "COM-01")).toBe(false);
    expect(s0.rows.commitmentVersions?.some((row) => row.seed_key === "COM-01/v1")).toBe(false);
    expect(s0.rows.quotes?.find((row) => row.seed_key === "QUO-01")?.status).toBe("open");
    expect(s0.rows.payments?.some((row) => row.seed_key === "PAY-02")).toBe(true);
  });
});

describe("reset_demo input (acceptance 5.2)", () => {
  it("refuses a confirm_text other than RESET and an unknown checkpoint", () => {
    for (const confirm_text of ["reset", "RESET ", ""]) {
      expect(commandSchemas.reset_demo.safeParse({ confirm_text }).success).toBe(false);
    }
    expect(commandSchemas.reset_demo.safeParse({ confirm_text: "RESET", checkpoint: "d1" }).success).toBe(false);
    expect(commandSchemas.reset_demo.safeParse({ confirm_text: "RESET" }).success).toBe(true);
  });
});

describe("reset_demo guards", () => {
  const sampleRow = { id: WEDDING_A, is_sample: true, version: 12, seed_key: SEED_KEYS.wedding };

  it("answers demo_reset_disabled when the env is off, before any read", async () => {
    const d = deps(false);
    const error = await failureOf(createResetDemoHandler(d)(context({ confirm_text: "RESET" }, fakeTx(sampleRow))));
    expect(error.body.code).toBe("demo_reset_disabled");
    expect(error.http_status).toBe(403);
    expect(d.log).not.toHaveBeenCalled();
  });

  it("re-checks confirm_text on a direct call", async () => {
    const error = await failureOf(createResetDemoHandler(deps())(context({ confirm_text: "reset" }, fakeTx(sampleRow))));
    expect(error.body).toMatchObject({ code: "validation_failed", field: "confirm_text" });
  });

  it("re-checks the checkpoint on a direct call", async () => {
    const error = await failureOf(createResetDemoHandler(deps())(context({ confirm_text: "RESET", checkpoint: "d3" }, fakeTx(sampleRow))));
    expect(error.body).toMatchObject({ code: "validation_failed", field: "checkpoint" });
  });

  it("answers not_sample_wedding for a real wedding", async () => {
    const d = deps();
    const error = await failureOf(
      createResetDemoHandler(d)(context({ confirm_text: "RESET" }, fakeTx({ ...sampleRow, is_sample: false }))),
    );
    expect(error.body.code).toBe("not_sample_wedding");
    expect(error.http_status).toBe(403);
    expect(d.log).not.toHaveBeenCalled();
  });

  it("answers not_sample_wedding for a throwaway sample wedding with no seeded D0", async () => {
    const other = "7d3c1c1e-0000-4000-8000-000000000000";
    const error = await failureOf(
      createResetDemoHandler(deps())(context({ confirm_text: "RESET" }, fakeTx({ ...sampleRow, id: other, seed_key: null }), other)),
    );
    expect(error.body.code).toBe("not_sample_wedding");
  });

  it("answers not_found for a missing wedding", async () => {
    const error = await failureOf(createResetDemoHandler(deps())(context({ confirm_text: "RESET" }, fakeTx(null))));
    expect(error.body.code).toBe("not_found");
  });
});
