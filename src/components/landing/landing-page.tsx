import {
  CalendarDots,
  Check,
  CheckCircle,
  Clock,
  CurrencyInr,
  EnvelopeSimple,
  HouseLine,
  Storefront,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react/ssr";
import { cn } from "cn";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { formatInr } from "@/contracts/money";
import { routes } from "@/contracts/routes";

import styles from "./styles";
import { Reveal } from "./reveal";
import { TiltCard } from "./tilt-card";
import { VoiceDemo } from "./voice-demo";

/** CSS custom properties for the motion stagger (`--i`) and fan offsets. */
function v(vars: Record<string, string | number>): CSSProperties {
  return vars as CSSProperties;
}

const onMaroonPrimary =
  "h-12 bg-paper px-5 text-maroon hover:bg-ivory focus-visible:outline-gold";
const onMaroonSecondary =
  "h-12 border-on-maroon-2/50 bg-transparent px-5 text-ivory hover:bg-maroon hover:text-ivory focus-visible:outline-gold";

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

/** The seal: initials in Eczar inside two concentric rings (DESIGN.md "Shapes"). */
function Seal({ initials, tone, size = 56 }: { initials: string; tone: "gold" | "maroon"; size?: number }) {
  const ring = tone === "gold" ? "border-gold text-gold" : "border-maroon text-maroon";
  return (
    <span
      className={cn("relative grid shrink-0 place-items-center rounded-full border", ring)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className={cn("absolute inset-[3px] rounded-full border", ring)} />
      <span className="font-serif font-semibold leading-none" style={{ fontSize: size * 0.32 }}>
        {initials}
      </span>
    </span>
  );
}

function Eyebrow({ children, onMaroon = false }: { children: ReactNode; onMaroon?: boolean }) {
  return (
    <p className={cn("flex items-center gap-3 text-meta", styles.rise, onMaroon ? "text-on-maroon-2" : "text-ink-3")}>
      <span className={cn("h-px w-8", onMaroon ? "bg-gold" : "bg-line-strong")} aria-hidden />
      {children}
    </p>
  );
}

/** A section title whose lines wipe up from a mask as it scrolls into view. */
function WipeTitle({ lines, className }: { lines: string[]; className?: string }) {
  return (
    <h2 className={cn("font-title text-[clamp(2.25rem,1.5rem+2.6vw,3.75rem)] leading-[1.06] font-normal", className)}>
      {lines.map((line, i) => (
        <span key={line} className={styles.wipe}>
          <span style={v({ "--i": i })}>{line}</span>
        </span>
      ))}
    </h2>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header() {
  return (
    <header data-surface="shell" className="sticky top-0 z-40 border-b border-maroon bg-maroon-deep text-ivory">
      <div className="mx-auto flex h-16 max-w-[90rem] items-center justify-between gap-6 px-4 md:px-8">
        <Link
          href={routes.landing()}
          className="flex items-center gap-3 rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
        >
          <Seal initials="J" tone="gold" size={36} />
          <span className="font-serif text-[1.375rem] font-semibold leading-none">Jashn</span>
          <span lang="hi" className="hidden font-serif text-body leading-none text-on-maroon-2 sm:inline">
            जश्न
          </span>
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {[
            ["How it works", "#how"],
            ["The khata", "#khata"],
            ["Everything", "#everything"],
            ["The card", "#card"],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-control px-3 py-2 text-body text-on-maroon-2 transition-colors duration-150 hover:bg-maroon hover:text-ivory focus-visible:outline-2 focus-visible:outline-gold"
            >
              {label}
            </a>
          ))}
        </nav>
        <Link href={routes.home()} className={cn(buttonVariants(), "h-10 bg-paper px-4 text-maroon hover:bg-ivory focus-visible:outline-gold")}>
          Go to dashboard
        </Link>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function InvitationStack() {
  return (
    <div className="relative mx-auto w-full max-w-[25rem] pb-16 pt-6 lg:pt-0">
      {/* Inserts behind the card, fanned */}
      {[
        { name: "Mehendi", hi: "मेहंदी", date: "Sat 12 Dec", x: "-20%", y: "7%", r: "-8deg" },
        { name: "Sangeet", hi: "संगीत", date: "Sun 13 Dec", x: "18%", y: "-3%", r: "6deg" },
      ].map((insert, i) => (
        <div
          key={insert.name}
          className={cn(
            styles.fan,
            "absolute inset-x-6 top-10 h-[78%] rounded-paper border border-line bg-ivory shadow-insert",
          )}
          style={v({ "--x": insert.x, "--y": insert.y, "--r": insert.r, "--i": i })}
          aria-hidden
        >
          <div className="flex items-baseline justify-between px-5 pt-5">
            <span className="font-serif text-insert-title text-invite-name">{insert.name}</span>
            <span lang="hi" className="font-serif text-body tracking-normal text-gold-ink">
              {insert.hi}
            </span>
          </div>
          <p className="px-5 text-meta text-ink-3">{insert.date}</p>
        </div>
      ))}

      <TiltCard className={cn(styles.cardIn, "relative")}>
        <article
          aria-label="Sample invitation for Mira and Kabir"
          className="relative flex aspect-[5/7] flex-col items-center justify-center gap-4 rounded-paper bg-invite-stock px-10 py-12 text-center text-invite-ink shadow-insert"
        >
          <span className="pointer-events-none absolute inset-3" aria-hidden>
            <svg className="h-full w-full overflow-visible">
              <rect className={styles.foil} x="0" y="0" width="100%" height="100%" pathLength={1} />
            </svg>
          </span>
          <Seal initials="MK" tone="maroon" size={60} />
          <p lang="hi" className="font-serif text-insert-title tracking-normal text-invite-blessing">
            शुभ विवाह
          </p>
          <p className="text-meta text-ink-2">With the blessings of our families, we invite you to celebrate</p>
          <h2 className="font-serif text-names text-invite-name">Mira &amp; Kabir</h2>
          <span className="h-px w-12 bg-gold" aria-hidden />
          <p className="text-body text-ink">
            Monday, 14 December 2026
            <br />
            <span className="text-ink-2">The Leela Palace, Bengaluru</span>
          </p>
          <div className="mt-2 flex gap-2" aria-hidden>
            <span className="inline-flex items-center gap-1 rounded-full bg-maroon px-4 py-2 text-meta text-paper">
              <Check size={16} weight="bold" />
              Attending
            </span>
            <span className="rounded-full border border-line-strong px-4 py-2 text-meta text-ink">Can&apos;t come</span>
          </div>
        </article>
      </TiltCard>

      {/* The receipt a confirmed voice note leaves behind */}
      <div
        className={cn(
          styles.fadeUp,
          "absolute -bottom-1 left-1/2 flex w-max -translate-x-1/2 items-center gap-3 rounded-sheet border border-line bg-paper px-4 py-3 text-ink shadow-overlay lg:left-auto lg:-right-10 lg:translate-x-0",
        )}
        style={v({ "--i": 8 })}
      >
        <CheckCircle size={20} className="text-paid" aria-hidden />
        <span className="text-meta">
          <span className="font-medium">Sangeet venue saved</span>
          <span className="text-ink-3"> · by Mira, 3:10 pm</span>
        </span>
        <span className="text-meta text-maroon underline underline-offset-4">Undo</span>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section
      data-surface="shell"
      className={cn(styles.root, "relative isolate overflow-hidden bg-maroon-deep text-ivory")}
      aria-labelledby="hero-title"
    >
      <span
        lang="hi"
        aria-hidden
        className={cn(
          styles.drift,
          "pointer-events-none absolute -bottom-[0.32em] -right-[0.06em] -z-10 select-none font-serif text-[clamp(12rem,32vw,30rem)] font-semibold leading-none tracking-normal text-maroon",
        )}
      >
        जश्न
      </span>

      <div className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-[90rem] items-center gap-12 px-4 py-16 md:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8 lg:py-20">
        <div className="flex max-w-[44rem] flex-col gap-8">
          <p className={cn(styles.fadeUp, "flex items-center gap-3 text-meta text-on-maroon-2")} style={v({ "--i": -4 })}>
            <span className="h-px w-8 bg-gold" aria-hidden />
            English, <span lang="hi">हिंदी</span> or Hinglish
          </p>
          <h1 id="hero-title" className="font-serif text-[clamp(2.6rem,1.2rem+5vw,6rem)] font-semibold leading-[0.98] tracking-[-0.02em]">
            {["Plan the whole", "wedding by", "saying it", "out loud."].map((line, i) => (
              <span key={line} className={styles.line}>
                <span className={styles.lineInner} style={v({ "--i": i })}>
                  {line}
                </span>
              </span>
            ))}
          </h1>
          <p className={cn(styles.fadeUp, "max-w-[34rem] text-[1.1875rem] leading-[1.6] text-on-maroon-2")} style={v({ "--i": 0 })}>
            Hold the mic and talk the way you would to a cousin. Jashn turns it into events, guests,
            vendors and money, kept in one family account book everyone can read. Nothing is saved
            until you confirm.
          </p>
          <div className={cn(styles.fadeUp, "flex flex-wrap gap-3")} style={v({ "--i": 1 })}>
            <Link href={routes.home()} className={cn(buttonVariants({ size: "lg" }), onMaroonPrimary)}>
              <HouseLine size={20} aria-hidden />
              Go to dashboard
            </Link>
            <a href="#how" className={cn(buttonVariants({ variant: "outline", size: "lg" }), onMaroonSecondary)}>
              See how it works
            </a>
          </div>
          <p className={cn(styles.fadeUp, "text-meta text-on-maroon-2/80")} style={v({ "--i": 2 })}>
            Fictional demo data: Mira &amp; Kabir, Bengaluru, 14 Dec 2026
          </p>
        </div>

        <InvitationStack />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

const STEPS = [
  {
    title: "Hold the mic and talk",
    body: "A payment, a guest’s diet, a task for your sister. One ramble can carry all three.",
  },
  {
    title: "Check what Jashn caught",
    body: "Each thing it heard becomes a card: what it will do, the words it came from, and the effect on your totals.",
  },
  {
    title: "Confirm, and the family sees it",
    body: "Voice never writes on its own. Confirm saves it, and everyone planning with you sees the change.",
  },
] as const;

function HowItWorks() {
  return (
    <Reveal id="how" className={cn(styles.root, "scroll-mt-16 bg-ivory")} threshold={0.12}>
      <div className="mx-auto grid max-w-[90rem] gap-12 px-4 py-24 md:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20 lg:py-32">
        <div className="flex flex-col gap-8 lg:sticky lg:top-28 lg:self-start">
          <Eyebrow>How it works</Eyebrow>
          <WipeTitle lines={["Say it the way", "you’d say it", "to your cousin."]} className="text-ink" />
          <ol className="flex flex-col">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className={cn(styles.rise, "grid grid-cols-[3rem_1fr] gap-x-4 border-t border-line py-5 last:border-b")}
                style={v({ "--i": i + 3 })}
              >
                <span className="font-serif text-[2rem] font-medium leading-none text-maroon tabular-nums">{i + 1}</span>
                <span className="flex flex-col gap-1">
                  <span className="text-heading text-ink">{step.title}</span>
                  <span className="text-body text-ink-2">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className={styles.rise} style={v({ "--i": 2 })}>
          <VoiceDemo />
        </div>
      </div>
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// The khata
// ---------------------------------------------------------------------------

type Status = { kind: "paid" | "due" | "overdue"; label: string };

const STATUS_STYLE = {
  paid: { cls: "bg-paid-tint text-paid", Icon: CheckCircle },
  due: { cls: "bg-due-tint text-due", Icon: Clock },
  overdue: { cls: "bg-overdue-tint text-overdue", Icon: WarningCircle },
} as const;

function StatusChip({ status }: { status: Status }) {
  const { cls, Icon } = STATUS_STYLE[status.kind];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-chip px-2 py-0.5 text-meta", cls)}>
      <Icon size={16} aria-hidden />
      {status.label}
    </span>
  );
}

/** Fictional demo figures; a real wedding's come from the money read model. */
const LEDGER: ReadonlyArray<{
  vendor: string;
  what: string;
  committed: number;
  was?: number;
  paid: number;
  owed: number;
  status: Status;
}> = [
  {
    vendor: "Sharma Caterers",
    what: "Wedding dinner, 230 guests",
    committed: 420_000,
    was: 450_000,
    paid: 50_000,
    owed: 370_000,
    status: { kind: "due", label: "Due 2 Dec, in 7 days" },
  },
  {
    vendor: "Rang Decor",
    what: "Mandap and sangeet stage",
    committed: 210_000,
    paid: 210_000,
    owed: 0,
    status: { kind: "paid", label: "Paid" },
  },
  {
    vendor: "The Leela Palace",
    what: "Venue, two days",
    committed: 380_000,
    paid: 100_000,
    owed: 280_000,
    status: { kind: "overdue", label: "Overdue since 20 Nov" },
  },
];

const TOTALS = { committed: 1_010_000, paid: 360_000, owed: 650_000, budget: 1_200_000 } as const;

function Khata() {
  return (
    <Reveal id="khata" className={cn(styles.root, "scroll-mt-16 bg-ivory-deep")} threshold={0.15}>
      <div className="mx-auto flex max-w-[90rem] flex-col gap-12 px-4 py-24 md:px-8 lg:py-32">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="flex flex-col gap-6">
            <Eyebrow>
              The khata <span lang="hi">· हिसाब</span>
            </Eyebrow>
            <WipeTitle lines={["A khata the whole", "family can read."]} className="text-ink" />
          </div>
          <p className={cn(styles.rise, "max-w-[32rem] text-[1.125rem] leading-[1.65] text-ink-2")} style={v({ "--i": 2 })}>
            Planned, committed, paid and still owed, in columns that add up. When someone corrects a
            figure the old one stays, struck through, with who changed it and when. Nothing is ever
            quietly erased.
          </p>
        </div>

        <div className={cn(styles.rise, "overflow-hidden rounded-sheet border border-line bg-paper")} style={v({ "--i": 3 })}>
          {/* Budget bar */}
          <div className="flex flex-col gap-3 border-b border-line p-6 md:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-heading text-ink">Mira &amp; Kabir · Budget</span>
              <span className="text-panel text-ink tabular-nums">{formatInr(TOTALS.budget)}</span>
            </div>
            <div className="flex h-3 gap-0.5" aria-hidden>
              <span className={cn(styles.segment, "rounded-l-full bg-maroon")} style={v({ width: "30%", "--i": 0 })} />
              <span
                className={cn(styles.segment, "border border-maroon bg-maroon-tint")}
                style={v({ width: "54%", "--i": 1 })}
              />
              <span
                className={cn(styles.segment, "flex-1 rounded-r-full border border-dashed border-line-strong")}
                style={v({ "--i": 2 })}
              />
            </div>
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-meta text-ink-2">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-maroon" aria-hidden />
                <dt>Paid</dt>
                <dd className="font-medium text-ink tabular-nums">{formatInr(TOTALS.paid)}</dd>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full border border-maroon bg-maroon-tint" aria-hidden />
                <dt>Committed</dt>
                <dd className="font-medium text-ink tabular-nums">{formatInr(TOTALS.committed)}</dd>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full border border-dashed border-line-strong" aria-hidden />
                <dt>Still owed</dt>
                <dd className="font-medium text-ink tabular-nums">{formatInr(TOTALS.owed)}</dd>
              </div>
            </dl>
          </div>

          {/* Ledger */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-table">
              <caption className="sr-only">Sample vendor ledger with one corrected contract</caption>
              <thead>
                <tr className="text-left text-meta text-ink-3">
                  <th scope="col" className="px-6 py-3 font-normal md:px-8">Vendor</th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">Committed</th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">Paid</th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">Still owed</th>
                  <th scope="col" className="px-6 py-3 font-normal md:px-8">Status</th>
                </tr>
              </thead>
              <tbody>
                {LEDGER.map((row) => (
                  <tr key={row.vendor} className="border-t border-line align-top">
                    <td className="px-6 py-4 md:px-8">
                      <span className="block font-medium text-ink">{row.vendor}</span>
                      <span className="block text-meta text-ink-3">{row.what}</span>
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums">
                      {row.was !== undefined ? (
                        <span className="flex flex-col items-end gap-0.5">
                          <span className="flex items-baseline gap-2">
                            <span className={styles.strike}>{formatInr(row.was)}</span>
                            <span className={cn(styles.corrected, "font-medium text-ink")}>{formatInr(row.committed)}</span>
                          </span>
                          <span className={cn(styles.corrected, "text-meta text-ink-3")}>corrected by Mira, 3:12 pm</span>
                        </span>
                      ) : (
                        <span className="font-medium text-ink">{formatInr(row.committed)}</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right font-medium text-ink tabular-nums">{formatInr(row.paid)}</td>
                    <td className="px-4 py-4 text-right tabular-nums">
                      <span
                        className={cn(row.was !== undefined && styles.washAfter, "rounded-[4px] px-1 font-medium text-ink")}
                        style={v({ "--i": 0 })}
                      >
                        {formatInr(row.owed)}
                      </span>
                    </td>
                    <td className="px-6 py-4 md:px-8">
                      <StatusChip status={row.status} />
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-line align-top">
                  <td className="px-6 py-4 md:px-8">
                    <span className="block font-medium text-ink">Mehendi by Saba</span>
                    <span className="block text-meta text-ink-3">Mehendi, 60 hands</span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="inline-flex flex-col items-end rounded-chip border border-dashed border-line-strong px-2 py-1">
                      <span className="tabular-nums text-ink-2">≈ {formatInr(36_000)}</span>
                      <span className="text-meta text-ink-3">estimate · 60 hands × {formatInr(600)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right text-ink-3">–</td>
                  <td className="px-4 py-4 text-right text-ink-3">–</td>
                  <td className="px-6 py-4 text-meta text-ink-3 md:px-8">Not booked yet</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t border-ink text-ink">
                  <th scope="row" className="px-6 pb-4 pt-4 text-left font-semibold md:px-8">Total</th>
                  <td className="px-4 pb-4 pt-4 text-right tabular-nums">
                    <span className={cn(styles.washAfter, "rounded-[4px] px-1 font-semibold")} style={v({ "--i": 1 })}>
                      {formatInr(TOTALS.committed)}
                    </span>
                  </td>
                  <td className="px-4 pb-4 pt-4 text-right font-semibold tabular-nums">{formatInr(TOTALS.paid)}</td>
                  <td className="px-4 pb-4 pt-4 text-right tabular-nums">
                    <span className={cn(styles.washAfter, "rounded-[4px] px-1 font-semibold")} style={v({ "--i": 2 })}>
                      {formatInr(TOTALS.owed)}
                    </span>
                  </td>
                  <td className="px-6 md:px-8" />
                </tr>
                <tr aria-hidden>
                  <td colSpan={5} className="px-6 pb-6 md:px-8">
                    <span className="block h-[3px] border-y border-ink" />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// Everything in one place
// ---------------------------------------------------------------------------

const SECTIONS = [
  { Icon: HouseLine, en: "Overview", hi: "एक नज़र में", body: "What needs you today, and what changed since you last looked." },
  { Icon: CalendarDots, en: "Events", hi: "कार्यक्रम", body: "Each function with its date, venue, dress code and who is invited." },
  { Icon: UsersThree, en: "Guests", hi: "मेहमान", body: "Households, RSVPs and dietary needs, function by function." },
  { Icon: CurrencyInr, en: "Money", hi: "हिसाब", body: "Budget, contracts and payments, with every correction on the record." },
  { Icon: Storefront, en: "Vendors", hi: "वेंडर", body: "Each vendor’s contract, what you have paid and what is still owed." },
  { Icon: EnvelopeSimple, en: "Invite", hi: "निमंत्रण", body: "A card for each household, with only their functions inside." },
] as const;

function Everything() {
  return (
    <Reveal id="everything" className={cn(styles.root, "scroll-mt-16 bg-ivory")} threshold={0.12}>
      <div className="mx-auto flex max-w-[90rem] flex-col gap-14 px-4 py-24 md:px-8 lg:py-32">
        <div className="flex flex-col gap-6">
          <Eyebrow>Everything in one place</Eyebrow>
          <WipeTitle lines={["Six pages instead of", "forty WhatsApp groups."]} className="text-ink" />
        </div>
        <ul className="grid border-t border-line md:grid-cols-2">
          {SECTIONS.map(({ Icon, en, hi, body }, i) => (
            <li
              key={en}
              className={cn(
                styles.rise,
                "group grid grid-cols-[2.5rem_1fr] gap-x-4 border-b border-line py-7 md:odd:border-r md:odd:pr-10 md:even:pl-10",
              )}
              style={v({ "--i": i })}
            >
              <span className="grid size-10 place-items-center rounded-control bg-ivory-deep text-maroon transition-colors duration-150 group-hover:bg-maroon group-hover:text-ivory">
                <Icon size={24} aria-hidden />
              </span>
              <span className="flex flex-col gap-1">
                <span className="flex items-baseline gap-3">
                  <span className="font-title text-[1.625rem] leading-tight text-ink">{en}</span>
                  <span lang="hi" className="font-serif text-body tracking-normal text-gold-ink">
                    {hi}
                  </span>
                </span>
                <span className="text-body text-ink-2">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

const INSERTS = [
  { name: "Mehendi", hi: "मेहंदी", date: "Saturday, 12 December", time: "4:00 pm", venue: "Mira’s home, Indiranagar", dress: "Greens and yellows", r: "-5deg", y: "28px" },
  { name: "Sangeet", hi: "संगीत", date: "Sunday, 13 December", time: "7:30 pm", venue: "The Leela Palace, Ballroom", dress: "Indo-western", r: "0deg", y: "0px" },
  { name: "Wedding", hi: "विवाह", date: "Monday, 14 December", time: "10:15 am", venue: "The Leela Palace, Lawns", dress: "Traditional", r: "5deg", y: "28px" },
] as const;

function TheCard() {
  return (
    <Reveal id="card" className={cn(styles.root, "scroll-mt-16 overflow-hidden bg-maroon-deep text-ivory")} threshold={0.15}>
      <div data-surface="shell" className="mx-auto flex max-w-[90rem] flex-col gap-16 px-4 py-24 md:px-8 lg:py-32">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="flex flex-col gap-6">
            <Eyebrow onMaroon>
              The card <span lang="hi">· निमंत्रण</span>
            </Eyebrow>
            <WipeTitle lines={["Guests get a card,", "not a form."]} className="text-ivory" />
          </div>
          <p className={cn(styles.rise, "max-w-[32rem] text-[1.125rem] leading-[1.65] text-on-maroon-2")} style={v({ "--i": 2 })}>
            Like the box that comes home before every wedding: one main card and an insert per
            function. Each household sees only the functions they are invited to, and answers
            right on the insert.
          </p>
        </div>

        <ul className="grid gap-6 md:grid-cols-3 md:gap-8">
          {INSERTS.map((insert, i) => (
            <li
              key={insert.name}
              className={cn(styles.insert, "relative rounded-paper bg-invite-stock p-8 text-invite-ink shadow-insert")}
              style={v({ "--r": insert.r, "--y": insert.y, "--i": i })}
            >
              <span className="pointer-events-none absolute inset-3 border border-gold" aria-hidden />
              <div className="relative flex flex-col gap-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-serif text-insert-title text-invite-name">{insert.name}</h3>
                  <span lang="hi" className="font-serif text-body tracking-normal text-invite-blessing">
                    {insert.hi}
                  </span>
                </div>
                <dl className="grid grid-cols-[5.5rem_1fr] gap-y-1.5 text-body">
                  <dt className="text-meta leading-6 text-ink-3">When</dt>
                  <dd>
                    {insert.date}, {insert.time}
                  </dd>
                  <dt className="text-meta leading-6 text-ink-3">Where</dt>
                  <dd>{insert.venue}</dd>
                  <dt className="text-meta leading-6 text-ink-3">Dress code</dt>
                  <dd>{insert.dress}</dd>
                </dl>
                <div className="flex gap-2 pt-2" aria-hidden>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-4 py-2 text-meta",
                      i === 1 ? "bg-maroon text-paper" : "border border-line-strong text-ink",
                    )}
                  >
                    {i === 1 ? <Check size={16} weight="bold" /> : null}
                    Attending
                  </span>
                  <span className="rounded-full border border-line-strong px-4 py-2 text-meta text-ink">Can&apos;t come</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// Closing call to action and footer
// ---------------------------------------------------------------------------

function Closing() {
  return (
    <Reveal className={cn(styles.root, "bg-ivory")} threshold={0.3}>
      <div className="mx-auto flex max-w-[90rem] flex-col items-start gap-10 px-4 py-24 md:px-8 lg:py-36">
        <h2 className="font-serif text-[clamp(2.75rem,1.4rem+5vw,5.5rem)] font-semibold leading-[1] tracking-[-0.02em] text-maroon">
          {["Your wedding is waiting", "where you left it."].map((line, i) => (
            <span key={line} className={styles.wipe}>
              <span style={v({ "--i": i })}>{line}</span>
            </span>
          ))}
        </h2>
        <div className={cn(styles.rise, "flex flex-wrap gap-3")} style={v({ "--i": 3 })}>
          <Link href={routes.home()} className={cn(buttonVariants({ size: "lg" }), "h-12 px-5")}>
            <HouseLine size={20} aria-hidden />
            Go to dashboard
          </Link>
          <Link href={routes.signup()} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 px-5")}>
            Create an account
          </Link>
        </div>
      </div>
    </Reveal>
  );
}

function Footer() {
  return (
    <footer data-surface="shell" className="bg-maroon-deep text-on-maroon-2">
      <div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-between gap-4 px-4 py-8 text-meta md:px-8">
        <span className="flex items-center gap-3">
          <Seal initials="J" tone="gold" size={28} />
          <span>Jashn · Built at FestiveHacks 2026</span>
        </span>
        <span>Every name and figure on this page is fictional demo data.</span>
      </div>
    </footer>
  );
}

/** The public landing page at `/`. "Go to dashboard" goes to `/app`, which routes by session. */
export function LandingPage() {
  return (
    <div className="flex min-h-full flex-col bg-ivory">
      <Header />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Khata />
        <Everything />
        <TheCard />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}
