# ai-meeting-assistant Claude Code Configuration

## Project Overview
AI参加会議 - 会議中にAIがリアルタイム参加し、文字起こし・要約・意見・アイデア提案を行うPWA。

- **Type**: PWA (Progressive Web App)
- **Tech Stack**: HTML, JavaScript, CSS (vanilla, no framework)
- **Hosting**: GitHub Pages
- **URL**: https://gatyoukatyou.github.io/ai-meeting-assistant/

## Common Commands

```bash
# Local development
npx http-server . -p 8080

# Linting
npx eslint .

# Tests
node scripts/ui_smoke_check.mjs
node scripts/check-docs-consistency.sh
```

## Conventions

- **Commits**: Conventional Commits (feat:/fix:/docs:/chore:)
- **Branches**: `feat/`, `fix/`, `docs/` prefixes
- **Language**: JavaScript (ESM), no TypeScript
- **No build step**: vanilla HTML/JS/CSS, served directly

## Session Exit Rule

**セッション終了前に必ず `/wrapup` を実行すること。**

- ユーザーが「終了」「おしまい」「ありがとう」等でセッション終了の意図を示した場合、まず `/wrapup` を実行してからセッションを終了する
- `/wrapup` を実行せずにセッションを終了してはならない
- SessionEnd hook が `/wrapup` 未実行を検出した場合、警告が表示される
