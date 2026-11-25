import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { baseMime, callModel, cleanKeyterms, clipFilename, isEmptySpeech, synthesizeStream, transcribe, type SarvamDeps } from "./sarvam";

const TEST_KEY = "test-key-not-real";
let savedKey: string | undefined;

beforeEach(() => {
  savedKey = process.env.SARVAM_API_KEY;
  process.env.SARVAM_API_KEY = TEST_KEY;
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.SARVAM_API_KEY;
  else process.env.SARVAM_API_KEY = savedKey;
});

const M03_ARGS = {
  intent: "act",
  reply_language: "hinglish",
  missing_fields: [],
  reply: "",
  actions: [{ kind: "correct_payment", vendor_id: "VEN-CAT", payment_kind: "advance", amount_inr: 40000, heard: [{ field: "amount_inr", phrase: "चालीस हज़ार" }] }],
};

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function chatOk(args: unknown, extra: { finish_reason?: string; reasoning_tokens?: number } = {}): Response {
  return json(200, {
    id: "req-chat-1",
    choices: [
      {
        finish_reason: extra.finish_reason ?? "tool_calls",
        message: { content: null, tool_calls: [{ function: { name: "propose_actions", arguments: typeof args === "string" ? args : JSON.stringify(args) } }] },
      },
    ],
    usage: { completion_tokens_details: { reasoning_tokens: extra.reasoning_tokens ?? 0 } },
  });
}

/** A fetch mock that answers in order and records each request. */
function mockFetch(responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
  const deps: Partial<SarvamDeps> = { fetch: fetchMock as unknown as typeof fetch, sleep: async () => {} };
  return { calls, deps, fetchMock };
}

const bodyOf = (init: RequestInit) => JSON.parse(String(init.body)) as Record<string, unknown>;

describe("callModel", () => {
  const messages = [
    { role: "system" as const, content: "rules" },
    { role: "user" as const, content: "Caterer को चालीस हज़ार advance दिया था" },
  ];

  it("sends sarvam-105b with reasoning off and one forced tool, and reads the tool call", async () => {
    const { calls, deps } = mockFetch([chatOk(M03_ARGS)]);
    const result = await callModel({ messages, route_started_ms: Date.now() }, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attempts).toBe(1);
    expect(result.reasoning_tokens).toBe(0);
    expect(result.request_ids).toEqual(["req-chat-1"]);
    expect(result.args.actions[0].amount_inr).toBe(40000);
    expect(calls[0].url).toBe("https://api.sarvam.ai/v1/chat/completions");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["api-subscription-key"]).toBe(TEST_KEY);
    const body = bodyOf(calls[0].init);
    expect(body.model).toBe("sarvam-105b");
    expect(body.reasoning_effort).toBeNull();
    expect("reasoning_effort" in body).toBe(true);
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(1200);
    expect(body.tool_choice).toEqual({ type: "function", function: { name: "propose_actions" } });
    expect((body.tools as unknown[]).length).toBe(1);
  });

  it("retries a transport failure once with the same request", async () => {
    const { calls, deps } = mockFetch([json(503, { error: { code: "model_overloaded", message: "busy" } }, { "retry-after": "1" }), chatOk(M03_ARGS)]);
    const result = await callModel({ messages, route_started_ms: Date.now() }, deps);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(bodyOf(calls[1].init)).toEqual(bodyOf(calls[0].init));
  });

  it("retries a network error once", async () => {
    const { calls, deps } = mockFetch([new TypeError("fetch failed"), chatOk(M03_ARGS)]);
    const result = await callModel({ messages, route_started_ms: Date.now() }, deps);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("retries a parse failure with reasoning_effort low and max_tokens 3000", async () => {
    const { calls, deps } = mockFetch([chatOk("{not json"), chatOk(M03_ARGS)]);
    const result = await callModel({ messages, route_started_ms: Date.now() }, deps);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    const retry = bodyOf(calls[1].init);
    expect(retry.reasoning_effort).toBe("low");
    expect(retry.max_tokens).toBe(3000);
  });

  it("retries a schema break and a length cut the same way, then gives llm_no_action", async () => {
    const bad = { ...M03_ARGS, actions: [{ kind: "void_payment" }] };
    const { calls, deps } = mockFetch([chatOk(bad), chatOk(M03_ARGS, { finish_reason: "length" })]);
    const result = await callModel({ messages, route_started_ms: Date.now() }, deps);
    expect(result).toMatchObject({ ok: false, code: "llm_no_action", retryable: false, attempts: 2 });
    expect(bodyOf(calls[1].init).reasoning_effort).toBe("low");
  });

  it("treats a missing tool call as no action", async () => {
    const { deps } = mockFetch([
      json(200, { choices: [{ finish_reason: "stop", message: { content: "hello" } }] }),
      json(200, { choices: [{ finish_reason: "stop", message: { content: "hello" } }] }),
    ]);
    const result = await callModel({ messages, route_started_ms: Date.now() }, deps);
    expect(result).toMatchObject({ ok: false, code: "llm_no_action" });
  });

  it.each([400, 401, 402, 403, 422])("never retries %i", async (status) => {
    const { calls, deps } = mockFetch([json(status, { error: { code: "x", message: "no" } }), chatOk(M03_ARGS)]);
    const result = await callModel({ messages, route_started_ms: Date.now() }, deps);
    expect(result).toMatchObject({ ok: false, code: "llm_unavailable", attempts: 1 });
    expect(calls).toHaveLength(1);
  });

  it("never retries seat_budget_exhausted_error", async () => {
    const { calls, deps } = mockFetch([json(429, { error: { code: "seat_budget_exhausted_error", message: "budget" } }), chatOk(M03_ARGS)]);
    const result = await callModel({ messages, route_started_ms: Date.now() }, deps);
    expect(result).toMatchObject({ ok: false, code: "llm_unavailable", attempts: 1 });
    expect(calls).toHaveLength(1);
  });

  it("gives llm_unavailable after two transport failures", async () => {
    const { calls, deps } = mockFetch([json(500, {}), json(502, {})]);
    const result = await callModel({ messages, route_started_ms: Date.now() }, deps);
    expect(result).toMatchObject({ ok: false, code: "llm_unavailable", retryable: true, attempts: 2 });
    expect(calls).toHaveLength(2);
  });

  it("starts no attempt after 30 s of route time", async () => {
    const { calls, deps } = mockFetch([chatOk(M03_ARGS)]);
    const result = await callModel({ messages, route_started_ms: Date.now() - 31_000 }, deps);
    expect(result).toMatchObject({ ok: false, code: "llm_unavailable", attempts: 0 });
    expect(calls).toHaveLength(0);
  });

  it("sends the json_schema variant without tools", async () => {
    const content = JSON.stringify(M03_ARGS);
    const { calls, deps } = mockFetch([json(200, { choices: [{ finish_reason: "stop", message: { content } }] })]);
    const result = await callModel({ messages, route_started_ms: Date.now(), variant: "json_schema" }, deps);
    expect(result.ok).toBe(true);
    const body = bodyOf(calls[0].init);
    expect(body.tools).toBeUndefined();
    expect((body.response_format as { type: string }).type).toBe("json_schema");
  });

  it("refuses without a key and calls nothing", async () => {
    delete process.env.SARVAM_API_KEY;
    const { calls, deps } = mockFetch([chatOk(M03_ARGS)]);
    const result = await callModel({ messages, route_started_ms: Date.now() }, deps);
    expect(result).toMatchObject({ ok: false, code: "llm_unavailable" });
    expect(calls).toHaveLength(0);
  });
});

describe("transcribe", () => {
  const audio = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm;codecs=opus" });
  const input = (overrides: Partial<Parameters<typeof transcribe>[0]> = {}) => ({
    audio: audio(),
    filename: "clip.webm",
    mime: "audio/webm;codecs=opus",
    speech_language: "hi-IN" as const,
    keyterms: ["Mehendi", "mehendi", "Annapoorna Caterers", "x".repeat(65)],
    route_started_ms: Date.now(),
    ...overrides,
  });

  it("sends saaras:v4, codemix, the hint, the base type and keyterms as one JSON field", async () => {
    const { calls, deps } = mockFetch([json(200, { request_id: "stt-1", transcript: "Caterer को चालीस हज़ार advance दिया था", language_code: "hi-IN" })]);
    const result = await transcribe(input(), deps);
    expect(result).toMatchObject({ ok: true, transcript: "Caterer को चालीस हज़ार advance दिया था", request_id: "stt-1", attempts: 1 });
    expect(calls[0].url).toBe("https://api.sarvam.ai/speech-to-text");
    const form = calls[0].init.body as FormData;
    expect(form.get("model")).toBe("saaras:v4");
    expect(form.get("mode")).toBe("codemix");
    expect(form.get("language_code")).toBe("hi-IN");
    expect(JSON.parse(String(form.get("keyterms")))).toEqual(["Mehendi", "Annapoorna Caterers"]);
    const file = form.get("file") as File;
    expect(file.type).toBe("audio/webm");
    expect(file.name).toBe("clip.webm");
  });

  it("maps an empty or punctuation-only transcript to no_speech", async () => {
    const { deps } = mockFetch([json(200, { request_id: "stt-2", transcript: " । ", language_code: "hi-IN" })]);
    expect(await transcribe(input(), deps)).toMatchObject({ ok: false, code: "no_speech", retryable: false });
  });

  it("maps 400 'Failed to read the file' and 'Invalid file type' to audio_unreadable without a retry", async () => {
    for (const message of ["Failed to read the file, please check the audio format", "Invalid file type: audio/x-foo"]) {
      const { calls, deps } = mockFetch([json(400, { error: { code: "invalid_request_error", message } }), json(200, { transcript: "x" })]);
      expect(await transcribe(input(), deps)).toMatchObject({ ok: false, code: "audio_unreadable", http_status: 400 });
      expect(calls).toHaveLength(1);
    }
  });

  it("refuses a 0-byte clip without calling Saaras", async () => {
    const { calls, deps } = mockFetch([]);
    expect(await transcribe(input({ audio: new Blob([]) }), deps)).toMatchObject({ ok: false, code: "audio_unreadable", attempts: 0 });
    expect(calls).toHaveLength(0);
  });

  it("retries 503 once, then gives stt_unavailable", async () => {
    const { calls, deps } = mockFetch([json(503, {}), json(500, {})]);
    expect(await transcribe(input(), deps)).toMatchObject({ ok: false, code: "stt_unavailable", http_status: 500, attempts: 2, retryable: true });
    expect(calls).toHaveLength(2);
  });

  it("retries a 429 and succeeds", async () => {
    const { calls, deps } = mockFetch([json(429, { error: { code: "rate_limit_exceeded_error" } }), json(200, { transcript: "haan" })]);
    expect(await transcribe(input(), deps)).toMatchObject({ ok: true, transcript: "haan", attempts: 2 });
    expect(calls).toHaveLength(2);
  });

  it("does not retry 403 or after 15 s of route time", async () => {
    const first = mockFetch([json(403, { error: { code: "invalid_api_key_error" } }), json(200, { transcript: "x" })]);
    expect(await transcribe(input(), first.deps)).toMatchObject({ ok: false, code: "stt_unavailable", http_status: 403 });
    expect(first.calls).toHaveLength(1);
    const late = mockFetch([json(503, {}), json(200, { transcript: "x" })]);
    expect(await transcribe(input({ route_started_ms: Date.now() - 16_000 }), late.deps)).toMatchObject({ ok: false, code: "stt_unavailable" });
    expect(late.calls).toHaveLength(1);
  });
});

describe("synthesizeStream", () => {
  const input = { text: "एक लाख पचास हज़ार रुपये बाकी हैं।", language_code: "hi-IN" as const, speaker: "simran_enhi_customer" };

  it("always sends bulbul:v4-flash and language_code, and passes audio/mpeg through", async () => {
    const { calls, deps } = mockFetch([new Response(new Uint8Array([0xff, 0xfb]), { status: 200, headers: { "content-type": "audio/mpeg" } })]);
    const result = await synthesizeStream(input, deps);
    expect(result.ok).toBe(true);
    const body = bodyOf(calls[0].init);
    expect(calls[0].url).toBe("https://api.sarvam.ai/text-to-speech/stream");
    expect(body).toMatchObject({
      model: "bulbul:v4-flash",
      language_code: "hi-IN",
      speaker: "simran_enhi_customer",
      enable_preprocessing: true,
      output_audio_codec: "mp3",
    });
  });

  it("refuses a JSON error body, even with status 200", async () => {
    const { deps } = mockFetch([json(200, { error: { code: "invalid_request_error", message: "speaker" } })]);
    const result = await synthesizeStream(input, deps);
    expect(result.ok).toBe(false);
  });

  it("refuses an error status without retrying", async () => {
    const { calls, deps } = mockFetch([json(400, { error: { code: "invalid_request_error", message: "bad speaker" } }), json(200, {})]);
    const result = await synthesizeStream(input, deps);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(calls).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("strips codecs and names clips per 1.3", () => {
    expect(baseMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(clipFilename("audio/mp4")).toBe("clip.m4a");
    expect(clipFilename("audio/ogg;codecs=opus")).toBe("clip.ogg");
    expect(clipFilename("audio/wav")).toBe("clip.wav");
  });

  it("dedupes keyterms ignoring case, drops long ones and stops at 50", () => {
    const terms = Array.from({ length: 80 }, (_, index) => `Term ${index}`);
    const cleaned = cleanKeyterms(["Haldi", "HALDI", "x".repeat(65), ...terms]);
    expect(cleaned.length).toBe(50);
    expect(cleaned[0]).toBe("Haldi");
    expect(cleaned.every((term) => term.length <= 64)).toBe(true);
  });

  it("knows empty speech", () => {
    expect(isEmptySpeech("")).toBe(true);
    expect(isEmptySpeech("hmm, ok।")).toBe(true);
    expect(isEmptySpeech("अच्छा")).toBe(true);
    expect(isEmptySpeech("haan save karo")).toBe(false);
  });
});
