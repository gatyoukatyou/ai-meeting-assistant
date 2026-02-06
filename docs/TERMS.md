# 利用規約 / Terms of Service

最終更新日 / Last Updated: 2026-02-06

---

## 日本語（Japanese）

### はじめに
本利用規約は、「AI参加会議」（以下「本アプリ」）の利用条件を定めるものです。
本アプリを利用した時点で、本規約に同意したものとみなされます。

### サービスの性質
本アプリは、ブラウザ上で動作するクライアントサイド中心のアプリケーションです。
開発者は、ユーザーの会議内容や文字起こし結果を収集・保存・送信しません。

### ローカル保存について
本アプリは利便性のため、会議履歴（文字起こし・AI回答）をブラウザのIndexedDBに保存します（最大5件）。
会議コンテキスト（目的/参考情報/添付資料の抽出テキスト）は、既定でsessionStorage（タブ/セッション限定）に保存されます。
設定で「会議情報を次回も保持する」を有効にした場合のみ、会議コンテキストはlocalStorageに保存されます。
不要になったデータは履歴削除や設定のクリアで削除してください。

### APIキー（BYOK）について
本アプリは BYOK（Bring Your Own Key）方式を採用しています。
ユーザーは自己責任で取得した以下のAPIキーを使用します。

- OpenAI API
- Anthropic Claude API
- Google Gemini API
- Groq API
- Deepgram API
- その他対応するAIサービス

APIキーはブラウザのsessionStorage（タブ/セッション限定）に保存され、タブ/ブラウザを閉じると削除されます。
APIキーは別タブへは共有されず、設定のエクスポートにも含まれません。開発者のサーバーには送信されません。

### 免責事項
本アプリは「現状有姿」で提供されます。
開発者は、本アプリの正確性、完全性、特定目的への適合性について、いかなる保証も行いません。

本アプリの利用により生じたいかなる損害についても、開発者は責任を負いません。

### 規約の変更
本規約は予告なく変更されることがあります。
変更後も利用を継続した場合、変更に同意したものとみなされます。

---

## English

### Introduction
These Terms of Service govern the use of "AI Meeting Assistant" (the "Application").
By using the Application, you agree to be bound by these terms.

### Nature of the Service
The Application operates primarily as a client-side, browser-based tool.
The developer does not collect, store, or transmit meeting audio, transcripts, or content.

### Local Storage
For convenience, the Application stores meeting history (transcripts and AI responses) in browser IndexedDB (max 5 records).
Meeting context (goals, references, extracted attachment text) is stored in sessionStorage by default (tab/session scope).
Only when the "Persist meeting context across sessions" option is enabled, meeting context is stored in localStorage.
Remove this data via history clear or settings reset when no longer needed.

### API Keys (BYOK)
The Application uses a Bring Your Own Key (BYOK) model.
Users must provide their own API keys for supported AI services, such as:

- OpenAI API
- Anthropic Claude API
- Google Gemini API
- Groq API
- Deepgram API
- Other supported AI services

API keys are stored in browser sessionStorage (tab/session scope) and are cleared when the tab/browser is closed.
API keys are not shared across tabs and are excluded from settings export. They are never sent to the developer's servers.

### Disclaimer
The Application is provided "as is," without warranties of any kind.
The developer makes no guarantees regarding accuracy, completeness, or fitness for a particular purpose.

The developer shall not be liable for any damages arising from the use of the Application.

### Changes to the Terms
These terms may be updated without prior notice.
Continued use of the Application constitutes acceptance of the updated terms.
