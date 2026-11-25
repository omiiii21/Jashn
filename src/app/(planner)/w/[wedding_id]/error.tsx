"use client";

import { WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** The server's error reference (`error.digest`), to match the server log. */
function digestOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("digest" in error)) return null;
  return typeof error.digest === "string" ? error.digest : null;
}

/**
 * The wedding pages' error boundary (Next 16: `error` and `retry`). It sits inside the
 * shell, so the header, the nav and the mic stay usable. It says what happened and what
 * to do, without apologising.
 */
export default function WeddingError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = digestOf(error);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="font-serif text-title text-ink">This page didn&rsquo;t load</h1>
      <div role="alert" className="rounded-sheet border border-line bg-paper p-4 lg:p-6">
        <p className="flex gap-2 text-body text-ink">
          <span className="flex h-6 shrink-0 items-center text-overdue">
            <WarningCircleIcon size={20} aria-hidden="true" />
          </span>
          <span>
            Jashn couldn&rsquo;t read this wedding&rsquo;s records just now. Nothing was changed. Try again, and if it
            keeps failing, reload the page.
          </span>
        </p>
        <Button
          type="button"
          onClick={() => retry()}
          className="mt-4 h-11 rounded-control bg-maroon px-4 text-paper hover:bg-maroon-deep"
        >
          {/* The shared cn() drops the type-size tokens, so the size sits on the label. */}
          <span className="text-body">Try again</span>
        </Button>
        {digest ? <p className="mt-3 text-meta text-ink-3">Reference {digest}</p> : null}
      </div>
    </div>
  );
}
