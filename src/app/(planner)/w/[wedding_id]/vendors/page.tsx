import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Fragment } from "react";

import { HighlightOnce } from "@/components/planner";
import { HIGHLIGHT_PARAM, VENDOR_ID_PARAM, parseHighlight } from "@/contracts/routes";

import { dispatchCommand } from "@/server/actions/dispatch";

import { getVendorLedger, getWeddingProfile, readModel } from "../_lib/read";
import { VendorLedgerView, VendorNotShared } from "./VendorLedgerView";
import { VendorList } from "./VendorList";

type VendorsPageProps = {
  params: Promise<{ wedding_id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The `vendor_id` query parameter (D18), or null for the list. */
function vendorIdOf(query: Record<string, string | string[] | undefined>): string | null {
  const raw = query[VENDOR_ID_PARAM];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value === "" ? null : value;
}

/** "Vendors", or the vendor's own name on its page ("Annapoorna Caterers, Mira & Kabir"). */
export async function generateMetadata({ params, searchParams }: VendorsPageProps): Promise<Metadata> {
  const [{ wedding_id }, query] = await Promise.all([params, searchParams]);
  const vendor_id = vendorIdOf(query);
  if (vendor_id === null) return { title: "Vendors" };
  if (!UUID.test(vendor_id)) return { title: "Vendor" };
  const ledger = await getVendorLedger(wedding_id, vendor_id);
  return { title: ledger === "forbidden" ? "Vendor" : ledger.vendor.name };
}

/**
 * Vendors (D18): the list at `/w/{wedding_id}/vendors`, and one vendor's page at
 * `?vendor_id=…`. Reads only through the read models, with the member's role filtering done
 * on the server. Both views apply the `highlight` parameter once (D121).
 */
export default async function VendorsPage({ params, searchParams }: VendorsPageProps) {
  const [{ wedding_id }, query] = await Promise.all([params, searchParams]);
  const highlight = parseHighlight(query[HIGHLIGHT_PARAM]);
  const vendor_id = vendorIdOf(query);

  if (vendor_id === null) {
    const summary = await readModel("money_summary", wedding_id);
    return (
      <>
        <VendorList wedding_id={wedding_id} summary={summary} />
        <HighlightOnce keys={highlight} />
      </>
    );
  }

  if (!UUID.test(vendor_id)) notFound();

  const [ledger, summary, profile] = await Promise.all([
    getVendorLedger(wedding_id, vendor_id),
    readModel("money_summary", wedding_id),
    getWeddingProfile(wedding_id),
  ]);

  if (ledger === "forbidden") return <VendorNotShared wedding_id={wedding_id} />;

  const row = summary.vendors?.find((vendor) => vendor.vendor_id === vendor_id) ?? null;
  // Keyed by the record: moving straight to another vendor remounts the view, so its figures
  // never wash as if they had changed, and the next vendor's highlight runs afresh.
  return (
    <Fragment key={ledger.vendor.vendor_id}>
      <VendorLedgerView
        wedding_id={wedding_id}
        ledger={ledger}
        row={row}
        actions={{ role: profile.member.role, actor_name: profile.member.display_name, dispatch: dispatchCommand }}
      />
      <HighlightOnce keys={highlight} />
    </Fragment>
  );
}
