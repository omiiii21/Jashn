"use client";

/**
 * The review card (voice.md 1.12) built from the `preview` event, and the receipt it collapses
 * into after a confirm. Nothing here writes: the dock owns the confirm and cancel calls.
 */
import { CheckCircleIcon, CircleNotchIcon, PencilSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VoicePreviewField, VoiceStreamEvent } from "@/contracts/api";

import type { DockCopy } from "./dock-copy";

export type PreviewEvent = Extract<VoiceStreamEvent, { type: "preview" }>;

/** `"{action_index}:{field}"` → the typed value. */
export type CardEdits = Record<string, string>;

export function editKey(action_index: number, field: string): string {
  return `${action_index}:${field}`;
}

/** The edits as the confirm body takes them (1.13). */
export function editsForConfirm(edits: CardEdits): { action_index: number; field: string; value: string }[] {
  return Object.entries(edits)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => {
      const at = key.indexOf(":");
      return { action_index: Number(key.slice(0, at)), field: key.slice(at + 1), value: value.trim() };
    });
}

function needsInput(field: VoicePreviewField): boolean {
  return field.state === "missing" || field.state === "uncertain";
}

/**
 * Whether Save can be pressed: the server said so, or every "?" field now has a typed value
 * (the confirm validates the edits like typing, check 6).
 */
export function canSave(preview: PreviewEvent, edits: CardEdits): boolean {
  if (preview.confirm_enabled) return true;
  const open = preview.actions.flatMap((a) => a.fields.filter(needsInput).map((f) => editKey(a.index, f.field)));
  if (open.length === 0) return false;
  return open.every((key) => (edits[key] ?? "").trim().length > 0);
}

export type CardPhase = "ready" | "saving" | "changed";

export function ReviewCard(props: {
  preview: PreviewEvent;
  phase: CardPhase;
  /** A plain-words line on the card: a command error, "Changed meanwhile", a network failure. */
  notice: string | null;
  edits: CardEdits;
  copy: DockCopy;
  onEdit: (action_index: number, field: string, value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { preview, phase, notice, edits, copy } = props;
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [slowSave, setSlowSave] = useState(false);
  const titleId = useId();
  const saving = phase === "saving";
  const spinner = saving && slowSave;

  // The spinner shows only if saving takes more than 150 ms (design-direction 7.1).
  useEffect(() => {
    if (!saving) return;
    const timer = setTimeout(() => setSlowSave(true), 150);
    return () => {
      clearTimeout(timer);
      setSlowSave(false);
    };
  }, [saving]);

  const enabled = canSave(preview, edits) && !saving;
  const allEditing = preview.actions.every((a) => a.fields.every((f) => editing[editKey(a.index, f.field)]));

  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    if (!allEditing) for (const a of preview.actions) for (const f of a.fields) next[editKey(a.index, f.field)] = true;
    setEditing(next);
  };

  return (
    <section
      aria-labelledby={titleId}
      tabIndex={-1}
      data-voice-card="review"
      className="flex flex-col gap-3 rounded-sheet border border-line bg-paper p-4 text-ink focus:outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-240"
    >
      <h3 id={titleId} className="text-heading text-ink">
        {preview.title}
      </h3>

      {phase === "changed" ? (
        <p role="status" className="rounded-control bg-wash px-3 py-2 text-meta text-ink">
          {notice ?? copy.changed_meanwhile}
        </p>
      ) : null}

      {preview.actions.map((action) => (
        <div key={action.index} className="flex flex-col gap-2">
          <dl className="flex flex-col divide-y divide-line">
            {action.fields.map((field) => {
              const key = editKey(action.index, field.field);
              const edited = edits[key];
              const open = editing[key] === true;
              const question = needsInput(field) && !(edited && edited.trim());
              return (
                <div key={key} className="flex flex-col gap-1 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-meta text-ink-2">{field.label}</dt>
                    <dd className="flex min-w-0 items-center gap-2 text-right text-table tabular-nums">
                      {field.old && field.old !== field.new ? (
                        <span className="text-ink-3 line-through decoration-[1.5px]">{field.old}</span>
                      ) : null}
                      {edited && edited.trim() ? (
                        <span className="font-medium text-ink">{edited}</span>
                      ) : question ? (
                        <span
                          className={cn(
                            "font-medium text-due",
                            field.state === "uncertain" && "underline decoration-dotted underline-offset-4",
                          )}
                          aria-label={`${field.new ?? ""} ${copy.needs_value}`.trim()}
                        >
                          {field.state === "uncertain" && field.new ? `${field.new} ?` : "?"}
                        </span>
                      ) : (
                        <span className="font-medium text-ink">{field.new ?? "–"}</span>
                      )}
                      <button
                        type="button"
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-ink-3 hover:bg-ivory hover:text-ink"
                        aria-label={`${copy.edit} ${field.label}`}
                        aria-expanded={open}
                        onClick={() => setEditing((prev) => ({ ...prev, [key]: !prev[key] }))}
                      >
                        <PencilSimpleIcon size={16} aria-hidden="true" />
                      </button>
                    </dd>
                  </div>
                  {field.heard ? (
                    <p className="text-meta text-ink-3">
                      {copy.heard} “<span className="underline decoration-maroon underline-offset-4">{field.heard}</span>”
                    </p>
                  ) : null}
                  {open ? (
                    <Input
                      autoFocus
                      aria-label={field.label}
                      defaultValue={edited ?? (needsInput(field) && field.state === "missing" ? "" : (field.new ?? ""))}
                      onChange={(e) => props.onEdit(action.index, field.field, e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          setEditing((prev) => ({ ...prev, [key]: false }));
                        }
                      }}
                      className="bg-paper"
                    />
                  ) : null}
                </div>
              );
            })}
          </dl>

          {action.after_saving.length > 0 ? (
            <div className="flex flex-col gap-1 rounded-control bg-ivory px-3 py-2">
              <p className="text-meta font-medium text-ink-2">{copy.after_saving}</p>
              {action.after_saving.map((row) => (
                <p key={row.label} className="flex items-baseline justify-between gap-3 text-table tabular-nums">
                  <span className="text-ink-2">{row.label}</span>
                  <span className="flex items-baseline gap-2">
                    {row.old && row.old !== row.new ? <span className="text-ink-3 line-through decoration-[1.5px]">{row.old}</span> : null}
                    <span className="font-medium text-ink">{row.new}</span>
                  </span>
                </p>
              ))}
            </div>
          ) : null}

          {action.warnings.map((warning) => (
            <p key={warning} className="flex items-start gap-2 text-meta text-due">
              <WarningCircleIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>{warning}</span>
            </p>
          ))}
        </div>
      ))}

      {notice && phase !== "changed" ? (
        <p role="alert" className="flex items-start gap-2 text-meta text-overdue">
          <WarningCircleIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{notice}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {!enabled && !saving ? (
          <p className="mr-auto text-meta text-ink-3">{preview.disabled_reason ?? copy.save_blocked}</p>
        ) : null}
        <Button type="button" variant="ghost" size="lg" onClick={props.onCancel} disabled={saving}>
          {copy.cancel}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={toggleAll} disabled={saving} aria-pressed={allEditing}>
          {allEditing ? copy.done_editing : copy.edit}
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={props.onConfirm}
          disabled={!enabled}
          aria-busy={saving}
          className="relative min-w-32"
        >
          <span className={cn(spinner && "invisible")}>{preview.button_label}</span>
          {spinner ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <CircleNotchIcon size={18} aria-hidden="true" className="motion-safe:animate-spin" />
              <span className="sr-only">{copy.saving}</span>
            </span>
          ) : null}
        </Button>
      </div>
    </section>
  );
}

export type ReceiptView =
  | { kind: "saved"; line: string }
  | { kind: "approval"; line: string }
  | { kind: "partly"; lines: string[] };

/** The one-line receipt the card collapses into (1.12). Undo is a follow-up (voice.md 5.5). */
export function VoiceReceipt({ receipt }: { receipt: ReceiptView }) {
  if (receipt.kind === "partly") {
    return (
      <div role="status" data-voice-card="receipt" className="flex flex-col gap-1 rounded-sheet border border-line bg-paper p-3 text-meta text-ink">
        {receipt.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    );
  }
  return (
    <p
      role="status"
      data-voice-card="receipt"
      className="flex items-center gap-2 rounded-sheet border border-line bg-paper p-3"
    >
      <CheckCircleIcon
        size={20}
        aria-hidden="true"
        className={`shrink-0 motion-safe:animate-in motion-safe:zoom-in-90 motion-safe:duration-200 ${receipt.kind === "saved" ? "text-paid" : "text-proposal"}`}
      />
      <span className="text-meta text-ink">{receipt.line}</span>
    </p>
  );
}
