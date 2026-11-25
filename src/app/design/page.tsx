import { notFound } from "next/navigation";

import { formatInr } from "@/contracts/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Lane E's preview of the tokens and primitives (D132). Never shipped to users:
 * production builds return 404. Hindi, Hinglish and ₹ sit side by side so the
 * Geist → Anek Devanagari fallback can be checked by eye.
 */
export default function DesignPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  const swatches = [
    "paper", "ivory", "ivory-deep", "ink", "ink-2", "ink-3", "line", "line-strong",
    "maroon", "maroon-deep", "maroon-tint", "gold", "gold-ink", "wash",
  ];

  return (
    <main className="mx-auto flex max-w-content flex-col gap-12 bg-ivory px-6 py-12 text-ink">
      <header>
        <h1 className="font-title text-4xl leading-tight">Jashn design tokens</h1>
        <p className="mt-2 text-body text-ink-2">
          Geist for the interface, Geist Serif for planner titles, Eczar and Tiro for the invitation.
        </p>
      </header>

      <section className="rounded-sheet border border-line bg-paper p-6">
        <h2 className="text-heading">Type</h2>
        <div className="mt-4 flex flex-col gap-3">
          <p className="font-title text-title">Money</p>
          <p className="font-serif text-names text-maroon">Mira &amp; Kabir</p>
          <p className="text-body">Annapoorna Caterers confirmed the menu for the wedding lunch.</p>
          <p className="text-body">Caterer ko chaalis hazaar advance diya tha, not fifty.</p>
          <p className="text-body" lang="hi">शुभ विवाह · हल्दी, मेहंदी, संगीत · प्रीतिभोज</p>
          <p className="text-panel tabular-nums">
            {formatInr(160000)}{" "}
            <span className="text-body font-normal text-ink-3 line-through">{formatInr(150000)}</span>
          </p>
          <p className="text-meta text-ink-3">Changed by Diya, 4:12 pm</p>
        </div>
      </section>

      <section className="rounded-sheet border border-line bg-paper p-6">
        <h2 className="text-heading">Colour</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {swatches.map((name) => (
            <div key={name} className="flex flex-col gap-1 text-meta text-ink-2">
              <span
                className="h-12 rounded-control border border-line"
                style={{ background: `var(--jashn-${name})` }}
              />
              {name}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-sheet border border-line bg-paper p-6">
        <h2 className="text-heading">Primitives</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button>Save correction</Button>
          <Button variant="outline">Add an event</Button>
          <Button variant="ghost">Decline</Button>
          <Button variant="destructive">Void payment</Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="paid">Paid</Badge>
          <Badge variant="due">Due 1 Dec</Badge>
          <Badge variant="overdue">Overdue</Badge>
          <Badge variant="proposal">Proposed by Diya</Badge>
          <Badge variant="neutral">Pending</Badge>
        </div>
        <div className="mt-4 max-w-sm">
          <Input aria-label="Budget" defaultValue={formatInr(1200000)} />
        </div>
      </section>
    </main>
  );
}
