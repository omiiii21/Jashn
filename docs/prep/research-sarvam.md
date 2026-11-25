# Sarvam AI: verified reference for the build

Prepared 25 Nov 2026, about 02:20 IST, for the coding session that starts at 9:00. It checks `docs/prep/raw/research-sarvam.json` against primary sources and gives the request shapes to build from.

How this was checked: the REST spec, the WebSocket spec, the docs pages (as `.md`), the `sarvamai` npm type definitions and source for 1.1.22 and 1.1.23-alpha.2 on unpkg, the npm and PyPI registries, a live probe of the docs MCP server, and the hackathon resources page. No API key was used, and nothing that needs a key was called. Everything below is therefore documented behaviour, not observed behaviour, until the 9:00 tests in §7 run.

Source shorthand used below:
- `spec` = https://docs.sarvam.ai/openapi/apis.json (OpenAPI 3.1, server `https://api.sarvam.ai`)
- `async` = https://docs.sarvam.ai/asyncapi.json
- `docs:/x/y` = https://docs.sarvam.ai/x/y (append `.md` to read it as Markdown)
- `npm` = https://registry.npmjs.org/sarvamai; `unpkg` = https://unpkg.com/sarvamai@1.1.22/dist/cjs/...
- `pypi` = https://pypi.org/pypi/sarvamai/json; `mcp` = live calls to https://docs.sarvam.ai/_mcp/server

---

## 1. Verdict

The research holds up. Of 55 items checked, a primary source confirms 47, 2 are wrong, and 6 can't be settled without a key (§7 tests all 6). Build the plan as written, with these changes, ordered by how much time each would cost at 9:00:

1. **The way to turn reasoning off depends on the endpoint.** On `POST /v1/chat/completions`, send `"reasoning_effort": null`, which is how the spec documents it. On `/v2`, send `"reasoning_effort": "none"`. Sarvam's Pipecat guide measured that value cutting time to first spoken token from 8.9 s to 0.3 s, with 0 reasoning tokens, and says `/v1` rejects `"none"`. Nothing documents what `null` does on `/v2`. Keep `sarvam-105b` on `/v1` with `null`. If anyone moves to the OpenAI SDK on `/v2`, they must change the value to `"none"`. When asked about exactly this, the docs MCP gave a self-contradictory answer, so check the page it cites before acting on what it says.
2. **Document AI differs from the other APIs in four ways.** Submitting a job returns **201 Created** with `{job_id, status: "pending", run_id}`. A bad key returns **401**; every other API returns 403. Asking for results before the job finishes returns **409**. `/results` responses are gzip-compressed, so use `curl --compressed`.
3. **Don't choose the TTS voice from the `language_code` that STT returns.** When the request sends `language_code=hi-IN`, language detection is skipped, so the response can't tell English from Hinglish. Choose the voice from the UI language toggle or from the script of the reply (§3.3).
4. **Always send the language explicitly.** For TTS `language_code`, one docs page says it is required, another says it is optional with an `en-IN` default, and the spec says only `text` is required. For Extract `language`, the guide says the default is `indic`, but the spec's `default` field says `en-IN`.
5. **Schemas.** In a Document AI schema, every field needs a `type`, objects need `properties`, arrays need `items`, and nesting may go at most 4 levels deep. Give every field a non-empty `description`, because the SDK 1.1.22 docstring says it is required. In the LLM tool, avoid `type: ["string","null"]` and open-ended `fields: {type: "object"}`: the docs don't say how constrained decoding treats them. Use explicit optional properties instead (§3.2).
6. **On the Starter (pay-as-you-go) plan, `max_tokens` is capped at 4,096.** Several docs examples send 6,000.
7. **Rate limits:** the pricing page says limits apply per account and all keys share them; the Token Factory page says "per API key". Assume they are shared.

None of these blocks the plan. The remaining risks are all runtime behaviour: latency (Sarvam publishes no figures), decoding of 48 kHz WebM/Opus, Safari's MP4 recordings, forced tool calls with reasoning off, and Document AI accuracy on decorative cards. Each one has a test in §7, and the tests take about 15 minutes.

---

## 2. Verification table

The verdict counts are: critical_claims, 14 confirmed and 1 refuted; integration details, 33 confirmed, 1 refuted and 6 unverified. "Confirmed, caveat" counts as confirmed, because a primary source states the claim but something nearby needs care.

Short names in the Source column, all under `https://docs.sarvam.ai` (append `.md` for Markdown):
- STT: `faq` = /api/speech-to-text/faq; `rest-api` = /api/api-guides-tutorials/speech-to-text/rest-api; `select-output-mode` and `keyterms` = /api/api-guides-tutorials/speech-to-text/how-to/...; `saaras` = /api/api-guides-tutorials/models/saaras
- Chat: `chat-completions` (chat guide) = /api/token-factory/chat-completions; `models table` = /api/token-factory/models; `sarvam-105b page` = /api/token-factory/models/sarvam-105b; `thinking-level guide` = /api/token-factory/how-to/adjust-the-models-thinking-level; `pipecat guide` = /api/integration/pipecat-production-guide
- TTS: `voices` and `best-practices` = /api/api-guides-tutorials/text-to-speech/...; `set-the-language` and `set-audio-format-for-output` = /api/api-guides-tutorials/text-to-speech/how-to/...; `http-stream` = /api/api-guides-tutorials/text-to-speech/streaming-api/http-stream
- Document AI: `how-to/extract` = /api/api-guides-tutorials/document-intelligence/how-to/extract; `job-lifecycle` and `languages-formats-limits` = /api/api-guides-tutorials/document-intelligence/...
- Account: `pricing` = /api/getting-started/pricing; `billing` = /api/platform/billing; `errors-troubleshooting` = /api/getting-started/errors-troubleshooting; `building-for-india` = /api/getting-started/building-for-india

### 2a. critical_claims

| # | Claim | Verdict | Correct fact / note | Source |
|---|---|---|---|---|
| C1 | STT accepts browser MediaRecorder output (WebM/Opus, OGG, MP4/M4A, WAV) as the multipart `file`, and the docs include an official browser recipe | Confirmed | The `file` description lists WAV, MP3, AAC, AIFF, OGG, OPUS, FLAC, MP4/M4A, AMR, WMA, WebM and PCM. The FAQ has a MediaRecorder recipe for `audio/webm;codecs=opus`. The docs never mention Safari or 48 kHz audio (see B5 and B6). A file part with the wrong content type returns 400 "Invalid file type". | spec `POST /speech-to-text`; docs:/api/speech-to-text/faq; docs:/api/api-guides-tutorials/speech-to-text/rest-api |
| C2 | `mode=codemix` with `hi-IN` keeps English words in Latin and Hindi in Devanagari, with numbers as digits | Confirmed, caveat | Documented output: `मेरा phone number है 9840950950`. But the docs' own live sample returned `मुझे flight बुक करनी है।`, with "book" in Devanagari. Expect mixed script for loanwords. | docs:/api/api-guides-tutorials/speech-to-text/how-to/select-output-mode; docs:/api/getting-started/building-for-india |
| C3 | REST STT accepts at most 30 s of audio; longer clips return 400 | Confirmed | `400 invalid_request_error` "Audio duration exceeds the maximum limit of 30 seconds". No byte limit is documented. | docs:/api/api-guides-tutorials/speech-to-text/rest-api |
| C4 | `sarvam-105b` supports `tools` with a forced, named `tool_choice`, and the arguments come back as a JSON string constrained to the schema | Confirmed | `tool_choice` accepts `none`, `auto`, `required` or `{type:"function", function:{name}}`. Forcing one tool constrains its arguments to that tool's schema. On v2, naming a function that isn't in `tools` returns 400. | spec v1/v2 `ToolChoiceOption`; docs:/api/token-factory/chat-completions |
| C5 | `response_format` supports `json_schema` (with `strict`) and `json_object` | Confirmed | The shape is `{type:"json_schema", json_schema:{name, schema, strict, description}}`, where `name` may contain only letters, digits, `_` and `-`. The reply arrives as a JSON string in `message.content`. | spec `ResponseFormat`; chat-completions guide |
| C6 | Reasoning is on by default, counts toward `max_tokens` (default 2,048 on v1), and `reasoning_effort: null` turns it off | Confirmed on /v1 | The v1 spec says "Set to `null` to turn reasoning off." The docs disagree on the default level: `medium` in the spec and the thinking-level guide, `low` in the chat guide and on the model page. On /v2 the documented off value is `"none"`, and /v1 rejects that value (see Verdict 1). | spec v1; docs:/api/token-factory/models/sarvam-105b; docs:/api/token-factory/how-to/adjust-the-models-thinking-level; docs:/api/integration/pipecat-production-guide |
| C7 | Document AI Extract takes JPG, PNG or PDF plus a JSON schema, runs as an async job, and returns a confidence and source for each field; a missing field comes back null with confidence 0 | Confirmed | Also: submitting returns 201 with `{job_id, status, run_id}`. `annotations` mirrors the shape of `result`, so it is nested for arrays. Asking for results before a terminal status returns 409. | spec `POST /doc-ai/v1/job/extract`, `GET .../results`; docs:/api/api-guides-tutorials/document-intelligence/how-to/extract; docs:/api/api-guides-tutorials/document-intelligence/job-lifecycle |
| C8 | `gemma4` on /v2 accepts base64 data-URI images, supports tools and structured output, and is serverless | Confirmed | Remote image URLs return 400. Request bodies over 10 MiB return 413. Reasoning is off by default. The docs say it is "not specifically tuned for Indian languages". | docs:/api/token-factory/models/gemma-4-31b; docs:/api/token-factory/models |
| C9 | `bulbul:v4-flash` has `simran_enhi_customer` and `aparna_hi_customer`; the stream endpoint takes 3,500 characters and returns chunked MP3, and REST takes 2,500 and returns base64 WAV | Confirmed | Both IDs are in the 259-entry speaker enum. Always send `model: "bulbul:v4-flash"`: omitting it routes to `bulbul:v3`, which rejects v4 speaker IDs with 400. | spec TTS; docs:/api/api-guides-tutorials/text-to-speech/voices; .../best-practices |
| C10 | Pay-as-you-go limits, per account: STT 60/min, TTS 60/min, 105B 60/min, gemma4 50/min, Extract 30/min | Confirmed, caveat | The pricing page says limits apply per account and every key shares one token bucket. The Token Factory page says "Limits apply per API key". The docs disagree, so assume the limits are shared. | docs:/api/getting-started/pricing; docs:/api/api-guides-tutorials/document-intelligence/languages-formats-limits; docs:/api/token-factory/models |
| C11 | Verified users get ₹100 of free credits at signup; an empty balance returns 402 `insufficient_quota_error` | Confirmed | Credits never expire. The balance belongs to the organisation and every key draws on it. The docs don't define "verified". | pricing; docs:/api/platform/billing; docs:/api/getting-started/errors-troubleshooting |
| C12 | Auth uses the `api-subscription-key` header, Bearer is also accepted, and a bad key returns 403 | **Refuted in part** | This holds everywhere except Document AI: `/doc-ai/v1/*` returns **401** for a missing or invalid key, and 402 or 403 there means a billing or entitlement problem. | docs:/api-reference/authentication; errors-troubleshooting; job-lifecycle |
| C13 | The OpenAI-compatible base URL is `https://api.sarvam.ai/v2`, and `/v1` also works for 105B with Bearer auth | Confirmed, caveat | The v1 spec's security scheme is HTTP Bearer, and the `api-subscription-key` header is also accepted. The reasoning switch differs between the two (Verdict 1). | docs:/api/token-factory; spec v1 |
| C14 | `sarvamai@1.1.22` needs Node 18+, accepts File or Blob uploads, and its `docAi.extract` has no `language` field (1.1.23-alpha.2 adds it) | Confirmed | `latest` is 1.1.22, published 23 Nov 18:51 UTC; `alpha` is 1.1.23-alpha.2. Its only dependency is `ws`. `Uploadable` accepts a Blob, File, Buffer or stream, or `{data, filename, contentType}`. | npm; unpkg `DocAiExtractRequest.d.ts`, `core/file/types.d.ts` |
| C15 | The docs MCP at `https://docs.sarvam.ai/_mcp/server` is live, needs no key, and exposes `searchDocs(query, topK)` | Confirmed (live) | `initialize` returns `fern-docs-mcp-server 1.0.0` with protocol 2025-06-18. It has one tool, `searchDocs`, with `topK` from 1 to 20 (default 8). Its answers are written by an LLM; one was self-contradictory. | mcp (live probe, 01:55 IST) |

### 2b. integration_recommendation and supporting facts

| # | Claim | Verdict | Correct fact / note | Source |
|---|---|---|---|---|
| B1 | STT model `saaras:v4` is the default and latest; the enum is only `saaras:v3` and `saaras:v4`; Saarika and Saaras v2.5 are deprecated | Confirmed | Requesting a deprecated model returns 400 with a `{"detail": ...}` body instead of the usual error envelope. | spec; rest-api; docs:/api/getting-started/models/saarika |
| B2 | Valid `language_code` values include `hi-IN`, `en-IN` and `unknown` | Confirmed | There are 23 codes plus `unknown`. With a specific code, detection is skipped and `language_probability` is null. | spec; docs:/api/api-guides-tutorials/models/saaras |
| B3 | `keyterms`: up to 50 terms of up to 64 characters, sent as one JSON-encoded form field, `saaras:v4` only | Confirmed | Don't use the old `keyterm` or `hotwords` fields. The keyterms guide says the JS REST fix "has not shipped", but the 1.1.22 source does `append("keyterms", JSON.stringify(...))`, which is correct. The guide's `languageCode` is also wrong; the SDK uses `language_code`. | spec; docs:/api/api-guides-tutorials/speech-to-text/how-to/keyterms; unpkg `speechToText/client/Client.js` |
| B4 | The STT response is `{request_id, transcript, language_code, language_probability}` | Confirmed | It also carries `timestamps` when you ask for them. `language_code` may be null. | spec |
| B5 | Browser Opus recorded at 48 kHz decodes correctly | **Unverified** | The FAQ says 8, 16, 22.05 and 44.1 kHz "all work" and never mentions 48 kHz. Test T3. | faq |
| B6 | Safari records `audio/mp4`, and STT accepts it | **Unverified** | MP4/M4A is an accepted format, but no Sarvam doc mentions Safari. Test T3, then a real Safari recording. | spec |
| B7 | Choose the TTS voice from the `language_code` that STT returned | **Refuted** | Sending `hi-IN` skips detection, so the returned code can't tell English from Hinglish. Choose from the UI toggle or from the reply's script (§3.3). | docs:/api/api-guides-tutorials/models/saaras |
| B8 | `/v1` serves only `sarvam-105b` and `sarvam-105b-conversations`; `/v2` serves 105B plus `glm5.3`, `glm5.3-flash`, `gemma4` and `deepseekv4.1-flash-1017` (serverless) | Confirmed | The v2 enum also lists `sarvam-105b-conversations`, although the model page says it is on /v1 only. | spec; chat-completions; sarvam-105b page |
| B9 | `reasoning_effort: null` on `/v2` turns off 105B reasoning (the "OpenAI SDK on /v2" option) | **Unverified** | Not documented. The documented value on /v2 is `"none"`. Test T4c. | spec v2; pipecat guide; docs:/api/token-factory/migrations/from-openrouter/chat-completion |
| B10 | A forced `tool_choice` behaves the same with `reasoning_effort: null` | **Unverified** | No docs example combines the two. Test T4. | none |
| B11 | `max_tokens` cap: Starter 4,096, Pro 16,384, Business 128,000 | Confirmed | Starter is the pay-as-you-go plan (billing page). | chat-completions "Limits"; docs:/api/platform/billing |
| B12 | `temperature: 0.2` is valid; the default is 0.6 with reasoning off | Confirmed | Range 0 to 2. The default is 1.0 with reasoning on. | spec v1 |
| B13 | SDK 1.1.22 types `reasoning_effort` without null | Confirmed | It is typed `reasoning_effort?: ReasoningEffort`, meaning `"none"`, `"low"`, `"medium"`, `"high"` or `"max"`. | unpkg `ChatCompletionsRequest.d.ts`, `types/ReasoningEffort.d.ts` |
| B14 | `bulbul:v4-flash` is the latest TTS model (200+ personas, default `shubh_enhi_ads`); `bulbul:v3` is the API default (37 speakers, default `shubh`); speaker IDs are not interchangeable | Confirmed | A speaker from the wrong model returns 400 with the valid list. The building-for-india page pairs `shubh` with v4-flash, which the best-practices page says returns 400. | spec; best-practices |
| B15 | 13 English-Hindi (`enhi`) personas; recommended Hindi voices are `aparna_hi_customer` (female) and `shubh_hi_customer` (male); English options include `simran_en_customer` and `aparna_en_companion` | Confirmed | In v4-flash, the language tag in a persona ID does not restrict `language_code`. | voices; best-practices; docs:/api/api-guides-tutorials/text-to-speech/how-to/set-the-language |
| B16 | TTS accepts 11 language codes, and `en-US` is rejected | Confirmed | `bn`, `en`, `gu`, `hi`, `kn`, `ml`, `mr`, `od`, `pa`, `ta` and `te`, each with `-IN`. | spec; best-practices |
| B17 | REST TTS requires `text` and `language_code`; the stream endpoint requires only `text` | Confirmed per spec, docs conflict | The set-the-language page says `language_code` is required on every request. The http-stream page says it is optional with an `en-IN` default. Always send it. | spec; set-the-language; docs:/api/api-guides-tutorials/text-to-speech/streaming-api/http-stream |
| B18 | Codecs are wav, mp3, aac, flac, opus, linear16, mulaw and alaw; opus returns 400 at 22,050 Hz; REST goes up to 48 kHz and streaming up to 24 kHz | Confirmed | The default sample rate is 22,050 everywhere. Opus needs 8,000, 16,000 or 24,000 Hz (or 48,000 on REST). | spec; docs:/api/api-guides-tutorials/text-to-speech/how-to/set-audio-format-for-output |
| B19 | The stream endpoint returns chunked `audio/mpeg`; REST returns `{request_id, audios:[base64]}` as WAV | Confirmed | Errors come back as JSON, not audio, so check the status and `content-type` before piping the body to the browser. | spec; http-stream |
| B20 | `enable_preprocessing` normalises numbers, dates and currency | Confirmed | Default false. | spec; best-practices |
| B21 | Extract takes `file`, `schema` (a JSON string) or `config_id`, `language`, `output_format` (json, csv or xlsx) and `mode` (basic or advanced) | Confirmed | Send exactly one of `schema` and `config_id`, and exactly one of `file` and `upload_ids`. `model` defaults to `sarvam-vision-v1`, and other values return 400. `classification` isn't available yet. | spec |
| B22 | Extract `language` defaults to `indic`, so set `en-IN` for English cards | Confirmed, docs conflict | The guide and the spec's description both say `indic`; the spec's `default` field says `en-IN`. Always send it. | spec; how-to/extract |
| B23 | Submitting an Extract job returns `{job_id, status: 'pending'}` | Confirmed, incomplete | The status code is HTTP **201**, and the body also contains `run_id`. Treat any 2xx as success. | spec |
| B24 | Poll `GET /doc-ai/v1/job/{id}/status` until it is terminal, then `GET .../results` | Confirmed | Statuses go `pending`, then `running`, then one of `completed`, `partially_completed`, `failed` or `rejected`. Results requested early return `409 RESULTS_NOT_READY`. `/results` is gzip-compressed. | spec; job-lifecycle |
| B25 | Resending with the same `Idempotency-Key` returns the original `job_id` | Confirmed | The same key with a changed request returns `409 IDEMPOTENCY_KEY_REUSED`. | spec |
| B26 | Document AI accepts PDF, PNG, JPG/JPEG, TIFF, DOCX and ZIP (of JPG or PNG pages); GIF is rejected; 100 MiB per file; 23 languages | Confirmed | Data is retained for 8 days. One request is treated as one logical document. | languages-formats-limits; how-to/extract |
| B27 | Document AI limits: Extract 30 req/min (500 pages per request), Parse 200 req/min (20 pages) | Confirmed | The docs don't say whether status polls count toward these limits. The docs examples poll every 5 s. | languages-formats-limits |
| B28 | The research's invitation schema is valid as written | **Unverified** | It is probably valid: the API says `description` is optional. But some fields have no description, and the SDK 1.1.22 docstring says a non-empty `description` is required. Use the schema in §4, which gives every field one. | spec; unpkg `DocAiExtractRequest.d.ts` |
| B29 | Prices (pay-as-you-go): STT ₹0.49/min billed per second; Bulbul v4 Flash ₹2 per 1,000 characters (v3 ₹3); 105B ₹10 input and ₹25 output per 1M tokens, introductory through 2026; gemma4 ₹35 and ₹90; Extract basic ₹1/page; Parse ₹0.50/page | Confirmed | Cached input costs ₹0.25 per 1M on 105B and ₹10 on gemma4. Extract advanced costs ₹2.50/page. All prices exclude GST. The STT FAQ adds "+10% for language detection", which the pricing page does not list. | pricing; faq |
| B30 | Dictate is `POST /v2/dictate`: 30 s or less, at most 10,000,000 bytes, with `output_rules`, at ₹0.50/min | Confirmed | | spec; pricing |
| B31 | Sarvam Prism is `POST /v2/systemone` with model `sarvam-prism` | Confirmed | ₹4 per 1M input tokens, ₹0 for output. Its rate limit is not listed. | spec; pricing |
| B32 | The dashboard is `indus.sarvam.ai`, with `/key-management`, `/billing`, `/rate-limits`, `/api-playground/text-to-speech` and `/akshar/playground/extract` | Confirmed | Every docs link uses indus.sarvam.ai, and `dashboard.sarvam.ai` redirects to `indus.sarvam.ai/login`. A key is shown only once. | docs links; live redirect check |
| B33 | JS SDK: `new SarvamAIClient({ apiSubscriptionKey })`; `speechToText.transcribe`, `textToSpeech.convert`/`convertStream`, `chat.completions`/`completionsV2`, `docAi.extract`/`getStatus`/`getResults`; snake_case field names | Confirmed | `docAi.getStatus(job_id)` takes the ID as a positional argument, and `extract`'s `file` is an array. The SDK's default timeout is 60 s. | unpkg d.ts and Client.js; how-to/extract |
| B34 | The Python SDK's stable release is 0.1.49 (Python 3.8+); the `language` field needs 0.1.50, which exists only as an alpha | Confirmed | 0.1.50a2 was published 24 Nov. | pypi |
| B35 | `openapi.json` is an HTML index; the REST spec is `openapi/apis.json`, and the WebSocket spec is `asyncapi.json` | Confirmed | The hackathon page still links to `openapi.json`. | live fetch |
| B36 | The realtime WebSocket authenticates with a header or, in browsers, the subprotocol `api-subscription-key.<key>`, which exposes the key | Confirmed | | async |
| B37 | Sarvam publishes no latency figures for REST STT, LLM time to first token, TTS time to first byte or Document AI | Confirmed | The only figure is about 70 ms of streaming-STT processing in the LiveKit plugin. The docs say there is "no official Sarvam round-trip SLA". | docs:/api/api-guides-tutorials/speech-to-text/which-api-to-use; .../use-cases/ivr-contact-center |
| B38 | `sarvam-105b` moved to the 1711 weights on 22 Nov 2026, with no API change | Confirmed | | docs:/changelog/2026/11/22 |
| B39 | The research's tool schema (`type: ['string','null']`, open `fields: {type:'object'}`) works with a forced tool choice | **Unverified** | The docs don't say which JSON Schema keywords constrained decoding honours. Use §3.2's explicit optional properties, with no union types. Test T4. | none |
| B40 | The hackathon page gives `claude mcp add sarvam-docs --transport http https://docs.sarvam.ai/_mcp/server` | Confirmed | It also lists the Codex form: `codex mcp add sarvam-docs --url ...`. | https://www.wemakedevs.org/hackathons/festivehacks/resources |

### 2c. Other contradictions in Sarvam's docs (beyond the research)

- The default reasoning level is `medium` in the spec, the thinking-level guide and the LangChain page, but `low` in the chat guide, the 105B page and the models table.
- The reasoning-off value is `null` (v1 spec and guides) or `"none"` (models table, OpenRouter migration guide and Pipecat guide, all for v2). The spec's own enum text says `"none"` turns thinking off only on the DeepSeek models and `qwen38-27b`, and that other models reject it or keep thinking.
- The v2 `max_tokens` default is 2048 in the spec, but the chat guide says only `glm5.3` defaults to 2048 on v2. Always set it explicitly.
- The plan names differ: Starter/Pro/Business (FAQ, chat limits and billing pages) against Pay as you go/Pro/Growth/Business (pricing page).
- The Pipecat guide says `bulbul:v4-flash` ignores TTS `temperature`; the spec says both models accept it. This only matters if you tune it.

---

## 3. The pipeline: STT → LLM tools → TTS

### 3.0 Rules for every call

- Base URL `https://api.sarvam.ai`. Send the `api-subscription-key: <key>` header on every call (`Authorization: Bearer` also works). Call Sarvam **only from the server**: the authentication page says never to expose the key in client-side code.
- Node 18+ has global `fetch`, `FormData` and `Blob`; global `File` arrives only in Node 20. Use `form.append('file', blob, 'clip.webm')`, not `new File(...)`. Never set `Content-Type` yourself on a FormData request, because fetch has to add the boundary.
- Plain `fetch` is the simplest choice for everything. The SDK (`sarvamai@1.1.22`, pinned exactly) is fine for STT and TTS. Use `fetch` for chat, because the SDK's types don't allow `null`, and for Document AI, because the SDK has no `language` field.
- Errors use the envelope `{"error":{"message","code","request_id"}}`. The exception: STT with a deprecated model returns 400 `{"detail": "..."}`.
- Retry only 429, 500, 502 and 503, with backoff, honouring `Retry-After`, and at most once inside a voice turn. Don't retry 400, 401, 402, 403 or 422, or a 429 whose code is `seat_budget_exhausted_error`.
- TTS silently ignores unknown fields, so a misspelled parameter fails without any error.

### 3.1 Speech to text: `POST https://api.sarvam.ai/speech-to-text` (multipart/form-data)

Browser side: record with MediaRecorder using `audio/webm;codecs=opus` where it is supported, and Safari's default (`audio/mp4`) otherwise. Wait for the final `dataavailable` event, then stop the tracks. Reject a recording if `blob.size === 0`, because the API returns 400 "Failed to read the file". Stop automatically at 25 s; the hard limit is 30 s. POST the blob to your own server route.

| Field | Send | Notes |
|---|---|---|
| `file` | the blob, named `clip.webm`, `clip.m4a`, `clip.ogg` or `clip.wav` | Use the base MIME as the part's type (`audio/webm`, `audio/mp4`, `audio/ogg`, `audio/wav`). Stripping `;codecs=...` is a precaution, because a wrong type returns "Invalid file type". |
| `model` | `saaras:v4` | It is the default, but send it anyway. |
| `mode` | `codemix` | Hinglish: English words in Latin script, Hindi words in Devanagari. |
| `language_code` | `hi-IN` (Hinglish/Hindi toggle, the default) or `en-IN` (English toggle) | `unknown` auto-detects; the FAQ says that costs 10% more and docs advise sending the code when known. |
| `keyterms` | a JSON string of at most 50 distinct terms, each 64 characters or fewer | For example `["Mehendi","Haldi","Sangeet","Baraat","Shagun","lakh","Garden Hall", ...couple, family, vendor and venue names]`. Put each phrase in its own item. |
| `with_timestamps`, `input_audio_codec` | omit | `input_audio_codec` is only for raw PCM, which must be 16 kHz. |

```ts
// Server-side only. Node 18+.
const SARVAM = 'https://api.sarvam.ai';
const KEY = process.env.SARVAM_API_KEY!;

export async function transcribe(audio: Blob, lang: 'hi-IN' | 'en-IN', terms: string[]) {
  const mime = (audio.type || 'audio/webm').split(';')[0];          // "audio/webm;codecs=opus" -> "audio/webm"
  const ext = mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'webm';
  if (audio.size === 0) throw new Error('empty recording');
  const form = new FormData();
  form.append('file', new Blob([await audio.arrayBuffer()], { type: mime }), `clip.${ext}`);
  form.append('model', 'saaras:v4');
  form.append('mode', 'codemix');
  form.append('language_code', lang);
  const keyterms = [...new Set(terms.map(t => t.trim()).filter(t => t && t.length <= 64))].slice(0, 50);
  if (keyterms.length) form.append('keyterms', JSON.stringify(keyterms));
  const res = await fetch(`${SARVAM}/speech-to-text`, { method: 'POST', headers: { 'api-subscription-key': KEY }, body: form });
  if (!res.ok) throw new Error(`STT ${res.status}: ${await res.text()}`);
  return (await res.json()) as { request_id: string | null; transcript: string; language_code: string | null; language_probability?: number | null };
}
```

Errors specific to STT, all `400 invalid_request_error`: "Audio duration exceeds the maximum limit of 30 seconds"; "Failed to read the file, please check the audio format" (an empty, truncated or corrupt file); "Invalid file type: ..."; and invalid `model`, `mode`, `language_code` or `keyterms`. A bad key returns 403. 429 and 503 can be retried.

Using the SDK instead:
```ts
client.speechToText.transcribe({ file: { data: blob, filename: 'clip.webm', contentType: 'audio/webm' }, model: 'saaras:v4', mode: 'codemix', language_code: 'hi-IN', keyterms })
```
That form is verified against the 1.1.22 types and source.

### 3.2 Transcript to proposed actions: `POST https://api.sarvam.ai/v1/chat/completions` (JSON)

```json
{
  "model": "sarvam-105b",
  "reasoning_effort": null,
  "temperature": 0.2,
  "max_tokens": 1200,
  "messages": [
    { "role": "system", "content": "<rules> + Today is 2026-11-25, Asia/Kolkata + compact JSON snapshot of the wedding: ids and names of events, vendors, payments, guest groups" },
    { "role": "user", "content": "<previous turn, plain text>" },
    { "role": "assistant", "content": "<previous reply, plain text>" },
    { "role": "user", "content": "<transcript>" }
  ],
  "tools": [ PROPOSE_ACTIONS ],
  "tool_choice": { "type": "function", "function": { "name": "propose_actions" } }
}
```

`PROPOSE_ACTIONS` uses explicit optional fields instead of an open `fields` object, and no `null` unions. This change is unverified (B39), so test it in T4.

```json
{
  "type": "function",
  "function": {
    "name": "propose_actions",
    "description": "Propose changes to the wedding plan. The user confirms before anything is saved. Never invent names, dates or amounts: leave the field out and list it in missing_fields.",
    "parameters": {
      "type": "object",
      "properties": {
        "intent": { "type": "string", "enum": ["act", "ask", "clarify"] },
        "actions": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "kind": { "type": "string", "enum": ["set_wedding_profile", "create_event", "update_event", "add_vendor", "record_commitment", "record_payment", "correct_payment", "add_requirement", "update_invite_style", "add_guest", "set_rsvp"] },
              "target_id": { "type": "string", "description": "id of an existing record from the snapshot; omit when creating" },
              "title": { "type": "string" },
              "date": { "type": "string", "description": "YYYY-MM-DD; omit unless day, month and year are all known" },
              "time": { "type": "string", "description": "HH:MM, 24-hour, Asia/Kolkata" },
              "venue": { "type": "string" },
              "name": { "type": "string", "description": "person, guest or vendor name as spoken" },
              "amount_inr": { "type": "integer", "description": "whole rupees; 1 lakh = 100000" },
              "per_person_inr": { "type": "integer" },
              "headcount": { "type": "integer" },
              "rsvp": { "type": "string", "enum": ["yes", "no", "pending"] },
              "notes": { "type": "string" }
            },
            "required": ["kind"]
          }
        },
        "missing_fields": { "type": "array", "items": { "type": "string" } },
        "reply": { "type": "string", "description": "At most 140 characters, in the user's language. Hindi words in Devanagari, English words in Latin script." }
      },
      "required": ["intent", "actions", "missing_fields", "reply"]
    }
  }
}
```

Parsing:
- `const call = data.choices?.[0]?.message?.tool_calls?.[0]`. Check `call?.function?.name === 'propose_actions'`, then `JSON.parse(call.function.arguments)` (the arguments are a JSON string), then validate with zod. Check that `tool_calls` is present rather than trusting `finish_reason` alone; `message.content` is null on a tool call.
- Check `data.usage.completion_tokens_details.reasoning_tokens`. It should be 0 or absent; log a warning if not.
- Do every calculation in code (₹800 × 250 = ₹2,00,000; outstanding balances). A `correct_payment` must point at an existing payment id from the snapshot. Save only after the user confirms, through the same server functions the forms use.
- Fallbacks, at most one per turn. If there is no tool call, the arguments don't parse, or `finish_reason` is `"length"`, resend with `response_format: {type:"json_schema", json_schema:{name:"wedding_actions", strict:true, schema:<the parameters object>}}` and no `tools`. Keep `reasoning_effort: null`, and parse `message.content`. If that also fails, show the transcript as editable text. The last resort is `reasoning_effort: "low"` with `max_tokens: 3000`, which stays under the 4,096 Starter cap but adds seconds.
- Send history as plain user and assistant text. Don't replay `tool_calls` unless you also send the matching `role: "tool"` messages.
- Leave out `n` (only 1 is allowed) and `stop` (at most 4). Don't send `functions` or `function_call`.

Read-only questions, such as "What changed today, and how much do we still owe?": query the database in code, then make a second call with no tools: `{model:"sarvam-105b", reasoning_effort:null, temperature:0.3, max_tokens:300, messages:[{role:"system", content:"Answer in 1-2 short sentences using only these facts: <rows and totals computed in code>. Hindi words in Devanagari, English in Latin."}, {role:"user", content:<transcript>}]}`, and read `choices[0].message.content`.

If you use the OpenAI SDK, use `baseURL: 'https://api.sarvam.ai/v1'` with the key as `apiKey` (sent as Bearer) and `reasoning_effort: null`, then confirm in T4 that `reasoning_tokens` is 0. On `https://api.sarvam.ai/v2`, use `reasoning_effort: "none"` instead.

### 3.3 Spoken confirmation: `POST https://api.sarvam.ai/text-to-speech/stream` (JSON in, chunked audio out)

```json
{
  "text": "<reply: up to 3,500 characters on this endpoint; keep it under about 140>",
  "language_code": "hi-IN",
  "model": "bulbul:v4-flash",
  "speaker": "simran_enhi_customer",
  "enable_preprocessing": true,
  "output_audio_codec": "mp3",
  "pace": 1.0
}
```

Choose the voice from the reply text, not from STT's `language_code` (B7):

| Reply text | `language_code` | `speaker` | Alternatives to audition |
|---|---|---|---|
| Contains Devanagari (Hinglish or Hindi) | `hi-IN` | `simran_enhi_customer` | `ishita_enhi_customer`, `shubh_enhi_banking` (male), `aparna_hi_customer` (Hindi, female), `shubh_hi_customer` (Hindi, male) |
| Latin script only (English) | `en-IN` | `simran_en_customer` | `aparna_en_companion`, `ishita_en_customer` |

```ts
const speech = /[ऀ-ॿ]/.test(reply)
  ? { language_code: 'hi-IN', speaker: 'simran_enhi_customer' }
  : { language_code: 'en-IN', speaker: 'simran_en_customer' };
const upstream = await fetch(`${SARVAM}/text-to-speech/stream`, {
  method: 'POST',
  headers: { 'api-subscription-key': KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: reply, ...speech, model: 'bulbul:v4-flash', enable_preprocessing: true, output_audio_codec: 'mp3' }),
});
if (!upstream.ok || !(upstream.headers.get('content-type') ?? '').startsWith('audio/')) {
  throw new Error(`TTS ${upstream.status}: ${await upstream.text()}`);   // errors are JSON, not audio
}
return new Response(upstream.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
```

Text rules from the best-practices page: write Hindi words in Devanagari and English words in Latin script, because romanised Hindi lowers quality. Write amounts the way they are printed (`₹1,50,000`) and keep `enable_preprocessing: true`. Keep sentences short and use punctuation for rhythm, because v4-flash has no SSML. Leave out `speech_sample_rate`: the default 22,050 Hz is fine for MP3, and the stream endpoint accepts at most 24 kHz.

The non-streaming alternative is `POST /text-to-speech`, with the same body and at most 2,500 characters. It returns `{request_id, audios: [base64]}`, WAV by default, which must be decoded before playing. In the SDK: `client.textToSpeech.convert({...})` or `convertStream({...})`.

---

## 4. Document AI path (invitations and receipts)

**Submit:** `POST https://api.sarvam.ai/doc-ai/v1/job/extract`, multipart, with headers `api-subscription-key` and `Idempotency-Key: <uuid>`.

| Field | Send |
|---|---|
| `file` | JPG, PNG or PDF; one request is one logical document. Downscale phone photos on the client to well under 5 MB; some hosts cap request bodies (Vercel functions at 4.5 MB). |
| `schema` | a JSON **string** of the schema below |
| `language` | `en-IN` for English cards, `hi-IN` for Devanagari cards. Always send it (B22). |
| `output_format` | `json` |
| `mode` | `basic` (₹1/page); `advanced` costs ₹2.50/page |

The response is **201** with `{ "job_id": "...", "status": "pending", "run_id": "..." }`.

**Poll:** `GET https://api.sarvam.ai/doc-ai/v1/job/{job_id}/status` every 3 to 5 s until `status` is `completed`, `partially_completed`, `failed` or `rejected`. Poll from the client through a thin status route, rather than holding one serverless request open. No job duration is documented.

**Fetch:** `GET https://api.sarvam.ai/doc-ai/v1/job/{job_id}/results` (gzip; `fetch` decodes it automatically). Asking before a terminal status returns 409.

```json
{
  "type": "extract", "job_id": "...", "status": "completed",
  "result": { "bride_name": "...", "events": [ { "event_name": "...", "date_text": "..." } ] },
  "annotations": {
    "bride_name": { "confidence": 0.97, "sources": [ { "page_num": 1, "filename": "invite.jpg", "bbox_norm": [0.20, 0.06, 0.29, 0.10] } ] },
    "events": [ { "event_name": { "confidence": 0.9, "sources": [] } } ]
  },
  "usage": { "pages_total": 1 }, "version": 1
}
```
`annotations` mirrors `result` leaf by leaf, so walk it recursively for arrays. A field the model couldn't find is `null` with `confidence: 0` and no sources. Some sources carry `region_norm` instead of `bbox_norm`.

**Invitation schema.** Every field has a type and a description, there are no union types, and nesting is 4 levels or fewer. Ask only for printed text; parse dates in code, and ask the user for the year when it isn't printed.
```json
{
  "type": "object",
  "properties": {
    "bride_name":   { "type": "string", "description": "Bride's full name exactly as printed on the card" },
    "groom_name":   { "type": "string", "description": "Groom's full name exactly as printed on the card" },
    "hosts":        { "type": "string", "description": "Names of the inviting family or parents exactly as printed" },
    "events": {
      "type": "array",
      "description": "Each wedding function printed on the card, in printed order",
      "items": {
        "type": "object",
        "description": "One wedding function",
        "properties": {
          "event_name":    { "type": "string", "description": "Function name as printed, e.g. Mehendi, Haldi, Sangeet, Wedding, Reception" },
          "date_text":     { "type": "string", "description": "Date exactly as printed; include the year only if it is printed" },
          "time_text":     { "type": "string", "description": "Time exactly as printed" },
          "venue_name":    { "type": "string", "description": "Venue name exactly as printed" },
          "venue_address": { "type": "string", "description": "Venue address exactly as printed" }
        }
      }
    },
    "rsvp_contact": { "type": "string", "description": "RSVP contact names and phone numbers exactly as printed" }
  }
}
```

**Receipt schema**, used to prefill a payment preview:
```json
{
  "type": "object",
  "properties": {
    "vendor_name":     { "type": "string", "description": "Business name of the vendor who issued the receipt, as printed" },
    "amount_paid_inr": { "type": "number", "description": "Total amount paid in Indian rupees, digits only" },
    "paid_on_text":    { "type": "string", "description": "Payment date exactly as printed" },
    "receipt_number":  { "type": "string", "description": "Receipt or invoice number as printed" },
    "payment_mode":    { "type": "string", "description": "Payment mode as printed, e.g. cash, UPI, card, cheque" }
  }
}
```

**Review rule:** load every field into the draft. Mark a field "please confirm" when it is null or its confidence is below 0.8; that threshold comes from the docs' own example. Never save without the user confirming. If NudgeBee retries, resend the identical request with the same `Idempotency-Key` to get the original `job_id` back; a changed request with the same key returns 409.

**Synchronous fallback, behind a flag:** `POST https://api.sarvam.ai/v2/chat/completions`
```json
{
  "model": "gemma4",
  "max_tokens": 1000,
  "messages": [ { "role": "user", "content": [
    { "type": "text", "text": "Read this wedding invitation. Copy names, dates, times and venues exactly as printed. Use an empty string for anything that is not printed." },
    { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,<...>" } }
  ] } ],
  "response_format": { "type": "json_schema", "json_schema": { "name": "invite", "strict": true, "schema": <invitation schema> } }
}
```
Images must be base64 data URIs, and the whole body must stay under 10 MiB (413 beyond that). Reasoning is off unless you set it. The model is weaker on Indic scripts, and it gives no confidence scores, so mark every field "please confirm".

---

## 5. Limits, pricing, credits

### Limits

| API | Limit |
|---|---|
| STT REST | 30 s of audio per request; no byte cap documented; PCM only at 16 kHz; 8, 16, 22.05 and 44.1 kHz documented; stereo is merged to mono; `keyterms` up to 50 terms of 64 characters; **60 req/min** |
| STT WebSocket (not used) | 20 concurrent; browser auth exposes the key |
| Chat v1 `sarvam-105b` | 128K context; `max_tokens` defaults to 2,048, capped at 4,096 on Starter; `n` = 1; `stop` up to 4; temperature 0 to 2; **60 req/min** |
| `gemma4` (v2) | 262,144 context; body at most 10 MiB; images as base64 only; **50 req/min** |
| TTS | REST 2,500 characters, stream 3,500, WebSocket 2,500 per message; stream sample rates up to 24 kHz; **60 req/min** (REST and stream) |
| Document AI Extract | 100 MiB per file; 500 pages per request; **30 req/min**; data retained 8 days |
| Dictate (optional) | 30 s or less, at most 10,000,000 bytes per clip; 60 req/min |

Limits apply per account in a token bucket that refills continuously, and every key shares it (see C10 for the docs' disagreement). Your actual limits are on https://indus.sarvam.ai/rate-limits.

### Prices (pay-as-you-go, excluding GST)

| Item | Price |
|---|---|
| STT | ₹0.49/min, billed per second (FAQ: +10% when language detection is used) |
| TTS Bulbul v4 Flash | ₹2.00 per 1,000 characters (v3 ₹3.00) |
| `sarvam-105b` | ₹10 input, ₹0.25 cached input, ₹25 output per 1M tokens; reasoning is billed as output; introductory pricing through end-2026 |
| `gemma4` | ₹35 input, ₹10 cached input, ₹90 output per 1M tokens |
| Document AI | Extract basic ₹1/page, advanced ₹2.50/page; Parse ₹0.50/page |
| Dictate | ₹0.50/min |

**Credits:** verified users get ₹100 free; the docs don't define "verified". Credits never expire, and the balance is shared by every key, workspace and product in the organisation. When it is empty, every call returns `402 insufficient_quota_error` ("No credits available."), and retrying won't help. Topping up doesn't change your plan or limits. Any top-up minimum is not documented, and the balance can lag about a minute behind a burst of usage.

**Build-day estimate:** 250 STT clips of 8 s cost ₹16. 400 LLM calls (2,500 tokens in, 250 out) cost ₹13. 250 TTS replies of 120 characters cost ₹60. 30 Extract pages cost ₹30. 20 gemma4 image calls cost about ₹3. That totals **about ₹122, more than the free ₹100**. One demo voice turn costs about ₹0.34, and TTS is about 70% of that.

### Error codes

| HTTP | `error.code` | Meaning | Action |
|---|---|---|---|
| 400 | `invalid_request_error` | Bad parameters or file (STT duration, unreadable file, wrong file type, speaker that doesn't match the model, `n` > 1) | Fix the request; don't retry |
| 401 | `UNAUTHORIZED` | **Document AI only:** missing or invalid key | Fix the key |
| 402 | `insufficient_quota_error` | Out of credits | Top up; don't retry |
| 403 | `invalid_api_key_error` | Missing or invalid key (everything except Document AI). On Document AI, 402 or 403 means a billing or entitlement problem | Fix the key or the plan |
| 404 | `not_found_error` | Unknown model id (ids are case-sensitive); Document AI job or config not found | Fix the id |
| 409 | `RESULTS_NOT_READY` / `IDEMPOTENCY_KEY_REUSED` | Document AI: results requested too early, or a reused key with a changed request | Keep polling, or use a new key |
| 413 | `FILE_TOO_LARGE` / `invalid_request_error` | Document AI file over 100 MiB; gemma4 body over 10 MiB | Shrink the input |
| 422 | `unprocessable_entity_error` | Validation failure on some endpoints (STT uses 400 instead) | Fix the request |
| 429 | `rate_limit_exceeded_error`, `model_rate_limit_exceeded_error`, `audio_duration_busy_error`, `seat_budget_exhausted_error` | Rate, capacity or busy; a seat budget is not temporary | Back off and retry, except for `seat_budget_exhausted_error` (top up) |
| 500 / 502 / 503 | `internal_server_error` / `model_call_failed` / `model_overloaded` | Transient. The TTS stream returns 500 for an unknown `dict_id` | Retry with backoff |

---

## 6. What the user should do tonight

These steps involve accounts and assets only: no application code, no project files.

1. Sign up or log in at **https://indus.sarvam.ai**; `dashboard.sarvam.ai` redirects there. Complete any verification the dashboard asks for, then check that **Settings → Billing** shows the ₹100 credit (https://indus.sarvam.ai/billing).
2. Create one API key at **https://indus.sarvam.ai/key-management**. It is shown **once**, so copy it straight into your password manager. Don't paste it into chats, docs or repos. At 9:00 it goes into `.env.local` (gitignored) and the host's environment variables.
3. Open **https://indus.sarvam.ai/rate-limits** and confirm the pay-as-you-go numbers (STT 60/min, TTS 60/min, 105B 60/min, Extract 30/min).
4. Decide on a top-up. The estimate in §5 exceeds ₹100, and credits never expire. Adding about ₹300–500 avoids a mid-demo 402; whether to spend it is your call.
5. Choose voices in **https://indus.sarvam.ai/api-playground/text-to-speech** with `bulbul:v4-flash`. Audition `simran_enhi_customer`, `ishita_enhi_customer`, `aparna_hi_customer` and `simran_en_customer`, then pick one Hinglish voice and one English voice. Try a line with an amount, for example "Caterer का बाकी ₹1,50,000 है।".
6. Optional but valuable: run a **fictional, clearly labelled** invitation image through **https://indus.sarvam.ai/akshar/playground/extract**. This tells you tonight whether decorative cards read at all.
7. Prepare assets in a folder **outside the repo**, for example `~/sarvam-smoke`:
   - `invite.jpg`: a fictional invitation under 5 MB
   - `receipt.jpg`: a fictional receipt
   - 3–4 Hinglish and English lines you will speak in the demo, each under 25 s
   - a keyterm list of names, venues and words such as mehendi, haldi, sangeet, baraat, shagun and lakh
8. Optional: add the docs MCP to Claude Code with `claude mcp add --transport http sarvam-docs https://docs.sarvam.ai/_mcp/server`. It is verified live and needs no key. Treat its answers as pointers to pages, not as facts.
9. Optional key check tonight, which is not app code and should cost nothing: T0 from §7.

---

## 7. 9:00 connectivity tests (first 15 minutes)

Run these in a terminal from `~/sarvam-smoke`, outside the repo, with `SARVAM_API_KEY` exported. The commands are written for macOS zsh. Record the HTTP codes and timings in the build notes.

```zsh
setopt interactivecomments
cd ~/sarvam-smoke
[ -n "$SARVAM_API_KEY" ] && echo "key is set" || echo "SARVAM_API_KEY is missing"
```

**T0. Key and free endpoints (1 min).** Expect `200`, `403` and `200`.
```zsh
curl -sS -o /dev/null -w 'models %{http_code}\n' https://api.sarvam.ai/v2/models -H "api-subscription-key: $SARVAM_API_KEY"
curl -sS -o /dev/null -w 'bad key %{http_code}\n' https://api.sarvam.ai/v2/models -H "api-subscription-key: invalid"
curl -sS -o caps.json -w 'docai capabilities %{http_code}\n' https://api.sarvam.ai/doc-ai/v1/capabilities -H "api-subscription-key: $SARVAM_API_KEY"
```

**T1. TTS stream (2 min).** Expect `200`, `content-type: audio/mpeg`, and audio that plays. Note the time to first byte. If the code isn't 200, `cat tts.mp3` shows the JSON error.
```zsh
curl -sS https://api.sarvam.ai/text-to-speech/stream \
  -H "api-subscription-key: $SARVAM_API_KEY" -H "Content-Type: application/json" \
  -D tts.h -o tts.mp3 -w 'tts %{http_code} first-byte %{time_starttransfer}s total %{time_total}s\n' \
  -d '{"text":"ठीक है, Sangeet 13 December को शाम 7 बजे Garden Hall में add कर दिया है। Caterer का बाकी ₹1,50,000 है।","language_code":"hi-IN","model":"bulbul:v4-flash","speaker":"simran_enhi_customer","enable_preprocessing":true,"output_audio_codec":"mp3"}'
grep -i '^content-type' tts.h; afplay tts.mp3
```
Repeat with `"speaker":"simran_en_customer","language_code":"en-IN"` and an English sentence.

**T2. STT on the T1 audio, with codemix and keyterms (2 min).** Expect `200` and a transcript that mixes Devanagari and Latin script. Check how the ₹ amount comes out.
```zsh
curl -sS https://api.sarvam.ai/speech-to-text -H "api-subscription-key: $SARVAM_API_KEY" \
  -F "file=@tts.mp3;type=audio/mpeg" -F "model=saaras:v4" -F "mode=codemix" -F "language_code=hi-IN" \
  --form-string 'keyterms=["Sangeet","Mehendi","Haldi","Garden Hall","Caterer"]' \
  -w '\nstt %{http_code} %{time_total}s\n'
```

**T3. Browser-like formats (3 min).** This settles B5 and B6. `clip48k.webm` is Opus at 48 kHz, as Chrome records it; `clip.m4a` is AAC in MP4, as Safari records it. `real48k.webm` records a real Hinglish line from the mic; macOS will ask for microphone permission.
```zsh
ffmpeg -loglevel error -y -i tts.mp3 -ac 1 -ar 48000 -c:a libopus clip48k.webm
ffmpeg -loglevel error -y -i tts.mp3 -ac 1 -ar 44100 -c:a aac clip.m4a
for pair in clip48k.webm:audio/webm clip.m4a:audio/mp4; do
  f=${pair%%:*}; mime=${pair#*:}
  curl -sS https://api.sarvam.ai/speech-to-text -H "api-subscription-key: $SARVAM_API_KEY" \
    -F "file=@$f;type=$mime" -F "model=saaras:v4" -F "mode=codemix" -F "language_code=hi-IN" -w "\n$f %{http_code} %{time_total}s\n"
done
ffmpeg -loglevel error -y -f avfoundation -i ":0" -t 8 -ac 1 -ar 48000 -c:a libopus real48k.webm
curl -sS https://api.sarvam.ai/speech-to-text -H "api-subscription-key: $SARVAM_API_KEY" \
  -F "file=@real48k.webm;type=audio/webm" -F "model=saaras:v4" -F "mode=codemix" -F "language_code=hi-IN" -w '\nreal %{http_code} %{time_total}s\n'
```
Also speak one English-only line with `language_code=hi-IN`, then again with `en-IN`, and compare the scripts.

**T4. Forced tool call with reasoning off (4 min).** This settles B9, B10 and B39.
```zsh
cat > chat.json <<'JSON'
{
  "model": "sarvam-105b",
  "reasoning_effort": null,
  "temperature": 0.2,
  "max_tokens": 1200,
  "messages": [
    {"role": "system", "content": "You turn a family's wedding-planning request into proposed actions for them to confirm. Today is 2026-11-25, timezone Asia/Kolkata. Never invent names, dates or amounts: leave the field out and list it in missing_fields. Amounts are whole rupees (1 lakh = 100000). Snapshot (fictional test data): {\"wedding\":{\"date\":\"2026-12-14\",\"city\":\"Bengaluru\"},\"vendors\":[{\"id\":\"v1\",\"name\":\"Annapurna Caterers\",\"type\":\"caterer\"}],\"payments\":[]}. Reply in the user's language: Hindi words in Devanagari, English words in Latin script, at most 140 characters."},
    {"role": "user", "content": "Caterer आठ सौ per person ले रहा है, 250 लोगों के लिए। और मैंने पचास हज़ार advance दे दिया है।"}
  ],
  "tools": [{"type": "function", "function": {"name": "propose_actions", "description": "Propose changes to the wedding plan. The user confirms before anything is saved.", "parameters": {"type": "object", "properties": {"intent": {"type": "string", "enum": ["act", "ask", "clarify"]}, "actions": {"type": "array", "items": {"type": "object", "properties": {"kind": {"type": "string", "enum": ["set_wedding_profile", "create_event", "update_event", "add_vendor", "record_commitment", "record_payment", "correct_payment", "add_requirement", "update_invite_style", "add_guest", "set_rsvp"]}, "target_id": {"type": "string"}, "title": {"type": "string"}, "date": {"type": "string"}, "time": {"type": "string"}, "venue": {"type": "string"}, "name": {"type": "string"}, "amount_inr": {"type": "integer"}, "per_person_inr": {"type": "integer"}, "headcount": {"type": "integer"}, "rsvp": {"type": "string", "enum": ["yes", "no", "pending"]}, "notes": {"type": "string"}}, "required": ["kind"]}}, "missing_fields": {"type": "array", "items": {"type": "string"}}, "reply": {"type": "string"}}, "required": ["intent", "actions", "missing_fields", "reply"]}}}],
  "tool_choice": {"type": "function", "function": {"name": "propose_actions"}}
}
JSON
show() { python3 -c 'import json,sys
d=json.load(open(sys.argv[1]))
if "choices" not in d: print(d); sys.exit()
c=d["choices"][0]; m=c["message"]; u=d.get("usage") or {}
print("finish:", c.get("finish_reason"), "| reasoning_tokens:", (u.get("completion_tokens_details") or {}).get("reasoning_tokens"), "| reasoning text:", bool(m.get("reasoning_content")))
tc=m.get("tool_calls") or []
print(json.dumps(json.loads(tc[0]["function"]["arguments"]), ensure_ascii=False, indent=1) if tc else m.get("content"))' "$1"; }
curl -sS https://api.sarvam.ai/v1/chat/completions -H "api-subscription-key: $SARVAM_API_KEY" -H "Content-Type: application/json" \
  --data-binary @chat.json -o v1_null.json -w 'v1 null %{http_code} %{time_total}s\n'; show v1_null.json
```
Pass condition: there is a tool call, it parses, it contains a `record_commitment` (800 × 250, vendor `v1`) and a `record_payment` of 50000, and `reasoning_tokens` is 0 or absent.

T4b and T4c settle the docs conflict:
```zsh
sed 's/"reasoning_effort": null/"reasoning_effort": "none"/' chat.json > chat_none.json
curl -sS https://api.sarvam.ai/v1/chat/completions -H "api-subscription-key: $SARVAM_API_KEY" -H "Content-Type: application/json" --data-binary @chat_none.json -o v1_none.json -w 'v1 none %{http_code} %{time_total}s\n'; show v1_none.json
curl -sS https://api.sarvam.ai/v2/chat/completions -H "api-subscription-key: $SARVAM_API_KEY" -H "Content-Type: application/json" --data-binary @chat_none.json -o v2_none.json -w 'v2 none %{http_code} %{time_total}s\n'; show v2_none.json
curl -sS https://api.sarvam.ai/v2/chat/completions -H "api-subscription-key: $SARVAM_API_KEY" -H "Content-Type: application/json" --data-binary @chat.json -o v2_null.json -w 'v2 null %{http_code} %{time_total}s\n'; show v2_null.json
```
Expected from the docs: v1 with `"none"` returns 400, v2 with `"none"` has reasoning off, and v2 with `null` is unknown. Build on whichever combination is fastest with 0 reasoning tokens.

**T5. Document AI Extract on the fictional invitation (3 min plus job time).** Expect `201` on submit and a terminal status. Note how long the job took.
```zsh
cat > invite_schema.json <<'JSON'
{"type":"object","properties":{"bride_name":{"type":"string","description":"Bride's full name exactly as printed on the card"},"groom_name":{"type":"string","description":"Groom's full name exactly as printed on the card"},"hosts":{"type":"string","description":"Names of the inviting family or parents exactly as printed"},"events":{"type":"array","description":"Each wedding function printed on the card, in printed order","items":{"type":"object","description":"One wedding function","properties":{"event_name":{"type":"string","description":"Function name as printed, e.g. Mehendi, Haldi, Sangeet, Wedding, Reception"},"date_text":{"type":"string","description":"Date exactly as printed; include the year only if it is printed"},"time_text":{"type":"string","description":"Time exactly as printed"},"venue_name":{"type":"string","description":"Venue name exactly as printed"},"venue_address":{"type":"string","description":"Venue address exactly as printed"}}}},"rsvp_contact":{"type":"string","description":"RSVP contact names and phone numbers exactly as printed"}}}
JSON
curl -sS https://api.sarvam.ai/doc-ai/v1/job/extract \
  -H "api-subscription-key: $SARVAM_API_KEY" -H "Idempotency-Key: $(uuidgen)" \
  -F "file=@invite.jpg;type=image/jpeg" --form-string "schema=$(cat invite_schema.json)" \
  -F "language=en-IN" -F "output_format=json" -F "mode=basic" \
  -o job.json -w 'extract submit %{http_code}\n'; cat job.json; echo
JOB=$(python3 -c 'import json;print(json.load(open("job.json"))["job_id"])')
for i in $(seq 1 60); do
  curl -sS "https://api.sarvam.ai/doc-ai/v1/job/$JOB/status" -H "api-subscription-key: $SARVAM_API_KEY" -o st.json
  ST=$(python3 -c 'import json;print(json.load(open("st.json")).get("status"))')
  echo "$((i*3))s $ST"
  case "$ST" in completed|partially_completed|failed|rejected) break ;; esac
  sleep 3
done
curl -sS --compressed "https://api.sarvam.ai/doc-ai/v1/job/$JOB/results" -H "api-subscription-key: $SARVAM_API_KEY" -o res.json -w 'results %{http_code}\n'
python3 -m json.tool --no-ensure-ascii res.json | head -100
```

**T6. Optional gemma4 fallback (1 min).** Run it only if T5 is slow or inaccurate. Expect `200` and JSON in `content`.
```zsh
python3 - <<'PY'
import base64, json
img = base64.b64encode(open("invite.jpg", "rb").read()).decode()
schema = json.load(open("invite_schema.json"))
body = {"model": "gemma4", "max_tokens": 1000,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": "Read this wedding invitation. Copy names, dates, times and venues exactly as printed. Use an empty string for anything that is not printed."},
            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + img}}]}],
        "response_format": {"type": "json_schema", "json_schema": {"name": "invite", "strict": True, "schema": schema}}}
json.dump(body, open("gemma.json", "w"))
PY
curl -sS https://api.sarvam.ai/v2/chat/completions -H "api-subscription-key: $SARVAM_API_KEY" -H "Content-Type: application/json" \
  --data-binary @gemma.json -o gemma.out.json -w 'gemma4 %{http_code} %{time_total}s\n'
python3 -c 'import json;d=json.load(open("gemma.out.json"));print(d["choices"][0]["message"]["content"] if "choices" in d else d)'
```

After the tests, check the balance at https://indus.sarvam.ai/billing. These tests should cost a few rupees at most.

---

## 8. Risks

- **Reasoning left on** makes every voice turn slow and can return empty content when `finish_reason` is `"length"`. The off value differs between v1 and v2 (Verdict 1). Mitigation: T4, plus a runtime warning whenever `reasoning_tokens` > 0.
- **Latency is unpublished.** Measure the full STT, LLM and TTS round trip in T1–T4. Show the transcript as soon as it arrives, show the preview card before TTS starts, and stream the TTS.
- **Credits.** The estimated build day exceeds ₹100, and an empty balance makes every call return 402. Mitigation: top up, keep replies short, cache audio for fixed phrases, and check the balance at midday.
- **Shared rate limits.** STT, TTS and 105B each allow 60/min, and Extract 30/min. Poll Document AI every 3–5 s, since the docs don't say whether status polls count.
- **Browser audio.** An empty blob returns 400. 48 kHz Opus and Safari MP4 are unverified (T3). Strip `;codecs=` from the MIME type and stop recording at 25 s. If decoding fails, convert to 16 kHz mono WAV in the browser.
- **Constrained decoding is undocumented.** It is unclear how forced tools and strict schemas treat open objects, union types or optional fields. Mitigation: the explicit schema in §3.2, zod validation, and one fallback to `json_schema`.
- **Document AI on wedding cards.** The model targets forms, IDs and invoices. Its accuracy on decorative fonts and photographed cards, and its job duration, are unknown. Keep the gemma4 fallback behind a flag. Never auto-save; low-confidence and null fields go to review.
- **The docs contradict themselves** (§2c), and the docs MCP returned a self-contradictory answer. Trust the spec, then the specific endpoint page, then MCP summaries. Sarvam shipped SDK releases on 19, 22, 23 and 24 Nov and changed the 105B weights on 22 Nov, so pin `sarvamai@1.1.22` if you use it and check https://docs.sarvam.ai/changelog at 9:00.
- **Key exposure.** Keep every call server-side. Don't use the realtime WebSocket from the browser, because its subprotocol auth exposes the key.
- **Silent typos.** TTS ignores unknown fields. Assert that responses have an `audio/*` content type, and keep field names in one constants file.
- **Script mixing.** With `hi-IN`, English loanwords can come out in Devanagari ("बुक"). The LLM handles mixed script, but keep the transcript editable.
- **Hosting body limits.** If the host caps request bodies (Vercel functions at 4.5 MB), downscale images in the browser before upload.

---

## 9. Unknowns

The test that resolves each one is in brackets.

- Latency of REST STT, 105B time to first token, TTS time to first byte and Extract job duration [T1–T5 measure them].
- Whether `reasoning_effort: null` turns reasoning off on `/v2`, and whether `/v1` really rejects `"none"` [T4b, T4c].
- Whether a forced `tool_choice` with reasoning off behaves normally, and which JSON Schema keywords strict mode honours [T4; if needed, add a `json_schema` variant].
- Whether 48 kHz WebM/Opus and Safari MP4/AAC decode at full quality [T3].
- How `codemix` handles English-only speech with `hi-IN` versus `en-IN` [T3, last step].
- Whether Latin-script keyterms improve recognition of Devanagari output [compare T2 with and without keyterms].
- STT's byte limit, which is not documented. A 30 s WebM clip is about 0.2–0.5 MB, so this is unlikely to matter.
- Whether the "+10% for language detection" surcharge (FAQ only) is real [use explicit codes and avoid the question].
- What "verified user" means, whether hackathon participants get extra credits, and any top-up minimum [the dashboard tonight; ask the organisers about credits].
- Whether a new account starts on pay-as-you-go limits [https://indus.sarvam.ai/rate-limits tonight].
- Whether Document AI status polls count toward the 30/min Extract limit [only matters at scale].
- Document AI accuracy on decorative or photographed cards [the playground tonight, then T5].
- Sarvam Prism's rate limit; whether `sarvam-105b-conversations` supports tool calling; whether the `sarvamai` SDK runs on the Edge runtime. None of these is needed: use the Node runtime and plain `fetch`.
