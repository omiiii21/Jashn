import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AssetId } from "@/contracts/domain";

import { PhotoPicker } from "./PhotoPicker";

const photo = (n: number) => ({ asset_id: `00000000-0000-4000-8000-00000000000${n}` as AssetId, url: n === 6 ? null : `https://storage.example.invalid/p${n}.jpg` });
const six = [1, 2, 3, 4, 5, 6].map(photo);

describe("PhotoPicker", () => {
  it("offers every couple photo as one radio group, the draft's photo checked", () => {
    const html = renderToStaticMarkup(
      createElement(PhotoPicker, { photos: six, selected: six[1].asset_id, on_select: () => undefined, on_image_error: () => undefined, is_sample: true }),
    );
    expect(html.match(/type="radio"/g)).toHaveLength(6);
    expect(html.match(/name="studio-photo"/g)).toHaveLength(6);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toContain(`checked="" value="${six[1].asset_id}"`);
    expect(html).toContain("Photo 6 of 6");
    expect(html.match(/<img /g)).toHaveLength(5);
    expect(html).toContain("AI-generated, fictional.");
  });

  it("stays out of the way when the only photo is already the draft's", () => {
    const html = renderToStaticMarkup(
      createElement(PhotoPicker, { photos: [six[0]], selected: six[0].asset_id, on_select: () => undefined, on_image_error: () => undefined, is_sample: false }),
    );
    expect(html).toBe("");
  });
});
