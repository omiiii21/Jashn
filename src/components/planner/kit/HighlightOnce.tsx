"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { HIGHLIGHT_PARAM } from "@/contracts/routes";

import { washFields } from "./wash-element";

/**
 * Applies the `highlight` query parameter once (D121). Lane C appends the field keys to
 * `navigate.path`; the page passes `parseHighlight(searchParams.highlight)` here. On mount
 * it washes every `[data-field]` inside the page's `<main>` that matches a key, then drops
 * only the `highlight` parameter from the URL, so a reload or the 2.5 s poll never washes
 * again. It never moves focus or scroll. Renders nothing.
 */
export function HighlightOnce({ keys }: { keys: string[] }) {
  const router = useRouter();
  // A stable dependency: the poll re-renders the page with an equal, new array.
  const signature = keys.join(",");

  useEffect(() => {
    if (signature === "") return;
    const root: ParentNode = document.querySelector("main") ?? document;
    washFields(root, signature.split(","));

    const url = new URL(window.location.href);
    if (!url.searchParams.has(HIGHLIGHT_PARAM)) return;
    url.searchParams.delete(HIGHLIGHT_PARAM);
    // Through the router, not history.replaceState: Next skips its own bookkeeping for a
    // replaceState carrying its history state, so the next refresh would write the old URL
    // back. A search-param-only replace keeps the page mounted, so the running wash goes on,
    // and the page re-renders with no keys, so the same highlight can wash again later.
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }, [signature, router]);

  return null;
}
