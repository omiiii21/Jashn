import { Skeleton } from "@/components/ui/skeleton";

const ROWS = ["w-24", "w-20", "w-16", "w-20"] as const;

/**
 * The wedding pages' loading state: a title bar and one paper sheet of rows in the shape
 * the page will take, inside the shell, so the header and its mic stay put. No spinner.
 */
export default function WeddingLoading() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Loading this page</span>
      <Skeleton aria-hidden="true" className="h-8 w-56 max-w-full rounded-control motion-reduce:animate-none" />
      <div aria-hidden="true" className="max-w-xl rounded-sheet border border-line bg-paper p-4 lg:p-6">
        <Skeleton className="h-6 w-40 rounded-chip motion-reduce:animate-none" />
        <div className="mt-2 divide-y divide-line">
          {ROWS.map((width, index) => (
            <div key={index} className="flex items-center justify-between gap-4 py-3 last:pb-0">
              <Skeleton className={`h-5 ${width} rounded-chip motion-reduce:animate-none`} />
              <Skeleton className="h-5 w-32 rounded-chip motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
