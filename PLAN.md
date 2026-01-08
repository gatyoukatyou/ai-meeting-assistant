# Issue #14 実装計画: コンテキスト、会議資料の事前提供

## 概要

会議コンテキスト（目的、参加者、参考資料、過去の決定事項）をLLMプロンプトに統合し、より正確な要約とアイデア生成を実現する。

## 現状分析

### 既に実装済み（#16で完了）
- ✅ コンテキスト入力UI（モーダルフォーム）
- ✅ 目標・参考資料の2つのテキストエリア
- ✅ localStorage への保存・読込機能
- ✅ ステータスバッジ（コンテキスト設定済み表示）
- ✅ i18n対応（14の翻訳キー）

### 未実装（本Issue対象）
- ❌ LLMプロンプトへのコンテキスト注入
- ❌ システムプロンプトのサポート（Claude, OpenAI）
- ❌ エクスポートへのコンテキスト含有
- ❌ 履歴へのコンテキスト保存
- ❌ トークン制限の考慮

---

## 実装タスク

### Phase 1: LLMプロンプト統合（コア機能）

#### Task 1.1: コンテキストフォーマッター関数の作成
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
    parts.push(`【会議の目的】\n${meetingContext.goal}`);
  }
  if (meetingContext.reference) {
    parts.push(`【参考資料・背景情報】\n${meetingContext.reference}`);
  }

  return parts.length > 0
    ? `--- 会議コンテキスト ---\n${parts.join('\n\n')}\n--- コンテキストここまで ---\n\n`
    : '';
}
```

#### Task 1.2: askAI()関数の拡張
**ファイル**: `js/app.js` (行 1988-2189付近)

`askAI()` 関数内のプロンプト構築部分を修正:

```javascript
// Before (現状):
prompt = `${t('ai.prompt.summary')}\n\n${targetText}`;

// After (実装後):
const contextPrefix = formatMeetingContextForPrompt();
prompt = `${contextPrefix}${t('ai.prompt.summary')}\n\n${targetText}`;
```

**全AIクエリタイプに適用**:
- summary（要約）
- opinion（意見）
- idea（アイデア）
- minutes（議事録）
- custom（カスタム質問）

#### Task 1.3: i18nプロンプトテンプレートの更新
**ファイル**: `locales/ja.json`, `locales/en.json`

コンテキスト使用時の指示を追加:

```json
{
  "ai": {
    "prompt": {
      "contextHint": "上記の会議コンテキストを考慮して回答してください。",
      "summary": "以下の会議の文字起こしを要約してください...",
      // 既存のプロンプトはそのまま
    }
  }
}
```

---

### Phase 2: システムプロンプトサポート（品質向上）

#### Task 2.1: callLLMOnce()のシステムプロンプト対応
**ファイル**: `js/app.js` (行 2300-2410付近)

各LLMプロバイダーのAPIコールにシステムプロンプトを追加:

**Claude (Anthropic)**:
```javascript
body: JSON.stringify({
  model: model,
  max_tokens: 4096,
  system: systemPrompt,  // 追加
  messages: [{ role: 'user', content: prompt }]
})
```

**OpenAI / Groq**:
```javascript
body: JSON.stringify({
  model: model,
  messages: [
    { role: 'system', content: systemPrompt },  // 追加
    { role: 'user', content: prompt }
  ]
})
```

**Gemini**:
```javascript
// Geminiはsystem_instructionパラメータを使用
body: JSON.stringify({
  system_instruction: { parts: [{ text: systemPrompt }] },  // 追加
  contents: [{ parts: [{ text: prompt }] }]
})
```

#### Task 2.2: buildSystemPrompt()関数の作成
**ファイル**: `js/app.js`

```javascript
function buildSystemPrompt() {
  let systemPrompt = t('ai.systemPrompt.base');

  if (hasMeetingContext()) {
    systemPrompt += '\n\n' + t('ai.systemPrompt.contextPrefix');
    if (meetingContext.goal) {
      systemPrompt += `\n${t('ai.systemPrompt.goal')}: ${meetingContext.goal}`;
    }
    if (meetingContext.reference) {
      systemPrompt += `\n${t('ai.systemPrompt.reference')}: ${meetingContext.reference}`;
    }
  }

  return systemPrompt;
}
```

#### Task 2.3: システムプロンプト用i18nキーの追加
**ファイル**: `locales/ja.json`, `locales/en.json`

```json
{
  "ai": {
    "systemPrompt": {
      "base": "あなたは会議支援AIアシスタントです。正確で簡潔な回答を心がけてください。",
      "contextPrefix": "以下の会議コンテキストを考慮して回答してください：",
      "goal": "会議の目的",
      "reference": "参考資料"
    }
  }
}
```

---

### Phase 3: エクスポート機能拡張

#### Task 3.1: Markdownエクスポートへのコンテキスト追加
**ファイル**: `js/app.js` (エクスポート関数)

```javascript
function generateMarkdownExport() {
  let md = `# ${meetingTitle}\n\n`;

  // コンテキストセクション追加
  if (hasMeetingContext()) {
    md += `## 会議情報\n\n`;
    if (meetingContext.goal) {
      md += `### 目的\n${meetingContext.goal}\n\n`;
    }
    if (meetingContext.reference) {
      md += `### 参考資料\n${meetingContext.reference}\n\n`;
    }
  }

  md += `## 文字起こし\n${fullTranscript}\n\n`;
  // ...続く
}
```

---

### Phase 4: 履歴へのコンテキスト保存

#### Task 4.1: IndexedDBスキーマ更新
**ファイル**: `js/history-store.js`

meetingContextフィールドを履歴レコードに追加:

```javascript
const meetingRecord = {
  id: Date.now(),
  title: meetingTitle,
  context: meetingContext,  // 追加
  transcript: fullTranscript,
  aiResponses: aiResponses,
  createdAt: new Date().toISOString()
};
```

#### Task 4.2: 履歴復元時のコンテキスト読込
**ファイル**: `js/app.js`

履歴から会議を復元する際にコンテキストも復元:

```javascript
function restoreMeetingFromHistory(record) {
  // 既存のコード
  fullTranscript = record.transcript;

  // 追加
  if (record.context) {
    meetingContext = record.context;
    updateContextIndicators();
  }
}
```

---

### Phase 5: トークン制限対応

#### Task 5.1: コンテキスト文字数制限の実装
**ファイル**: `js/app.js`

```javascript
const CONTEXT_MAX_CHARS = 2000;  // 約500トークン相当

function validateContextLength(text) {
  return text.length <= CONTEXT_MAX_CHARS;
}

function truncateContext(text) {
  if (text.length > CONTEXT_MAX_CHARS) {
    return text.substring(0, CONTEXT_MAX_CHARS) + '...（省略）';
  }
  return text;
}
```

#### Task 5.2: UI警告の追加
**ファイル**: `js/app.js`, `locales/*.json`

コンテキストが長すぎる場合の警告表示:

```javascript
function saveContextFromModal() {
  const goal = document.getElementById('contextGoal').value.trim();
  const reference = document.getElementById('contextReference').value.trim();

  // 文字数チェック
  if (goal.length + reference.length > CONTEXT_MAX_CHARS) {
    showToast(t('context.warning.tooLong'), 'warning');
  }

  // 保存処理...
}
```

---

## 変更対象ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `js/app.js` | コンテキスト統合、システムプロンプト、エクスポート拡張 |
| `js/history-store.js` | コンテキスト保存対応 |
| `locales/ja.json` | 新規i18nキー追加 |
| `locales/en.json` | 新規i18nキー追加 |

---

## 実装順序

1. **Phase 1** (Task 1.1-1.3): LLMプロンプト統合 - 最優先
2. **Phase 2** (Task 2.1-2.3): システムプロンプト - 品質向上
3. **Phase 3** (Task 3.1): エクスポート拡張
4. **Phase 4** (Task 4.1-4.2): 履歴保存
5. **Phase 5** (Task 5.1-5.2): トークン制限

---

## テスト項目

- [ ] コンテキスト設定後、要約生成でコンテキストが反映されること
- [ ] 意見・アイデア生成でコンテキストが考慮されること
- [ ] 各LLMプロバイダー（Gemini, Claude, OpenAI, Groq）で動作すること
- [ ] エクスポートにコンテキストが含まれること
- [ ] 履歴からの復元でコンテキストが復元されること
- [ ] 長いコンテキストでエラーにならないこと

---

## 将来の拡張（本Issue対象外）

- コンテキストテンプレート機能
- ファイルアップロードによる参考資料添付
- 過去の会議からのコンテキスト自動提案
