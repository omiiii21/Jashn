/**
 * The seed applier (domain-and-data 3.7 `reset_demo`, 5.0, 5.5, 6.3; demo-data 1.4; decisions
 * D15, D17, D100, D107, D120, D126).
 *
 * One function makes a sample copy exactly D0 (or S0): the seed script runs it per copy, and
 * Lane A's `reset_demo` handler runs it inside the dispatcher's transaction. It
 *   1. locks the copy's `weddings` row;
 *   2. deletes the copy's live rows (no `seed_key`) and stale seeded rows (a `seed_key` the
 *      dataset no longer has), children first, keeping the tables domain 3.7 keeps;
 *   3. upserts every seeded row by its fixed id, setting every column (an omitted column gets
 *      its default back), so a changed seeded value is restored;
 *   4. bumps `weddings.version` by 1. It never goes down and is never reset.
 *
 * Kept (domain 3.7): `members` (seeded rows are upserted, live ones stay), `invitation_links`
 * (Tara's link survives every reset; only links of deleted live households go), `assets` (the
 * couple photo; its file fields survive a reset), `experiment_exposures`, `card_imports`, and
 * the seeded export job's artifact fields (the file at its fixed key survives too).
 *
 * No `server-only` here and nothing from `src/server/`: `scripts/seed.ts` runs it under tsx and
 * Vitest imports it (architecture 7.1, trap 11).
 */
import { createHash, randomBytes } from "node:crypto";

import { and, eq, inArray, isNotNull, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import { getTableConfig, type PgColumn, type PgTable } from "drizzle-orm/pg-core";

import type { DbOrTx, Tx } from "./client";
import { SAMPLE_COPIES, seededId, type SampleCopy } from "./ids";
import { ALL_TABLES, assets, households, invitationLinks, inviteStyles, members, weddings } from "./schema";
import { buildSeedDataset, fallbackUserId, invitationLinkSeedKey, seedAccounts, type SeedDataset } from "./seed-data";

export type TableKey = keyof typeof ALL_TABLES;
type Row = Record<string, unknown>;

/** Tables `reset_demo` never deletes from (domain 3.7). Seeded `members` and `assets` rows are still upserted. */
const KEPT_TABLES: ReadonlySet<TableKey> = new Set<TableKey>([
  "members",
  "invitationLinks",
  "assets",
  "experimentExposures",
  "cardImports",
]);

/** Columns whose existing value survives an upsert when the dataset leaves them null (files at fixed keys). */
const KEEP_EXISTING_WHEN_NULL: Partial<Record<TableKey, readonly string[]>> = {
  exportJobs: ["artifact_path", "artifact_sha256", "artifact_bytes", "artifact_created_at"],
  assets: ["mime_type", "bytes", "width", "height"],
};

/** Columns an upsert never writes: the cursor and the feed's identity. */
const NEVER_WRITTEN: Partial<Record<TableKey, readonly string[]>> = {
  weddings: ["version"],
  activityEntries: ["seq"],
};

const TABLE_KEYS = Object.keys(ALL_TABLES) as TableKey[];
const INSERT_CHUNK = 400;

type TableMeta = {
  key: TableKey;
  table: PgTable;
  /** The SQL table name, which is also the `seededId` table name (domain 5.1). */
  name: string;
  columns: PgColumn[];
  byName: Map<string, PgColumn>;
  /** Primary-key columns: `id`, the parent key, or the composite key. */
  identity: PgColumn[];
  wedding: PgColumn | undefined;
  seedKey: PgColumn | undefined;
};

const META: Map<TableKey, TableMeta> = new Map(
  TABLE_KEYS.map((key) => {
    const table = ALL_TABLES[key] as unknown as PgTable;
    const config = getTableConfig(table);
    const byName = new Map(config.columns.map((column) => [column.name, column]));
    const single = config.columns.filter((column) => column.primary);
    const identity = single.length > 0 ? single : (config.primaryKeys[0]?.columns ?? []);
    return [
      key,
      {
        key,
        table,
        name: config.name,
        columns: config.columns,
        byName,
        identity,
        wedding: key === "weddings" ? undefined : byName.get("wedding_id"),
        seedKey: byName.get("seed_key"),
      },
    ];
  }),
);

function meta(key: TableKey): TableMeta {
  const found = META.get(key);
  if (!found) throw new Error(`Unknown table ${key}`);
  return found;
}

function rowsOf(dataset: SeedDataset, key: TableKey): Row[] {
  return ((dataset.rows as Partial<Record<TableKey, Row[]>>)[key] ?? []) as Row[];
}

/** The identity of a row as one string: the id, or "vendor_id:event_id" for a composite key. */
function identityOf(tableMeta: TableMeta, row: Row): string {
  return tableMeta.identity.map((column) => String(row[column.name])).join(":");
}

function identityExpression(tableMeta: TableMeta): SQL | PgColumn {
  if (tableMeta.identity.length === 1) return tableMeta.identity[0];
  return sql.join(
    tableMeta.identity.map((column) => sql`${column}::text`),
    sql` || ':' || `,
  );
}

/**
 * The rows of `key` in this copy that step 2 deletes: live rows (unless `keep_live_rows`) and
 * seeded rows the dataset no longer has. Undefined when the table is never deleted from.
 */
function deletePredicate(dataset: SeedDataset, key: TableKey, keepLiveRows: boolean): SQL | undefined {
  const tableMeta = meta(key);
  if (key === "weddings" || !tableMeta.wedding) return undefined;
  const inCopy = eq(tableMeta.wedding, dataset.wedding_id);
  if (!tableMeta.seedKey) {
    // command_receipts has no seed_key: every receipt of the copy is live (domain 3.7 step 2).
    return keepLiveRows ? undefined : inCopy;
  }
  const keepIds = rowsOf(dataset, key).map((row) => identityOf(tableMeta, row));
  const notInDataset = notInArray(identityExpression(tableMeta) as PgColumn, keepIds);
  const target = keepLiveRows
    ? and(isNotNull(tableMeta.seedKey), notInDataset)
    : or(isNull(tableMeta.seedKey), notInDataset);
  return and(inCopy, target);
}

function assertDatasetScope(dataset: SeedDataset): void {
  const weddingRows = rowsOf(dataset, "weddings");
  if (weddingRows.length !== 1 || weddingRows[0].id !== dataset.wedding_id) {
    throw new Error(`Seed dataset for copy ${dataset.copy} must hold exactly its own weddings row`);
  }
  for (const key of TABLE_KEYS) {
    if (key === "weddings") continue;
    for (const row of rowsOf(dataset, key)) {
      if (row.wedding_id !== undefined && row.wedding_id !== dataset.wedding_id) {
        throw new Error(`Seed dataset for copy ${dataset.copy} has a ${meta(key).name} row of another wedding`);
      }
    }
  }
}

async function lockWedding(tx: Tx, wedding_id: string): Promise<boolean> {
  const locked = await tx.select({ id: weddings.id }).from(weddings).where(eq(weddings.id, wedding_id)).for("update");
  return locked.length > 0;
}

async function bumpVersion(tx: Tx, wedding_id: string): Promise<number> {
  const [row] = await tx
    .update(weddings)
    .set({ version: sql`${weddings.version} + 1` })
    .where(eq(weddings.id, wedding_id))
    .returning({ version: weddings.version });
  if (!row) throw new Error("The wedding row is missing");
  return row.version;
}

/**
 * Before step 2: nullable references from surviving rows to rows step 2 deletes are cleared
 * (for example a seeded function moved to a live venue). The upsert puts the seeded value back.
 */
async function clearReferencesToDeletedRows(tx: Tx, dataset: SeedDataset, keepLiveRows: boolean): Promise<void> {
  for (const childKey of TABLE_KEYS) {
    const child = meta(childKey);
    if (!child.wedding) continue;
    for (const foreignKey of getTableConfig(child.table).foreignKeys) {
      if (foreignKey.onDelete === "cascade" || foreignKey.onDelete === "set null") continue;
      const reference = foreignKey.reference();
      const column = reference.columns[0];
      if (reference.columns.length !== 1 || column.notNull) continue;
      const parentKey = TABLE_KEYS.find((key) => meta(key).table === reference.foreignTable);
      if (!parentKey || parentKey === "weddings" || KEPT_TABLES.has(parentKey)) continue;
      const parent = meta(parentKey);
      const predicate = deletePredicate(dataset, parentKey, keepLiveRows);
      if (!predicate || parent.identity.length !== 1) continue;
      const doomed = tx.select({ id: parent.identity[0] }).from(parent.table).where(predicate);
      await tx
        .update(child.table)
        .set({ [column.name]: null } as never)
        .where(and(eq(child.wedding, dataset.wedding_id), inArray(column, doomed)));
    }
  }
}

/** Step 2: delete live and stale seeded rows, children first. */
async function deleteRows(tx: Tx, dataset: SeedDataset, keepLiveRows: boolean): Promise<void> {
  for (const key of [...TABLE_KEYS].reverse()) {
    if (key === "invitationLinks") {
      // Kept, except the links of live households, which are deleted next (their FK has no action).
      const doomedHouseholds = deletePredicate(dataset, "households", keepLiveRows);
      if (!doomedHouseholds) continue;
      await tx
        .delete(invitationLinks)
        .where(
          and(
            eq(invitationLinks.wedding_id, dataset.wedding_id),
            inArray(invitationLinks.household_id, tx.select({ id: households.id }).from(households).where(doomedHouseholds)),
          ),
        );
      continue;
    }
    if (KEPT_TABLES.has(key)) continue;
    const predicate = deletePredicate(dataset, key, keepLiveRows);
    if (!predicate) continue;
    await tx.delete(meta(key).table).where(predicate);
  }
}

/** Step 3 for one table: insert or update every seeded row by its identity. */
async function upsertRows(tx: Tx, key: TableKey, rows: Row[], now: Date): Promise<void> {
  if (rows.length === 0) return;
  const tableMeta = meta(key);
  const neverWritten = new Set(NEVER_WRITTEN[key] ?? []);
  const keepExisting = new Set(KEEP_EXISTING_WHEN_NULL[key] ?? []);
  const identityNames = new Set(tableMeta.identity.map((column) => column.name));
  const hasUpdatedAt = tableMeta.byName.has("updated_at");

  const prepared = rows.map((row) => {
    const copy: Row = { ...row };
    for (const name of neverWritten) {
      if (key !== "weddings" || name !== "version") delete copy[name];
    }
    if (hasUpdatedAt && copy.updated_at === undefined) copy.updated_at = now;
    return copy;
  });
  const writesCreatedAt = prepared.some((row) => row.created_at !== undefined);

  const set: Record<string, SQL> = {};
  for (const column of tableMeta.columns) {
    const name = column.name;
    if (identityNames.has(name) || neverWritten.has(name)) continue;
    if (name === "created_at" && !writesCreatedAt) continue;
    set[name] = keepExisting.has(name)
      ? sql.raw(`coalesce(excluded."${name}", "${tableMeta.name}"."${name}")`)
      : sql.raw(`excluded."${name}"`);
  }

  for (let start = 0; start < prepared.length; start += INSERT_CHUNK) {
    const chunk = prepared.slice(start, start + INSERT_CHUNK);
    await tx
      .insert(tableMeta.table)
      .values(chunk as never)
      .onConflictDoUpdate({ target: tableMeta.identity as never, set: set as never });
  }
}

/** Step 3: every seeded row, parents first. */
async function upsertDataset(tx: Tx, dataset: SeedDataset, now: Date): Promise<void> {
  const primaries: { id: string; primary_guest_id: string }[] = [];

  for (const key of TABLE_KEYS) {
    if (key === "assets") {
      // The couple photo (D126): its D0 row is inserted when missing and never overwritten, so
      // the photo step's file fields survive every reset (domain 3.7 keeps `assets`).
      await tx.insert(assets).values(dataset.photo.row).onConflictDoNothing({ target: assets.id });
    }
    let rows = rowsOf(dataset, key);
    if (rows.length === 0) continue;

    if (key === "households") {
      // households.primary_guest_id points at guests, which come later: set it after them.
      rows = rows.map((row) => {
        if (typeof row.primary_guest_id === "string") {
          primaries.push({ id: String(row.id), primary_guest_id: row.primary_guest_id });
        }
        return { ...row, primary_guest_id: null };
      });
    }

    if (key === "inviteStyles") {
      // The photo is referenced only when its asset row exists.
      const candidate = (rows[0].photo_asset_id as string | null | undefined) ?? dataset.photo.asset_id;
      const found = await tx.select({ id: assets.id }).from(assets).where(eq(assets.id, candidate));
      rows = rows.map((row) => ({ ...row, photo_asset_id: found.length > 0 ? candidate : null }));
    }

    await upsertRows(tx, key, rows, now);

    if (key === "guests" && primaries.length > 0) {
      const values = sql.join(
        primaries.map((row) => sql`(${row.id}::uuid, ${row.primary_guest_id}::uuid)`),
        sql`, `,
      );
      await tx.execute(
        sql`update ${households} set primary_guest_id = v.primary_guest_id from (values ${values}) as v(id, primary_guest_id) where ${households.id} = v.id`,
      );
    }
  }
}

/**
 * Makes the copy's wedding exactly the dataset's state (D0 from `buildSeedDataset`, or S0 from
 * `datasetForCheckpoint`). Runs inside the caller's transaction; returns the new `version`.
 *
 * `keep_live_rows` skips deleting live rows (stale seeded rows still go). It is safe only when
 * no live row conflicts with a seeded one, such as a live current payment version.
 */
export async function applySeedState(
  tx: Tx,
  dataset: SeedDataset,
  options: { now: Date; keep_live_rows?: boolean },
): Promise<{ version: number }> {
  assertDatasetScope(dataset);
  const keepLiveRows = options.keep_live_rows ?? false;

  const exists = await lockWedding(tx, dataset.wedding_id);
  if (exists) {
    await clearReferencesToDeletedRows(tx, dataset, keepLiveRows);
    await deleteRows(tx, dataset, keepLiveRows);
  }
  await upsertDataset(tx, dataset, options.now);
  const version = await bumpVersion(tx, dataset.wedding_id);
  return { version };
}

/**
 * The dataset for a `reset_demo` checkpoint (domain 3.7). `d0` is the dataset itself; `s0`, the
 * video's opening, also removes COM-01, PAY-01 and their versions and reopens QUO-01.
 */
export function datasetForCheckpoint(dataset: SeedDataset, checkpoint: "s0" | "d0"): SeedDataset {
  if (checkpoint === "d0") return dataset;
  const commitmentId = seededId(dataset.copy, "commitments", "COM-01");
  const paymentId = seededId(dataset.copy, "payments", "PAY-01");
  const rows = { ...dataset.rows } as Partial<Record<TableKey, Row[]>>;
  const keep = (key: TableKey, test: (row: Row) => boolean) => {
    if (rows[key]) rows[key] = rows[key].filter(test);
  };
  keep("commitments", (row) => row.id !== commitmentId);
  keep("commitmentVersions", (row) => row.commitment_id !== commitmentId);
  keep("payments", (row) => row.id !== paymentId && row.commitment_id !== commitmentId);
  const removedPayments = new Set(
    rowsOf(dataset, "payments")
      .filter((row) => row.id === paymentId || row.commitment_id === commitmentId)
      .map((row) => row.id),
  );
  keep("paymentVersions", (row) => !removedPayments.has(row.payment_id));
  if (rows.quotes) {
    rows.quotes = rows.quotes.map((row) => (row.seed_key === "QUO-01" ? { ...row, status: "open" } : row));
  }
  // Before record_commitment, which moves the vendor from `considering` to `booked` (3.3):
  // at S0 the caterer has only its quote (demo-data 7.3).
  const catererId = rowsOf(dataset, "commitments").find((row) => row.id === commitmentId)?.vendor_id;
  if (rows.vendors && catererId) {
    rows.vendors = rows.vendors.map((row) => (row.id === catererId ? { ...row, status: "considering" } : row));
  }
  return { ...dataset, rows: rows as SeedDataset["rows"] };
}

/** The sample copy whose seeded wedding id this is, or null for any other wedding. */
export function sampleCopyOfWedding(wedding_id: string): SampleCopy | null {
  return SAMPLE_COPIES.find((copy) => seededId(copy, "weddings", "WEDDING") === wedding_id) ?? null;
}

/**
 * Each seed account's Auth user id as the copy's seeded member rows hold it, or the local
 * stand-in when the row is missing. A reset or a `--skip-auth` seed run uses these, so it never
 * swaps a real Auth id for a stand-in and signs someone out of their copy.
 */
export async function storedSeedUserIds(db: DbOrTx, copy: SampleCopy): Promise<Record<string, string>> {
  const stored = await db
    .select({ seed_key: members.seed_key, user_id: members.user_id })
    .from(members)
    .where(and(eq(members.wedding_id, seededId(copy, "weddings", "WEDDING")), isNotNull(members.seed_key)));
  const byKey = new Map(stored.map((row) => [row.seed_key, row.user_id]));
  return Object.fromEntries(
    seedAccounts(copy).map((account) => [account.email, byKey.get(account.member_key) ?? fallbackUserId(account.email)]),
  );
}

/** The dataset `reset_demo` applies (domain 3.7): the checkpoint's rows with the stored Auth user ids. */
export async function datasetForReset(tx: Tx, copy: SampleCopy, checkpoint: "s0" | "d0"): Promise<SeedDataset> {
  return datasetForCheckpoint(buildSeedDataset(copy, { user_ids: await storedSeedUserIds(tx, copy) }), checkpoint);
}

// ---------------------------------------------------------------------------
// Guest links (domain 6.3)
// ---------------------------------------------------------------------------

/** SHA-256 of a raw link token, as stored in `invitation_links.token_hash`. */
export function hashLinkToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

/** 32 random bytes, base64url without padding: 43 characters (domain 6.3). */
export function newLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

function ownerMemberId(dataset: SeedDataset): string | null {
  const owners = rowsOf(dataset, "members").filter((row) => row.role === "owner");
  const mira = owners.find((row) => row.seed_key === "MEM-MIRA") ?? owners[0];
  return mira ? String(mira.id) : null;
}

/**
 * Gives every link household without an active link a new one, and returns only the new raw
 * tokens: the one time they are shown. A rerun keeps existing rows and returns nothing for them.
 * Only the SHA-256 and the last 4 characters are stored.
 */
export async function ensureInvitationLinks(
  tx: Tx,
  dataset: SeedDataset,
): Promise<Array<{ household_seed_key: string; household_name: string; token: string }>> {
  const issued: Array<{ household_seed_key: string; household_name: string; token: string }> = [];
  const householdRows = rowsOf(dataset, "households");
  const createdBy = ownerMemberId(dataset);

  for (const household_seed_key of dataset.link_households) {
    const household_id = seededId(dataset.copy, "households", household_seed_key);
    const household = householdRows.find((row) => row.id === household_id);
    if (!household) throw new Error(`Link household ${household_seed_key} is not in the ${dataset.copy} dataset`);

    const active = await tx
      .select({ id: invitationLinks.id })
      .from(invitationLinks)
      .where(and(eq(invitationLinks.household_id, household_id), isNull(invitationLinks.revoked_at)))
      .limit(1);
    if (active.length > 0) continue;

    const seed_key = invitationLinkSeedKey(household_seed_key);
    const seededRow = await tx
      .select({ id: invitationLinks.id })
      .from(invitationLinks)
      .where(and(eq(invitationLinks.wedding_id, dataset.wedding_id), eq(invitationLinks.seed_key, seed_key)))
      .limit(1);

    const token = newLinkToken();
    await tx.insert(invitationLinks).values({
      // The first link is seeded; a link after a revoke is a live row (the revoked seeded row keeps its key).
      ...(seededRow.length === 0 ? { id: seededId(dataset.copy, "invitation_links", seed_key), seed_key } : {}),
      wedding_id: dataset.wedding_id,
      household_id,
      token_hash: hashLinkToken(token),
      token_hint: token.slice(-4),
      created_by_member_id: createdBy,
    });
    issued.push({ household_seed_key, household_name: String(household.name), token });
  }
  return issued;
}

// ---------------------------------------------------------------------------
// The photo step (D107, D126)
// ---------------------------------------------------------------------------

/**
 * The photo step's row: upserts the `couple_photo` asset by its seed key with the uploaded
 * file's fields (at `photo.storage_path` in bucket `uploads`, domain 5.5) and points
 * `invite_styles.photo_asset_id` at it. It touches nothing else, apart
 * from the `version` bump that makes open screens show the photo (domain 5.6).
 */
export async function upsertCouplePhotoAsset(
  tx: Tx,
  dataset: SeedDataset,
  file: { bytes: number; mime_type: string; width?: number; height?: number },
): Promise<{ asset_id: string; storage_path: string; version: number }> {
  if (!(await lockWedding(tx, dataset.wedding_id))) {
    throw new Error(`Copy ${dataset.copy} is not seeded yet: run the seed before the photo step`);
  }
  const now = new Date();
  const asset_id = dataset.photo.asset_id;
  const storage_path = dataset.photo.storage_path;
  const fileFields = {
    asset_kind: "couple_photo" as const,
    storage_path,
    mime_type: file.mime_type,
    bytes: file.bytes,
    width: file.width ?? null,
    height: file.height ?? null,
    seed_key: dataset.photo.seed_key,
    updated_at: now,
  };
  await tx
    .insert(assets)
    .values({ id: asset_id, wedding_id: dataset.wedding_id, uploaded_by_member_id: ownerMemberId(dataset), ...fileFields })
    .onConflictDoUpdate({ target: assets.id, set: fileFields });
  await tx
    .update(inviteStyles)
    .set({ photo_asset_id: asset_id, updated_at: now })
    .where(
      and(
        eq(inviteStyles.wedding_id, dataset.wedding_id),
        or(isNull(inviteStyles.photo_asset_id), sql`${inviteStyles.photo_asset_id} <> ${asset_id}`),
      ),
    );
  const version = await bumpVersion(tx, dataset.wedding_id);
  return { asset_id, storage_path, version };
}
