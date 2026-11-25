"use client";

/**
 * The reason chip beside the header mic, plus "Questions only" while voice writes are off
 * (voice.md 1.15; flagsmith 3.1 and 3.2; decisions D20 and D121). Each chip opens a popover
 * with CHIP_LABELS[key].explanation. Plain props only: no Flagsmith SDK or key reaches the
 * browser. For internal accounts only, VoiceDock also passes the flags drawer's data, and the
 * reason chip's popover gets a "Flags and experiment" button that opens it (flagsmith 5.9).
 */
import { FlagIcon, InfoIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AppLanguage } from "@/contracts/domain";
import { CHIP_LABELS, type ChipKey, type VoiceDockFlags } from "@/contracts/flags";

import { DRAWER_COPY } from "./drawer-copy";
import type { FlagDrawerData } from "./drawer-types";
import { FlagDrawer } from "./FlagDrawer";

function Chip({
  chip_key,
  ui_language,
  tone,
  onOpenDrawer,
}: {
  chip_key: ChipKey;
  ui_language: AppLanguage;
  tone: "reason" | "limit";
  onOpenDrawer?: () => void;
}) {
  const label = CHIP_LABELS[chip_key];
  const text = ui_language === "hi" ? label.label_hi : label.label_en;
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-chip={chip_key}
          aria-label={`${text}. ${label.explanation}`}
          className={cn(
            "inline-flex h-7 max-w-44 shrink items-center gap-1 truncate rounded-chip border px-2 whitespace-nowrap transition-colors duration-150",
            tone === "reason"
              ? "border-current/40 text-foreground hover:bg-accent"
              : "border-transparent bg-due-tint text-due hover:bg-due-tint/90",
          )}
          lang={ui_language === "hi" ? "hi" : undefined}
        >
          {/* The size sits on the span: cn() would merge text-meta away against the colour. */}
          <span className="truncate text-meta">{text}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 text-ink">
        <p className="flex items-start gap-2 text-meta text-ink-2">
          <InfoIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{label.explanation}</span>
        </p>
        {onOpenDrawer ? (
          <button
            type="button"
            data-testid="open-flag-drawer"
            onClick={() => {
              setOpen(false);
              onOpenDrawer();
            }}
            className="inline-flex h-9 items-center gap-2 self-start rounded-md border border-line-strong px-3 text-meta text-ink transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <FlagIcon size={16} aria-hidden="true" />
            <span>{DRAWER_COPY.open_button}</span>
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Both chips. Nothing when voice is off (the disabled mic carries the off text instead).
 * `drawer` is set only for internal accounts; without it no drawer button or drawer renders.
 */
export function ReasonChips({
  flags,
  ui_language,
  className,
  drawer = null,
}: {
  flags: VoiceDockFlags;
  ui_language: AppLanguage;
  className?: string;
  drawer?: FlagDrawerData | null;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  if (!flags.voice_available) return null;
  const showReason = flags.chip !== null;
  const showQuestionsOnly = !flags.writes_enabled && flags.chip?.key !== "questions_only";
  if (!showReason && !showQuestionsOnly) return null;
  const openDrawer = drawer ? () => setDrawerOpen(true) : undefined;
  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      {flags.chip ? (
        <Chip chip_key={flags.chip.key} ui_language={ui_language} tone="reason" onOpenDrawer={openDrawer} />
      ) : null}
      {showQuestionsOnly ? (
        <Chip
          chip_key="questions_only"
          ui_language={ui_language}
          tone="limit"
          onOpenDrawer={flags.chip ? undefined : openDrawer}
        />
      ) : null}
      {drawer ? <FlagDrawer data={drawer} open={drawerOpen} onOpenChange={setDrawerOpen} /> : null}
    </div>
  );
}
