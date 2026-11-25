import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCardModel, type CardModel } from "@/components/invite/card-model";
import { RenderError } from "./chromium";
import { renderCardOg, type OgPhotoLoader } from "./og-renderer";
import { PROBE_CARD_EVENT_IDS, PROBE_PHOTO, probeSnapshot } from "./probe-fixture";

/** Reads `/card/…` from public/, as the deployment would serve it. */
const publicPhoto: OgPhotoLoader = async (url) => {
  expect(url.startsWith("/card/")).toBe(true);
  return new Uint8Array(await readFile(path.join(process.cwd(), "public", url)));
};

function pngSize(png: Uint8Array): { width: number; height: number } {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  expect(Array.from(png.subarray(0, 8))).toEqual(signature);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function probeModel(variant: "rev3" | "rev2" = "rev3", withPhoto = true): CardModel {
  return buildCardModel({
    snapshot: probeSnapshot(variant),
    card_event_ids: PROBE_CARD_EVENT_IDS,
    is_sample: true,
    photo: withPhoto ? PROBE_PHOTO : null,
  });
}

/** OG_CARD_OUT=<dir> keeps the rendered PNGs for a look by eye. */
async function keep(name: string, png: Uint8Array): Promise<void> {
  const dir = process.env.OG_CARD_OUT;
  if (dir) await writeFile(path.join(dir, name), png);
}

describe("renderCardOg", () => {
  it("renders the probe REV-3 card as a 1080 × 1350 PNG", async () => {
    const png = await renderCardOg(probeModel("rev3"), { load_photo: publicPhoto });
    expect(pngSize(png)).toEqual({ width: 1080, height: 1350 });
    expect(png.byteLength).toBeGreaterThan(20_000);
    await keep("og-rev3.png", png);
  }, 30_000);

  it("renders without a photo (D107)", async () => {
    const png = await renderCardOg(probeModel("rev3", false));
    expect(pngSize(png)).toEqual({ width: 1080, height: 1350 });
    await keep("og-rev3-no-photo.png", png);
  }, 30_000);

  it("omits Hindi it can't draw: other heading and wording text, and title_hi", async () => {
    const model: CardModel = {
      ...probeModel("rev3", false),
      theme: "peacock_gold",
      heading_hi: "शुभ लग्न",
      wording_hi: "कृपया पधारें।",
    };
    const png = await renderCardOg(model);
    expect(pngSize(png)).toEqual({ width: 1080, height: 1350 });
    await keep("og-peacock-omitted.png", png);
  }, 30_000);

  it("fits three functions with a muhurat and a photo by the fit rule", async () => {
    const base = probeModel("rev3");
    const first = base.functions[0]!;
    const model: CardModel = {
      ...base,
      blessing_line: "Shri Ganeshaya Namah",
      functions: [
        { ...first, event_id: "e1", title: "Haldi", muhurat_line: "Muhurat 11:15 AM" },
        { ...first, event_id: "e2", title: "Wedding", muhurat_line: "Muhurat 11:15 AM" },
        { ...first, event_id: "e3" },
      ],
      more_functions_line: "and 2 more functions. Your personal invitation link lists them all.",
    };
    const png = await renderCardOg(model, { load_photo: publicPhoto });
    expect(pngSize(png)).toEqual({ width: 1080, height: 1350 });
    await keep("og-fit.png", png);
  }, 30_000);

  it("fails with RENDER_FAILED when the names aren't Latin", async () => {
    const model: CardModel = { ...probeModel("rev3", false), names: "मीरा & कबीर" };
    await expect(renderCardOg(model)).rejects.toMatchObject({ code: "RENDER_FAILED", detail: "names need Hindi shaping" });
  });

  it("fails with RENDER_FAILED 'photo not loaded' when the photo can't be read", async () => {
    const failing: OgPhotoLoader = async () => {
      throw new Error("https://example.invalid/secret?token=abc");
    };
    const error = await renderCardOg(probeModel("rev3"), { load_photo: failing }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RenderError);
    expect((error as RenderError).detail).toBe("photo not loaded");
    expect((error as RenderError).message).not.toContain("example.invalid");
  });

  it("fails with RENDER_FAILED 'photo not loaded' for a GIF", async () => {
    const gif: OgPhotoLoader = async () => new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]);
    await expect(renderCardOg(probeModel("rev3"), { load_photo: gif })).rejects.toMatchObject({ detail: "photo not loaded" });
  });
});
