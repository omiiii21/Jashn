/**
 * The seed (lane A topic A1; domain-and-data 3.7, 5.5, 6.3; demo-data 1.4; decisions D15, D68,
 * D107, D118, D120, D126). Laptop only: `npx tsx scripts/seed.ts` (or `npm run db:seed --`).
 *
 *   npx tsx scripts/seed.ts                       every copy: accounts, buckets, D0, links, card, photo
 *   npx tsx scripts/seed.ts --copies demo,a       only those copies
 *   npx tsx scripts/seed.ts --photo-only          the photo step alone, for every copy (D107): couple-photo.jpg
 *                                                 as ASSET-PHOTO, and couple-photo-2.jpg to -6.jpg as ASSET-PHOTO-2 to -6
 *   npx tsx scripts/seed.ts --skip-auth --skip-storage --copies c   local, without Supabase
 *
 * Flags: --copies <list>, --skip-auth, --skip-storage, --photo-only, --links-file <path>
 * (default demo-links.local.md), --base-url <url> (default APP_BASE_URL).
 *
 * It reads `.env.local` with `@next/env`, uses `DATABASE_URL_SESSION` (5432, never the 6543
 * pooler), and never prints a secret. New guest links are printed once and appended to the
 * gitignored links file; existing links are never reprinted. It imports nothing from
 * `src/server/` (architecture 7.1, trap 11).
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createDb, type Db } from "../src/db/client";
import { SAMPLE_COPIES, type SampleCopy } from "../src/db/ids";
import { applySeedState, ensureInvitationLinks, storedSeedUserIds, upsertCouplePhotoAsset, upsertExtraPhotoAssets } from "../src/db/seed-apply";
import { buildSeedDataset, EXTRA_PHOTO_NUMBERS, extraPhotoSeedKey, fallbackUserId, seedAccounts, type SeedAccount, type SeedDataset } from "../src/db/seed-data";

const ROOT = process.cwd();
const CARD_FILE = path.join(ROOT, "scripts/seed-assets/card-rev2.png");
const PHOTO_FILE = path.join(ROOT, "scripts/seed-assets/couple-photo.jpg");
const MB = 1024 * 1024;

/** Private buckets, no Storage policies (domain 5.5, architecture 3.6). */
const BUCKETS = [
  { id: "uploads", fileSizeLimit: 10 * MB, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] },
  { id: "exports", fileSizeLimit: 10 * MB, allowedMimeTypes: ["image/png"] },
] as const;

type Options = {
  copies: SampleCopy[];
  skipAuth: boolean;
  skipStorage: boolean;
  photoOnly: boolean;
  linksFile: string;
  baseUrl: string;
};

type IssuedLink = { copy: SampleCopy; household_seed_key: string; household_name: string; url: string };

// ---------------------------------------------------------------------------
// Arguments, environment and output hygiene
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Omit<Options, "baseUrl"> & { baseUrl: string | null } {
  const options = {
    copies: [...SAMPLE_COPIES] as SampleCopy[],
    skipAuth: false,
    skipStorage: false,
    photoOnly: false,
    linksFile: path.join(ROOT, "demo-links.local.md"),
    baseUrl: null as string | null,
  };
  const value = (flag: string, index: number): string => {
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`${flag} needs a value`);
    return next;
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const [flag, inline] = arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    switch (flag) {
      case "--copies": {
        const list = (inline ?? value(flag, index++)).split(",").map((copy) => copy.trim()).filter(Boolean);
        const unknown = list.filter((copy) => !(SAMPLE_COPIES as readonly string[]).includes(copy));
        if (unknown.length > 0 || list.length === 0) {
          throw new Error(`--copies takes a comma-separated list of ${SAMPLE_COPIES.join(", ")}`);
        }
        options.copies = [...new Set(list)] as SampleCopy[];
        break;
      }
      case "--skip-auth":
        options.skipAuth = true;
        break;
      case "--skip-storage":
        options.skipStorage = true;
        break;
      case "--photo-only":
        options.photoOnly = true;
        break;
      case "--links-file":
        options.linksFile = path.resolve(ROOT, inline ?? value(flag, index++));
        break;
      case "--base-url":
        options.baseUrl = inline ?? value(flag, index++);
        break;
      case "--help":
      case "-h":
        console.log("Usage: npx tsx scripts/seed.ts [--copies demo,a] [--skip-auth] [--skip-storage] [--photo-only] [--links-file path] [--base-url url]");
        process.exit(0);
      default:
        throw new Error(`Unknown flag ${arg}`);
    }
  }
  return options;
}

function requireEnv(name: string): string {
  const raw = process.env[name]?.trim();
  if (!raw) throw new Error(`${name} is not set (in .env.local or the environment)`);
  return raw;
}

/** The secrets this run holds, so no error message can echo one. */
function secretValues(): string[] {
  return ["SEED_PASSWORD", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL_SESSION", "DATABASE_URL"]
    .map((name) => process.env[name])
    .filter((value): value is string => typeof value === "string" && value.length >= 6);
}

function redact(message: string): string {
  let clean = message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[database url]");
  for (const secret of secretValues()) clean = clean.split(secret).join("[secret]");
  return clean;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return redact(`${error.message}${typeof code === "string" ? ` (${code})` : ""}`);
  }
  return redact(String(error));
}

/** The links' origin: --base-url, then APP_BASE_URL, then the production host, then port 3000. */
function baseUrlFor(explicit: string | null): string {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const raw = explicit?.trim() || process.env.APP_BASE_URL?.trim() || (production ? `https://${production}` : "");
  return (raw || "http://localhost:3000").replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Supabase: accounts and buckets
// ---------------------------------------------------------------------------

function supabaseAdmin(): SupabaseClient {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function listUserIds(admin: SupabaseClient): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const perPage = 1000;
  for (let page = 1; page < 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not list Auth users: ${error.message}`);
    for (const user of data.users) {
      if (user.email) ids.set(user.email.toLowerCase(), user.id);
    }
    if (data.users.length < perPage) break;
  }
  return ids;
}

function isAlreadyRegistered(error: { message?: string; code?: string; status?: number }): boolean {
  return (
    error.code === "email_exists" ||
    error.code === "user_already_exists" ||
    /already (been )?registered|already exists/i.test(error.message ?? "")
  );
}

/**
 * Creates every account through the Admin API with `SEED_PASSWORD` and the email confirmed (D68,
 * D118). "Already exists" counts as success; the existing user's password is left alone.
 */
async function ensureAccounts(admin: SupabaseClient, accounts: SeedAccount[]): Promise<Record<string, string>> {
  const password = requireEnv("SEED_PASSWORD");
  let known = await listUserIds(admin);
  const userIds: Record<string, string> = {};
  let created = 0;

  for (const account of accounts) {
    const email = account.email.toLowerCase();
    let id = known.get(email);
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: account.display_name },
      });
      if (error) {
        if (!isAlreadyRegistered(error)) throw new Error(`Could not create ${email}: ${redact(error.message)}`);
        known = await listUserIds(admin);
        id = known.get(email);
        if (!id) throw new Error(`${email} already exists but could not be found`);
      } else {
        id = data.user.id;
        created++;
      }
    }
    userIds[account.email] = id;
  }
  console.log(`auth: ${accounts.length} accounts ready (${created} created, ${accounts.length - created} already there)`);
  return userIds;
}

async function ensureBuckets(admin: SupabaseClient): Promise<void> {
  for (const bucket of BUCKETS) {
    const settings = { public: false, fileSizeLimit: bucket.fileSizeLimit, allowedMimeTypes: [...bucket.allowedMimeTypes] };
    const existing = await admin.storage.getBucket(bucket.id);
    if (existing.error) {
      const created = await admin.storage.createBucket(bucket.id, settings);
      if (created.error && !/already exists/i.test(created.error.message)) {
        throw new Error(`Could not create bucket ${bucket.id}: ${created.error.message}`);
      }
      if (!created.error) {
        console.log(`storage: created private bucket ${bucket.id}`);
        continue;
      }
    }
    const updated = await admin.storage.updateBucket(bucket.id, settings);
    if (updated.error) throw new Error(`Could not update bucket ${bucket.id}: ${updated.error.message}`);
    console.log(`storage: bucket ${bucket.id} is private (${settings.allowedMimeTypes.join(", ")}, 10 MB)`);
  }
}

async function uploadObject(
  admin: SupabaseClient,
  bucket: "uploads" | "exports",
  key: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await admin.storage.from(bucket).upload(key, bytes, { contentType, upsert: true, cacheControl: "3600" });
  if (error) throw new Error(`Could not upload ${bucket}/${key}: ${error.message}`);
  // The size check the worker also makes (export-and-recovery 2.6).
  const folder = key.slice(0, key.lastIndexOf("/"));
  const name = key.slice(key.lastIndexOf("/") + 1);
  const listed = await admin.storage.from(bucket).list(folder, { search: name, limit: 10 });
  const size = listed.data?.find((object) => object.name === name)?.metadata?.size;
  if (typeof size === "number" && size !== bytes.length) {
    throw new Error(`Uploaded ${bucket}/${key} is ${size} bytes, expected ${bytes.length}`);
  }
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/** Width and height from a JPEG's first start-of-frame marker, or null when it can't be read. */
function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset++;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    offset += 2 + length;
  }
  return null;
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** "c Bhat (H16): http://localhost:3001/i/…": the key tells same-name households apart. */
function formatLink(link: IssuedLink): string {
  return `${link.copy} ${link.household_name} (${link.household_seed_key}): ${link.url}`;
}

function recordLinks(file: string, links: IssuedLink[]): void {
  if (links.length === 0) return;
  if (!existsSync(file)) {
    writeFileSync(
      file,
      "# Demo links\n\nGuest links printed once by `scripts/seed.ts`. Gitignored: never commit, paste or share this file.\n",
      { mode: 0o600 },
    );
  }
  const stamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
  const lines = links.map((link) => `- ${formatLink(link)}`);
  appendFileSync(file, `\n## Seed run, ${stamp} IST\n\n${lines.join("\n")}\n`);
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function fallbackUserIds(accounts: SeedAccount[]): Record<string, string> {
  return Object.fromEntries(accounts.map((account) => [account.email, fallbackUserId(account.email)]));
}

/** The extra couple photos present on disk (couple-photo-2.jpg to -6.jpg); missing ones are skipped. */
function readExtraPhotos(): ExtraPhotoFile[] {
  return EXTRA_PHOTO_NUMBERS.flatMap((number) => {
    const file = path.join(ROOT, "scripts/seed-assets", `couple-photo-${number}.jpg`);
    return existsSync(file) ? [{ seed_key: extraPhotoSeedKey(number), file_name: path.basename(file), data: readFileSync(file) }] : [];
  });
}

type ExtraPhotoFile = { seed_key: string; file_name: string; data: Buffer };

/** The extra photos (ASSET-PHOTO-2 to -6): upload each, then upsert their rows in one transaction. */
async function extraPhotoStep(db: Db, admin: SupabaseClient, dataset: SeedDataset, extras: ExtraPhotoFile[]): Promise<void> {
  if (extras.length === 0) return;
  for (const extra of extras) {
    const photo = dataset.extra_photos.find((candidate) => candidate.seed_key === extra.seed_key);
    if (!photo) throw new Error(`${extra.seed_key} is not one of the extra photos`);
    await uploadObject(admin, "uploads", photo.storage_path, extra.data, "image/jpeg");
  }
  const result = await db.transaction((tx) =>
    upsertExtraPhotoAssets(
      tx,
      dataset,
      extras.map((extra) => {
        const size = jpegSize(extra.data);
        return {
          seed_key: extra.seed_key,
          bytes: extra.data.length,
          mime_type: "image/jpeg",
          ...(size ? { width: size.width, height: size.height } : {}),
        };
      }),
    ),
  );
  console.log(`${dataset.copy}: ${result.assets.length} extra photos (${result.assets.map((asset) => asset.seed_key).join(", ")}), version ${result.version}`);
}

/** Step 5, the photo step (D107, D126): upload the file, then fill the asset row's file fields. */
async function photoStep(db: Db, admin: SupabaseClient, dataset: SeedDataset, photo: Buffer): Promise<void> {
  await uploadObject(admin, "uploads", dataset.photo.storage_path, photo, "image/jpeg");
  const size = jpegSize(photo);
  const result = await db.transaction((tx) =>
    upsertCouplePhotoAsset(tx, dataset, {
      bytes: photo.length,
      mime_type: "image/jpeg",
      ...(size ? { width: size.width, height: size.height } : {}),
    }),
  );
  console.log(`${dataset.copy}: couple photo at uploads/${result.storage_path} (${photo.length} bytes), version ${result.version}`);
}

/**
 * Steps 3 and 4 for one copy: the card upload, then D0 and the links in one transaction. The
 * photo step runs after it, in `main`, once the new links are safe: a token exists only in
 * this run's memory, so nothing that can fail may stand between the commit and recording it.
 */
async function seedCopy(
  db: Db,
  admin: SupabaseClient | null,
  copy: SampleCopy,
  userIds: Record<string, string>,
  files: { card: Buffer | null },
  baseUrl: string,
): Promise<{ dataset: SeedDataset; links: IssuedLink[] }> {
  // Step 4 comes first for the card: the file goes to its fixed key, then the job row records it (D15).
  let dataset = buildSeedDataset(copy, { user_ids: userIds });
  if (admin && files.card) {
    await uploadObject(admin, "exports", dataset.rev2_job.artifact_path, files.card, "image/png");
    dataset = buildSeedDataset(copy, {
      user_ids: userIds,
      rev2_card: { sha256: sha256Hex(files.card), bytes: files.card.length },
    });
  }

  // Step 3: D0 and the links, in one transaction.
  const { version, links } = await db.transaction(async (tx) => {
    const applied = await applySeedState(tx, dataset, { now: new Date() });
    const issued = await ensureInvitationLinks(tx, dataset);
    return { version: applied.version, links: issued };
  });
  const cardNote = admin && files.card ? "REV-2 card uploaded" : "REV-2 card Ready without a file (D15)";
  console.log(`${copy}: D0 applied to wedding ${dataset.wedding_id}, version ${version}, ${links.length} new links, ${cardNote}`);

  return {
    dataset,
    links: links.map((link) => ({
      copy,
      household_seed_key: link.household_seed_key,
      household_name: link.household_name,
      url: `${baseUrl}/i/${link.token}`,
    })),
  };
}

async function main(): Promise<void> {
  loadEnvConfig(ROOT, false, { info: () => {}, error: (...args: unknown[]) => console.error(...args.map(String).map(redact)) });
  const parsed = parseArgs(process.argv.slice(2));
  const options: Options = { ...parsed, baseUrl: baseUrlFor(parsed.baseUrl) };

  const { db, client } = createDb(requireEnv("DATABASE_URL_SESSION"), { max: 2, idle_timeout_s: 5, prepare: false });
  const failures: string[] = [];
  try {
    const needsAdmin = !options.skipStorage || (!options.skipAuth && !options.photoOnly);
    const admin = needsAdmin ? supabaseAdmin() : null;
    const storage = options.skipStorage ? null : admin;
    const files = {
      card: existsSync(CARD_FILE) ? readFileSync(CARD_FILE) : null,
      photo: existsSync(PHOTO_FILE) ? readFileSync(PHOTO_FILE) : null,
      extra_photos: readExtraPhotos(),
    };
    const missingExtras = EXTRA_PHOTO_NUMBERS.length - files.extra_photos.length;

    if (options.photoOnly) {
      if (!storage) throw new Error("--photo-only needs Storage: drop --skip-storage");
      if (!files.photo) throw new Error("scripts/seed-assets/couple-photo.jpg is missing");
      for (const copy of options.copies) {
        try {
          const dataset = buildSeedDataset(copy, { user_ids: fallbackUserIds(seedAccounts(copy)) });
          await photoStep(db, storage, dataset, files.photo);
          await extraPhotoStep(db, storage, dataset, files.extra_photos);
        } catch (error) {
          failures.push(`${copy}: ${describeError(error)}`);
        }
      }
      if (missingExtras > 0) console.log(`photos: ${missingExtras} of couple-photo-2.jpg to -6.jpg not there yet; skipped`);
      return;
    }

    const accounts = options.copies.flatMap((copy) => seedAccounts(copy));
    const authIds = options.skipAuth || !admin ? null : await ensureAccounts(admin, accounts);
    if (!authIds) console.log("auth: skipped; members keep their stored user ids (local stand-ins when new)");
    if (storage) await ensureBuckets(storage);
    else console.log("storage: skipped; no card or photo upload");
    if (storage && !files.card) console.log("card: scripts/seed-assets/card-rev2.png not there yet; JOB-EXP-R2-PNG stays Ready without a file");
    if (storage && !files.photo) console.log("photo: scripts/seed-assets/couple-photo.jpg not there yet; the photo row keeps no file");
    if (storage && files.photo && missingExtras > 0) console.log(`photos: ${missingExtras} of couple-photo-2.jpg to -6.jpg not there yet; skipped`);

    const issued: IssuedLink[] = [];
    for (const copy of options.copies) {
      let seeded: { dataset: SeedDataset; links: IssuedLink[] };
      try {
        const userIds = authIds ?? (await storedSeedUserIds(db, copy));
        seeded = await seedCopy(db, storage, copy, userIds, files, options.baseUrl);
      } catch (error) {
        failures.push(`${copy}: ${describeError(error)}`);
        continue;
      }
      // Committed: these tokens are shown now or never, so they are kept before anything else runs.
      issued.push(...seeded.links);
      try {
        recordLinks(options.linksFile, seeded.links);
      } catch (error) {
        failures.push(`${copy}: links file not written (the links are printed below): ${describeError(error)}`);
      }
      if (storage && files.photo) {
        try {
          await photoStep(db, storage, seeded.dataset, files.photo);
          await extraPhotoStep(db, storage, seeded.dataset, files.extra_photos);
        } catch (error) {
          failures.push(`${copy}: photo step: ${describeError(error)}`);
        }
      }
    }

    if (issued.length > 0) {
      const relative = path.relative(ROOT, options.linksFile);
      const shown = relative && !relative.startsWith("..") ? relative : options.linksFile;
      console.log(`\nNew guest links, shown once (also appended to ${shown}):`);
      for (const link of issued) console.log(formatLink(link));
    } else {
      console.log("links: no new links (existing links are kept and never reprinted)");
    }
  } finally {
    if (failures.length > 0) {
      for (const failure of failures) console.error(`seed failed for ${failure}`);
      process.exitCode = 1;
    }
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(`seed failed: ${describeError(error)}`);
  process.exitCode = 1;
});
