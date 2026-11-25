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
    const focusMain = () => document.getElementById(MAIN_ID)?.focus({ preventScroll: true });
    focusMain();
    // The new section can finish rendering after this effect and remove the link that had
    // focus, which drops focus to <body>. Put it back on main if that happens soon after.
    const timers = [120, 400, 900].map((ms) =>
      window.setTimeout(() => {
        const active = document.activeElement;
        if (!active || active === document.body) focusMain();
      }, ms),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [routeKey]);

  return null;
}
