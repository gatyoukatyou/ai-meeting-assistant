# 作業指示書 2026-09-04 — clean テーマ Phase 3/4（config.html 適用 & 配置洗練）

**担当**: MuseSpark1.3 (opencode CLI)
**前提**: PR #212（clean テーマ刷新 Phase 1+2）マージ済み（main `41d03ef`）

## 0. 共通ガードレール（全タスク開始前に必須）

```bash
test -f manifest.json || exit 1
git remote -v | grep -q "gatyoukatyou/ai-meeting-assistant" || exit 1
```

- `git push` / `gh pr create` / `gh pr merge` は必ず HUMAN 承認を取る
- Conventional Commits / ブランチ命名規約を遵守
- **1 Issue → 1 PR**: Phase 3 と Phase 4 は別PR（Phase 4 は Phase 3 のマージ後に着手）

## 1. 前提状態と技術調査結果（2026-09-04 検証済み）

- ベースは `origin/main`（`41d03ef`）から切ること
- **config.css に既存の clean トークンブロックが存在するが、index.css の新仕様と乖離している**:
  - `css/config.css:94-131` — light: `--bg: #fafafa`, `--primary: #3b82f6`, `--primary-hover: #2563eb`
  - `css/index.css:1481-1526`（正）— light: `--bg: #f7f8fa`, `--primary: #6366f1`, `--primary-hover: #4f46e5`, radius 10px / btn-radius 8px ほか
- `js/theme.js:10` `DEFAULT_STYLE = 'clean'`、`normalizeStyle` フォールバックは `DEFAULT_STYLE`（#212 で確定。**変更禁止**）
- index.css の clean ブロックには「theme.js のインライン値が実行時優先される」コメントあり → **アクセント色9色のインライン `--primary` が config.html でも伝播するか要検証**
- config 側の構成: `config.html`（433行、`#uiStyle` セレクタあり）/ `css/config.css`（655行）

---

## Task 1【Phase 3】config.html / css/config.css の clean テーマ統一

**ブランチ**: `feat/theme-phase3-config-clean`（main から切る）

### 手順

1. **トークン同期**（`css/config.css` の clean ブロックを index.css 仕様に合わせる）:
   - `html[data-style="clean"]`（light）: `--bg: #f7f8fa`, `--primary: #6366f1`, `--primary-hover: #4f46e5` を最低限修正。radius / border / shadow 系トークンも index.css §clean と突き合わせて一致させる
   - `html[data-style="clean"][data-display-theme="dark"]`: index.css の dark 仕様（bg `#0d0f13` / card `#15181e` / text `#e7e9ee` / border `rgba(255,255,255,.09)` / toast `#1b1f26` / shadow-modal `0 16px 48px`）と一致させる
   - **差分は clean スコープのブロック内のみ**。paper / cli / `:root`（brutalism 相当）には触れない
2. **コンポーネント確認**（必要なら clean スコープ追記のみ）:
   - `config.html` の `setting-card` / `setting-label` / `setting-input` / 保存ボタン / ヘッダーが light・dark とも仕様見た目になること
   - 入力欄の inset 影除去（index.css と同じ `box-shadow: none` 方針）
3. **アクセント色伝播検証**:
   - index.html でアクセント色を変更 → config.html を開いて `.btn-primary` 等に反映されるか確認（theme.js のインライン適用が config ページでも走るか）
   - 反映されない場合は `js/theme.js` の初期化フローを確認（ロジック変更が必要になる場合は **変更せず報告**）
4. **テスト**:
   ```bash
   npm run lint && npm run test:unit && npm run test:ui-smoke && npm run test:config-smoke && npm run test:i18n
   ```
5. **視覚検証**（Phase 1+2 で実施した分離テストページ + computed style 手法を踏襲）:
   - config.html の light/dark × clean の computed style を Playwright で確認
   - **非退行確認**: brutalism / paper / cli で config.html の見た目が変わらないこと（before/after スクショまたは computed style 比較）
6. **受入基準**:
   - [ ] config.html が clean 既定で新仕様の見た目（light/dark）
   - [ ] index.css と config.css の clean トークンが一致
   - [ ] 他テーマ3種の非退行
   - [ ] 全テスト PASS
   - [ ] 差分は `css/config.css`（+必要最小限の `config.html`）に限定
7. **PR作成**（HUMAN 承認後）: `feat: apply clean theme tokens to config page (Phase 3)`。PR本文に乖離の発見経緯と検証結果を記載

---

## Task 2【Phase 4】配置の洗練（Task 1 マージ後に着手）

**ブランチ**: `feat/theme-phase4-layout-refinement`

### スコープ（handoff status-2026-08-11.md §7 より）
- ヘッダー・下部タブの本格的なレイアウト調整（**DOM 変更を含む領域**）

### 制約
- DOM 変更は全テーマに影響するため、**構造変更は共通側、見た目調整は各テーマのスコープ内**に分離
- index.html の DOM を変える場合は `scripts/ui_smoke_check.mjs` が壊れないこと（セレクタ依存の確認）
- モバイル（390px）下部タブの非アクティブ/アクティブ仕様（Phase 1+2 で確認済みの surface-muted/primary）を維持
- **本タスクの具体的デザイン案は HUMAN との目視すり合わせが必要** → 実装前にキャプチャ＋変更案を提示して承認を取ること（いきなりコミットしない）

---

## 実行順序

```
Task 1（Phase 3）→ PR → HUMAN 承認・マージ
Task 2（Phase 4）→ デザイン案提示 → HUMAN 承認 → 実装 → PR
```

## 残タスク（本指示書のスコープ外）
- PR #211 の要修正2件（CSP不整合・Ollama CORS/タイムアウト）— MuseSpark1.3 が対応中
- PR #209 の smoke-only 分割 — 別指示
- pr2〜pr6c worktree の利用可否確認（ブランチ削除の後続タスク）
