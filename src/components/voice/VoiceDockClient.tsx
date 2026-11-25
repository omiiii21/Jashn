"use client";

/**
 * The dock's client part (voice.md 1.2 to 1.15, 6; design-direction 7.1). It records, streams the
 * turn, shows the card and confirms through `/api/voice/confirm`, which runs the dispatcher on
 * the server. It gets plain props and voice blocks only: no Flagsmith SDK, key, identity or
 * traits (flagsmith 6.9). Client components never import src/server/ (AGENTS.md rule 5).
 */
import {
  ArrowClockwiseIcon,
  FlaskIcon,
  KeyboardIcon,
  LockSimpleIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  PaperPlaneRightIcon,
  PencilSimpleIcon,
  SpeakerHighIcon,
  StopIcon,
  TranslateIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { cn } from "cn";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  VOICE_STATE_EVENT,
  VOICE_STATE_REQUEST_EVENT,
  VOICE_TOGGLE_EVENT,
  VOICE_TYPE_EVENT,
  type VoiceDockBroadcast,
  type VoiceDockState,
} from "@/components/ui/voice-events";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { VOICE_TEXT_MAX, VOICE_TURN_TTL_MS, type VoiceAnswerCard, type VoiceConfirmResponse, type VoiceReply, type VoiceStreamEvent } from "@/contracts/api";
import type { CommandEnvelope, CommandResponse, VoicePrefillEntry } from "@/contracts/commands";
import type { AppLanguage } from "@/contracts/domain";
import type { VoiceDockFlags } from "@/contracts/flags";

import { dockCopy, receiptTime, type DockCopy } from "./dock-copy";
import { fixtureRowSetting, speechLanguageSetting, useFixtureRow, useOnline, useRecorderChoice, useSpeechLanguage } from "./dock-settings";
import { prefillTargetPath, setVoicePrefill } from "./prefill-store";
import type { FlagDrawerData } from "./drawer-types";
import { ReasonChips } from "./ReasonChip";
import {
  AMBER_MS,
  AUTO_STOP_MS,
  classifyMicError,
  createLevelContext,
  decideRelease,
  formatTimer,
  gestureFromDrag,
  openMic,
  PERMISSION_SLOW_MS,
  queryMicPermission,
  startRecording,
  stopStream,
  type ActiveRecording,
} from "./recorder";
import { playReply, stopReplyAudio, unlockReplyAudio, type ReplyAudioState, type ReplyPlayback } from "./reply-audio";
import { editKey, editsForConfirm, ReviewCard, VoiceReceipt, type CardEdits, type CardPhase, type PreviewEvent, type ReceiptView } from "./ReviewCard";
import { buildTurnForm, postCancel, postConfirm, sendTurn, voiceBlockOf, type TurnInput } from "./turn-stream";

export type VoiceDockClientProps = {
  wedding_id: string | null;
  setup_opened_at: string | null;
  show_printed_card: boolean;
  flags: VoiceDockFlags;
  ui_language: AppLanguage;
  fixture_mode: boolean;
  fixture_rows: readonly string[];
  display_name: string;
  is_internal: boolean;
  /** The one command action (D98), for Undo (voice.md 5.5). Undo itself is a follow-up. */
  dispatchCommand: (envelope: CommandEnvelope) => Promise<CommandResponse>;
  /** The flags drawer's data and actions (flagsmith 5.9): internal accounts only, else null. */
  drawer?: FlagDrawerData | null;
};

/** The browser gives up on a turn after 45 s (voice.md 1.16). */
const GIVE_UP_MS = 45_000;
const SKELETON_MS = 300;
const STILL_WORKING_MS = 4_000;
/** A held clip is kept for one Retry, then dropped after 2 minutes (voice.md 6). */
const CLIP_KEEP_MS = 2 * 60_000;

type HeardEvent = Extract<VoiceStreamEvent, { type: "heard" }>;
type Terminal = Exclude<VoiceStreamEvent, { type: "heard" } | { type: "done" }>;

type MicState =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "starting"; locked: boolean }
  | { kind: "listening"; locked: boolean; started_at: number };

type TurnView = {
  voice_turn_id: string | null;
  heard: HeardEvent | null;
  terminal: Terminal | null;
  card_phase: CardPhase;
  card_notice: string | null;
  edits: CardEdits;
  receipt: ReceiptView | null;
  /** The card closed: expired, closed, replaced, cancelled, voice off. */
  closed_line: string | null;
  form_opened: boolean;
  /** What Retry resends (a clip, a text or an option), with when it was kept. */
  retry: { input: TurnInput; context_turn_id: string | null; at: number } | null;
};

const EMPTY_VIEW: TurnView = {
  voice_turn_id: null,
  heard: null,
  terminal: null,
  card_phase: "ready",
  card_notice: null,
  edits: {},
  receipt: null,
  closed_line: null,
  form_opened: false,
  retry: null,
};

type Notice = { text: string; tone: "info" | "error"; retry?: boolean } | null;
type ReplyView = { voice_turn_id: string; text: string; state: ReplyAudioState } | null;
type Flight = { started: number; skeleton: boolean; slow: boolean } | null;

const noopSubscribe = () => () => undefined;

function currentPage(): string | null {
  try {
    return `${window.location.pathname}${window.location.search}`;
  } catch {
    return null;
  }
}

function newClientTurnId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-4000-8000-${Math.random().toString(16).slice(2, 14)}`;
  }
}

function isOpenPreview(view: TurnView): boolean {
  return view.terminal?.type === "preview" && view.receipt === null && view.closed_line === null;
}

export function VoiceDockClient(props: VoiceDockClientProps) {
  const router = useRouter();
  const copy = dockCopy(props.ui_language);
  const panelId = useId();
  const statusId = useId();
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);

  // The voice block: whichever the dock received last (1.15). New props replace a response's
  // block; a response's block replaces the props' until the next render.
  const [propFlags, setPropFlags] = useState(props.flags);
  const [voice, setVoice] = useState(props.flags);
  if (props.flags !== propFlags) {
    setPropFlags(props.flags);
    setVoice(props.flags);
  }
  const voiceRef = useRef<VoiceDockFlags>(props.flags);
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);
  const takeVoice = useCallback((block: VoiceDockFlags | null | undefined) => {
    if (!block) return;
    voiceRef.current = block;
    setVoice(block);
  }, []);

  const choice = useRecorderChoice();
  const online = useOnline();
  const speechLanguage = useSpeechLanguage();
  const fixtureRow = useFixtureRow();

  const [panelOpen, setPanelOpen] = useState(false);
  const [mic, setMicState] = useState<MicState>({ kind: "idle" });
  const micRef = useRef<MicState>({ kind: "idle" });
  const setMic = (next: MicState) => {
    micRef.current = next;
    setMicState(next);
  };
  const [elapsed, setElapsed] = useState(0);
  const [flight, setFlight] = useState<Flight>(null);
  const flightRef = useRef(false);
  const [view, setViewState] = useState<TurnView>(EMPTY_VIEW);
  const viewRef = useRef<TurnView>(EMPTY_VIEW);
  const setView = useCallback((update: TurnView | ((prev: TurnView) => TurnView)) => {
    const next = typeof update === "function" ? update(viewRef.current) : update;
    viewRef.current = next;
    setViewState(next);
  }, []);
  const [notice, setNotice] = useState<Notice>(null);
  const [reply, setReply] = useState<ReplyView>(null);
  const [typed, setTyped] = useState("");
  const [editingHeard, setEditingHeard] = useState(false);
  const [heardDraft, setHeardDraft] = useState("");
  /** A note about the last clip, such as "Stopped at 25 seconds". */
  const [clipNote, setClipNote] = useState<string | null>(null);

  const pressRef = useRef<{ pointerId: number; x: number; y: number; at: number } | null>(null);
  const recRef = useRef<ActiveRecording | null>(null);
  const startTokenRef = useRef(0);
  const latestTurnRef = useRef<{ id: string; at: number } | null>(null);
  const playbackRef = useRef<ReplyPlayback | null>(null);
  const meterRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelInputRef = useRef<HTMLInputElement | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((next: Notice, ms?: number) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = null;
    setNotice(next);
    if (next && ms) noticeTimerRef.current = setTimeout(() => setNotice(null), ms);
  }, []);

  const contextTurnId = (): string | null => {
    const latest = latestTurnRef.current;
    if (!latest) return null;
    return Date.now() - latest.at < VOICE_TURN_TTL_MS ? latest.id : null;
  };

  // -------------------------------------------------------------------------
  // Spoken replies (1.14)
  // -------------------------------------------------------------------------

  const speak = useCallback(
    (voice_turn_id: string, r: VoiceReply, flags: VoiceDockFlags) => {
      playbackRef.current?.stop();
      playbackRef.current = null;
      if (!r.display_text) {
        setReply(null);
        return;
      }
      if (!r.speak || r.parts < 1 || !flags.spoken_replies) {
        setReply({ voice_turn_id, text: r.display_text, state: "silent" });
        return;
      }
      setReply({ voice_turn_id, text: r.display_text, state: "loading" });
      playbackRef.current = playReply({
        voice_turn_id,
        parts: r.parts,
        onState: (state) => setReply((prev) => (prev && prev.voice_turn_id === voice_turn_id ? { ...prev, state } : prev)),
      });
    },
    [],
  );

  const stopSpeaking = () => {
    playbackRef.current?.stop();
    playbackRef.current = null;
    stopReplyAudio();
  };

  // -------------------------------------------------------------------------
  // Confirm results (1.13), shared by the tap and the phrase's `saved` event
  // -------------------------------------------------------------------------

  const applyConfirmed = useCallback(
    (body: VoiceConfirmResponse, http_status: number) => {
      takeVoice(body.voice);
      const time = receiptTime();
      let receipt: ReceiptView;
      if (body.status === "partially_saved") {
        receipt = { kind: "partly", lines: [copy.partly_saved, body.reply.display_text].filter(Boolean) };
      } else if (http_status === 202 || (body.results.length > 0 && body.results.every((r) => r.outcome === "proposed"))) {
        receipt = { kind: "approval", line: copy.sent_for_approval };
      } else {
        receipt = { kind: "saved", line: copy.saved_by(props.display_name, time) };
      }
      setView((prev) => ({ ...prev, card_phase: "ready", card_notice: null, receipt, retry: null }));
      // Go to the affected record; otherwise re-render once (polling only, architecture 2.4).
      if (body.navigate?.path) router.push(body.navigate.path);
      else router.refresh();
      speak(body.voice_turn_id, body.reply, body.voice);
    },
    [copy, props.display_name, router, setView, speak, takeVoice],
  );

  const handOffPrefill = useCallback(
    (entries: VoicePrefillEntry[], voice_turn_id: string) => {
      if (entries.length === 0) return false;
      setVoicePrefill(entries, { voice_turn_id, wedding_id: props.wedding_id });
      const target = prefillTargetPath(entries, props.wedding_id);
      if (target && target !== currentPage()) router.push(target);
      // Say "the form is open" only when there is something to fill it with.
      return entries.some((entry) => Object.keys(entry.input).length > 0);
    },
    [props.wedding_id, router],
  );

  // -------------------------------------------------------------------------
  // Turn events (1.5)
  // -------------------------------------------------------------------------

  const onEvent = useCallback(
    (event: VoiceStreamEvent, hadOpenCard: boolean) => {
      // A result reopens the panel if the person closed it meanwhile.
      if (event.type !== "heard" && event.type !== "done") setPanelOpen(true);
      switch (event.type) {
        case "heard":
          takeVoice(event.voice);
          latestTurnRef.current = { id: event.voice_turn_id, at: Date.now() };
          setView((prev) => ({ ...prev, heard: event }));
          return;
        case "done":
          takeVoice(event.voice);
          return;
        case "saved":
          // A confirm phrase acted on the open card (or replayed a saved one, X-01).
          setView((prev) => ({ ...prev, voice_turn_id: event.body.voice_turn_id, retry: null }));
          applyConfirmed(event.body, 200);
          return;
        case "cancelled":
          setView((prev) => ({ ...prev, terminal: null, receipt: null, closed_line: event.reply.display_text || copy.nothing_changed, retry: null }));
          speak(event.voice_turn_id, event.reply, voiceRef.current);
          return;
        case "preview":
          setView((prev) => ({
            ...prev,
            voice_turn_id: event.voice_turn_id,
            terminal: event,
            card_phase: "ready",
            card_notice: null,
            edits: {},
            receipt: null,
            closed_line: null,
            form_opened: false,
            retry: null,
          }));
          // A complete preview is silent; one needing input speaks its question.
          if (event.reply.speak) speak(event.voice_turn_id, event.reply, voiceRef.current);
          else setReply(null);
          return;
        case "answer":
        case "clarify":
          setView((prev) => ({
            ...prev,
            voice_turn_id: event.voice_turn_id,
            terminal: event,
            receipt: null,
            closed_line: event.type === "answer" && hadOpenCard ? copy.replaced : null,
            retry: null,
          }));
          speak(event.voice_turn_id, event.type === "answer" ? event.reply : event.question, voiceRef.current);
          return;
        case "refused": {
          const opened = handOffPrefill(event.prefill, event.voice_turn_id);
          setView((prev) => ({
            ...prev,
            voice_turn_id: event.voice_turn_id,
            terminal: event,
            receipt: null,
            closed_line: hadOpenCard ? copy.replaced : null,
            form_opened: opened,
            retry: null,
          }));
          speak(event.voice_turn_id, event.reply, voiceRef.current);
          return;
        }
        case "error":
          // Failure messages are shown, never spoken (6). The transcript stays for "Edit what I heard".
          setView((prev) => ({ ...prev, voice_turn_id: event.voice_turn_id, terminal: hadOpenCard ? prev.terminal : event }));
          showNotice({ text: event.message || copy.something_wrong, tone: "error", retry: event.retryable });
          return;
      }
    },
    [applyConfirmed, copy, handOffPrefill, setView, showNotice, speak, takeVoice],
  );

  // -------------------------------------------------------------------------
  // Sending a turn (1.4)
  // -------------------------------------------------------------------------

  const runTurn = useCallback(
    async (input: TurnInput, opts: { context_turn_id?: string | null } = {}) => {
      if (flightRef.current) return;
      if (!navigator.onLine) {
        showNotice({ text: copy.offline, tone: "error" });
        return;
      }
      flightRef.current = true;
      setPanelOpen(true);
      setEditingHeard(false);
      showNotice(null);
      stopSpeaking();
      setReply(null);

      const context_turn_id = opts.context_turn_id === undefined ? contextTurnId() : opts.context_turn_id;
      const hadOpenCard = isOpenPreview(viewRef.current);
      const keep = { input, context_turn_id, at: Date.now() };
      setView((prev) => ({
        ...prev,
        heard: null,
        // An open card stays until the new turn's result says what happened to it.
        terminal: hadOpenCard ? prev.terminal : null,
        receipt: hadOpenCard ? prev.receipt : null,
        closed_line: null,
        retry: keep,
      }));

      const started = Date.now();
      setFlight({ started, skeleton: false, slow: false });
      const skeletonTimer = setTimeout(() => setFlight((f) => (f && f.started === started ? { ...f, skeleton: true } : f)), SKELETON_MS);
      const slowTimer = setTimeout(() => setFlight((f) => (f && f.started === started ? { ...f, slow: true } : f)), STILL_WORKING_MS);
      const controller = new AbortController();
      let gaveUp = false;
      const giveUpTimer = setTimeout(() => {
        gaveUp = true;
        controller.abort();
      }, GIVE_UP_MS);

      let sawTerminal = false;
      let result: Awaited<ReturnType<typeof sendTurn>>;
      try {
        for (let attempt = 0; ; attempt += 1) {
          // A new client_turn_id per send: a resend is a new turn (6.1 row 5).
          const form = buildTurnForm({
            input,
            wedding_id: props.wedding_id,
            client_turn_id: newClientTurnId(),
            ui_language: props.ui_language,
            speech_language: speechLanguageSetting.get(),
            context_turn_id,
            page: currentPage(),
            setup_opened_at: props.setup_opened_at,
            fixture_id: props.fixture_mode ? fixtureRowSetting.get() || null : null,
          });
          result = await sendTurn(
            form,
            (event) => {
              if (event.type !== "heard" && event.type !== "done") sawTerminal = true;
              onEvent(event, hadOpenCard);
            },
            controller.signal,
          );
          if (result.kind === "network" && attempt === 0 && navigator.onLine) continue;
          break;
        }
      } finally {
        clearTimeout(skeletonTimer);
        clearTimeout(slowTimer);
        clearTimeout(giveUpTimer);
        flightRef.current = false;
        setFlight(null);
      }

      if (result.kind === "aborted") {
        if (gaveUp) {
          showNotice({ text: copy.took_too_long, tone: "error", retry: true });
          const id = viewRef.current.heard?.voice_turn_id;
          if (id) void postCancel({ voice_turn_id: id });
        }
        return;
      }
      if (result.kind === "network") {
        // 6.1 row 5: sent once more already; now offer Retry.
        showNotice({ text: navigator.onLine ? copy.send_failed : copy.offline, tone: "error", retry: true });
        return;
      }
      if (result.kind === "error") {
        takeVoice(voiceBlockOf(result.body));
        const code = result.body?.error.code;
        if (code === "voice_unavailable") {
          setView((prev) => ({ ...prev, terminal: null, closed_line: null, retry: null }));
          return;
        }
        if (code === "unauthenticated") showNotice({ text: copy.sign_in, tone: "error" });
        else if (code === "rate_limited") showNotice({ text: copy.rate_limited, tone: "error" });
        else if (code === "validation_failed" && result.body?.error.message === "too_long") showNotice({ text: copy.too_long, tone: "error" });
        else if (code === "validation_failed" && result.body?.error.field === "option") showNotice({ text: copy.closed, tone: "error" });
        else if (code === "forbidden") showNotice({ text: result.body?.error.message || copy.others_turn, tone: "error" });
        else showNotice({ text: copy.something_wrong, tone: "error", retry: true });
        return;
      }
      if (!sawTerminal) {
        showNotice({ text: copy.something_wrong, tone: "error", retry: true });
        return;
      }
      if (input.kind === "text") setTyped("");
    },
    [copy, onEvent, props.fixture_mode, props.setup_opened_at, props.ui_language, props.wedding_id, setView, showNotice, takeVoice],
  );

  const retry = () => {
    unlockReplyAudio();
    const kept = viewRef.current.retry;
    if (!kept || Date.now() - kept.at > CLIP_KEEP_MS) {
      showNotice(null);
      return;
    }
    void runTurn(kept.input, { context_turn_id: kept.context_turn_id });
  };

  // -------------------------------------------------------------------------
  // Recording (1.2, 1.3)
  // -------------------------------------------------------------------------

  const micProblemText = (error: unknown): string => {
    const problem = classifyMicError(error);
    if (problem === "denied") return copy.mic_denied;
    if (problem === "unavailable") return copy.mic_unavailable;
    if (problem === "unsupported") return copy.cant_record;
    return copy.mic_unavailable;
  };

  const lockRecording = () => {
    const m = micRef.current;
    if (m.kind === "starting") setMic({ kind: "starting", locked: true });
    else if (m.kind === "listening") setMic({ ...m, locked: true });
  };

  const cancelRecording = (showCancelled = true) => {
    startTokenRef.current += 1;
    pressRef.current = null;
    recRef.current?.cancel();
    recRef.current = null;
    setMic({ kind: "idle" });
    setElapsed(0);
    if (showCancelled) showNotice({ text: copy.cancelled, tone: "info" }, 1000);
  };

  const finishRecording = async (note?: string) => {
    const rec = recRef.current;
    if (!rec) {
      cancelRecording(false);
      return;
    }
    recRef.current = null;
    pressRef.current = null;
    setMic({ kind: "idle" });
    setElapsed(0);
    let clip;
    try {
      clip = await rec.stop();
    } catch (error) {
      showNotice({ text: micProblemText(error), tone: "error" });
      return;
    }
    // A 0-byte blob is refused in the browser (1.3).
    if (clip.blob.size === 0) {
      showNotice({ text: copy.unreadable, tone: "error" });
      return;
    }
    setClipNote(note ?? null);
    await runTurn({ kind: "audio", blob: clip.blob, file_name: clip.choice.file_name, upload_type: clip.choice.upload_type, duration_ms: clip.duration_ms });
  };

  /** Called synchronously from the press gesture: the mic opens inside it (1.2). */
  const beginRecording = (locked: boolean) => {
    if (flightRef.current || micRef.current.kind !== "idle") return;
    stopSpeaking();
    if (!choice) {
      showNotice({ text: copy.cant_record, tone: "error" });
      setPanelOpen(true);
      queueMicrotask(() => panelInputRef.current?.focus());
      return;
    }
    if (!navigator.onLine) {
      showNotice({ text: copy.offline, tone: "error" });
      return;
    }
    if (props.fixture_mode && !fixtureRowSetting.get()) {
      setPanelOpen(true);
      showNotice({ text: copy.pick_row_first, tone: "error" });
      return;
    }
    const token = (startTokenRef.current += 1);
    // Both inside the gesture: getUserMedia, and the AudioContext iOS starts only from one.
    const levelContext = createLevelContext();
    let streamPromise: Promise<MediaStream>;
    try {
      streamPromise = openMic();
    } catch (error) {
      void levelContext?.close().catch(() => undefined);
      showNotice({ text: micProblemText(error), tone: "error" });
      return;
    }
    setPanelOpen(true);
    showNotice(null);
    setClipNote(null);
    setMic({ kind: "starting", locked });

    void (async () => {
      const permission = await queryMicPermission();
      let firstUse = permission === "prompt";
      if (permission === "unknown") {
        const slow = await Promise.race([
          streamPromise.then(() => false, () => false),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(true), PERMISSION_SLOW_MS)),
        ]);
        firstUse = slow;
      }
      let stream: MediaStream;
      try {
        stream = await streamPromise;
      } catch (error) {
        void levelContext?.close().catch(() => undefined);
        if (token === startTokenRef.current) {
          setMic({ kind: "idle" });
          showNotice({ text: micProblemText(error), tone: "error" });
        }
        return;
      }
      if (token !== startTokenRef.current) {
        stopStream(stream);
        void levelContext?.close().catch(() => undefined);
        return;
      }
      // First use: the press only asks. It never records (1.2).
      if (firstUse) {
        stopStream(stream);
        void levelContext?.close().catch(() => undefined);
        pressRef.current = null;
        setMic({ kind: "idle" });
        showNotice({ text: copy.mic_ready, tone: "info" });
        return;
      }
      recRef.current = startRecording({
        stream,
        choice,
        levelContext,
        onStart: () => {
          if (token !== startTokenRef.current) return;
          const m = micRef.current;
          const isLocked = m.kind === "starting" ? m.locked : m.kind === "listening" ? m.locked : true;
          setMic({ kind: "listening", locked: isLocked, started_at: performance.now() });
        },
        onError: (error) => {
          if (token !== startTokenRef.current) return;
          recRef.current = null;
          setMic({ kind: "idle" });
          showNotice({ text: micProblemText(error), tone: "error" });
        },
      });
    })();
  };

  const finishRecordingRef = useRef<((note?: string) => Promise<void>) | null>(null);
  const copyRef = useRef<DockCopy>(copy);
  useEffect(() => {
    finishRecordingRef.current = finishRecording;
    copyRef.current = copy;
  });

  // Timer, amber at 20 s, auto stop at 25 s, and the level meter (display only).
  const listening = mic.kind === "listening";
  const listeningSince = mic.kind === "listening" ? mic.started_at : null;
  useEffect(() => {
    if (listeningSince === null) return;
    let frame = 0;
    const tick = () => {
      const level = recRef.current?.level() ?? 0;
      if (meterRef.current) meterRef.current.style.transform = `scaleX(${Math.max(0.04, level).toFixed(3)})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const interval = setInterval(() => {
      const ms = performance.now() - listeningSince;
      setElapsed(ms);
      if (ms >= AUTO_STOP_MS) void finishRecordingRef.current?.(copyRef.current.stopped_25);
    }, 200);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(interval);
    };
  }, [listeningSince]);

  // Release every track if the dock unmounts mid-recording (AT-2.13).
  useEffect(
    () => () => {
      startTokenRef.current += 1;
      recRef.current?.cancel();
      recRef.current = null;
      playbackRef.current?.stop();
    },
    [],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !voice.voice_available) return;
    const m = micRef.current;
    if (m.kind === "listening" || m.kind === "starting") {
      // A tap on the mic while locked sends.
      if (m.locked) {
        e.preventDefault();
        unlockReplyAudio();
        void finishRecording();
      }
      return;
    }
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety for the drag gestures.
    }
    pressRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now() };
    beginRecording(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== e.pointerId) return;
    const m = micRef.current;
    if ((m.kind !== "listening" && m.kind !== "starting") || m.locked) return;
    const gesture = gestureFromDrag(e.clientX - press.x, e.clientY - press.y);
    if (gesture === "cancel") cancelRecording();
    else if (gesture === "lock") {
      pressRef.current = null;
      lockRecording();
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== e.pointerId) return;
    pressRef.current = null;
    // Unlock the reply element inside the release gesture, before any await (1.14).
    unlockReplyAudio();
    const m = micRef.current;
    if (m.kind !== "listening" && m.kind !== "starting") return;
    if (m.locked) return;
    const now = performance.now();
    const startedAt = recRef.current?.startedAt() ?? null;
    const decision = decideRelease({ press_ms: now - press.at, recorded_ms: startedAt === null ? null : now - startedAt });
    if (decision === "lock") lockRecording();
    else void finishRecording();
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== e.pointerId) return;
    const m = micRef.current;
    if ((m.kind === "listening" || m.kind === "starting") && !m.locked) cancelRecording();
    pressRef.current = null;
  };

  const onMicKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.repeat) return;
    const m = micRef.current;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (m.kind === "idle") {
        unlockReplyAudio();
        beginRecording(true);
      } else if (m.kind === "listening" || m.kind === "starting") {
        unlockReplyAudio();
        void finishRecording();
      }
    } else if (e.key === "Escape" && (m.kind === "listening" || m.kind === "starting")) {
      e.preventDefault();
      cancelRecording();
    }
  };

  // -------------------------------------------------------------------------
  // Card actions (1.12, 1.13)
  // -------------------------------------------------------------------------

  const confirmCard = async () => {
    // Inside the Save gesture, before any await (1.14).
    unlockReplyAudio();
    const current = viewRef.current;
    if (current.terminal?.type !== "preview" || current.card_phase === "saving") return;
    const preview = current.terminal;
    setView((prev) => ({ ...prev, card_phase: "saving", card_notice: null }));
    const edits = editsForConfirm(current.edits);
    const result = await postConfirm({ voice_turn_id: preview.voice_turn_id, edits: edits.length > 0 ? edits : undefined, via: "tap" });
    if (result.kind === "ok") {
      applyConfirmed(result.body, result.status);
      return;
    }
    if (result.kind === "network") {
      setView((prev) => ({ ...prev, card_phase: "ready", card_notice: copy.send_failed }));
      return;
    }
    const body = result.body;
    takeVoice(voiceBlockOf(body));
    const error = body?.error;
    switch (error?.code) {
      case "stale_version":
      case "draft_changed":
        setView((prev) => ({
          ...prev,
          terminal: body?.preview ?? prev.terminal,
          card_phase: "changed",
          card_notice: copy.changed_meanwhile,
          edits: {},
        }));
        return;
      case "voice_turn_expired":
        setView((prev) => ({
          ...prev,
          terminal: null,
          card_phase: "ready",
          closed_line: /closed|बंद/i.test(error.message) ? copy.closed : copy.expired,
        }));
        return;
      case "voice_writes_paused": {
        // 423: the refusal line and the prefilled form (AT-2.7 "Also").
        const opened = handOffPrefill(error.prefill ?? [], preview.voice_turn_id);
        setView((prev) => ({ ...prev, terminal: null, card_phase: "ready", closed_line: error.message, form_opened: opened }));
        return;
      }
      case "voice_unavailable":
        setView((prev) => ({ ...prev, terminal: null, card_phase: "ready", closed_line: null }));
        return;
      case "forbidden":
        setView((prev) => ({ ...prev, card_phase: "ready", card_notice: error.message || copy.others_turn }));
        return;
      case "validation_failed": {
        const label = preview.actions.flatMap((a) => a.fields).find((f) => f.field === error.field)?.label ?? error.field ?? "";
        setView((prev) => ({ ...prev, card_phase: "ready", card_notice: label ? `${label}: ${error.message}` : error.message }));
        return;
      }
      default:
        setView((prev) => ({ ...prev, card_phase: "ready", card_notice: error?.message || copy.something_wrong }));
    }
  };

  const cancelCard = async () => {
    unlockReplyAudio();
    const current = viewRef.current;
    if (current.terminal?.type !== "preview") return;
    const id = current.terminal.voice_turn_id;
    setView((prev) => ({ ...prev, terminal: null, closed_line: copy.nothing_changed, retry: null }));
    const result = await postCancel({ voice_turn_id: id });
    if (result.kind === "ok") {
      takeVoice(result.body.voice);
      setView((prev) => ({ ...prev, closed_line: result.body.reply.display_text || copy.nothing_changed }));
      speak(id, result.body.reply, result.body.voice);
    } else if (result.kind === "error") {
      takeVoice(voiceBlockOf(result.body));
    }
  };

  const editField = (action_index: number, field: string, value: string) => {
    setView((prev) => ({ ...prev, edits: { ...prev.edits, [editKey(action_index, field)]: value } }));
  };

  const pickOption = (value: string) => {
    unlockReplyAudio();
    const id = viewRef.current.voice_turn_id;
    if (!id) return;
    void runTurn({ kind: "option", value }, { context_turn_id: id });
  };

  const sendTyped = (text: string) => {
    unlockReplyAudio();
    const value = text.trim().slice(0, VOICE_TEXT_MAX);
    if (!value) return;
    void runTurn({ kind: "text", text: value });
  };

  const sendEditedHeard = () => {
    unlockReplyAudio();
    const value = heardDraft.trim().slice(0, VOICE_TEXT_MAX);
    const id = viewRef.current.heard?.voice_turn_id ?? viewRef.current.voice_turn_id;
    if (!value) return;
    void runTurn({ kind: "text", text: value }, { context_turn_id: id ?? null });
  };

  const closePanel = () => {
    if (micRef.current.kind !== "idle") cancelRecording(false);
    setPanelOpen(false);
    // The context turn ends when the panel closes (1.4).
    latestTurnRef.current = null;
  };

  // Focus moves to a new card when nothing else holds it.
  const cardKey = view.terminal ? `${view.terminal.type}:${view.terminal.voice_turn_id}` : null;
  useEffect(() => {
    if (!cardKey || !panelRef.current) return;
    const active = document.activeElement;
    if (active && active !== document.body && panelRef.current.contains(active) && active.tagName !== "BUTTON") return;
    if (active && active.tagName === "INPUT") return;
    const card = panelRef.current.querySelector<HTMLElement>("[data-voice-card]");
    card?.focus({ preventScroll: false });
  }, [cardKey]);

  // Escape closes the panel when not recording.
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && micRef.current.kind === "idle") setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const voiceOff = !voice.voice_available;
  const busy = flight !== null;
  const recording = mic.kind === "listening" || mic.kind === "starting";
  const locked = recording && mic.locked;
  const cantRecord = choice === null;
  const micDisabled = voiceOff || busy || !online;
  const micLabel = voiceOff ? copy.voice_off : busy ? copy.mic_busy : cantRecord ? copy.cant_record : recording ? (locked ? copy.stop_send : copy.listening) : copy.mic_label;

  // The voice-first landing card (Lane E) drives this same dock, so it stays the only recorder
  // (D20). Its tap toggles a locked recording, like Space or Enter on the mic; it hears our state.
  const dockState: VoiceDockState = voiceOff || !online ? "off" : busy ? "busy" : recording ? "listening" : "idle";
  const heardText = view.heard?.transcript ?? null;
  const broadcastRef = useRef<VoiceDockBroadcast>({ state: dockState, heard: heardText });
  const toggleRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    broadcastRef.current = { state: dockState, heard: heardText };
    window.dispatchEvent(new CustomEvent(VOICE_STATE_EVENT, { detail: broadcastRef.current }));
  }, [dockState, heardText]);
  useEffect(() => {
    toggleRef.current = () => {
      const m = micRef.current;
      if (m.kind === "idle") {
        unlockReplyAudio();
        beginRecording(true);
      } else if (m.kind === "listening" || m.kind === "starting") {
        unlockReplyAudio();
        void finishRecording();
      }
    };
  });
  useEffect(() => {
    const onToggle = () => toggleRef.current();
    const onType = () => {
      setPanelOpen(true);
      queueMicrotask(() => panelInputRef.current?.focus());
    };
    const onRequest = () => window.dispatchEvent(new CustomEvent(VOICE_STATE_EVENT, { detail: broadcastRef.current }));
    window.addEventListener(VOICE_TOGGLE_EVENT, onToggle);
    window.addEventListener(VOICE_TYPE_EVENT, onType);
    window.addEventListener(VOICE_STATE_REQUEST_EVENT, onRequest);
    return () => {
      window.removeEventListener(VOICE_TOGGLE_EVENT, onToggle);
      window.removeEventListener(VOICE_TYPE_EVENT, onType);
      window.removeEventListener(VOICE_STATE_REQUEST_EVENT, onRequest);
    };
  }, []);

  const statusText = voiceOff
    ? copy.voice_off
    : mic.kind === "asking" || mic.kind === "starting"
      ? copy.starting
      : listening
        ? `${copy.listening} ${formatTimer(elapsed)}`
        : busy
          ? copy.interpreting
          : (notice?.text ?? "");

  const headerControls = (
    <div className="flex min-w-0 items-center gap-2" data-voice-dock="">
      {!voiceOff ? (
        <form
          className="hidden min-w-0 items-center lg:flex"
          onSubmit={(e) => {
            e.preventDefault();
            sendTyped(typed);
          }}
        >
          <Input
            value={typed}
            onChange={(e) => setTyped(e.currentTarget.value)}
            placeholder={copy.type_placeholder}
            aria-label={copy.type_label}
            maxLength={VOICE_TEXT_MAX}
            disabled={busy}
            className="h-9 w-60 border-current/30 bg-transparent text-foreground placeholder:text-muted-foreground"
          />
        </form>
      ) : null}
      <ReasonChips flags={voice} ui_language={props.ui_language} drawer={props.drawer ?? null} />
      {props.fixture_mode && !voiceOff ? (
        // Fixture mode is labelled on the dock itself (voice.md 6.4, AT-2.10); the picker is in the panel.
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          aria-controls={panelId}
          title={copy.fixture_label}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-chip bg-due-tint px-2 text-due"
        >
          <FlaskIcon size={16} aria-hidden="true" />
          <span className="text-meta">{fixtureRow || copy.fixture_none}</span>
          <span className="sr-only">{copy.fixture_label}</span>
        </button>
      ) : null}
      {!voiceOff ? (
        <button
          type="button"
          onClick={() => {
            setPanelOpen(true);
            queueMicrotask(() => panelInputRef.current?.focus());
          }}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-accent lg:hidden"
          aria-label={copy.open_typing}
          aria-controls={panelId}
        >
          <KeyboardIcon size={24} aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        aria-label={micLabel}
        title={micLabel}
        aria-controls={panelId}
        aria-pressed={recording}
        aria-describedby={statusId}
        disabled={micDisabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onMicKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "inline-flex h-11 min-w-11 shrink-0 touch-none items-center justify-center gap-2 rounded-full px-3 text-paper ring-1 ring-gold/60 transition-[transform,background-color] duration-100 select-none",
          voiceOff ? "bg-maroon/50 opacity-60" : recording ? "bg-maroon-deep motion-safe:scale-106" : "bg-maroon hover:bg-maroon/90",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        {voiceOff ? (
          <MicrophoneSlashIcon size={24} aria-hidden="true" />
        ) : busy ? (
          <span className="size-6 animate-pulse rounded-full bg-paper/40" aria-hidden="true" />
        ) : recording ? (
          <>
            {locked ? <StopIcon size={24} weight="fill" aria-hidden="true" /> : <MicrophoneIcon size={24} weight="fill" aria-hidden="true" />}
            <span className={`text-meta tabular-nums ${elapsed >= AMBER_MS ? "text-due-tint" : ""}`}>{formatTimer(elapsed)}</span>
          </>
        ) : (
          <MicrophoneIcon size={24} aria-hidden="true" />
        )}
      </button>
      <span id={statusId} className="sr-only" aria-live="polite">
        {statusText}
      </span>
    </div>
  );

  const terminal = view.terminal;
  // Clarify and refused blocks, and a closed card, already show the reply's words.
  const replyShowsText = !(terminal?.type === "clarify" || terminal?.type === "refused" || (view.closed_line !== null && view.receipt === null));
  const panel =
    isClient && panelOpen
      ? createPortal(
          <div
            id={panelId}
            ref={panelRef}
            role="region"
            aria-label={copy.panel_title}
            className={cn(
              "fixed inset-x-0 bottom-0 z-40 flex h-[60dvh] flex-col rounded-t-sheet border-t border-line bg-ivory-deep text-ink shadow-sheet",
              "lg:inset-x-auto lg:top-16 lg:right-0 lg:h-auto lg:w-dock lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-overlay",
              "motion-safe:animate-in motion-safe:slide-in-from-bottom-10 motion-safe:duration-280 lg:motion-safe:slide-in-from-right-10 lg:motion-safe:slide-in-from-bottom-0",
            )}
          >
            <div className="flex items-center gap-2 border-b border-line px-4 py-2">
              <p className="text-heading">{copy.panel_title}</p>
              {props.fixture_mode ? (
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-chip bg-due-tint px-2 py-0.5 text-meta text-due">
                    <FlaskIcon size={16} aria-hidden="true" />
                    {copy.fixture_label}
                  </span>
                  <label className="sr-only" htmlFor={`${panelId}-row`}>
                    {copy.fixture_pick}
                  </label>
                  <select
                    id={`${panelId}-row`}
                    value={fixtureRow}
                    onChange={(e) => fixtureRowSetting.set(e.currentTarget.value)}
                    className="h-8 min-w-0 rounded-control border border-line-strong bg-paper px-2 text-meta text-ink"
                  >
                    <option value="">{copy.fixture_none}</option>
                    {props.fixture_rows.map((row) => (
                      <option key={row} value={row}>
                        {row}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="ml-auto flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" aria-label={copy.speech_setting}>
                      <TranslateIcon size={20} aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel>{copy.speech_setting}</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={speechLanguage}
                      onValueChange={(value) => speechLanguageSetting.set(value === "en-IN" ? "en-IN" : "hi-IN")}
                    >
                      <DropdownMenuRadioItem value="hi-IN">{copy.speech_hi}</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="en-IN">{copy.speech_en}</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button type="button" variant="ghost" size="icon" onClick={closePanel} aria-label={copy.close_panel}>
                  <XIcon size={20} aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
              {voiceOff ? <p className="text-body text-ink-2">{copy.voice_off}</p> : null}

              {recording ? (
                <div className="flex flex-col gap-2 rounded-sheet bg-paper p-3">
                  <p className={`text-heading tabular-nums ${elapsed >= AMBER_MS ? "text-due" : "text-ink"}`}>
                    {mic.kind === "listening" ? `${copy.listening} ${formatTimer(elapsed)}` : copy.starting}
                  </p>
                  <span className="block h-2 overflow-hidden rounded-full bg-ivory" aria-hidden="true">
                    <span ref={meterRef} className="block h-full origin-left rounded-full bg-maroon" style={{ transform: "scaleX(0.04)" }} />
                  </span>
                  {locked ? (
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" size="lg" onClick={() => cancelRecording()}>
                        <XIcon size={16} aria-hidden="true" />
                        {copy.cancel}
                      </Button>
                      <Button
                        type="button"
                        size="lg"
                        onClick={() => {
                          unlockReplyAudio();
                          void finishRecording();
                        }}
                      >
                        <StopIcon size={16} weight="fill" aria-hidden="true" />
                        {copy.stop_send}
                      </Button>
                    </div>
                  ) : (
                    <p className="flex justify-between text-meta text-ink-3">
                      <span>← {copy.slide_cancel}</span>
                      <span className="inline-flex items-center gap-1">
                        <LockSimpleIcon size={16} aria-hidden="true" />
                        {copy.lock_hint}
                      </span>
                    </p>
                  )}
                </div>
              ) : null}

              {clipNote && !recording ? <p className="text-meta text-due">{clipNote}</p> : null}

              {view.heard ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-meta text-ink-3">
                    <span>{copy.you_said}</span>
                    <span className="rounded-chip border border-line px-1.5 text-ink-2">{copy.register[view.heard.chip]}</span>
                    {!editingHeard ? (
                      <button
                        type="button"
                        className="ml-auto inline-flex items-center gap-1 rounded-control px-2 py-1 text-ink-2 hover:bg-paper"
                        onClick={() => {
                          setHeardDraft(view.heard?.transcript ?? "");
                          setEditingHeard(true);
                        }}
                        disabled={busy}
                      >
                        <PencilSimpleIcon size={16} aria-hidden="true" />
                        {copy.edit_heard}
                      </button>
                    ) : null}
                  </div>
                  {editingHeard ? (
                    <form
                      className="flex flex-col gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        sendEditedHeard();
                      }}
                    >
                      <Textarea
                        autoFocus
                        value={heardDraft}
                        maxLength={VOICE_TEXT_MAX}
                        onChange={(e) => setHeardDraft(e.currentTarget.value)}
                        aria-label={copy.edit_heard}
                        className="bg-paper"
                      />
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => setEditingHeard(false)}>
                          {copy.cancel}
                        </Button>
                        <Button type="submit" disabled={busy || heardDraft.trim().length === 0}>
                          {copy.send}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <p className="text-body text-ink motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">“{view.heard.transcript}”</p>
                  )}
                </div>
              ) : null}

              {busy && flight?.skeleton && !(terminal && isOpenPreview(view)) ? (
                <div className="flex flex-col gap-2 rounded-sheet bg-paper p-4" aria-hidden="true">
                  <Skeleton className="h-5 w-2/3 bg-ivory" />
                  <Skeleton className="h-4 w-full bg-ivory" />
                  <Skeleton className="h-4 w-5/6 bg-ivory" />
                </div>
              ) : null}
              {busy && flight?.slow ? <p className="text-meta text-ink-3">{copy.still_working}</p> : null}

              {view.receipt ? <VoiceReceipt receipt={view.receipt} /> : null}

              {terminal?.type === "preview" && !view.receipt && !view.closed_line ? (
                <ReviewCard
                  preview={terminal as PreviewEvent}
                  phase={view.card_phase}
                  notice={view.card_notice}
                  edits={view.edits}
                  copy={copy}
                  onEdit={editField}
                  onConfirm={() => void confirmCard()}
                  onCancel={() => void cancelCard()}
                />
              ) : null}

              {terminal?.type === "answer" ? <AnswerCards cards={terminal.cards} copy={copy} /> : null}

              {terminal?.type === "clarify" ? (
                <div className="flex flex-col gap-2 rounded-sheet border border-line bg-paper p-4 focus:outline-none" data-voice-card="clarify" tabIndex={-1}>
                  <p className="text-body text-ink">{terminal.question.display_text}</p>
                  {terminal.options && terminal.options.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {terminal.options.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          variant={option.default ? "default" : "outline"}
                          size="lg"
                          disabled={busy}
                          onClick={() => pickOption(option.value)}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  {terminal.cards && terminal.cards.length > 0 ? <AnswerCards cards={terminal.cards} copy={copy} /> : null}
                </div>
              ) : null}

              {terminal?.type === "refused" ? (
                <div className="flex flex-col gap-2 rounded-sheet border border-line bg-paper p-4 focus:outline-none" data-voice-card="refused" tabIndex={-1}>
                  <p className="flex items-start gap-2 text-body text-ink">
                    <WarningCircleIcon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-due" />
                    <span>{terminal.reply.display_text}</span>
                  </p>
                  {view.form_opened ? <p className="text-meta text-ink-3">{copy.form_opened}</p> : null}
                  {terminal.cards.length > 0 ? <AnswerCards cards={terminal.cards} copy={copy} /> : null}
                </div>
              ) : null}

              {view.closed_line ? (
                <div className="flex flex-col gap-1 rounded-sheet border border-line bg-paper p-3 focus:outline-none" data-voice-card="closed" tabIndex={-1}>
                  <p className="text-meta text-ink-2">{view.closed_line}</p>
                  {view.form_opened ? <p className="text-meta text-ink-3">{copy.form_opened}</p> : null}
                </div>
              ) : null}

              {reply && (replyShowsText || reply.state !== "silent") ? (
                <ReplyCaption
                  reply={reply}
                  copy={copy}
                  showText={replyShowsText}
                  onStop={stopSpeaking}
                  onPlay={() => playbackRef.current?.resume()}
                />
              ) : null}

              {notice && !recording && !busy ? (
                <div className={`flex items-start gap-2 text-meta ${notice.tone === "error" ? "text-overdue" : "text-ink-2"}`} role={notice.tone === "error" ? "alert" : "status"}>
                  {notice.tone === "error" ? <WarningCircleIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" /> : null}
                  <span className="flex-1">{notice.text}</span>
                  {notice.retry && view.retry ? (
                    <Button type="button" variant="outline" size="sm" onClick={retry}>
                      <ArrowClockwiseIcon size={16} aria-hidden="true" />
                      {copy.retry}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {busy ? <p className="text-meta text-ink-3">{copy.interpreting}</p> : null}
            </div>

            {!voiceOff ? (
              <form
                className="flex items-center gap-2 border-t border-line px-4 py-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendTyped(typed);
                }}
              >
                <Input
                  ref={panelInputRef}
                  value={typed}
                  onChange={(e) => setTyped(e.currentTarget.value)}
                  placeholder={copy.type_placeholder}
                  aria-label={copy.type_label}
                  maxLength={VOICE_TEXT_MAX}
                  disabled={busy}
                  className="h-10 bg-paper"
                />
                <Button type="submit" size="icon-lg" disabled={busy || typed.trim().length === 0} aria-label={copy.send}>
                  <PaperPlaneRightIcon size={20} aria-hidden="true" />
                </Button>
              </form>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {headerControls}
      {panel}
    </>
  );
}

function AnswerCards({ cards, copy }: { cards: VoiceAnswerCard[]; copy: DockCopy }) {
  if (cards.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 focus:outline-none" data-voice-card="answer" tabIndex={-1}>
      {cards.map((card, i) => (
        <div key={`${card.title}-${i}`} className="flex flex-col gap-1 rounded-sheet border border-line bg-paper p-3">
          <p className="text-meta text-ink-2">{card.title}</p>
          <p className="text-panel text-ink tabular-nums">{card.figure}</p>
          {card.link ? (
            <Link href={card.link} prefetch={false} className="text-meta text-maroon underline underline-offset-4">
              {copy.open_link}
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ReplyCaption({
  reply,
  copy,
  showText,
  onStop,
  onPlay,
}: {
  reply: NonNullable<ReplyView>;
  copy: DockCopy;
  showText: boolean;
  onStop: () => void;
  onPlay: () => void;
}) {
  return (
    <div className={cn("flex items-start gap-2", showText && "rounded-sheet bg-paper p-3")}>
      {reply.state !== "silent" ? <SpeakerHighIcon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-maroon" /> : null}
      <p className="flex-1 text-body text-ink">{showText ? reply.text : null}</p>
      {reply.state === "playing" || reply.state === "loading" ? (
        <Button type="button" variant="ghost" size="sm" onClick={onStop}>
          <StopIcon size={16} aria-hidden="true" />
          {copy.stop_reply}
        </Button>
      ) : null}
      {reply.state === "blocked" ? (
        <Button type="button" variant="outline" size="sm" onClick={onPlay}>
          <SpeakerHighIcon size={16} aria-hidden="true" />
          {copy.play_reply}
        </Button>
      ) : null}
      {reply.state === "unavailable" ? <span className="text-meta text-ink-3">{copy.audio_unavailable}</span> : null}
    </div>
  );
}
