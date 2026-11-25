"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import type { WeddingId } from "@/contracts/domain";

import type { NavSection, SectionSeqs } from "../shell/nav-items";

const CHANGE_EVENT = "jashn:nav-seen";

function storageKey(wedding_id: WeddingId): string {
  return `jashn.nav-seen.${wedding_id}`;
}

function readRaw(wedding_id: WeddingId): string | null {
  try {
    return window.localStorage.getItem(storageKey(wedding_id));
  } catch {
    return null;
  }
}

function writeSeen(wedding_id: WeddingId, seen: SectionSeqs): void {
  try {
    const next = JSON.stringify(seen);
    if (window.localStorage.getItem(storageKey(wedding_id)) === next) return;
    window.localStorage.setItem(storageKey(wedding_id), next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Private windows and blocked storage: the dot simply doesn't persist.
  }
}

function parseSeen(raw: string | null): SectionSeqs | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SectionSeqs;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The gold nav dot (design-direction 7.2): the sections with activity newer than the last
 * time this browser showed them. The section on screen is marked seen; a first visit marks
 * everything seen, so a fresh browser starts without dots. Per-viewer only (localStorage),
 * nothing on the server render. No toast, no focus move.
 */
export function useNewChanges(wedding_id: WeddingId, current: NavSection | null, latest: SectionSeqs): Set<NavSection> {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(wedding_id),
    () => null,
  );
  const signature = JSON.stringify(latest);

  useEffect(() => {
    const newest = JSON.parse(signature) as SectionSeqs;
    const seen: SectionSeqs = parseSeen(readRaw(wedding_id)) ?? { ...newest };
    if (current && newest[current] !== undefined) seen[current] = newest[current];
    writeSeen(wedding_id, seen);
  }, [wedding_id, current, signature]);

  return useMemo(() => {
    const seen = parseSeen(raw);
    const fresh = new Set<NavSection>();
    if (!seen) return fresh;
    const newest = JSON.parse(signature) as SectionSeqs;
    for (const [section, seq] of Object.entries(newest) as [NavSection, number][]) {
      if (section !== current && seq > (seen[section] ?? 0)) fresh.add(section);
    }
    return fresh;
  }, [raw, signature, current]);
}
