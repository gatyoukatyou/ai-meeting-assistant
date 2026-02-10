# ai-meeting-assistant AI Agent Instructions

## Project Identity
- **Project**: ai-meeting-assistant
- **Repository**: https://github.com/gatyoukatyou/ai-meeting-assistant
- **Type**: PWA (Progressive Web App)
- **Tech Stack**: HTML, JavaScript, CSS (vanilla)

## AI Team Roles

| Agent | Tool | Role |
|-------|------|------|
| KURO | Claude Code | 設計・実装（プライマリ） |
| Codex | OpenAI Codex CLI | レビュー・小規模修正 |
| JEM | Gemini CLI | 教育レポート・要約・UX助言 |

## Safety Guardrails

Before any read/write operation, verify:

```bash
test -f manifest.json
git remote -v | grep -q "gatyoukatyou/ai-meeting-assistant"
```

### STOP IMMEDIATELY if any check fails
- Wrong remote (not ai-meeting-assistant)
- Not at repo root

## Forbidden Directories
- `~/actions-runner/_work/*` (CI/CD only)

## Project Overview

会議中にAIがリアルタイム参加し、文字起こし・要約・意見・アイデア提案を行うPWA。

### Key Features
- STT: OpenAI Whisper / Deepgram (WebSocket)
- LLM: Gemini, Claude, OpenAI, Groq
- BYOK (Bring Your Own Key) 方式
- 多言語対応（日本語・英語）
- GitHub Pages でホスティング

## Conventions

### Commits
- Format: Conventional Commits (feat:/fix:/docs:/chore:)

### Branches
- Naming: `feat/`, `fix/`, `docs/` prefixes

## Common Commands

```bash
# Development (local server)
npx http-server . -p 8080

# Linting
npx eslint .

# Tests
node scripts/ui_smoke_check.mjs
```

## Key Documents

- `docs/CHANGELOG.md` - Version history
- `docs/SECURITY.md` - Security documentation
- `docs/PRIVACY.md` - Privacy policy
- `README.md` - Project overview

## Approvals

**Auto-approve (no confirmation needed):**
- File reads, writes, edits
- npm/npx commands
- Test commands

**Must request approval:**
- `git add`, `git commit`, `git push`
- `gh pr create`, `gh pr merge`
- `gh issue`, `gh release`
