# 作業指示書 2026-09-04 — ベース同期 & clean テーマ ship & PRレビュー

## 0. 共通ガードレール（全タスク開始前に必須）

```bash
test -f manifest.json || exit 1
git remote -v | grep -q "gatyoukatyou/ai-meeting-assistant" || exit 1
```

- 破壊的操作（force push / hard reset / branch -D）は本指示書に明記された場合のみ可
- `git push`, `gh pr create`, `gh pr merge`, ブランチ削除は必ず HUMAN 承認を取る
- Conventional Commits / ブランチ命名規約（`feat/`, `fix/`, `docs/`）を遵守

## 1. 前提状態（2026-09-04 時点の検証済み事実）

- ローカル `feat/refresh-clean-theme` = `0a24513` ベース、未コミット差分4ファイル
  - `css/index.css` / `docs/CHANGELOG.md` / `index.html` / `js/theme.js`
  - 未追跡: `handoff/instruction-2026-08-11-clean-theme-refresh.md` / `handoff/status-2026-08-11.md`
- `origin/main` = `314063d`（`0a24513..origin/main` の変更ファイルは **CLAUDE.md と package-lock.json のみ** → テーマ差分と非重複、コンフリクト想定なし）
- 実装自体は handoff `status-2026-08-11.md` のとおり完了・テスト済み（test:unit 289/289, lint PASS）
  - ただし約3週間経過しているため、rebase 後に**全テスト再実行を必須**とする

---

## Task 1【最優先】clean テーマのコミット → rebase → 検証 → PR

**担当**: MuseSpark1.3 (opencode CLI)（実装確定済みのため git 操作・検証・PR化が中心）
**ゴール**: `feat/refresh-clean-theme` の PR を main に対して作成するまで

### 手順

1. **事前チェック**: `git status --porcelain` が §1 の記載と一致することを確認。一致しなければ中断して HUMAN に報告
2. **コミット**:
   ```bash
   git add css/index.css js/theme.js index.html docs/CHANGELOG.md
   git commit -m "feat: refresh clean theme and make it the default for new users"
   ```
   - `handoff/*.md` は**このコミットに含めない**（スコープ拡大防止）。別途 Task 1b で docs ブランチに分離可
3. **ベース同期**:
   ```bash
   git fetch origin --prune
   git rebase origin/main
   ```
   - 期待: コンフリクトなし。**発生した場合は abort して HUMAN に報告**（勝手に解決しない）
4. **テスト再実行**（全て PASS がゴール条件）:
   ```bash
   npm run lint
   npm run test:unit
   npm run test:ui-smoke
   npm run test:config-smoke
   npm run test:i18n
   ```
5. **受入再確認**（handoff status-2026-08-11.md §5 の再検証）:
   - 新規ユーザー（localStorage 未設定）で `data-style="clean"` になること
   - 保存値 `brutalism` / `paper` / `cli` が上書きされないこと（`normalizeStyle` フォールバック = `DEFAULT_STYLE` の確認）
   - `css/index.css` の差分が clean スコープ（`html[data-style="clean"]`）に限定されていること。他テーマ・共通ルールへの影響があれば**タスク中断**
6. **PR 作成**（HUMAN 承認後）:
   ```bash
   git push -u origin feat/refresh-clean-theme
   gh pr create --base main \
     --title "feat: refresh clean theme and make it the default for new users" \
     --body-file <PR本文>
   ```
   - PR本文に `handoff/status-2026-08-11.md` §3（実施内容）・§4（検証結果）・§6（リスク: e2e の networkidle タイムアウトは環境要因）を要約して転記
   - handoff 2件は PR の別コミット（`docs: add 2026-08-11 clean theme handoff`）として push してもよい

### 完了条件
- PR URL が HUMAN に報告されていること

---

## Task 2【並行可】ローカル main の fast-forward

**担当**: MuseSpark1.3 (opencode CLI)
**ゴール**: ローカル main を origin/main に一致させる

```bash
git checkout main
git pull --ff-only
git checkout feat/refresh-clean-theme
```

- `--ff-only` 以外は禁止。失敗したら HUMAN に報告
- 依存関係: Task 1 の rebase とは独立。いつ実行してもよいが Task 1 のコミット前後の作業と混ぜない（stash 等で事故る前に単独で実施）

---

## Task 3 PR #211 レビュー（Local LLM / Issue #208 Phase 1）

**担当**: MuseSpark1.3 (opencode CLI)（レビュー役）
**対象**: `agent/6hHvgPXvvGvpWQHH` → DRAFT, MERGEABLE, レビューなし

### レビューチェックリスト
- [ ] `local_llm` プロバイダが keyless（APIキー入力なし）で動作する設計か。秘匿情報を localStorage / ログに残していないか
- [ ] CSP `connect-src` の localhost / 127.0.0.1 許可がワイルドカードや外部ホストに広がっていないか
- [ ] Base URL プリセット（Ollama :11434 / LM Studio :1234）と `/v1/models` discovery のエラーハンドリング（未起動・CORS・タイムアウト）
- [ ] コスト計算が常に ¥0 になることの単体テスト有無
- [ ] i18n: ja/en のキー数同期（`npm run test:i18n`）。新規キー7個（localLlmBaseUrlUnset 等）の ja/en 両対応
- [ ] `docs/PRIVACY.md` / API_MODEL_SUPPORT の記載が実装と一致
- [ ] スコープ: Phase 2（iPhone/Tailscale）に踏み込んでいないか（Issue #208 の HUMAN 決定 2026-08-27 を遵守）

### 判定後
- 問題なければ `gh pr ready 211`（承認後）+ レビューコメント
- 指摘があればレビューコメントで返す（直接 push 修正はしない）

---

## Task 4 PR #209 レビュー（Realtime WebRTC smoke test / Issue #207）

**担当**: MuseSpark1.3 (opencode CLI)（レビュー役）
**対象**: `feat/realtime-webrtc-smoke` → DRAFT, MERGEABLE

### レビューチェックリスト
- [ ] 製品コード（`js/`, `index.html`）に影響する変更を含まない smoke test のみの PR か（テストコードとCI設定のみであること）
- [ ] OpenAI Realtime API のキーをテスト内で要求しない（keyless / ダミーで動くか）
- [ ] CI で flaky にならないか（ネットワーク依存・タイムアウト設定）
- [ ] Issue #207 の「検討」段階に照らし、スコープが適切か

---

## Task 5 ブランチ整理（HUMAN 承認後に実行）

**担当**: MuseSpark1.3 (opencode CLI)

### 対象候補
1. upstream 消失済みローカルブランチ（6本）:
   `docs/handoff-2026-07-11`, `fix/ask-ai-selection-scope`, `fix/debug-audio-decode-gate`, `fix/gemini-header-auth-only`, `fix/remove-unused-code`, `fix/stt-language`
2. `worktree-agent-*`（3本）: 対応worktreeの残骸の可能性 → `git worktree list` で確認

### 手順
```bash
# 削除前にマージ済み確認（全て一覧で HUMAN に提示）
git branch --merged origin/main | grep -E "handoff-2026-07-11|ask-ai|debug-audio|gemini-header|remove-unused|stt-language|worktree-agent"
# 確認後（承認を得てから）
git branch -d <branch...>
```

- `-D`（force）は `--merged` に出てこないブランチのみ、個別に HUMAN 承認を取ってから

---

## Task 6 次フェーズの方向性決定（HUMAN 判断 + 各AI準備）

以下のいずれかを本日中に決め、翌日の指示書に反映する:

| 案 | 内容 | 前提 |
|----|------|------|
| A | Issue #208 Phase 2（ローカルLLM: iPhone/Tailscale対応） | PR #211 が Ready 化していること |
| B | Issue #207 本実装（Realtime API リアルタイム音声回答） | PR #209 の smoke 結果を踏まえる |
| C | clean テーマ Phase 3/4（config.html 適用・レイアウト洗練） | Task 1 の PR がマージ済みであること |

- JEM: 案A/B の技術調査・WBS
- Gino: 指示書ドラフトのレビュー
- KURO: 実装担当としての見積り

---

## 実行順序まとめ

```
Task 1（commit → rebase → test → PR）
  ├─ Task 2 は並行でOK（ただし単独で実施）
  ├─ Task 3 / Task 4（レビュー）は Task 1 の push 待ちの間に実施可
Task 5 は Task 1 の PR 作成後にまとめて提示 → 承認 → 削除
Task 6 は日中のどこかで HUMAN と合議
```
