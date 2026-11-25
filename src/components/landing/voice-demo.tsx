"use client";

import { ArrowCounterClockwise, CheckCircle, Microphone } from "@phosphor-icons/react";
import { cn } from "cn";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { formatInr } from "@/contracts/money";

import styles from "./styles";
import { useInView } from "./reveal";

type Kind = "money" | "who" | "when";

/** One voice note in Hinglish, with the spans Jashn recognises. Fictional demo data. */
const SEGMENTS: ReadonlyArray<{ text: string; kind?: Kind }> = [
  { text: "Haan, toh" },
  { text: "Sharma Caterers", kind: "who" },
  { text: "ko" },
  { text: "fifty thousand", kind: "money" },
  { text: "advance de diya. Aur" },
  { text: "Diya,", kind: "who" },
  { text: "mehendi", kind: "when" },
  { text: "wali ko call karke" },
  { text: "Saturday", kind: "when" },
  { text: "ka time confirm kar lena. Aur" },
  { text: "Nani", kind: "who" },
  { text: "ke liye no onion, no garlic." },
];

const KIND_CLASS: Record<Kind, string> = {
  money: "bg-wash",
  who: "bg-maroon-tint",
  when: "bg-ivory-deep",
};

const CAUGHT = [
  {
    tag: "Payment",
    action: `Paid Sharma Caterers ${formatInr(50_000)} as advance`,
    from: "“fifty thousand advance de diya”",
    effect: `Still owed to Sharma Caterers: ${formatInr(370_000)}`,
  },
  {
    tag: "Task for Diya",
    action: "Call the mehendi artist and confirm Saturday’s time",
    from: "“mehendi wali ko call karke”",
    effect: "Due before Sat 12 Dec",
  },
  {
    tag: "Dietary need",
    action: "Nani: no onion, no garlic",
    from: "“Nani ke liye no onion, no garlic”",
    effect: "Added to every function Nani attends",
  },
] as const;

const BARS = [6, 12, 8, 15, 5, 11, 7, 14, 6, 10] as const;
const STEP_MS = 150;

type Token = { text: string; kind?: Kind; index: number };

/**
 * The landing page's listening card: a scripted voice note types itself out word by word,
 * the recognised spans wash in, then "What I caught" rises card by card. Starts once in
 * view; with reduced motion it shows the finished state.
 */
export function VoiceDemo() {
  const tokens = useMemo(() => {
    const out: Token[] = [];
    for (const seg of SEGMENTS) {
      if (seg.kind) out.push({ text: seg.text, kind: seg.kind, index: out.length });
      else for (const w of seg.text.split(" ")) out.push({ text: w, index: out.length });
    }
    return out;
  }, []);

  const [ref, inView] = useInView<HTMLDivElement>(0.4);
  const [shown, setShown] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const t = setTimeout(() => setShown(tokens.length + 4), 0);
      return () => clearTimeout(t);
    }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= tokens.length + 4) clearInterval(id);
    }, STEP_MS);
    return () => clearInterval(id);
  }, [inView, run, tokens.length]);

  const listening = inView && shown < tokens.length;
  const done = shown >= tokens.length + 2;
  const seconds = Math.min(Math.floor((shown * STEP_MS) / 600), 9);

  return (
    <div ref={ref} className="flex flex-col gap-4" aria-label="A sample voice note and what Jashn caught from it">
      <div className="rounded-sheet border border-line bg-paper p-6 md:p-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "grid size-11 place-items-center rounded-full text-ivory transition-colors duration-150",
                listening ? "bg-maroon-deep" : "bg-maroon",
              )}
              aria-hidden
            >
              <Microphone size={24} weight={listening ? "fill" : "regular"} />
            </span>
            <div className="flex flex-col">
              <span className="text-heading text-ink">{listening ? "Listening" : done ? "Heard you" : "Ready"}</span>
              <span className="text-meta text-ink-3 tabular-nums">0:0{seconds}</span>
            </div>
          </div>
          <span className={styles.meter} data-live={listening ? "true" : "false"} aria-hidden>
            {BARS.map((h, i) => (
              <i key={i} style={{ "--h": `${h}px`, "--i": i } as CSSProperties} />
            ))}
          </span>
        </div>

        <p className="mt-6 min-h-[7.5rem] text-panel font-normal leading-[1.55] text-ink" lang="hi-Latn">
          {tokens.map((t) => {
            const on = shown > t.index;
            return (
              <span key={t.index}>
                <span className={styles.word} data-on={on ? "true" : "false"}>
                  {t.kind ? (
                    <span className={cn(styles.span, KIND_CLASS[t.kind])} data-hl={shown > t.index + 1 ? "true" : "false"}>
                      {t.text}
                    </span>
                  ) : (
                    t.text
                  )}
                </span>{" "}
              </span>
            );
          })}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-meta text-ink-3">
          <span>
            English, <span lang="hi">हिंदी</span> or Hinglish · Nothing is saved until you confirm
          </span>
          <button
            type="button"
            onClick={() => {
              setShown(0);
              setRun((r) => r + 1);
            }}
            disabled={!done}
            className="inline-flex items-center gap-1 rounded-control px-2 py-1 text-maroon transition-opacity duration-150 hover:bg-ivory focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon disabled:opacity-0"
          >
            <ArrowCounterClockwise size={16} aria-hidden />
            Play again
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2 text-heading text-ink">
        What I caught
        <span className="text-meta font-normal text-ink-3 tabular-nums">{done ? CAUGHT.length : 0}</span>
      </div>
      <ul className="flex flex-col gap-3">
        {CAUGHT.map((c, i) => (
          <li
            key={c.tag}
            className={cn(styles.caught, "rounded-sheet border border-line bg-paper p-4 md:p-5")}
            data-on={done ? "true" : "false"}
            style={{ "--i": i } as CSSProperties}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="w-fit rounded-chip bg-ivory-deep px-2 py-0.5 text-meta text-ink-2">{c.tag}</span>
                <span className="text-body font-medium text-ink">{c.action}</span>
                <span className="text-meta text-ink-3">
                  From {c.from} · {c.effect}
                </span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-control bg-maroon px-3 py-1.5 text-meta text-paper" aria-hidden>
                <CheckCircle size={16} />
                Confirm
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
