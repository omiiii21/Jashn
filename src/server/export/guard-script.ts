import "server-only";

/**
 * The readiness guard and fit rule, run inside the render page before capture
 * (export-and-recovery 1.3 and 1.5, steps 2 to 5; step 1 is the navigation's network idle).
 *
 * Kept as a plain JavaScript string, not a function, so no bundler transform can leak a
 * helper into the browser context. The page is the card from InvitationCard.tsx.
 *
 * Returns `{ ok: true, fonts_ms, fit }` or `{ ok: false, code, cause, faces, fonts_ms }`:
 * - FONT_NOT_LOADED: an element marked `data-font-check` has no loaded web face for its
 *   own text (next/font's local fallback faces don't count), within the budget;
 * - RENDER_FAILED "photo not loaded": the mounted photo didn't decode to a non-zero size;
 * - RENDER_FAILED "layout overflow": the content is taller than the card after the fit rule.
 */
export const GUARD_SCRIPT = String.raw`
async (budgetMs) => {
  const started = performance.now();
  const deadline = started + budgetMs;
  const left = () => Math.max(0, deadline - performance.now());
  const within = (promise, ms) => Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve("__timeout__"), ms)),
  ]);
  const cleanFamily = (raw) => raw
    .replace(/["']/g, "")
    .trim()
    .replace(/^__/, "")
    .replace(/_[0-9a-f]{6,}$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+Fallback$/i, "")
    .trim();
  const isFallback = (family) => /fallback/i.test(family);

  // Step 2: the document's font set reports ready.
  await within(document.fonts.ready, left());

  // Step 3: each checked element loads its own computed web face for its own text.
  const missing = new Set();
  const checked = Array.from(document.querySelectorAll("[data-font-check]"));
  for (const el of checked) {
    const isHindi = el.getAttribute("lang") === "hi";
    // For Hindi, only the Devanagari code points: a space or punctuation would let the
    // Latin face satisfy the check while the Devanagari face is missing (the local trap).
    const raw = (el.textContent || "").trim();
    const text = isHindi ? Array.from(raw).filter((ch) => /[\u0900-\u097F\u1CD0-\u1CFF\uA8E0-\uA8FF]/.test(ch)).join("") : raw;
    if (!text) continue;
    const cs = getComputedStyle(el);
    // Only the element's primary family, the web face. next/font's fallback faces use
    // local() fonts (Times New Roman, Arial) that Sparticuz doesn't ship, and asking for
    // the whole family list makes load() reject on Vercel even when the web face loaded.
    const primaryRaw = (cs.fontFamily.split(",")[0] || "").trim();
    const primary = cleanFamily(primaryRaw || "unknown");
    let faces = [];
    if (primaryRaw && !isFallback(primaryRaw)) {
      const font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + primaryRaw;
      try {
        const result = await within(document.fonts.load(font, text), left());
        faces = result === "__timeout__" ? [] : Array.from(result);
      } catch (error) {
        faces = [];
      }
    }
    const web = faces.filter((face) => face.status === "loaded" && !isFallback(face.family));
    if (web.length === 0) missing.add(primary + (isHindi ? " (Devanagari)" : ""));
  }
  const fonts_ms = Math.round(performance.now() - started);
  if (missing.size > 0) {
    return { ok: false, code: "FONT_NOT_LOADED", cause: "", faces: Array.from(missing), fonts_ms };
  }

  // Step 4: the photo, when the card has one, decodes with a non-zero natural size.
  const photo = document.querySelector("img[data-card-photo]");
  if (photo) {
    try {
      if (!photo.complete) await within(new Promise((resolve, reject) => {
        photo.addEventListener("load", resolve, { once: true });
        photo.addEventListener("error", reject, { once: true });
      }), 5000);
      await within(photo.decode(), 5000);
    } catch (error) {
      // Checked below.
    }
    if (!photo.naturalWidth || !photo.naturalHeight) {
      return { ok: false, code: "RENDER_FAILED", cause: "photo not loaded", faces: [], fonts_ms };
    }
  }

  // Step 5: the fit rule. Shrink the photo to 240 px, then the gaps to half, then the
  // function block to one line per function. Text never shrinks and is never clipped.
  const root = document.querySelector("[data-card-root]");
  const body = document.querySelector("[data-card-body]");
  const content = document.querySelector("[data-card-content]");
  if (!root || !body || !content) {
    return { ok: false, code: "RENDER_FAILED", cause: "card markup missing", faces: [], fonts_ms };
  }
  const fits = () => content.getBoundingClientRect().height <= body.clientHeight + 0.5;
  const steps = [];
  if (!fits() && photo) {
    for (let h = 360; h >= 240 && !fits(); h -= 20) {
      root.style.setProperty("--card-photo-max-h", h + "px");
      steps.push("photo:" + h);
    }
  }
  for (let g = 0.9; g >= 0.5 - 1e-9 && !fits(); g -= 0.1) {
    root.style.setProperty("--card-gap", g.toFixed(1));
    steps.push("gap:" + g.toFixed(1));
  }
  if (!fits()) {
    root.setAttribute("data-fit", "compact");
    steps.push("compact");
  }
  if (!fits()) {
    return { ok: false, code: "RENDER_FAILED", cause: "layout overflow", faces: [], fonts_ms };
  }
  return { ok: true, fonts_ms, fit: steps.join(",") };
}
`;

export type GuardResult =
  | { ok: true; fonts_ms: number; fit: string }
  | { ok: false; code: "FONT_NOT_LOADED" | "RENDER_FAILED"; cause: string; faces: string[]; fonts_ms: number };
