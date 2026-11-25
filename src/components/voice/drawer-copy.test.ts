import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DRAWER_COPY } from "./drawer-copy";

const root = path.resolve(__dirname, "../../..");
const flagsmithSpec = readFileSync(path.join(root, "docs/prep/spec/flagsmith.md"), "utf8");
const acceptanceSpec = readFileSync(path.join(root, "docs/prep/spec/acceptance.md"), "utf8");

describe("the drawer's fixed texts match the specs word for word", () => {
  it("the Sent by Jashn heading (flagsmith 5.9)", () => {
    expect(DRAWER_COPY.sent_heading).toBe("Sent by Jashn (app-side counts, not Flagsmith's statistics)");
    expect(flagsmithSpec).toContain(`the heading "${DRAWER_COPY.sent_heading}"`);
  });

  it("the AT-1.8 line (flagsmith 5.9, acceptance AT-1.8)", () => {
    expect(DRAWER_COPY.sent_line).toBe(
      "Flagsmith shows statistics from 50 owners and 5 saves per arm. A 10-point effect needs about 385 per arm. We claim no winner.",
    );
    expect(flagsmithSpec).toContain(`"${DRAWER_COPY.sent_line}"`);
    expect(acceptanceSpec).toContain(`"${DRAWER_COPY.sent_line}"`);
  });

  it("the Synthetic disclosure (flagsmith 1.2 rule 5)", () => {
    expect(flagsmithSpec).toContain(`> ${DRAWER_COPY.synthetic_disclosure}\n`);
    expect(DRAWER_COPY.synthetic_banner).toBe("Synthetic data");
  });

  it("the button and the Health actions (flagsmith 3.1, 5.9)", () => {
    expect(flagsmithSpec).toContain(`a "${DRAWER_COPY.open_button}" button`);
    expect(flagsmithSpec).toContain(`"${DRAWER_COPY.run_check}"`);
    expect(flagsmithSpec).toContain(`"${DRAWER_COPY.run_probes}"`);
    expect(DRAWER_COPY.fallback).toBe("fallback");
  });

  it("never shows a synthetic number of its own", () => {
    // The pointer names the Synthetic experiment page; the only figures are those in its name.
    expect(DRAWER_COPY.synthetic_pointer).toContain("Synthetic environment");
    expect(flagsmithSpec).toContain('"SYNTHETIC DATA: setup entry, 800 scripted owners, planted 50% vs 60%"');
  });
});
