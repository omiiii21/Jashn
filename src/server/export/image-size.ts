import "server-only";

/**
 * Reads an image's type and pixel size from its bytes, for the og card's photo box
 * (export-and-recovery 3.7: the photo is fetched on the server and embedded). The studio
 * accepts JPEG, PNG and WEBP, never a GIF (topic 7); SVG is here for the probe's placeholder.
 * Returns null for anything else or a header it can't read.
 */

export type ImageKind = "png" | "jpeg" | "webp" | "svg";
export type ImageInfo = { kind: ImageKind; mime: string; width: number; height: number };

const MIME: Record<ImageKind, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

function info(kind: ImageKind, width: number, height: number): ImageInfo | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { kind, mime: MIME[kind], width, height };
}

function readPng(bytes: Uint8Array, view: DataView): ImageInfo | null {
  // Signature, then the IHDR chunk: width and height at offsets 16 and 20.
  if (bytes.length < 24) return null;
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null;
  return info("png", view.getUint32(16), view.getUint32(20));
}

function readJpeg(bytes: Uint8Array, view: DataView): ImageInfo | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // Start-of-frame markers carry the size; DHT (C4), JPG (C8) and DAC (CC) don't.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return info("jpeg", view.getUint16(offset + 7), view.getUint16(offset + 5));
    }
    const length = view.getUint16(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

function readWebp(bytes: Uint8Array, view: DataView): ImageInfo | null {
  if (bytes.length < 30) return null;
  const chunk = String.fromCharCode(bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0);
  if (chunk === "VP8 ") {
    return info("webp", view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
  }
  if (chunk === "VP8L") {
    const bits = view.getUint32(21, true);
    return info("webp", (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (chunk === "VP8X") {
    const width = 1 + ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16));
    const height = 1 + ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16));
    return info("webp", width, height);
  }
  return null;
}

function readSvg(bytes: Uint8Array): ImageInfo | null {
  const head = new TextDecoder().decode(bytes.subarray(0, 4096));
  const tag = /<svg\b[^>]*>/i.exec(head)?.[0];
  if (!tag) return null;
  const attr = (name: string) => {
    const match = new RegExp(`\\s${name}=["']\\s*([0-9.]+)(px)?\\s*["']`, "i").exec(tag);
    return match ? Number.parseFloat(match[1] ?? "") : null;
  };
  const width = attr("width");
  const height = attr("height");
  if (width && height) return info("svg", width, height);
  const viewBox = /\sviewBox=["']\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*["']/i.exec(tag);
  if (!viewBox) return null;
  return info("svg", Number.parseFloat(viewBox[1] ?? ""), Number.parseFloat(viewBox[2] ?? ""));
}

export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return readPng(bytes, view);
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return readJpeg(bytes, view);
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) {
    return readWebp(bytes, view);
  }
  return readSvg(bytes);
}
