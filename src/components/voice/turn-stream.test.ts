import { describe, expect, it } from "vitest";

import type { VoiceStreamEvent } from "@/contracts/api";

import { buildTurnForm, createNdjsonParser, isVoiceErrorBody, readTurnStream, voiceBlockOf } from "./turn-stream";

const voice = { voice_available: true, writes_enabled: true, spoken_replies: true, chip: null, fallback: false };

function lines(...events: object[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

describe("createNdjsonParser (voice.md 1.5)", () => {
  it("splits complete lines across chunk boundaries", () => {
    const got: VoiceStreamEvent[] = [];
    const parser = createNdjsonParser((e) => got.push(e));
    const text = lines(
      { type: "heard", voice_turn_id: "t1", transcript: "Caterer को चालीस हज़ार", language_code: "hi-IN", chip: "hinglish", input_mode: "speech", voice },
      { type: "done", voice_turn_id: "t1", timings_ms: { stt: 1 }, voice },
    );
    const cut = 17;
    parser.push(text.slice(0, cut));
    expect(got).toHaveLength(0);
    parser.push(text.slice(cut));
    parser.end();
    expect(got.map((e) => e.type)).toEqual(["heard", "done"]);
    expect(got[0]?.type === "heard" && got[0].transcript).toBe("Caterer को चालीस हज़ार");
  });

  it("flushes a last line with no newline and skips blank and bad lines", () => {
    const got: VoiceStreamEvent[] = [];
    const bad: string[] = [];
    const parser = createNdjsonParser(
      (e) => got.push(e),
      (l) => bad.push(l),
    );
    parser.push("\n\n{not json}\n");
    parser.push(JSON.stringify({ type: "mystery", voice_turn_id: "t" }) + "\n");
    parser.push(JSON.stringify({ type: "done", voice_turn_id: "t2", timings_ms: {}, voice }));
    parser.end();
    expect(got.map((e) => e.voice_turn_id)).toEqual(["t2"]);
    expect(bad).toHaveLength(2);
  });

  it("reads a byte stream with a multi-byte character split across chunks", async () => {
    const text = lines({ type: "cancelled", voice_turn_id: "t3", reply: { display_text: "ठीक है, कुछ नहीं बदला।", language: "hi", speak: true, parts: 1 } });
    const bytes = new TextEncoder().encode(text);
    const split = 40; // inside a Devanagari character
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, split));
        controller.enqueue(bytes.slice(split));
        controller.close();
      },
    });
    const got: VoiceStreamEvent[] = [];
    await readTurnStream(body, (e) => got.push(e));
    expect(got).toHaveLength(1);
    expect(got[0]?.type === "cancelled" && got[0].reply.display_text).toBe("ठीक है, कुछ नहीं बदला।");
  });
});

describe("error bodies", () => {
  it("recognises VoiceErrorBody and reads its voice block", () => {
    const body = { ok: false, error: { code: "voice_unavailable", message: "Voice is off" }, voice: { ...voice, voice_available: false } };
    expect(isVoiceErrorBody(body)).toBe(true);
    expect(voiceBlockOf(body)?.voice_available).toBe(false);
    expect(isVoiceErrorBody({ ok: true })).toBe(false);
    expect(isVoiceErrorBody({ ok: false, error: "x" })).toBe(false);
    expect(voiceBlockOf({ ok: false })).toBeNull();
  });
});

describe("buildTurnForm (voice.md 1.4)", () => {
  it("sends audio with the base part type, file name and duration", () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm;codecs=opus" });
    const form = buildTurnForm({
      input: { kind: "audio", blob, file_name: "clip.webm", upload_type: "audio/webm", duration_ms: 1234.4 },
      wedding_id: "w1",
      client_turn_id: "c1",
      ui_language: "en",
      speech_language: "hi-IN",
      context_turn_id: null,
      page: "/w/w1/money",
      setup_opened_at: null,
      fixture_id: "M-03",
    });
    const audio = form.get("audio") as File;
    expect(audio.type).toBe("audio/webm");
    expect(audio.name).toBe("clip.webm");
    expect(form.get("duration_ms")).toBe("1234");
    expect(form.get("wedding_id")).toBe("w1");
    expect(form.get("fixture_id")).toBe("M-03");
    expect(form.get("page")).toBe("/w/w1/money");
    expect(form.has("context_turn_id")).toBe(false);
    expect(form.has("text")).toBe(false);
  });

  it("sends text or an option, with an empty wedding_id on setup", () => {
    const text = buildTurnForm({
      input: { kind: "text", text: "Sangeet ka venue kya hai?" },
      wedding_id: null,
      client_turn_id: "c2",
      ui_language: "hi",
      speech_language: "en-IN",
      context_turn_id: "t0",
      page: null,
      setup_opened_at: "2026-11-25T14:00:00+05:30",
      fixture_id: null,
    });
    expect(text.get("text")).toBe("Sangeet ka venue kya hai?");
    expect(text.get("wedding_id")).toBe("");
    expect(text.get("context_turn_id")).toBe("t0");
    expect(text.get("setup_opened_at")).toBe("2026-11-25T14:00:00+05:30");
    expect(text.has("audio")).toBe(false);

    const option = buildTurnForm({
      input: { kind: "option", value: "o2" },
      wedding_id: "w1",
      client_turn_id: "c3",
      ui_language: "en",
      speech_language: "hi-IN",
      context_turn_id: "t1",
      page: null,
      setup_opened_at: null,
      fixture_id: null,
    });
    expect(option.get("option")).toBe("o2");
    expect(option.get("speech_language")).toBe("hi-IN");
  });
});
