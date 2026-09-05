# API / model support record

Official information verified on **2026-08-01**. The application is browser-only BYOK;
browser CORS behavior is not guaranteed by any entry in this document. Meeting content is
sent directly to the selected provider. API keys remain under the existing session-storage
policy and are excluded from exports.

## Supported LLM presets

| Provider | Presets shown by default | Task policy | Official sources |
|---|---|---|---|
| Google Gemini | `gemini-3.6-flash`, `gemini-3.5-flash-lite` | minutes/summary: `thinkingLevel=minimal`; advice: `high` when enabled | [models](https://ai.google.dev/gemini-api/docs/models), [thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [deprecations](https://ai.google.dev/gemini-api/docs/deprecations) |
| OpenAI | `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.6-sol` | summary: `reasoning_effort=low`; advice: `medium` when enabled | [models](https://developers.openai.com/api/docs/models), [model guidance](https://developers.openai.com/api/docs/guides/latest-model), [comparison/pricing](https://developers.openai.com/api/docs/models/compare) |
| Anthropic | `claude-sonnet-5`, `claude-haiku-4-5-20251001` | Sonnet 5 summary: thinking disabled; advice: adaptive/high. No manual `budget_tokens` on Sonnet 5 | [models](https://platform.claude.com/docs/en/about-claude/models/overview), [thinking](https://platform.claude.com/docs/en/build-with-claude/thinking), [pricing](https://platform.claude.com/docs/en/about-claude/pricing) |
| Groq | `openai/gpt-oss-120b`, `openai/gpt-oss-20b` | summary: low effort; advice: medium when enabled; reasoning text excluded | [models and prices](https://console.groq.com/docs/models), [reasoning](https://console.groq.com/docs/reasoning), [deprecations](https://console.groq.com/docs/deprecations) |
| DeepSeek | `deepseek-v4-flash` | summary: thinking disabled; advice: thinking enabled/high | [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion), [models and pricing](https://api-docs.deepseek.com/quick_start/pricing), [thinking](https://api-docs.deepseek.com/guides/thinking_mode) |
| Local LLM (Ollama / LM Studio) | No fixed presets — model list is fetched live from `GET {baseUrl}/models`, or entered manually | No API key required; reasoning controls are not applied | [Ollama OpenAI compatibility](https://github.com/ollama/ollama/blob/main/docs/openai.md), [LM Studio local server](https://lmstudio.ai/docs/local-server) |

Local LLM only connects to `http://localhost:*` or `http://127.0.0.1:*` (enforced by the
CSP `connect-src`), matching Phase 1 scope: a server already running on the same machine
as the browser. LAN access from another device (e.g. an iPhone reaching the Mac mini) is
out of scope for Phase 1 and tracked as Phase 2 (Tailscale/TLS, CORS, auth) in
[Issue #208](https://github.com/gatyoukatyou/ai-meeting-assistant/issues/208).

CORS prerequisite: when the app itself is served from a non-local origin (e.g. GitHub
Pages), the browser sends that origin to the local server, and Ollama's default
`OLLAMA_ORIGINS` (localhost origins only) rejects the request. Either serve the app
locally (e.g. `npx http-server`) or start Ollama with `OLLAMA_ORIGINS` configured.
LM Studio requires enabling CORS in its local server settings.

Groq's `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` remain recognizable only
so saved settings can be shown with a migration recommendation. Groq announced an
August 16, 2026 shutdown for developer/free tiers. DeepSeek's retired
`deepseek-chat` and `deepseek-reasoner` are not offered as new presets.

## Supported STT presets

| Provider | Presets | Billing shown by the app | Official sources |
|---|---|---|---|
| OpenAI Transcribe | `gpt-4o-mini-transcribe` (standard), `gpt-4o-transcribe` (accuracy), `whisper-1` (legacy) | `whisper-1`: $0.006/min. GPT-4o transcription uses audio tokens; when usage is unavailable the app says estimate unavailable | [mini model](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe), [full model](https://developers.openai.com/api/docs/models/gpt-4o-transcribe), [Whisper](https://developers.openai.com/api/docs/models/whisper-1) |
| Deepgram realtime | `nova-3-general` | $0.0048/min pay-as-you-go monolingual streaming reference | [models](https://developers.deepgram.com/docs/model), [pricing](https://deepgram.com/pricing) |
| OpenAI Realtime Transcribe | `gpt-4o-transcribe` (accuracy), `gpt-4o-mini-transcribe` (standard) | $0.006/min / $0.003/min realtime transcription reference (session-duration based) | [Realtime WebSocket guide](https://developers.openai.com/api/docs/guides/realtime-websocket), [pricing](https://openai.com/api/pricing/) |

The existing OpenAI path uploads completed audio chunks to
`/v1/audio/transcriptions`; this is not the OpenAI Realtime API. Deepgram remains the
true WebSocket realtime path. The OpenAI default changed for new settings only. Existing
saved `whisper-1` selections are preserved.

The OpenAI Realtime Transcribe provider (`openai_realtime`) streams microphone PCM16
(24 kHz) over a WebSocket to `wss://api.openai.com/v1/realtime?intent=transcription`,
authenticated with a short-lived ephemeral key minted via
`POST /v1/realtime/transcription_sessions`. It shares the OpenAI API key with the
chunked path; `whisper-1` is not selectable on the realtime path (batch only) and
falls back to `gpt-4o-transcribe`.

## Cost estimate limits

- LLM estimates use provider-reported usage and the catalog's USD-per-million-token rate.
- If usage is absent, token counts are explicitly heuristic; the UI remains an estimate.
- Unknown custom models do not receive an invented fallback price.
- UI conversion uses **1 USD = 150 JPY**, fixed and verified for display policy on
  2026-08-01; it is not a live exchange rate or an invoice.
- Claude Sonnet 5 uses its introductory price through 2026-08-31; recheck after that date.
- DeepSeek documents possible future peak pricing, so its displayed estimate is a reference.
- Local LLM cost is always shown as ¥0 — it runs on hardware the user already owns,
  never falls into the "unknown estimate" case, and is excluded from cost alerts.

## HUMAN evaluation still required

No API keys, anonymized Japanese meeting transcript, or common Japanese audio sample were
available during implementation, so no quality ranking was asserted and no paid API call was
made. Before release:

1. Use one anonymized transcript and the same prompts for every LLM preset.
2. Record hallucinated facts, missed decisions, owner/deadline accuracy, action precision and
   recall, readability, advice specificity, latency, API errors, and actual provider cost.
3. Use one Japanese audio file to compare all three OpenAI transcription presets. Record WER
   or corrected-character count, latency, and actual billed usage.
4. Keep Gemini as the baseline, but select production defaults from measured results rather
   than a presumed quality ranking.

## Preset verification cadence

Model and pricing presets in `js/lib/provider-catalog.js` are re-verified against the
official sources above at least every 90 days (`VERIFIED_AT`, currently 2026-08-01).
`tests/unit/provider-catalog.test.mjs` fails once the verification is older than 90 days;
when it does, re-check every preset and price against the provider docs, update stale
entries, and bump `VERIFIED_AT` (also update this document and the README preset examples).

Do not put real API keys, raw confidential meeting data, or provider responses containing
sensitive content in repository fixtures.
