/**
 * Seeded ids (decisions D100 and D123; domain-and-data 0.1).
 *
 * Every seeded row gets a fixed UUIDv5 (RFC 4122, SHA-1) under SEED_ID_NAMESPACE,
 * from the name "<copy>:<table>:<seed_key>", for example "demo:households:H16".
 * Live rows keep the database's gen_random_uuid() default.
 *
 * No `server-only` here: the fixtures (browser), the seed (a laptop script) and the
 * server all import this file. It has no dependencies and is synchronous, so it
 * carries its own small SHA-1.
 */

export const SEED_ID_NAMESPACE = "75e13aff-00d4-427e-8e6b-7bd1798f1316";

/** The sample copies the seed creates (domain 3.7, demo-data 1.4). */
export const SAMPLE_COPIES = ["demo", "e2e", "a", "b", "c", "d"] as const;
export type SampleCopy = (typeof SAMPLE_COPIES)[number];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for any 8-4-4-4-12 hex string (any version). */
export function isUuidShaped(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function rotl(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

/** SHA-1 of a byte array (FIPS 180-4). Used only for UUIDv5 names, never for secrets. */
export function sha1(bytes: Uint8Array): Uint8Array {
  const length = bytes.length;
  const paddedLength = Math.ceil((length + 9) / 64) * 64;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(bytes);
  buffer[length] = 0x80;
  const view = new DataView(buffer.buffer);
  const bitLength = length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0);
  outView.setUint32(4, h1);
  outView.setUint32(8, h2);
  outView.setUint32(12, h3);
  outView.setUint32(16, h4);
  return out;
}

function uuidToBytes(uuid: string): Uint8Array {
  if (!isUuidShaped(uuid)) throw new Error(`Not a UUID: ${uuid}`);
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToUuid(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < 16; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** RFC 4122 version 5 UUID of `name` (UTF-8) under `namespace`. */
export function uuidV5(name: string, namespace: string = SEED_ID_NAMESPACE): string {
  const namespaceBytes = uuidToBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(namespaceBytes.length + nameBytes.length);
  input.set(namespaceBytes);
  input.set(nameBytes, namespaceBytes.length);
  const hash = sha1(input).slice(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return bytesToUuid(hash);
}

/** The UUIDv5 name for a seeded row: "<copy>:<table>:<seed_key>" (D123). */
export function seededIdName(copy: SampleCopy, table: string, seed_key: string): string {
  return `${copy}:${table}:${seed_key}`;
}

/**
 * The fixed id of a seeded row. `table` is the table name as domain-and-data 5.1
 * writes it ("households", "events", "payment_versions"), and `seed_key` the row's
 * demo-data label ("H16", "EVT-REC", "PAY-01/v1").
 */
export function seededId(copy: SampleCopy, table: string, seed_key: string): string {
  return uuidV5(seededIdName(copy, table, seed_key), SEED_ID_NAMESPACE);
}
