# 作業指示 2026-08-11 — clean テーマ刷新 & 既定テーマ切替(Phase 1+2)

## 0. この文書について

- 発行: Gino(計画担当)/ HUMAN 承認済み方針に基づく
- 実施: 実装担当モデル(KURO 想定)
- 対象リポジトリ: `~/AION_Project/repos/ai-meeting-assistant`
- **この文書だけで完結するよう、必要な背景・仕様・検証手順をすべて記載する**

## 1. HUMAN 承認済みの方針(変更禁止)

1. デザイン方向: **ダーク基調モダン(Linear dark 風)**。`clean` テーマを洗練されたものに作り直す
2. 既定テーマ: **新規ユーザーのみ `clean` を既定にする**。既存ユーザーの localStorage 保存値は絶対に上書きしない
3. スコープ: **Phase 1+2 のみ**(clean 刷新 + 既定値切替 + 切替メニューへの露出)
4. 前提条件: **機能・DOM構造・ID/クラス名・i18nキー・JSロジックは一切変更しない**。見た目(CSS と最小限のHTML属性)のみ

スコープ外(やってはいけない):
- `config.html` / `css/config.css` の統一(Phase 3 で別途実施)
- brutalism / paper / cli テーマの見た目変更(1px たりとも変えない)
- 絵文字の SVG アイコン化、ボタン配置の DOM 変更、新規依存の追加
- `js/app.js` をはじめとするロジック全般

## 2. 安全ガード(最初に実行)

```bash
cd ~/AION_Project/repos/ai-meeting-assistant
test -f manifest.json
git remote -v | grep -q "gatyoukatyou/ai-meeting-assistant"
```

失敗したら即停止。`~/actions-runner/_work/*` には触れない。

### 承認ルール(リポジトリ AGENTS.md)
- ファイル読み書き・npm/npx・テスト実行: 承認不要
- `git add` / `git commit` / `git push` / `gh` 系: **HUMAN 承認が必要。勝手に実行しない**
- ブランチ: `feat/refresh-clean-theme` を推奨(作成自体は可。コミットは承認後)

## 3. 現状の技術理解(調査済み事実)

- デザインは CSS 変数トークンで駆動。`<html data-style="brutalism|paper|clean|cli">` × `<html data-display-theme="light|dark">` で切替
- `js/theme.js` が localStorage `appStyle` を読み `data-style` を上書き設定する。
- ~~未保存時は `DEFAULT_STYLE` が使われる~~ → **【訂正 2026-08-11 実装時に発見】誤り**。`getStyle()` は `normalizeStyle(localStorage.getItem(...))` を返し、旧 `normalizeStyle` は whitelist に無い値(未保存の `null` 含む)を `'brutalism'` ハードコードで返していた。つまり `DEFAULT_STYLE` は例外時にしか効かず、**新規既定の変更には `normalizeStyle` のフォールバック修正が必須**。実装側で `normalizeStyle` を「whitelist 4値はそのまま返す(保存値 brutalism を保護)/ それ以外は `DEFAULT_STYLE` にフォールバック」に修正済み(HUMAN 承認済み)
- さらに theme.js がアクセントカラー9色のパレットから `--primary` 等を `<html>` の**インライン style** に設定する。つまり実行時、CSS ファイル上の `--primary` 定義は常にインライン値で上書きされる
- i18n キー `theme.clean` / `theme.cli` は `locales/ja.json` / `en.json` に**既存**(新規キー追加は不要)
- `index.html` の `#styleSwitcher` には現在 `brutalism` / `paper` の2択のみ。`config.html` 側の `#uiStyle` には4択ある
- 既知の不整合(今回修正対象):
  - `html[data-style="clean"] .btn-primary` が `#111827` 直書き → アクセントカラーが効かず、dark では背景に埋もれる
  - `input, select, textarea` の `box-shadow: inset 2px 2px 0 rgba(0,0,0,.08)` が全テーマ共通の直書き
  - `.cost-badge` / `.chip-cost-badge` が `background:#fff; color:#000` 直書き
  - `.header-brand h1` の回転バッジ(`rotate(-1.5deg)`+黒枠)が全テーマ共通
  - ダッシュ線(`.header-row-1` の `border-bottom`、`.memo-input-section`、`.timeline-controls`、`.custom-question`、`.cost-popover .cost-section-title`)
  - Webkit スクロールバーが太く黒枠付き(全テーマ共通ルール)
- `css/index.css` 後半(1723行目以降)にモバイル用の上書き層あり。`!important` 多用のため、clean 用ルールは**原則としてその後ろに置かず、既存 clean セクション(1481行目付近)に集約する**

## 4. デザイン仕様(clean 刷新版)

### 4.1 トークン値 — Light

```
--bg:            #f7f8fa
--card-bg:       #ffffff
--modal-bg:      #ffffff
--text:          #17191d
--text-secondary:#5c6370
--border-color:  #e5e7eb
--border-width:  1px
--radius:        10px
--btn-radius:    8px
--shadow-hard:    0 1px 2px rgba(16,24,40,.06)
--shadow-hard-sm: 0 1px 2px rgba(16,24,40,.05)
--shadow-modal:   0 16px 48px rgba(16,24,40,.18)
--surface-muted: #f3f4f6
--ai-response-bg:#f9fafb
--btn-hover-bg:  #f3f4f6
--btn-hover-translate: 0px
--btn-hover-shadow: none
--pattern-image: none
--overlay-bg:    rgba(15,17,21,.5)
--modal-header-bg:  var(--card-bg)
--modal-header-fg:  var(--text)
--modal-close-color: var(--text-secondary)
--toast-bg:      var(--card-bg)
--tab-strip-bg:  transparent
--tab-active-bg: var(--card-bg)
--focus-ring:    0 0 0 3px color-mix(in srgb, var(--primary) 35%, transparent)
--font-body:     var(--font-sans)
--textarea-font: var(--font-sans)
--meeting-mode-bg: linear-gradient(135deg, #0f172a 0%, #1f2937 100%)
```

`--cost-bg` / `--cost-text` / `--accent-blue` / `--accent-green` / `--accent-border-*` は既存 clean の値をベースに、トーンを上記に合わせて微調整してよい(色味の統一が目的)。

### 4.2 トークン値 — Dark(主役)

```
--bg:            #0d0f13
--card-bg:       #15181e
--modal-bg:      #15181e
--modal-text:    #e7e9ee
--text:          #e7e9ee
--text-secondary:#98a0ab
--border-color:  rgba(255,255,255,.09)
--surface-muted: #1b1f26
--ai-response-bg:#181c22
--shadow-hard:    0 1px 2px rgba(0,0,0,.35)
--shadow-hard-sm: 0 1px 2px rgba(0,0,0,.3)
--shadow-modal:   0 16px 48px rgba(0,0,0,.55)
--btn-hover-bg:  #1e232b
--overlay-bg:    rgba(0,0,0,.62)
--modal-header-bg:  var(--card-bg)
--modal-header-fg:  var(--text)
--modal-close-color: var(--text-secondary)
--toast-bg:      #1b1f26
--meeting-mode-bg: linear-gradient(135deg, #0a0c10 0%, #10141a 100%)
--focus-ring:    0 0 0 3px color-mix(in srgb, var(--primary) 45%, transparent)
--accent-blue:   #17202c   --accent-border-blue:   #253248
--accent-green:  #122019   --accent-border-green:  #1d3a2a
--cost-bg:       color-mix(in srgb, var(--warning) 22%, #15181e 78%)
--cost-text:     var(--text)
```

`--primary` / `--primary-hover` / `--accent` / `--accent-light` / `--accent-muted` は **clean 側で定義しない**(theme.js のアクセントパレットのインライン値に委ねる。FOUC 対策としてスタイルシート側には既定のフォールバックとして `--primary:#6366f1; --primary-hover:#4f46e5;` のみ残してよい)

### 4.3 コンポーネント上書き(すべて `html[data-style="clean"]` スコープ)

1. `.btn-primary` / `.btn-primary:hover`: `#111827` 直書きを廃止 → `background: var(--primary); border-color: var(--primary);` / hover は `var(--primary-hover)`
2. `input, select, textarea`: `box-shadow: none`(inset 影を消す)
3. `.header-brand h1`: `transform:none; border:none; box-shadow:none; background:transparent; color:var(--text); padding:0; text-transform:none; letter-spacing:0; font-weight:700;`
4. `.panel-title`: `text-transform:none; font-weight:600;` / `.panel-header`: `font-weight:600;`
5. `.btn`: `font-weight:600;`
6. ダッシュ線の実線化: `.header-row-1`, `.memo-input-section`, `.timeline-controls`, `.custom-question`, `.cost-popover .cost-section-title` → `border-*-style: solid`
7. スクロールバー: `::-webkit-scrollbar{width:8px;height:8px}`、track は `transparent`・枠線なし、thumb は `color-mix(in srgb, var(--text-secondary) 35%, transparent)`・枠線なし・角丸 4px
8. `.cost-badge`, `.chip-cost-badge`: `background: var(--surface-muted); color: var(--text-secondary); border-color: var(--border-color); font-weight:600;`
9. モバイル下部タブ(767px 以下の `.main-tab`): 現行は全タブが `var(--primary)` 塗り。clean では非アクティブを `background: var(--surface-muted); color: var(--text-secondary); box-shadow:none;`、アクティブのみ `background: var(--primary); color: var(--on-primary);`
10. モーダルヘッダー: トークン側で対応済み(`--modal-header-bg` 等)。色収差があれば `html[data-style="clean"] .modal-header` で調整

上記以外のコンポーネント(タブ下線、チップ、トースト等)はトークン追従で自然に変わるはず。**追加の上書きが必要になった場合も必ず `html[data-style="clean"]` スコープに限定すること。**

## 5. 変更タスク(ファイル別)

### Task 1: `css/index.css`
- `html[data-style="clean"]`(1481行目付近)のトークン定義を §4.1 に差し替え
- `html[data-style="clean"][data-display-theme="dark"]`(1553行目付近)を §4.2 に差し替え
- 既存の `html[data-style="clean"] .btn` / `.btn-primary` / `.panel` / `.card` ルールを §4.3 に沿って更新し、§4.3 の残りの上書きを同セクションに追記
- **他テーマ(brutalism/paper/cli)のルール、およびテーマ非依存の共通ルールには触れない**

### Task 2: `js/theme.js`
- `var DEFAULT_STYLE = 'brutalism';` → `var DEFAULT_STYLE = 'clean';`
- **【訂正済み】さらに `normalizeStyle` のフォールバックを `DEFAULT_STYLE` に変更し、whitelist に `'brutalism'` を追加すること**(§3 訂正参照。これをやらないと新規既定化が未達になる)
- それ以外は一切変更しない

### Task 3: `index.html`
- `<html ... data-style="brutalism" ...>` → `data-style="clean"`
- `#styleSwitcher` の `<option value="paper">` の直後に以下を追加(既存 option は変更しない):
  ```html
  <option value="clean" data-i18n="theme.clean">🧹 Clean</option>
  <option value="cli" data-i18n="theme.cli">💻 CLI</option>
  ```

### Task 4: `docs/CHANGELOG.md`
- 既存フォーマットに従い、clean テーマ刷新と既定変更のエントリを追記

### 変更可能ファイルは以上の4つのみ。それ以外の差分が出たら作業を見直すこと。

## 6. 検証(すべて PASS 必須)

```bash
npm run test:ui-smoke
npm run test:config-smoke
npm run test:i18n
npm run test:unit
npm run lint
```

可能なら `npm run test:e2e`(Playwright)も実行。環境都合で失敗する場合は結果を記録して報告。

### 目視検証(スクリーンショット)

1. `npx http-server . -p 8898 -c-1` でローカルサーバを起動
2. **分離テストページ手法**(JS 非依存で確実): リポジトリ直下に一時ファイル `_style_test_tmp.html` を作り、`<html data-style="clean">` 直指定 + `<link href="css/index.css">` + 代表的なコンポーネント(header/panel/tabs/btn/empty-state)を書き並べ、headless Chrome で撮影:
   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
     --window-size=1440,900 --screenshot=/tmp/clean-light.png \
     "http://localhost:8898/_style_test_tmp.html"
   ```
   - clean × light / clean × dark(`data-display-theme="dark"` 併記)× モバイル幅 390px の最低3枚
   - brutalism の同条件ページを同時に撮り、**作業前後で brutalism が完全一致**することも確認(差分ゼロが合格)
3. 実アプリ(index.html)も1枚撮って目視。`data-style` が JS に上書きされる点に注意(localStorage 未保存の新規プロファイル相当で `clean` になることを `--dump-dom` で `<html>` タグを見て確認)
4. 撮った画像は必ず自分で開いて確認し、サーバ停止・一時ファイル削除・`git status` がクリーン(意図した4ファイル+αのみ)であることを確認

## 7. 完了条件(受入基準)

- [ ] clean が新規既定テーマとして適用され、見た目が §4 の仕様に沿った洗練されたものになっている(light/dark 両方)
- [ ] 既存の localStorage `appStyle` 保存値が尊重される(コード上書きがないことを diff で説明可能)
- [ ] `#styleSwitcher` に clean/cli が現れ、切替が動作する
- [ ] アクセントカラー9色が clean の `.btn-primary` 等に正しく反映される
- [ ] brutalism/paper/cli の見た目が完全に不変
- [ ] §6 のテストがすべて PASS
- [ ] 差分が Task 1〜4 の4ファイルのみ

## 8. 作業後の記録

- `handoff/status-2026-08-11.md` を既存 status 文書の形式で作成し、実施内容・検証結果・スクショの所見・残課題(Phase 3: config.css 統一 / Phase 4: 配置洗練)を記録
- コミット・PR は HUMAN 承認後。Conventional Commits(例: `feat: refresh clean theme and make it the default for new users`)

## 9. 参考

- 調査済みスクショ: brutalism 現行は太枠・ハードシャドウ・ドット柄(旧来感の主因)、clean 現行は白ベースで半完成
- 問題箇所の行番号は 2026-08-11 時点の main(`0a24513`)基準。ずれていたらセレクタで探すこと
