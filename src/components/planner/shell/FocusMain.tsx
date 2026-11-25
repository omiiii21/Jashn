"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { VENDOR_ID_PARAM } from "@/contracts/routes";

import { MAIN_ID } from "./main-id";

/** The query parameters that open a record on a section's own path (D18): a vendor, a function. */
const RECORD_PARAMS = [VENDOR_ID_PARAM, "event_id"] as const;

/**
 * Moves focus to the main content after a route change (acceptance 6.5): a new pathname, or
 * a record opened on the same path, such as the vendor list and `?vendor_id=…`. It ignores
 * every other query parameter, so the first load, `router.refresh()` from the 2.5 s poll
 * and the `highlight` strip never move focus. Render it inside a Suspense boundary.
 */
export function FocusMain() {
  const pathname = usePathname();
  const search = useSearchParams();
  const routeKey = [pathname, ...RECORD_PARAMS.map((name) => search.get(name) ?? "")].join("|");
  const previous = useRef(routeKey);

  useEffect(() => {
    if (previous.current === routeKey) return;
    previous.current = routeKey;
    document.getElementById(MAIN_ID)?.focus({ preventScroll: true });
  }, [routeKey]);

  return null;
}
