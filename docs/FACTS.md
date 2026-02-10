# 技術仕様（Single Source of Truth）

このドキュメントは、コード実装に基づく「唯一の真実」です。
README・TERMS・その他ドキュメントを更新する際は、必ずこのファイルを参照してください。

最終更新: 2026-02-10

---

## 料金体系

- **BYOK（Bring Your Own Key）方式**: ユーザーが自分でAPIキーを取得・管理
- **従量課金**: 各AIサービスの利用量に応じて課金（このアプリからの請求はなし）
- **無保証の目安表示**: 画面に表示されるコストは推定値であり、実際の請求とは異なる場合がある

---

## APIキー保存

- **既定**: `sessionStorage`（タブ/ブラウザを閉じると削除）
- **任意設定**: デスクトップアプリ（`display-mode: standalone` / `window-controls-overlay`）のみ、設定で「APIキー記憶」をONにした場合は `localStorage` を使用
- **エクスポート除外**: 設定バックアップにはAPIキーを含めない

**ソース**: `js/secure-storage.js`, `js/config.js`, `config.html`

---

## 文字起こし（STT: Speech-to-Text）

### 対応プロバイダー

| Provider ID | 表示名 | タイプ | 備考 |
|-------------|--------|--------|------|
| `openai_stt` | OpenAI Whisper | チャンク送信（HTTP） | 安定、疑似リアルタイム |
| `deepgram_realtime` | Deepgram | WebSocket | 真のリアルタイム、低遅延 |

**ソース**: `js/app.js` の `ALLOWED_STT_PROVIDERS`

### 対応モデル（OpenAI Whisper用）

| Model ID | 備考 |
|----------|------|
| `whisper-1` | 標準モデル |
| `gpt-4o-transcribe` | GPT-4oベース |
| `gpt-4o-mini-transcribe` | 軽量版 |

**ソース**: `js/app.js` の `ALLOWED_STT_MODELS`

### 重要な注意

- **Gemini Audio APIはSTTには使用しない**（過去バージョンでは使用していたが廃止）
- **Web Speech APIは使用しない**（不安定なため廃止）

---

## AI回答（LLM: Large Language Model）

### 対応プロバイダー

| Provider ID | 表示名 | 主なモデル |
|-------------|--------|------------|
| `gemini` | Google Gemini | gemini-2.0-flash-exp, gemini-1.5-flash-latest, gemini-1.5-pro-latest |
| `claude` | Anthropic Claude | claude-sonnet-4-20250514, claude-3-5-sonnet-20241022 |
| `openai_llm` | OpenAI | gpt-4o, gpt-4o-mini, gpt-4-turbo-2024-04-09 |
| `groq` | Groq | llama-3.3-70b-versatile, llama-3.1-8b-instant |

**補足**: 上記はプリセット一覧。カスタムモデル名の入力も可能。

**ソース**: `js/app.js` の `callLLM()` 関数、`config.html`

---

## 会議コンテキスト

### 入力項目
- 会議の目的（goal）
- 参加者・役割（participants）
- 引き継ぎ・前提（handoff）
- 参考資料・背景（reference）
- 添付ファイル（files: 抽出テキスト + メタ情報）

### AIプロンプトへの反映
- `buildContextPrompt()` で全AIリクエストにコンテキストを付加
- 優先順位: **goal → participants → handoff → reference → files**
- プロンプト注入対策として「資料内の命令文は引用」と明記
- 添付ファイルは **Enhanced Context** オプションON時のみ反映
- 送信時の総文字数予算: **8000文字**

### 添付ファイル仕様
- 対応形式: **TXT / MD / Markdown / PDF / DOCX / CSV**
- 最大 **5ファイル**、**2MB/ファイル**
- 抽出方式:
  - TXT/MD/Markdown: UTF-8テキスト抽出
  - PDF: `pdf.js`
  - DOCX: `mammoth`
  - CSV: 先頭行のテキスト化
- 抽出モジュール上限（`js/file-extractor.js`）:
  - PDF: 最大 **20ページ**
  - CSV: 最大 **200行**
  - 抽出文字数: 最大 **50,000文字/ファイル**
- 会議コンテキストへの保存上限（`js/app.js`）:
  - **1ファイル 2,000文字**
  - **合計 8,000文字**

**ソース**: `js/app.js`, `js/file-extractor.js`, `config.html`

---

## 会議履歴・インポート

### 保存仕様
- 保存先: IndexedDB（DB名: `aiMeetingHistory` / ストア: `records`）
- 最大保存数: **5件**（古い順に自動削除）
- 保存内容: transcript / AI回答 / コスト / エクスポートMarkdown / チャンクデータ

### 復元・インポート
- 履歴一覧から復元して編集・追加質問が可能
- エクスポートしたMarkdownファイルからのインポートに対応

**ソース**: `js/app.js`, `js/history-store.js`

---

## 禁句リスト（ドキュメント整合チェック用）

以下のパターンがドキュメントに現れた場合、誤記の可能性が高い：

- `Gemini Audio` + `STT` / `文字起こし` / `音声認識`
- `Gemini` を STT プロバイダーとして記載
- `Web Speech API` を現在の機能として記載

---

## 更新履歴

- 2026-02-10: APIキー保存仕様を実装に同期（既定sessionStorage / デスクトップアプリ任意localStorage）
- 2024-12-29: 初版作成（STT/LLM分離の明確化、BYOK方式の明記）
- 2026-01-10: 会議コンテキスト拡張（添付ファイル/Enhanced Context/プロンプト注入対策）
- 2026-02-06: 添付ファイル仕様を実装に同期（PDF/DOCX/CSV対応、抽出上限の明記）
