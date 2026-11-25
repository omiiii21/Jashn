import { Skeleton } from "@/components/ui/skeleton";

const BLOCK = "rounded-control motion-reduce:animate-none";

function Line({ className }: { className: string }) {
  return <Skeleton className={`${BLOCK} ${className}`} />;
}

/**
 * The vendor page's shape while it loads: the way back, the name, the four details, and the
 * ledger sheet with Still owed and the dashed estimate box in the second column beside the
 * quote and the contract, then the balance. It switches columns on the same container
 * widths as the page. No spinner, and nothing moves under reduced motion. The status line
 * is read out; the skeleton is hidden from assistive tech.
 */
export default function VendorsLoading() {
  return (
    <div className="@container flex flex-col gap-6">
      <p className="sr-only" role="status">
        Loading the vendor
      </p>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <Line className="h-6 w-28" />
        <Line className="h-9 w-64 max-w-full" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 @3xl:grid-cols-4">
          {["a", "b", "c", "d"].map((key) => (
            <div key={key} className="flex flex-col gap-2">
              <Line className="h-4 w-20" />
              <Line className="h-6 w-32 max-w-full" />
            </div>
          ))}
        </div>
      </div>

      <div
        aria-hidden="true"
        className="grid gap-6 rounded-sheet border border-line bg-paper p-4 @2xl:grid-cols-2 @2xl:gap-x-12 lg:p-6"
      >
        <div className="flex items-center justify-between gap-4 border-b border-line pb-4 @2xl:col-start-2 @2xl:row-start-1">
          <Line className="h-6 w-28" />
          <Line className="h-7 w-32" />
        </div>
        <div className="flex flex-col gap-2 @2xl:col-start-1 @2xl:row-start-1">
          <Line className="h-6 w-24" />
          <Line className="h-5 w-full max-w-xl" />
        </div>
        <div className="flex flex-col gap-3 @2xl:col-start-1 @2xl:row-start-2">
          <Line className="h-6 w-24" />
          <Line className="h-7 w-64 max-w-full" />
          <Line className="h-5 w-48" />
          <Line className="h-5 w-40" />
        </div>
        <div className="flex flex-col gap-3 rounded-control border border-dashed border-line-strong p-4 @2xl:col-start-2 @2xl:row-span-2 @2xl:row-start-2 @2xl:self-start lg:p-6">
          <Line className="h-5 w-48" />
          <Line className="h-7 w-32" />
          <Line className="h-5 w-full" />
        </div>
        <div className="flex flex-col gap-3 @2xl:col-start-1 @2xl:row-start-3">
          <Line className="h-6 w-28" />
          <Line className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}
