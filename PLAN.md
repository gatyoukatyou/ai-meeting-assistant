# Issue #14 実装計画（差し替え版）
会議コンテキスト＋会議資料（ファイル）事前提供 ＆「強化オプション」対応

---

## 現状分析

### 既存実装
- **コンテキストモーダル**: 2フィールド（goal, reference）のみ
- **保存**: `localStorage` に `_meetingContext` キーで保存
- **状態**: `meetingContext = { goal: '', reference: '' }` グローバル変数
- **UI**: モーダル形式、ステータスバッジあり
- **LLM統合**: **未実装**（コンテキストがプロンプトに注入されていない）

### 必要な変更
1. コンテキストフィールドを4項目に拡張（goal, participants, handoff, references）
2. 資料添付機能の追加（複数ファイル、IndexedDB保存）
3. 強化オプションスイッチの追加
4. LLMプロンプトへのコンテキスト統合（全経路）
5. 上限制御の実装

---

## Phase 1: コンテキスト注入を全LLM経路へ（最優先）

### Task 1.1: formatMeetingContextForPrompt() 関数作成
**ファイル**: `js/app.js`

```javascript
/**
 * LLMに渡すコンテキスト文字列を生成
 * @returns {string} フォーマット済みコンテキスト
 */
function formatMeetingContextForPrompt() {
  if (!hasMeetingContext()) return '';

  const parts = [];
  if (meetingContext.goal) {
    parts.push(`Goal:\n${meetingContext.goal}`);
  }
  if (meetingContext.participants) {
    parts.push(`Participants:\n${meetingContext.participants}`);
  }
  if (meetingContext.handoff) {
    parts.push(`Handoff:\n${meetingContext.handoff}`);
  }
  if (meetingContext.references) {
    parts.push(`References:\n${meetingContext.references}`);
  }

  return parts.length > 0
    ? `[MEETING_CONTEXT]\n${parts.join('\n\n')}\n[/MEETING_CONTEXT]\n\n`
    : '';
}
```

### Task 1.2: askAI() 関数の修正
**ファイル**: `js/app.js` (askAI関数内)

全てのAIクエリタイプ（summary, opinion, idea, minutes, custom）でコンテキストを注入:

```javascript
// プロンプト構築時にコンテキストを先頭に付与
const contextPrefix = formatMeetingContextForPrompt();
prompt = `${contextPrefix}${t('ai.prompt.summary')}\n\n${targetText}`;
```

### Task 1.3: buildSystemPrompt() 関数作成
**ファイル**: `js/app.js`

```javascript
function buildSystemPrompt() {
  let base = t('ai.systemPrompt.base');
  if (hasMeetingContext()) {
    base += '\n\n' + formatMeetingContextForPrompt();
  }
  return base;
}
```

### Task 1.4: callLLMOnce() のシステムプロンプト対応
**ファイル**: `js/app.js`

各プロバイダーAPIにシステムプロンプトを追加:

| プロバイダー | 実装方法 |
|------------|---------|
| Claude | `system` パラメータを追加 |
| OpenAI | `messages[0]` に `role: 'system'` を追加 |
| Groq | OpenAIと同じ形式 |
| Gemini | `system_instruction` パラメータを追加 |

### Task 1.5: i18nキーの追加
**ファイル**: `locales/ja.json`, `locales/en.json`

```json
{
  "ai": {
    "systemPrompt": {
      "base": "あなたは会議支援AIアシスタントです。正確で簡潔な回答を心がけてください。"
    }
  }
}
```

### 完了条件
- [ ] コンテキスト設定後、要約ボタンで出力にコンテキストが反映される
- [ ] 意見・アイデア・議事録・カスタム質問全てで反映される
- [ ] 全LLMプロバイダー（Gemini, Claude, OpenAI, Groq）で動作する

---

## Phase 2: 資料添付UI＋抽出（デフォルト経路）

### Task 2.1: コンテキストモーダルの拡張
**ファイル**: `index.html`

4フィールドに拡張:
1. 議題・ゴール（goal）
2. 参加者（participants）- 新規追加
3. 引き継ぎ事項（handoff）- 新規追加
4. 参考情報（references）- 既存のreferenceを改名

資料添付UIを追加:
- 添付ボタン（複数選択対応）
- 添付一覧（ファイル名、種類、サイズ、削除ボタン）
- 強化オプションスイッチ

### Task 2.2: データ構造の拡張
**ファイル**: `js/app.js`

```javascript
// 拡張されたコンテキスト構造
let meetingContext = {
  goal: '',
  participants: '',
  handoff: '',
  references: '',
  enhancedDocsEnabled: false,
  updatedAt: 0
};

// 添付ファイル管理
let meetingAttachments = []; // { id, name, mime, size, extractedText, createdAt }
```

### Task 2.3: IndexedDB添付ファイルストア
**ファイル**: `js/attachment-store.js`（新規）

```javascript
const ATTACHMENT_DB_NAME = 'MeetingAttachmentsDB';
const ATTACHMENT_STORE_NAME = 'attachments';

// 添付ファイルの保存（バイナリ + メタデータ）
async function saveAttachment(file) { ... }

// 添付ファイルの取得
async function getAttachment(id) { ... }

// 添付ファイルの削除
async function deleteAttachment(id) { ... }

// 全添付ファイルのクリア
async function clearAllAttachments() { ... }
```

### Task 2.4: ファイル抽出処理
**ファイル**: `js/app.js`

```javascript
/**
 * ファイルからテキストを抽出
 * @param {File} file
 * @returns {Promise<string>} 抽出テキスト
 */
async function extractTextFromFile(file) {
  const mime = file.type;

  // txt/md/json: そのまま
  if (mime.startsWith('text/') || mime === 'application/json') {
    return await file.text();
  }

  // csv/tsv: そのまま
  if (mime === 'text/csv' || mime === 'text/tab-separated-values') {
    return await file.text();
  }

  // PDF: pdf.js使用（CDN or 埋め込み）
  if (mime === 'application/pdf') {
    return await extractPdfText(file);
  }

  // DOCX: mammoth.js使用
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return await extractDocxText(file);
  }

  return `[${file.name}: 未対応形式]`;
}
```

### Task 2.5: 上限定数の定義
**ファイル**: `js/app.js`

```javascript
const ATTACHMENT_LIMITS = {
  MAX_FILES: 5,
  MAX_FILE_SIZE_MB: 10,
  MAX_MATERIAL_CHARS_TOTAL: 30000,
  MAX_MATERIAL_CHARS_PER_FILE: 10000,
  MAX_CONTEXT_CHARS: 8000
};
```

### Task 2.6: 資料テキストをプロンプトに注入
**ファイル**: `js/app.js`

```javascript
function formatMaterialsForPrompt() {
  if (meetingAttachments.length === 0) return '';

  let materialsText = '[MEETING_MATERIALS_EXTRACTED]\n';
  let totalChars = 0;

  for (const att of meetingAttachments) {
    if (totalChars >= ATTACHMENT_LIMITS.MAX_MATERIAL_CHARS_TOTAL) break;

    const remaining = ATTACHMENT_LIMITS.MAX_MATERIAL_CHARS_TOTAL - totalChars;
    const text = att.extractedText.substring(0, Math.min(
      ATTACHMENT_LIMITS.MAX_MATERIAL_CHARS_PER_FILE,
      remaining
    ));

    materialsText += `- file: ${att.name} (${att.mime}, ${formatFileSize(att.size)})\n`;
    materialsText += text + '\n\n';
    totalChars += text.length;
  }

  materialsText += '[/MEETING_MATERIALS_EXTRACTED]\n\n';
  return materialsText;
}
```

### Task 2.7: i18nキーの追加
**ファイル**: `locales/ja.json`, `locales/en.json`

```json
{
  "context": {
    "participantsLabel": "参加者",
    "participantsPlaceholder": "例: 田中（PM）、佐藤（開発リーダー）、鈴木（デザイナー）",
    "handoffLabel": "引き継ぎ事項",
    "handoffPlaceholder": "例: 前回の決定事項、懸案事項など",
    "attachments": {
      "title": "添付資料",
      "addButton": "ファイルを添付",
      "empty": "添付ファイルなし",
      "extracting": "テキスト抽出中...",
      "extracted": "抽出済み",
      "remove": "削除",
      "limitWarning": "上限を超えています（最大{max}ファイル、各{maxSize}MB）",
      "truncated": "（先頭{chars}文字のみ送信）"
    },
    "enhanced": {
      "label": "強化：対応モデルでは資料そのものを送信",
      "hintOn": "PDF等をそのままAPIへ送る場合があります（高精度/高コスト）",
      "hintOff": "抽出テキストのみ送信します（軽量/互換）",
      "unsupported": "このプロバイダはファイル入力に未対応。抽出テキストで送信します。"
    }
  }
}
```

### 完了条件
- [ ] 4フィールドのコンテキスト入力が動作する
- [ ] ファイル添付・削除・再添付が正常に動作する
- [ ] 抽出テキストがプロンプトに注入される
- [ ] 上限超過時にUIで警告が表示される

---

## Phase 3: 強化スイッチ＆対応プロバイダでPDFそのまま送信

### Task 3.1: プロバイダ対応判定関数
**ファイル**: `js/app.js`

```javascript
/**
 * プロバイダがファイル直接送信に対応しているか判定
 */
function providerSupportsEnhancedDocs(provider, model) {
  // OpenAI: GPT-4 Vision対応モデル
  if (provider === 'openai_llm' && model.includes('gpt-4')) return true;

  // Claude: 全モデルでPDF対応
  if (provider === 'claude') return true;

  // Gemini: Pro以上でPDF対応
  if (provider === 'gemini' && (model.includes('pro') || model.includes('flash'))) return true;

  // Groq: 未対応
  return false;
}
```

### Task 3.2: 強化モード時のAPI呼び出し拡張
**ファイル**: `js/app.js`

各プロバイダーでPDFをbase64エンコードして送信:

**Claude**:
```javascript
messages: [{
  role: 'user',
  content: [
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data }},
    { type: 'text', text: prompt }
  ]
}]
```

**OpenAI**:
```javascript
messages: [{
  role: 'user',
  content: [
    { type: 'file', file: { filename: name, file_data: base64Data }},
    { type: 'text', text: prompt }
  ]
}]
```

**Gemini**:
```javascript
contents: [{
  parts: [
    { inline_data: { mime_type: 'application/pdf', data: base64Data }},
    { text: prompt }
  ]
}]
```

### Task 3.3: UI制御（強化スイッチの有効/無効）
**ファイル**: `js/app.js`

```javascript
function updateEnhancedDocsSwitch() {
  const provider = getCurrentLLMProvider();
  const model = getCurrentLLMModel();
  const supported = providerSupportsEnhancedDocs(provider, model);
  const hasAttachments = meetingAttachments.length > 0;

  const toggle = document.getElementById('enhancedDocsToggle');
  toggle.disabled = !supported || !hasAttachments;

  const hint = document.getElementById('enhancedDocsHint');
  if (!supported) {
    hint.textContent = t('context.enhanced.unsupported');
    toggle.checked = false;
    meetingContext.enhancedDocsEnabled = false;
  } else if (!hasAttachments) {
    hint.textContent = t('context.enhanced.hintOff');
  } else {
    hint.textContent = toggle.checked
      ? t('context.enhanced.hintOn')
      : t('context.enhanced.hintOff');
  }
}
```

### 完了条件
- [ ] 強化スイッチが対応プロバイダでのみON可能
- [ ] 非対応プロバイダでは理由が表示される
- [ ] ON時にPDFがファイルとして送信される（少なくとも1プロバイダで確認）
- [ ] OFF時は従来通り抽出テキスト送信

---

## Phase 4: Export/Historyの扱い（任意）

### Task 4.1: Markdownエクスポートへのコンテキスト追加
**ファイル**: `js/app.js`

エクスポートオプションに「コンテキストを含める」チェックボックスを追加（デフォルトOFF）。

```javascript
if (exportOptions.includeContext && hasMeetingContext()) {
  md += `## 会議情報\n\n`;
  if (meetingContext.goal) md += `### 目的\n${meetingContext.goal}\n\n`;
  if (meetingContext.participants) md += `### 参加者\n${meetingContext.participants}\n\n`;
  if (meetingContext.handoff) md += `### 引き継ぎ\n${meetingContext.handoff}\n\n`;
  if (meetingContext.references) md += `### 参考情報\n${meetingContext.references}\n\n`;
}
```

### Task 4.2: 履歴へのコンテキストメタデータ保存
**ファイル**: `js/history-store.js`

```javascript
const meetingRecord = {
  id: Date.now(),
  title: meetingTitle,
  context: {
    goal: meetingContext.goal,
    participants: meetingContext.participants,
    handoff: meetingContext.handoff,
    references: meetingContext.references,
    attachmentsMeta: meetingAttachments.map(a => ({
      name: a.name,
      mime: a.mime,
      size: a.size,
      extractedChars: a.extractedText?.length || 0
    }))
  },
  transcript: fullTranscript,
  aiResponses: aiResponses,
  createdAt: new Date().toISOString()
};
```

### 完了条件
- [ ] エクスポートにコンテキストを含めるオプションが動作
- [ ] 履歴にコンテキストメタデータが保存される

---

## 変更対象ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `index.html` | コンテキストモーダル拡張（4フィールド、添付UI、強化スイッチ） |
| `js/app.js` | コンテキスト統合、システムプロンプト、ファイル処理、強化モード |
| `js/attachment-store.js` | 新規作成 - IndexedDB添付ファイル管理 |
| `js/history-store.js` | コンテキストメタデータ保存対応 |
| `locales/ja.json` | 新規i18nキー追加 |
| `locales/en.json` | 新規i18nキー追加 |

---

## 実装順序まとめ

1. **Phase 1** (Task 1.1-1.5): コンテキスト注入を全LLM経路へ - **最優先**
2. **Phase 2** (Task 2.1-2.7): 資料添付UI＋抽出 - **必須**
3. **Phase 3** (Task 3.1-3.3): 強化スイッチ＆PDF送信 - **重要**
4. **Phase 4** (Task 4.1-4.2): Export/History - **任意**

---

## 上限値（定数）

| 項目 | 値 | 備考 |
|-----|-----|-----|
| MAX_FILES | 5 | 添付ファイル数上限 |
| MAX_FILE_SIZE_MB | 10 | 1ファイルの最大サイズ |
| MAX_MATERIAL_CHARS_TOTAL | 30000 | 抽出テキスト総量 |
| MAX_MATERIAL_CHARS_PER_FILE | 10000 | 1ファイルあたり抽出テキスト |
| MAX_CONTEXT_CHARS | 8000 | コンテキスト4項目合計 |

---

## テスト観点

- [ ] コンテキスト無し/ありで出力が変わる
- [ ] 添付無し/ありで出力が変わる
- [ ] 強化OFF: 全プロバイダで動く（抽出テキスト）
- [ ] 強化ON: 対応プロバイダのみON可能、非対応ではdisable表示
- [ ] 上限超過時: UIで警告、送信は安全にtruncate
- [ ] 連続操作: 添付→削除→保存→再オープンで状態が復元される
- [ ] i18n: 日英で表示崩れなし

---

## 依存ライブラリ（検討）

### PDF抽出
- **pdf.js** (Mozilla) - CDN: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs`
- 軽量代替: テキスト埋め込みPDFのみ対応する簡易実装

### DOCX抽出
- **mammoth.js** - CDN: `https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js`

### 判断基準
- 既存がvanilla JS + CDNなし構成なら、軽量な自前実装を優先
- 必要に応じてCDN追加（CSP更新が必要）
