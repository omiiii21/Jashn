import { describe, expect, it } from "vitest";

import type { CommandEnvelope } from "@/contracts/commands";
import { fixtureIds, fixtureSessionActor, getDemoFixture } from "@/contracts/fixtures";
import type { CommandHandlerContext } from "@/contracts/services";

import { createUpdateInviteStyleHandler } from "./invite-style";
import { createMemoryInviteStore, memoryStateFromFixture } from "./memory-store";
import type { SnapshotTools } from "./snapshot";

const fixture = getDemoFixture("d");
const ids = fixtureIds("d");
const photo = fixture.assets.find((asset) => asset.asset_kind === "couple_photo");

const unusedTools: SnapshotTools = {
  build: () => {
    throw new Error("update_invite_style never builds a snapshot");
  },
  diff: () => [],
  equal: () => true,
};

type StyleInput = CommandEnvelope<"update_invite_style">["input"];

function setup() {
  const state = memoryStateFromFixture(fixture);
  state.styles.get(ids.wedding_id)!.theme = "peacock_gold";
  const handler = createUpdateInviteStyleHandler({ store: createMemoryInviteStore(state), snapshot: unusedTools });
  const run = (input: StyleInput, person: "mira" | "diya" = "diya") =>
    handler({
      command: "update_invite_style",
      actor: fixtureSessionActor(person, "d"),
      wedding_id: ids.wedding_id,
      input,
      envelope: { wedding_id: ids.wedding_id, command: "update_invite_style", input, source: "ui" },
      tx: null,
      now: "2026-11-25T08:00:00.000Z",
    } as CommandHandlerContext<"update_invite_style", unknown>);
  return { state, run };
}

describe("update_invite_style", () => {
  it("AT-7.1: writes only the changed fields to the draft and bumps draft_version", async () => {
    const { state, run } = setup();
    const result = await run({ theme: "maroon_gold", typeface: "eczar" });
    expect(result.outcome).toBe("applied");
    expect(result.bumps_draft_version).toBe(true);
    expect(result.result).toEqual({ changed_fields: ["theme"], draft_version: fixture.wedding.draft_version + 1 });
    expect(result.activity?.topic).toBe("invite_style.updated");
    expect(result.activity?.entity_type).toBe("invite_style");
    expect(result.activity?.entity_id).toBe(ids.wedding_id);
    expect(result.activity?.before).toEqual({ theme: "peacock_gold" });
    expect(result.activity?.after).toEqual({ theme: "maroon_gold" });
    expect(result.activity?.summary_en).toBe("Diya changed the invitation: theme Peacock & Gold to Maroon & Gold.");
    expect(state.styles.get(ids.wedding_id)!.theme).toBe("maroon_gold");
  });

  it("AT-9.3: never touches publications or the published revision", async () => {
    const { state, run } = setup();
    await run({ theme: "maroon_gold", blessing_line: "Shubh vivah" });
    expect(state.publications).toHaveLength(fixture.publications.length);
    expect(state.weddings.get(ids.wedding_id)!.published_revision).toBe(fixture.wedding.published_revision);
  });

  it("a repeat is unchanged, with no entry and no draft bump", async () => {
    const { run } = setup();
    const result = await run({ theme: "peacock_gold" });
    expect(result.outcome).toBe("unchanged");
    expect(result.activity).toBeNull();
    expect(result.bumps_draft_version).toBeUndefined();
  });

  it("keeps the blank line in wording_en and normalises CRLF", async () => {
    const { state, run } = setup();
    await run({ wording_en: "With love from our families\r\n\r\ninvite you to their wedding" });
    expect(state.styles.get(ids.wedding_id)!.wording_en).toBe("With love from our families\n\ninvite you to their wedding");
  });

  it("refuses a photo that isn't this wedding's couple photo with 404, and never prints a photo id", async () => {
    const { run } = setup();
    await expect(run({ photo_asset_id: "7d1f2a3b-0000-4000-8000-000000000999" })).rejects.toMatchObject({
      body: { code: "not_found", field: "photo_asset_id" },
    });
    if (photo) {
      const { state, run: runFresh } = setup();
      state.styles.get(ids.wedding_id)!.photo_asset_id = null;
      const result = await runFresh({ photo_asset_id: photo.asset_id });
      expect(result.activity?.summary_en).toBe("Diya changed the invitation: couple photo added.");
      expect(result.activity?.summary_en).not.toContain(photo.asset_id);
    }
  });
});
