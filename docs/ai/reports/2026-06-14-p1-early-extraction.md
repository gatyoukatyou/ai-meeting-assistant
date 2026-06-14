# P1 Early Extraction Record

Date: 2026-06-14

## Summary

P1 early extraction work avoided a broad `app.js` split, ESM conversion, TypeScript conversion, or UI refresh. Instead, it continued from the P0 reliability work by extracting small, DOM-independent, pure-function-oriented pieces around history, storage, and history list preparation.

The goal was to reduce `app.js` responsibility without changing user-facing behavior, storage schemas, saved data formats, toast copy, or active meeting draft runtime behavior.

## Completed PRs

| PR | Area | Outcome |
| --- | --- | --- |
| #149 | History backup service | Extracted backup JSON parsing, import record normalization, and backup payload creation into `HistoryBackupService`. |
| #150 | History import validation | Extracted the empty importable records check into `HistoryBackupService.hasImportableRecords()`. |
| #151 | Backup file naming | Extracted `meeting-history-backup-YYYY-MM-DD.json` generation into `HistoryBackupService.buildBackupFileName()`. |
| #152 | History list display preparation | Extracted DOM-independent `title`, `savedAt`, `duration`, and `summaryPreview` preparation from `renderHistoryList()` into `HistoryListService`. |

## What Changed

- Some pure history backup import/export logic moved out of `app.js`.
- `HistoryBackupService` now owns small backup import/export responsibilities:
  - Backup JSON parsing.
  - Imported record normalization.
  - Backup payload creation.
  - Empty importable record checks.
  - Backup file name generation.
- `HistoryListService` now prepares per-record display metadata before DOM rendering.
- Unit tests were added for the extracted services and preserved existing behavior.

## What Did Not Change

- No history list DOM structure changed.
- No history UI copy or toast text changed.
- No IndexedDB schema changed.
- No saved data format changed.
- No history record ordering changed.
- No active meeting draft runtime behavior changed.
- No export Markdown output changed.

## What Was Intentionally Avoided

- Active draft runtime orchestration.
- Active meeting draft save timer changes.
- Restore modal DOM flow.
- Recording provider lifecycle.
- IndexedDB schema changes.
- Saved data format changes.
- History list record order changes.
- Export Markdown extraction or output changes.
- Large `app.js` split.
- ESM conversion.
- TypeScript conversion.
- UI refresh.

## Verification Pattern

Across the P1 early extraction PRs, the usual local verification pattern was:

```bash
node --test tests/unit/<target>.test.mjs
npm run test:unit
npm run lint
npm run test:ui-smoke
git diff --check
```

GitHub Actions `lint` and `ui-smoke` also passed for each PR.

## Remaining Known Issues

These remain outside the P1 early extraction scope:

- #147: Existing upload-edge test failure investigation.
- #148: `npm ci` audit findings investigation.
- Queue persistence and discarded chunk recovery.
- Normal-mode console log reduction.
- Active draft runtime extraction is not started yet.
- Export Markdown extraction is the next candidate area.

## Recommended Next Steps

1. Investigate pure logic around export Markdown as the next likely extraction area.
2. For the first export Markdown PR, report 2-3 extraction candidates and implement only one.
3. Do not change export output format, Markdown body text, file names, toast copy, or timing.
4. Continue avoiding active draft runtime, restore modal DOM flow, and recording provider lifecycle.
5. Keep PRs small enough that behavior preservation is easy to review.
