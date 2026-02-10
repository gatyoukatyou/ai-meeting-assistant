# プライバシーポリシー / Privacy Policy

最終更新日 / Last Updated: 2026-02-10

---

## 日本語（Japanese）

### はじめに
「AI参加会議」は、ユーザーのプライバシーを最重要視しています。

### 収集しない情報
本アプリは、以下の情報を収集しません。

- 氏名、メールアドレスなどの個人情報
- 会議音声
- 文字起こし内容
- 利用ログや行動履歴

### 技術的に必要な情報
本アプリの利用には、以下が必要です。

- 対応ブラウザ（Chrome / Edge 推奨）
- マイク
- ユーザー自身が取得したAIサービスのAPIキー

### データの保存場所
APIキーは既定でユーザーのブラウザのsessionStorage（タブ/セッション限定）に保存され、タブ/ブラウザを閉じると削除されます。
デスクトップアプリ（Chrome/Edgeアプリ）で「APIキーを記憶する」を有効にした場合のみ、端末内で次回セッションにも保持されます（非推奨）。
設定情報・モデル選択などはlocalStorageに保存されます。
開発者が管理するサーバーには一切送信されません。

会議履歴（文字起こし・AI回答）はブラウザのIndexedDBに保存されます（最大5件）。
会議コンテキスト（目的/参考情報/添付資料の抽出テキスト）は、既定でsessionStorageに保存されます。
設定で「会議情報を次回も保持する」を有効にした場合のみ、会議コンテキストはlocalStorageに保存されます。
不要になったデータは履歴削除や設定のクリアで削除できます。

### 外部サービス
本アプリは、ユーザーが指定した外部AIサービスと直接通信します。
各サービスのプライバシーポリシーは、それぞれの提供元をご確認ください。

- [Google のプライバシーポリシー](https://policies.google.com/privacy)
- [OpenAI のプライバシーポリシー](https://openai.com/policies/privacy-policy)
- [Anthropic（Claude）のプライバシーポリシー](https://www.anthropic.com/privacy)
- [Groq のプライバシーポリシー](https://groq.com/privacy-policy/)
- [Deepgram のプライバシーポリシー](https://deepgram.com/privacy)

---

## English

### Introduction
AI Meeting Assistant places the highest priority on user privacy.

### Information We Do Not Collect
The Application does not collect:

- Personal information such as names or email addresses
- Meeting audio
- Transcripts
- Usage logs or behavioral data

### Required Technical Information
To use the Application, the following are required:

- A supported browser (Chrome or Edge recommended)
- A microphone
- API keys obtained by the user for supported AI services

### Data Storage
API keys are stored in browser sessionStorage by default (tab/session scope) and are cleared when the tab/browser closes.
Only when "Remember API keys" is enabled in desktop app mode (Chrome/Edge app), API keys may be retained on the device across sessions (not recommended).
Settings and selected models are stored in localStorage.
They are never transmitted to or stored on servers operated by the developer.

Meeting history (transcripts and AI responses) is saved in browser IndexedDB (max 5 records).
Meeting context (goals, references, extracted attachment text) is saved in sessionStorage by default.
Only when the "Persist meeting context across sessions" option is enabled, meeting context is saved in localStorage.
You can remove this data via history clear or settings reset.

### Third-Party Services
The Application communicates directly with third-party AI services selected by the user.
Please refer to each provider's privacy policy for details on their data handling practices.

- [Google Privacy Policy](https://policies.google.com/privacy)
- [OpenAI Privacy Policy](https://openai.com/policies/privacy-policy)
- [Anthropic (Claude) Privacy Policy](https://www.anthropic.com/privacy)
- [Groq Privacy Policy](https://groq.com/privacy-policy/)
- [Deepgram Privacy Policy](https://deepgram.com/privacy)
