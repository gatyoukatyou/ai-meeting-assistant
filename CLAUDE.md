# ai-meeting-assistant Claude Code Configuration

<!-- aion-ops bootstrap v2026-07-02 | 正本: gatyoukatyou/aion-ops | このブロックは編集せず雛形から再配布する -->

## 共通運用ルール（正本 = aion-ops）

このリポジトリの3AI運用（KURO / Gino / JEM ＋ HUMAN）の共通ルールは、
**すべて `gatyoukatyou/aion-ops` を唯一の正本（canonical）とする**。
ここには**ルール本体を書き写さない**。必ず正本を読むこと。矛盾時は aion-ops を優先し、迷えば停止してHUMAN確認。

### 起動時にやること（環境別）

- **ローカル版 Claude Code**：起動を `claude --add-dir ~/AION_Project/aion-ops` で行う。
  （aion-ops をローカルに未cloneなら1回だけ
  `git clone https://github.com/gatyoukatyou/aion-ops.git ~/AION_Project/aion-ops`）
- **Web版 Claude Code**：セッション作成時に、作業repoと `gatyoukatyou/aion-ops` を**同時に選択**する。
  単一repoセッションで aion-ops が見えない場合は、cloneで回避しようとせず、HUMANに複数repoセッションの作成を依頼する。

### 最初に読む正本（順に）

1. `aion-ops/docs/operations/minimal-operating-rules.md` — まず守る6項目（最上位サマリ）
2. `aion-ops/docs/operations/todoist-operation-rules.md` — Todoist運用（ボード・ラベル・ライフサイクル・権限境界）
3. `aion-ops/docs/operations/github-workflow.md` — GitHub運用
4. `aion-ops/agents/kuro-claude.md` — KUROの役割・境界
5. `aion-ops/templates/handoff-brief-template.md` — 節目ごとのhandoff書式（HUMAN判断待ちを最上段に置く）

### GitHub / Todoist の更新について

- 作業repoへの commit / PR / Issue は標準機能で行う。**main へ直接pushしない。mergeはHUMANのみ。**
- 節目のhandoffは `repo/handoff/status-YYYY-MM-DD.md` を正本とし、要約をTodoist親カードのコメントに投稿する。
  そのコメントは **Web版Claude と Gino（ChatGPT）が直接読む**（両者で実測済み。Gino向けの長文手動コピペは原則不要）。
- Todoist更新は、Claude Code にユーザースコープで Todoist MCP を追加済みであれば全repoで可能。
- 機微情報は GitHub・Todoist・handoff のいずれにも書かない。

<!-- /aion-ops bootstrap -->

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
