"use client";

/**
 * The team's flags drawer (flagsmith.md 5.9; acceptance AT-1.8, AT-1.9): a right-hand panel on
 * desktop, a sheet from the bottom on the phone. Internal accounts only: VoiceDock passes its
 * data and actions solely to them, and every action checks the caller again on the server.
 * Four parts: This session (from VoiceDock's render), Sent by Jashn, Synthetic data, Health.
 * It shows no Flagsmith statistic and no synthetic number.
 */
import { ArrowClockwiseIcon, CheckCircleIcon, FlaskIcon, PulseIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { FlagsSelfCheck } from "@/contracts/flags";

import { ARM_LABELS, DRAWER_COPY } from "./drawer-copy";
import type {
  DrawerFlagRow,
  DrawerFullCheck,
  DrawerProbes,
  DrawerResult,
  DrawerSentCounts,
  DrawerVoiceTurnCounts,
  FlagDrawerData,
} from "./drawer-types";

const DESKTOP_QUERY = "(min-width: 768px)";

function subscribeDesktop(onChange: () => void): () => void {
  try {
    const query = window.matchMedia(DESKTOP_QUERY);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  } catch {
    return () => undefined;
  }
}

function isDesktopNow(): boolean {
  try {
    return window.matchMedia(DESKTOP_QUERY).matches;
  } catch {
    return true;
  }
}

/** Loaded, refused, failed, or still loading (undefined). */
type Loaded<T> = DrawerResult<T> | { ok: "error" } | undefined;

async function settle<T>(run: () => Promise<DrawerResult<T>>): Promise<Loaded<T>> {
  try {
    return await run();
  } catch {
    return { ok: "error" };
  }
}

function FallbackMark() {
  return (
    <span
      data-fallback="true"
      className="inline-flex items-center gap-1 rounded-chip bg-due-tint px-1.5 text-meta text-due"
    >
      <WarningCircleIcon size={14} aria-hidden="true" />
      {DRAWER_COPY.fallback}
    </span>
  );
}

function Section({ title, children, testid }: { title: string; children: ReactNode; testid: string }) {
  return (
    <section data-testid={testid} className="flex flex-col gap-3 border-t border-line px-4 py-4 first:border-t-0">
      <h3 className="text-heading text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 text-meta">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

function StateNotice<T>({ value }: { value: Loaded<T> }) {
  if (value === undefined) return <p className="text-meta text-ink-3">{DRAWER_COPY.loading}</p>;
  if (value.ok === false) return <p className="text-meta text-ink-2">{DRAWER_COPY.refused}</p>;
  if (value.ok === "error") return <p className="text-meta text-overdue">{DRAWER_COPY.failed}</p>;
  return null;
}

function FlagTable({ rows }: { rows: DrawerFlagRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-meta">
        <thead>
          <tr className="border-b border-line text-ink-3">
            <th className="py-1.5 pr-2 font-medium">{DRAWER_COPY.flag}</th>
            <th className="py-1.5 pr-2 font-medium">{DRAWER_COPY.state}</th>
            <th className="py-1.5 pr-2 font-medium">{DRAWER_COPY.value}</th>
            <th className="py-1.5 font-medium">{DRAWER_COPY.reason}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} data-flag={row.key} className="border-b border-line align-top last:border-b-0">
              <td className="py-1.5 pr-2 text-ink">{row.key}</td>
              <td className="py-1.5 pr-2">
                <span className="flex flex-wrap items-center gap-1">
                  <span className={row.enabled ? "text-paid" : "text-ink-2"}>
                    {row.enabled ? DRAWER_COPY.on : DRAWER_COPY.off}
                  </span>
                  {row.fallback ? <FallbackMark /> : null}
                </span>
              </td>
              <td className="py-1.5 pr-2 break-words text-ink-2">{row.variant ?? row.value ?? "–"}</td>
              <td className="py-1.5 break-words text-ink-2">{row.reason ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SessionPart({ data }: { data: FlagDrawerData }) {
  const session = data.session;
  return (
    <Section title={DRAWER_COPY.session_heading} testid="drawer-session">
      <dl className="flex flex-col gap-1.5">
        <Row label={DRAWER_COPY.identity}>{session.identity ?? DRAWER_COPY.identity_missing}</Row>
        <Row label={DRAWER_COPY.env_label}>
          {session.env_label} ({DRAWER_COPY.expected} {session.expected_env})
        </Row>
        <Row label={DRAWER_COPY.environment_key}>
          {session.environment_id_last4 ? `…${session.environment_id_last4}` : DRAWER_COPY.environment_key_missing}
        </Row>
        <Row label={DRAWER_COPY.evaluated}>{session.evaluated_label}</Row>
      </dl>
      {session.fallback ? (
        <p className="flex items-start gap-2 rounded-md bg-due-tint px-3 py-2 text-meta text-due">
          <WarningCircleIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{DRAWER_COPY.all_fallback}</span>
        </p>
      ) : null}
      <FlagTable rows={session.flags} />
    </Section>
  );
}

function SentPart({ sent }: { sent: Loaded<DrawerSentCounts> }) {
  return (
    <Section title={DRAWER_COPY.sent_heading} testid="drawer-sent">
      <p className="text-body text-ink">{DRAWER_COPY.sent_line}</p>
      <p className="text-meta text-ink-3">{DRAWER_COPY.sent_scope}</p>
      <StateNotice value={sent} />
      {sent && sent.ok === true ? (
        <>
          <table className="w-full border-collapse text-left text-meta">
            <thead>
              <tr className="border-b border-line text-ink-3">
                <th className="py-1.5 pr-2 font-medium">{DRAWER_COPY.arm}</th>
                <th className="py-1.5 pr-2 text-right font-medium">{DRAWER_COPY.exposures}</th>
                <th className="py-1.5 text-right font-medium">{DRAWER_COPY.saves}</th>
              </tr>
            </thead>
            <tbody>
              {sent.data.arms.map((arm) => (
                <tr key={arm.variant} data-arm={arm.variant} className="border-b border-line last:border-b-0">
                  <td className="py-1.5 pr-2 text-ink">{ARM_LABELS[arm.variant] ?? arm.variant}</td>
                  <td className="py-1.5 pr-2 text-right text-ink tabular-nums">{arm.exposures}</td>
                  <td className="py-1.5 text-right text-ink tabular-nums">{arm.saves}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-meta text-ink-3">
            {DRAWER_COPY.as_of} {sent.data.as_of_label}
          </p>
          {sent.data.note ? <p className="text-meta text-ink-2">{sent.data.note}</p> : null}
        </>
      ) : null}
    </Section>
  );
}

function SyntheticPart() {
  return (
    <Section title={DRAWER_COPY.synthetic_heading} testid="drawer-synthetic">
      <div className="overflow-hidden rounded-xl border border-maroon/30 bg-maroon-tint">
        <p className="flex items-center gap-2 bg-maroon-deep px-3 py-1.5 text-meta font-semibold text-paper">
          <FlaskIcon size={16} aria-hidden="true" />
          {DRAWER_COPY.synthetic_banner}
        </p>
        <div className="flex flex-col gap-2 px-3 py-3">
          <p className="text-body text-ink">{DRAWER_COPY.synthetic_disclosure}</p>
          <p className="text-meta text-ink-2">{DRAWER_COPY.synthetic_pointer}</p>
        </div>
      </div>
    </Section>
  );
}

function CheckSummary({ summary }: { summary: FlagsSelfCheck }) {
  return (
    <div data-testid="drawer-check" className="flex flex-col gap-2">
      <p className={cn("flex items-center gap-2 text-body font-semibold", summary.ok ? "text-paid" : "text-overdue")}>
        {summary.ok ? (
          <CheckCircleIcon size={18} aria-hidden="true" />
        ) : (
          <WarningCircleIcon size={18} aria-hidden="true" />
        )}
        {summary.ok ? DRAWER_COPY.check_pass : DRAWER_COPY.check_fail}
      </p>
      <dl className="flex flex-col gap-1.5">
        <Row label="env_label">
          {summary.env_label} ({DRAWER_COPY.expected} {summary.expected_env})
        </Row>
        <Row label="key_type">{summary.key_type}</Row>
        <Row label="fallback_flags">
          {summary.fallback_flags.length === 0 ? (
            "none"
          ) : (
            <span className="flex flex-wrap items-center gap-1">
              <FallbackMark />
              {summary.fallback_flags.join(", ")}
            </span>
          )}
        </Row>
        <Row label="not_created">{summary.not_created.length === 0 ? "none" : summary.not_created.join(", ")}</Row>
        <Row label="events_probe_status">{summary.events_probe_status ?? "not sent"}</Row>
        <Row label="experiment_events">{summary.experiment_events}</Row>
        <Row label="latency_ms">{summary.latency_ms ?? "–"}</Row>
        <Row label="sdk">{summary.sdk}</Row>
        <Row label="checked_at">{summary.checked_at}</Row>
      </dl>
    </div>
  );
}

function ProbeTable({ probes }: { probes: DrawerProbes }) {
  const variants = Object.entries(probes.variants)
    .map(([variant, count]) => `${variant} ${count}`)
    .join(", ");
  return (
    <div data-testid="drawer-probes" className="flex flex-col gap-2">
      <ul className="flex flex-col gap-0.5 text-meta text-ink">
        <li>
          voice_pilot on: {probes.voice_pilot_on} of {probes.rows.length} ({probes.voice_pilot_rollout} naming
          voice_rollout)
        </li>
        <li>
          setup_entry in experiment: {probes.in_experiment} of {probes.rows.length}
        </li>
        <li>setup_entry variants: {variants || "none"}</li>
        {probes.fallback > 0 ? (
          <li className="flex items-center gap-1">
            <FallbackMark /> {probes.fallback} of {probes.rows.length}
          </li>
        ) : null}
        <li className="text-ink-3">
          {DRAWER_COPY.as_of} {probes.ran_label}
        </li>
      </ul>
      <div className="max-h-64 overflow-auto rounded-md border border-line">
        <table className="w-full border-collapse text-left text-meta">
          <thead className="sticky top-0 bg-paper">
            <tr className="border-b border-line text-ink-3">
              <th className="px-2 py-1 font-medium">{DRAWER_COPY.probe}</th>
              <th className="px-2 py-1 font-medium">voice_pilot</th>
              <th className="px-2 py-1 font-medium">{DRAWER_COPY.reason}</th>
              <th className="px-2 py-1 font-medium">setup_entry</th>
              <th className="px-2 py-1 font-medium">{DRAWER_COPY.in_experiment}</th>
            </tr>
          </thead>
          <tbody>
            {probes.rows.map((row) => (
              <tr key={row.identity} className="border-b border-line align-top last:border-b-0">
                <td className="px-2 py-1 text-ink">{row.identity}</td>
                <td className="px-2 py-1">
                  <span className={row.voice_pilot.enabled ? "text-paid" : "text-ink-2"}>
                    {row.voice_pilot.enabled ? DRAWER_COPY.on : DRAWER_COPY.off}
                  </span>
                  {row.voice_pilot.fallback ? <span className="ml-1 text-due">({DRAWER_COPY.fallback})</span> : null}
                </td>
                <td className="px-2 py-1 break-words text-ink-2">{row.voice_pilot.reason ?? "–"}</td>
                <td className="px-2 py-1 text-ink-2">{row.setup_entry.variant ?? "–"}</td>
                <td className="px-2 py-1 text-ink-2">
                  {row.setup_entry.in_experiment === null ? "–" : row.setup_entry.in_experiment ? "yes" : "no"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HealthPart({
  data,
  check,
  turns,
  onCheck,
}: {
  data: FlagDrawerData;
  check: Loaded<FlagsSelfCheck>;
  turns: Loaded<DrawerVoiceTurnCounts>;
  onCheck: (summary: FlagsSelfCheck) => void;
}) {
  const [full, setFull] = useState<Loaded<DrawerFullCheck> | null>(null);
  const [probes, setProbes] = useState<Loaded<DrawerProbes> | null>(null);
  const [checking, setChecking] = useState(false);
  const [probing, setProbing] = useState(false);

  async function runCheck() {
    setChecking(true);
    const result = await settle(data.actions.runFullCheck);
    setFull(result);
    if (result && result.ok === true) onCheck(result.data.summary);
    setChecking(false);
  }

  async function runProbes() {
    setProbing(true);
    setProbes(await settle(data.actions.runProbes));
    setProbing(false);
  }

  return (
    <Section title={DRAWER_COPY.health_heading} testid="drawer-health">
      <h4 className="text-body font-semibold text-ink">{DRAWER_COPY.check_heading}</h4>
      <StateNotice value={check} />
      {check && check.ok === true ? <CheckSummary summary={check.data} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={runCheck} disabled={checking} data-testid="drawer-run-check">
          <ArrowClockwiseIcon size={16} aria-hidden="true" />
          {checking ? DRAWER_COPY.running_check : DRAWER_COPY.run_check}
        </Button>
        <Button type="button" variant="outline" onClick={runProbes} disabled={probing} data-testid="drawer-run-probes">
          <PulseIcon size={16} aria-hidden="true" />
          {probing ? DRAWER_COPY.running_probes : DRAWER_COPY.run_probes}
        </Button>
      </div>
      {full ? (
        <div className="flex flex-col gap-2">
          <StateNotice value={full} />
          {full.ok === true ? (
            <>
              <p className="text-meta text-ink">
                {DRAWER_COPY.sdk_probe}: {full.data.sdk_probe.status}. {full.data.sdk_probe.note}
              </p>
              <FlagTable rows={full.data.environment_flags} />
            </>
          ) : null}
        </div>
      ) : null}
      <p className="text-meta text-ink-3">{DRAWER_COPY.probes_note}</p>
      {probes ? (
        <>
          <StateNotice value={probes} />
          {probes.ok === true ? <ProbeTable probes={probes.data} /> : null}
        </>
      ) : null}
      <h4 className="pt-2 text-body font-semibold text-ink">{DRAWER_COPY.turns_heading}</h4>
      <StateNotice value={turns} />
      {turns && turns.ok === true ? (
        <div data-testid="drawer-turns" className="flex flex-col gap-1">
          <dl className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                [DRAWER_COPY.turns_total, turns.data.total],
                [DRAWER_COPY.turns_failed, turns.data.failed],
                [DRAWER_COPY.turns_paused, turns.data.paused],
              ] as const
            ).map(([label, count]) => (
              <div key={label} className="rounded-md bg-ivory px-2 py-1.5">
                <dt className="text-meta text-ink-3">{label}</dt>
                <dd className="text-heading text-ink tabular-nums">{count}</dd>
              </div>
            ))}
          </dl>
          <p className="text-meta text-ink-3">
            {DRAWER_COPY.as_of} {turns.data.as_of_label}
          </p>
          {turns.data.note ? <p className="text-meta text-ink-2">{turns.data.note}</p> : null}
        </div>
      ) : null}
    </Section>
  );
}

/** The drawer itself; ReasonChips renders it only when VoiceDock passed drawer data. */
export function FlagDrawer({
  data,
  open,
  onOpenChange,
}: {
  data: FlagDrawerData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktopNow, () => true);
  const [check, setCheck] = useState<Loaded<FlagsSelfCheck>>(undefined);
  const [sent, setSent] = useState<Loaded<DrawerSentCounts>>(undefined);
  const [turns, setTurns] = useState<Loaded<DrawerVoiceTurnCounts>>(undefined);

  // Parts 2 and 4 load through the server actions each time the drawer opens.
  useEffect(() => {
    if (!open) return;
    let live = true;
    void Promise.all([
      settle(data.actions.latestCheck),
      settle(data.actions.sentByJashn),
      settle(data.actions.voiceTurnCounts),
    ]).then(([nextCheck, nextSent, nextTurns]) => {
      if (!live) return;
      setCheck(nextCheck);
      setSent(nextSent);
      setTurns(nextTurns);
    });
    return () => {
      live = false;
    };
  }, [open, data.actions]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        data-testid="flag-drawer"
        // On the phone the sheet is anchored from the top with a fixed height, so it stays
        // on screen even when something on the page widens the layout viewport.
        className="gap-0 bg-paper p-0 text-ink data-[side=bottom]:top-[12dvh] data-[side=bottom]:bottom-auto data-[side=bottom]:h-[88dvh] data-[side=bottom]:w-screen data-[side=bottom]:max-w-[100vw] data-[side=bottom]:rounded-t-xl data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
      >
        <SheetHeader className="border-b border-line pr-12">
          <SheetTitle className="text-heading text-ink">{DRAWER_COPY.title}</SheetTitle>
          <SheetDescription className="text-meta text-ink-3">{DRAWER_COPY.description}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
          <SessionPart data={data} />
          <SentPart sent={sent} />
          <SyntheticPart />
          <HealthPart data={data} check={check} turns={turns} onCheck={(summary) => setCheck({ ok: true, data: summary })} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
