import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ReactElement } from "react";
import { ImageResponse } from "next/og";
import { CARD_HEIGHT_PX, CARD_WIDTH_PX, type CardModel } from "@/components/invite/card-model";
import { selfBaseUrl } from "@/server/jobs/base-url";
import { RenderError, type RenderTimings } from "./chromium";
import { readImageInfo, type ImageInfo } from "./image-size";
import { headingLineFor, wordingLineFor, type OgHindiLine, type OgHindiLineId } from "./og-hindi-lines";
import {
  fitLabel,
  fitSequence,
  isLatinText,
  latinOrNull,
  OG_BODY_HEIGHT_PX,
  OG_BODY_WIDTH_PX,
  OG_PALETTES,
  photoDisplaySize,
  textBlockPx,
  type OgFit,
  type OgPalette,
} from "./og-layout";

/**
 * The next/og fallback renderer (export-and-recovery 3.7). Dormant: Chromium stays the
 * selected renderer until `card_renderer` reads `og` (renderer-choice.ts). It builds the
 * same 1080 × 1350 card in memory with Satori, no browser:
 * - dynamic text is Latin only, in the committed Eczar and Anek TTF files;
 * - the Hindi heading and Hindi line are the captured PNGs in `public/card/`, drawn only
 *   when the text equals the captured text; `title_hi` and any other Hindi are omitted;
 * - the photo is fetched on the server and embedded;
 * - the fit rule matches the Chromium guard's order, from estimated block heights.
 * Errors are RenderError with a code from 2.5 and a short cause, never a URL or path.
 */

type FontWeight = 400 | 500 | 600;
type OgFont = { name: string; data: ArrayBuffer; weight: FontWeight; style: "normal" };

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

// The faces in ./fonts are Google Fonts' static instances of Eczar (400, 500, 600) and Anek
// Devanagari (400), subset to Latin with GPOS kerning removed: Satori misapplies their
// class kerning around spaces and opens uneven word gaps. Licence: ./fonts/OFL-*.txt.
// Literal paths under process.cwd(), one per file, so file tracing can follow each read.
let fontsPromise: Promise<OgFont[]> | null = null;
function loadFonts(): Promise<OgFont[]> {
  fontsPromise ??= Promise.all([
    readFile(path.join(process.cwd(), "src/server/export/fonts/Eczar-Regular.ttf")),
    readFile(path.join(process.cwd(), "src/server/export/fonts/Eczar-Medium.ttf")),
    readFile(path.join(process.cwd(), "src/server/export/fonts/Eczar-SemiBold.ttf")),
    readFile(path.join(process.cwd(), "src/server/export/fonts/AnekDevanagari-Regular.ttf")),
  ]).then(
    ([eczar400, eczar500, eczar600, anek400]) => [
      { name: "Eczar", data: toArrayBuffer(eczar400), weight: 400, style: "normal" },
      { name: "Eczar", data: toArrayBuffer(eczar500), weight: 500, style: "normal" },
      { name: "Eczar", data: toArrayBuffer(eczar600), weight: 600, style: "normal" },
      { name: "Anek", data: toArrayBuffer(anek400), weight: 400, style: "normal" },
    ],
    (error: unknown) => {
      fontsPromise = null;
      throw error;
    },
  );
  return fontsPromise;
}

const HINDI_LINE_READERS: Record<OgHindiLineId, () => Promise<Buffer>> = {
  "heading-hi-eczar-maroon": () => readFile(path.join(process.cwd(), "public/card/heading-hi-eczar-maroon-2x.png")),
  "heading-hi-eczar-peacock": () => readFile(path.join(process.cwd(), "public/card/heading-hi-eczar-peacock-2x.png")),
  "heading-hi-tiro-maroon": () => readFile(path.join(process.cwd(), "public/card/heading-hi-tiro-maroon-2x.png")),
  "heading-hi-tiro-peacock": () => readFile(path.join(process.cwd(), "public/card/heading-hi-tiro-peacock-2x.png")),
  "wording-hi-eczar": () => readFile(path.join(process.cwd(), "public/card/wording-hi-eczar-2x.png")),
  "wording-hi-tiro": () => readFile(path.join(process.cwd(), "public/card/wording-hi-tiro-2x.png")),
};

const hindiLineCache = new Map<OgHindiLineId, Promise<string>>();
function hindiLineDataUri(id: OgHindiLineId): Promise<string> {
  let cached = hindiLineCache.get(id);
  if (!cached) {
    cached = HINDI_LINE_READERS[id]().then(
      (png) => `data:image/png;base64,${png.toString("base64")}`,
      (error: unknown) => {
        hindiLineCache.delete(id);
        throw error;
      },
    );
    hindiLineCache.set(id, cached);
  }
  return cached;
}

/** The photo's bytes. The default fetches it; tests and the probe can read it another way. */
export type OgPhotoLoader = (url: string) => Promise<Uint8Array>;

/** The studio's upload limit (topic 7): nothing larger reaches a card. */
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_FETCH_TIMEOUT_MS = 10_000;

/** Fetches the photo: a signed URL as is, a path such as `/card/…` from this deployment. */
export const fetchPhoto: OgPhotoLoader = async (url) => {
  const absolute = /^https?:\/\//i.test(url) ? url : new URL(url, `${selfBaseUrl()}/`).toString();
  const response = await fetch(absolute, { cache: "no-store", signal: AbortSignal.timeout(PHOTO_FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`photo answered ${response.status}`);
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > PHOTO_MAX_BYTES) throw new Error("photo too large");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > PHOTO_MAX_BYTES) throw new Error("photo too large");
  return bytes;
};

type LoadedPhoto = { data_uri: string; info: ImageInfo; alt: string };

async function loadPhoto(model: CardModel, loader: OgPhotoLoader): Promise<LoadedPhoto | null> {
  if (!model.photo) return null;
  let bytes: Uint8Array;
  try {
    bytes = await loader(model.photo.url);
  } catch {
    throw new Error("photo not loaded");
  }
  const info = readImageInfo(bytes);
  if (!info) throw new Error("photo not loaded");
  const data_uri = `data:${info.mime};base64,${Buffer.from(bytes).toString("base64")}`;
  return { data_uri, info, alt: model.photo.alt };
}

// ---------------------------------------------------------------------------
// The card, as blocks with estimated heights
// ---------------------------------------------------------------------------

/** One block in the content column: its gap above (scaled by the fit), its height and its element. */
type Block = { key: string; gap_px: number; height: (fit: OgFit) => number; render: (fit: OgFit) => ReactElement };

const fixed = (px: number) => () => px;

type CardParts = {
  model: CardModel;
  palette: OgPalette;
  heading: { line: OgHindiLine; data_uri: string } | null;
  wording: { line: OgHindiLine; data_uri: string } | null;
  photo: LoadedPhoto | null;
};

const EZ = "Eczar";
const ANEK = "Anek";

function textStyle(family: string, weight: FontWeight, size: number, line_height: number, color: string) {
  return {
    display: "flex",
    justifyContent: "center",
    textAlign: "center",
    maxWidth: OG_BODY_WIDTH_PX,
    fontFamily: family,
    fontWeight: weight,
    fontSize: size,
    lineHeight: line_height,
    color,
  } as const;
}

function hindiImage(part: { line: OgHindiLine; data_uri: string }, alt: string): ReactElement {
  const { line } = part;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image.
    <img
      src={part.data_uri}
      alt={alt}
      width={line.width_css_px}
      height={line.height_css_px}
      style={{ margin: -line.pad_css_px, width: line.width_css_px, height: line.height_css_px }}
    />
  );
}

/** One function's lines: title, then date, time, muhurat and venue; or one compact line. */
function functionBlocks(fn: CardModel["functions"][number], palette: OgPalette) {
  const title = latinOrNull(fn.title);
  const details = [fn.date_line, fn.time_line, fn.muhurat_line, latinOrNull(fn.venue_line)].filter(
    (line): line is string => typeof line === "string" && line !== "",
  );
  const compactLine = [title, fn.date_line, fn.time_line, latinOrNull(fn.venue_line)?.split(",")[0]]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join(", ");

  const fullHeight =
    (title ? textBlockPx(title, "eczar_500", 40, 1.2) : 0) +
    details.reduce((sum, line) => sum + textBlockPx(line, "anek_400", 25, 1.4), 0);
  const compactHeight = textBlockPx(compactLine, "anek_400", 25, 1.4);

  const render = (compact: boolean): ReactElement =>
    compact ? (
      <div style={textStyle(ANEK, 400, 25, 1.4, palette.ink)}>{compactLine}</div>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {title ? <div style={textStyle(EZ, 500, 40, 1.2, palette.name)}>{title}</div> : null}
        {details.map((line, index) => (
          <div key={index} style={textStyle(ANEK, 400, 25, 1.4, palette.ink)}>
            {line}
          </div>
        ))}
      </div>
    );
  return { fullHeight, compactHeight, render };
}

function buildBlocks({ model, palette, heading, wording, photo }: CardParts): Block[] {
  const blocks: Block[] = [];
  const blessing = latinOrNull(model.blessing_line);
  const leadIn = latinOrNull(model.lead_in);
  const followLine = latinOrNull(model.follow_line);

  if (blessing) {
    blocks.push({
      key: "blessing",
      gap_px: 0,
      height: fixed(textBlockPx(blessing, "eczar_400", 22, 1.4)),
      render: () => <div style={textStyle(EZ, 400, 22, 1.4, palette.blessing)}>{blessing}</div>,
    });
  }

  blocks.push({
    key: "seal",
    gap_px: blessing ? 16 : 0,
    height: fixed(88),
    render: () => (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 88,
          height: 88,
          borderRadius: 44,
          border: `1px solid ${palette.foil}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 80,
            height: 80,
            borderRadius: 40,
            border: `1px solid ${palette.foil}`,
          }}
        >
          <div style={{ ...textStyle(EZ, 600, 30, 1, palette.name), maxWidth: 80 }}>{model.initials}</div>
        </div>
      </div>
    ),
  });

  if (heading) {
    blocks.push({
      key: "heading_hi",
      gap_px: 22,
      height: fixed(heading.line.height_css_px - 2 * heading.line.pad_css_px),
      render: () => hindiImage(heading, model.heading_hi),
    });
  }

  if (leadIn) {
    blocks.push({
      key: "lead_in",
      gap_px: 18,
      height: fixed(textBlockPx(leadIn, "eczar_400", 28, 1.4)),
      render: () => <div style={textStyle(EZ, 400, 28, 1.4, palette.blessing)}>{leadIn}</div>,
    });
  }

  blocks.push({
    key: "names",
    gap_px: leadIn ? 6 : 18,
    height: fixed(textBlockPx(model.names, "eczar_600", 84, 1.1, -0.84)),
    render: () => (
      <div style={{ ...textStyle(EZ, 600, 84, 1.1, palette.name), letterSpacing: -0.84 }}>{model.names}</div>
    ),
  });

  if (followLine) {
    blocks.push({
      key: "follow_line",
      gap_px: 6,
      height: fixed(textBlockPx(followLine, "eczar_400", 28, 1.4)),
      render: () => <div style={textStyle(EZ, 400, 28, 1.4, palette.blessing)}>{followLine}</div>,
    });
  }

  if (photo) {
    const at = (fit: OgFit) => photoDisplaySize(photo.info, fit.photo_max_h);
    blocks.push({
      key: "photo",
      gap_px: 30,
      // The 1 px rule and the 10 px ivory margin on each side add 22 px.
      height: (fit) => at(fit).height + 22,
      render: (fit) => {
        const size = at(fit);
        return (
          <div
            style={{
              display: "flex",
              padding: 10,
              border: `1px solid ${palette.blessing}`,
              backgroundColor: palette.stock,
            }}
          >
            {/* The photo as uploaded: scaled to fit, never cropped (1.3). */}
            {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image. */}
            <img src={photo.data_uri} alt={photo.alt} width={size.width} height={size.height} style={{ width: size.width, height: size.height }} />
          </div>
        );
      },
    });
  }

  if (model.functions.length > 0) {
    const fns = model.functions.map((fn) => functionBlocks(fn, palette));
    const more = latinOrNull(model.more_functions_line);
    blocks.push({
      key: "functions",
      gap_px: 30,
      height: (fit) =>
        fns.reduce((sum, fn, index) => sum + (index === 0 ? 0 : 20 * fit.gap) + (fit.compact ? fn.compactHeight : fn.fullHeight), 0) +
        (more ? 16 * fit.gap + textBlockPx(more, "anek_400", 22, 1.4) : 0),
      render: (fit) => (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
          {fns.map((fn, index) => (
            <div
              key={model.functions[index]?.event_id ?? index}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: index === 0 ? 0 : 20 * fit.gap }}
            >
              {fn.render(fit.compact)}
            </div>
          ))}
          {more ? <div style={{ ...textStyle(ANEK, 400, 22, 1.4, palette.ink), marginTop: 16 * fit.gap }}>{more}</div> : null}
        </div>
      ),
    });
  } else {
    const fallback = latinOrNull(model.fallback_date_line);
    if (fallback) {
      blocks.push({
        key: "fallback_date",
        gap_px: 30,
        height: fixed(textBlockPx(fallback, "anek_400", 25, 1.4)),
        render: () => <div style={textStyle(ANEK, 400, 25, 1.4, palette.ink)}>{fallback}</div>,
      });
    }
  }

  if (wording) {
    blocks.push({
      key: "wording_hi",
      gap_px: 26,
      height: fixed(wording.line.height_css_px - 2 * wording.line.pad_css_px),
      render: () => hindiImage(wording, model.wording_hi ?? ""),
    });
  }

  const reply = latinOrNull(model.reply_line);
  if (reply) {
    blocks.push({
      key: "reply",
      gap_px: 14,
      height: fixed(textBlockPx(reply, "anek_400", 22, 1.4)),
      render: () => <div style={textStyle(ANEK, 400, 22, 1.4, palette.ink)}>{reply}</div>,
    });
  }

  const footer = latinOrNull(model.footer);
  if (footer) {
    blocks.push({
      key: "footer",
      gap_px: 18,
      height: fixed(textBlockPx(footer, "anek_400", 18, 1.4)),
      render: () => <div style={textStyle(ANEK, 400, 18, 1.4, palette.ink)}>{footer}</div>,
    });
  }

  return blocks;
}

function contentHeight(blocks: Block[], fit: OgFit): number {
  return blocks.reduce((sum, block, index) => sum + (index === 0 ? 0 : block.gap_px * fit.gap) + block.height(fit), 0);
}

/** The first fit-rule state whose content fits the card body, as the Chromium guard picks it. */
function chooseFit(blocks: Block[], has_photo: boolean): OgFit | null {
  for (const fit of fitSequence(has_photo)) {
    if (contentHeight(blocks, fit) <= OG_BODY_HEIGHT_PX + 0.5) return fit;
  }
  return null;
}

function cardElement(blocks: Block[], palette: OgPalette, fit: OgFit): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: CARD_WIDTH_PX,
        height: CARD_HEIGHT_PX,
        backgroundColor: palette.ground,
      }}
    >
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 40,
          top: 40,
          width: CARD_WIDTH_PX - 80,
          height: CARD_HEIGHT_PX - 80,
          borderRadius: 2,
          backgroundColor: palette.stock,
        }}
      >
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 12,
            top: 12,
            width: CARD_WIDTH_PX - 80 - 24,
            height: CARD_HEIGHT_PX - 80 - 24,
            border: `1px solid ${palette.foil}`,
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 64,
            top: 52,
            width: OG_BODY_WIDTH_PX,
            height: OG_BODY_HEIGHT_PX,
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
            {blocks.map((block, index) => (
              <div
                key={block.key}
                style={{ display: "flex", justifyContent: "center", marginTop: index === 0 ? 0 : block.gap_px * fit.gap }}
              >
                {block.render(fit)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ogError(code: "RENDER_FAILED", detail: string, started: number, fit = ""): RenderError {
  const elapsed = Date.now() - started;
  const timings: RenderTimings = {
    slot_ms: 0,
    launch_ms: 0,
    navigate_ms: 0,
    fonts_ms: 0,
    capture_ms: elapsed,
    total_ms: elapsed,
    instance: "warm",
    fit,
  };
  return new RenderError(code, detail, timings);
}

export type RenderCardOgOptions = {
  /** How to read the photo's bytes. Defaults to fetching it (3.7). */
  load_photo?: OgPhotoLoader;
};

/**
 * Renders the card to a 1080 × 1350 PNG with next/og, in memory. Throws RenderError
 * `RENDER_FAILED` with "names need Hindi shaping", "photo not loaded", "layout overflow"
 * or "og render failed".
 */
export async function renderCardOg(model: CardModel, options: RenderCardOgOptions = {}): Promise<Uint8Array> {
  const started = Date.now();
  // The names and initials have no fallback: a card without them is no card.
  if (!isLatinText(model.names) || !isLatinText(model.initials)) {
    throw ogError("RENDER_FAILED", "names need Hindi shaping", started);
  }

  const headingLine = headingLineFor(model.heading_hi, model.theme, model.typeface);
  const wordingLine = wordingLineFor(model.wording_hi, model.typeface);

  let fonts: OgFont[];
  let parts: CardParts;
  try {
    const [loadedFonts, headingUri, wordingUri, photo] = await Promise.all([
      loadFonts(),
      headingLine ? hindiLineDataUri(headingLine.id) : null,
      wordingLine ? hindiLineDataUri(wordingLine.id) : null,
      loadPhoto(model, options.load_photo ?? fetchPhoto),
    ]);
    fonts = loadedFonts;
    parts = {
      model,
      palette: OG_PALETTES[model.theme] ?? OG_PALETTES.maroon_gold,
      heading: headingLine && headingUri ? { line: headingLine, data_uri: headingUri } : null,
      wording: wordingLine && wordingUri ? { line: wordingLine, data_uri: wordingUri } : null,
      photo,
    };
  } catch (error) {
    const detail = error instanceof Error && error.message === "photo not loaded" ? "photo not loaded" : "og assets not loaded";
    throw ogError("RENDER_FAILED", detail, started);
  }

  const blocks = buildBlocks(parts);
  const fit = chooseFit(blocks, parts.photo !== null);
  if (!fit) throw ogError("RENDER_FAILED", "layout overflow", started, "compact");

  try {
    const response = new ImageResponse(cardElement(blocks, parts.palette, fit), {
      width: CARD_WIDTH_PX,
      height: CARD_HEIGHT_PX,
      fonts,
    });
    const png = new Uint8Array(await response.arrayBuffer());
    if (png.byteLength === 0) throw new Error("empty image");
    return png;
  } catch {
    throw ogError("RENDER_FAILED", "og render failed", started, fitLabel(fit, parts.photo !== null));
  }
}
