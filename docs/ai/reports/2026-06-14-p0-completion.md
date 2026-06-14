# P0 Reliability Completion Record

Date: 2026-06-14

## Summary

P0 reliability work focused on protecting meeting data, making failures visible, and removing high-risk security or correctness regressions before larger P1 refactoring begins.

The work was intentionally split into small PRs. Each PR kept its scope narrow and avoided UI refresh, large `app.js` splitting, queue persistence, API key storage redesign, and unrelated provider changes.

## Completed PRs

| PR | Area | Outcome |
| --- | --- | --- |
| #138 | Active meeting drafts | Separated incomplete meeting drafts from normal saved history. Added recovery UI, unload protection, and secret field filtering. |
| #139 | STT language setting | Passed the configured `sttLanguage` into the normal Whisper chunk path. `auto` now omits the `language` FormData field. |
| #140 | Transcription queue overflow visibility | Kept the existing bounded queue behavior, but recorded discarded chunks and surfaced warning state instead of silently dropping audio. |
| #141 | Transient HTTP retry | Added retry handling for temporary HTTP failures in `fetchWithRetry` while preserving the existing public API. |
| #142 | Gemini header auth only | Removed Gemini API key URL query fallback and standardized Gemini requests on `x-goog-api-key` header auth. |
| #143 | Debug audio decode gate | Limited debug-only audio duration decoding to `?debug` mode to reduce normal recording CPU and battery cost. |
| #144 | Unused code removal | Removed confirmed unused state, helpers, globals, and no-op resume code without touching live queue or transcript state. |
| #145 | askAI selection scoping | Restricted `askAI` selection capture to intentional content areas and ignored selected UI labels, buttons, tabs, toast, and status text. |

## Reliability Improvements

### Data Protection

- Incomplete meeting data is now stored in `activeMeetingDrafts` instead of being mixed into normal `records`.
- Completed recordings remove their corresponding draft after the official history save.
- Draft payload sanitization avoids saving API keys, authorization values, secrets, tokens, passwords, credentials, and related key patterns.
- Queue overflow is no longer silent. The app now records discard counts and exposes warning state to users and debug views.

### Correctness

- Whisper language settings now match the user setting:
  - `ja` sends `language=ja`.
  - `en` sends `language=en`.
  - `auto` sends no `language` parameter.
- Non-Japanese STT paths avoid injecting Japanese tail prompt context.
- `askAI` no longer treats unrelated selected UI text as the user's intended question context.

### Security

- Gemini API keys are no longer sent through URL query parameters.
- Gemini generation, settings validation, model listing, and model probing now use header-based auth.
- Tests cover the absence of query-key fallback patterns.

### Performance

- `decodeAudioData` duration probing is now gated behind debug mode.
- Normal recording avoids debug-only audio decoding work.

### Maintainability

- Retry behavior is centralized in `FetchRetryService` while keeping the existing `fetchWithRetry(url, options, maxRetries)` wrapper.
- Selection handling is isolated in `SelectionUtils`.
- Confirmed dead code was removed after reference checks.

## Verification Pattern

Across the P0 PRs, the main verification commands were:

```bash
npm run test:unit
npm run lint
npm run test:ui-smoke
git diff --check
```

Where relevant, PR-specific unit tests were added for:

- Active meeting draft storage and sanitization.
- STT language FormData behavior.
- Queue discard visibility.
- HTTP retry and no-retry status handling.
- Gemini URL API key regression prevention.
- Debug-only audio duration decoding.
- Scoped selection handling for `askAI`.

## Known Remaining Issues

These were intentionally left out of P0 PRs to avoid mixing risk domains.

- `npm ci` reports 3 audit findings: 1 moderate and 2 high.
- Full `npm test` has an existing upload-edge failure around `test-upload-edge / test-12mb.txt` size rejection behavior.
- Queue persistence and retryable recovery for discarded audio chunks remain future work.
- Larger `app.js` decomposition remains P1 work.
- Broader UI cleanup and normal-mode console log reduction remain future work.
- Selection scoping still relies mainly on anchor/focus containment. It handles common UI-selection accidents, but a future enhancement could inspect full range contents for unusual cross-region selections.

## Recommended Next Steps

1. Create separate follow-up issues for dependency audit remediation and the existing upload-edge test failure.
2. Start P1 with small extraction PRs around storage/history boundaries before any broad `app.js` restructuring.
3. Keep future PRs narrowly scoped and continue preserving regression tests for each reliability fix.
