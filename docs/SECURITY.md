# セキュリティ / Security

最終更新日 / Last Updated: 2026-08-25

---

## 日本語（Japanese）

### 免責事項（最初にお読みください）

**このアプリの保護機能は完璧ではありません。**

- 共有PC・公共PCではAPIキーの安全性を保証できません
- マルウェアやブラウザ拡張機能による漏洩リスクは防げません
- APIキーは既定でセッション内のみ保持されますが、完璧な保護ではありません
- APIキーの管理は、最終的にユーザー自身の責任です
- 重要なAPIキーには、プロバイダー側で使用金額の上限を設定してください

### 基本方針
本アプリは、セキュリティリスクを最小化する設計を採用しています。

### クライアントサイド設計
- 会議音声や文字起こしデータはサーバーに保存されません
- 処理の大部分はブラウザ内で完結します

### ローカル保存されるデータ
- 会議履歴（文字起こし・AI回答など）はブラウザのIndexedDBに保存されます（最大5件）
- 会議コンテキスト（目的/参考情報/添付資料の抽出テキスト）はlocalStorageに保存されます
- 添付資料のテキストは、AIに送信する際のみ各プロバイダーへ送信されます
- 不要になったデータは履歴削除や設定のクリアで消去してください

### APIキーの扱い
- APIキーは既定でセッション内のみ保持され、タブ/ブラウザを閉じると消えます
- インストールしたアプリ表示（ホーム画面に追加したモバイルPWA、Chrome/Edgeデスクトップアプリ）のみ、設定で任意に端末保存を有効化できます（非推奨）
- 記憶を有効にするとAPIキーは端末のlocalStorageに平文で残ります。共有端末では使用せず、端末の紛失・盗難に備えて画面ロックを有効にしてください
- 開発者のサーバーに送信されることはありません
- HTTPS通信のみを使用します

### Realtime音声短時間テスト（ローカル専用）

- Realtime音声テストだけは、`npm run start:realtime`で起動したループバック（`127.0.0.1`）のローカルNode.jsサーバーが、プロセス環境変数`OPENAI_API_KEY`を読み取ります。公開サーバーへの配置は想定していません
- ローカルサーバーはOpenAIへ短命なクライアントシークレットを要求し、その値だけをブラウザへ返します。標準APIキーはレスポンス、画面、ログ、ブラウザのStorageへ保存しません
- ブラウザは短命なシークレットでOpenAI Realtime APIへWebRTC接続します。音声はWebRTCで送信され、AI音声は画面の音声要素で再生されます
- 既存録音のマイクストリームがある場合は同じ音声トラックを共有し、Realtime終了時に既存トラックを停止しません。Realtime専用に取得したトラックだけを終了時に停止します
- AIの出力文字列だけを既存タイムラインへ追加し、入力音声の文字起こしイベントは保存しません。ヘッドホンを使用して、AI音声がマイクへ回り込むことを避けてください
- 開始時に、会議情報（目的・参加者・引き継ぎ）・これまでのAI要約・直近の文字起こし（最大約9,000字相当）をAIへの指示（`session.update`）に含めてOpenAIへ送信します。会議内容がOpenAIに送信される点は、クラウドLLM利用時と同様です
- 30〜60秒のテストでもOpenAIの利用料が発生します。使用量は`response.done`のusageを画面へ表示し、料金は公式単価を使った概算または算出不可として扱います。実請求額はOpenAIの請求画面で確認してください
- APIキーや音声内容をスクリーンショット、録画、Issue、PR、Todoistへ記録しないでください

### 保護の範囲と限界

| 脅威 | 保護状況 | 詳細 |
|------|----------|------|
| 他のWebサイトからのアクセス | ✅ 対応 | ブラウザが自動的にブロック |
| 保存場所を直接閲覧 | ⚠️ 部分的 | 既定はセッション内のみだが、実行中は閲覧可能 |
| 通信の盗聴 | ✅ 対応 | HTTPS暗号化で保護 |
| 共用パソコンでの使用 | ⚠️ 部分的 | 記憶OFFを推奨。終了時はタブ/ブラウザを閉じる |
| マルウェア・悪意ある拡張機能 | ❌ 非対応 | ブラウザ内データにアクセス可能 |

### ユーザーへの推奨事項
- 信頼できる端末・ネットワークで利用してください
- 共用PCではタブ/ブラウザを閉じ、使い終わったら手動で削除してください
- APIキーは定期的にローテーションしてください
- 不要になったAPIキーは無効化してください

### セキュリティ問題の報告
- 一般的な問題: [GitHub Issues](https://github.com/gatyoukatyou/ai-meeting-assistant/issues)
- 深刻な脆弱性: [Security Advisories](https://github.com/gatyoukatyou/ai-meeting-assistant/security/advisories/new)

### 脅威モデル（技術的補足）
- APIキーはWeb Storage（既定はsessionStorage、記憶ON設定時はlocalStorage）に**平文**で保存されます。暗号化は行っていません
- 同一オリジンで実行されるスクリプト（本アプリ自身のバグやXSS）はWeb Storageを読み取れます。この対策として、厳格なCSPと一貫したエスケープ処理によりXSSの混入自体を防ぐ設計としています
- sessionStorageは既定でタブ/ブラウザを閉じると消去され、平文データが残る期間を限定します
- 記憶（persistApiKeys）オプションはユーザーの明示的なオプトインが必要で、対応環境（ホーム画面に追加したモバイルPWAまたはデスクトップアプリ表示モード）に限定してのみ有効化されます。モバイルの通常ブラウザタブでは有効化できません
- WebCrypto等によるクライアントサイド暗号化は検討しましたが、復号鍵も同一オリジンのJavaScriptから参照可能である以上、アプリ自身のオリジンを起点とする攻撃（XSS等）に対しては保護効果がないため、実装を見送りました
- Web Storageへの書き込み（`localStorage.setItem`等）はストレージ容量超過やSafariプライベートモード等で例外を投げる場合があります。本アプリはこれらの例外を捕捉し、保存に失敗してもアプリの動作は継続する設計です（データは保存されない場合があります）

---

## English

### Disclaimer (Please Read First)

**The protection features of this application are not perfect.**

- API key security cannot be guaranteed on shared or public PCs
- Leakage risks from malware or browser extensions cannot be prevented
- API keys are session-only by default, but protection is not perfect
- API key management is ultimately the user's responsibility
- Set spending limits with your API provider for important keys

### Security Principles
The Application is designed to minimize security risks.

### Client-Side Architecture
- Meeting audio and transcripts are not stored on servers
- Most processing occurs entirely within the user's browser

### Locally Stored Data
- Meeting history (transcripts and AI responses) is saved in browser IndexedDB (max 5 records)
- Meeting context (goals, references, extracted attachment text) is saved in localStorage
- Attachment text is sent to providers only when making AI requests
- Remove data via history clear or settings reset when no longer needed

### Handling of API Keys
- API keys are session-only by default and cleared when the tab/browser closes
- Installed app mode (a mobile PWA added to the home screen or a Chrome/Edge desktop app) can optionally persist API keys on device via explicit user opt-in (not recommended)
- Persisted API keys remain unencrypted in localStorage. Do not enable this on shared devices, and use a device screen lock to reduce the risk from loss or theft
- They are never transmitted to developer-controlled servers
- All communication uses HTTPS

### Realtime short voice test (local only)

- Only the Realtime voice test reads `OPENAI_API_KEY`, and only the loopback Node.js server started with `npm run start:realtime` reads it from its process environment. It is not intended for public deployment
- The local server requests a short-lived client secret from OpenAI and returns only that secret to the browser. The standard API key is not stored in responses, the UI, logs, or browser storage
- The browser uses the short-lived secret to connect to the OpenAI Realtime API over WebRTC. Audio is sent over WebRTC and AI audio is played by the page's audio element
- If an existing recording stream is available, the test shares its audio track and does not stop that track when the test ends. A track acquired only for Realtime is stopped during cleanup
- Only AI output text is added to the existing timeline. Input transcription events are ignored to prevent duplicate user speech entries. Use headphones to reduce audio feedback
- On start, the meeting info (goal, participants, handoff), the existing AI summary, and the most recent transcript (up to ~9,000 characters equivalent) are included in the AI instructions (`session.update`) and sent to OpenAI. Meeting content reaching OpenAI is the same as when using cloud LLMs
- A 30–60 second test incurs OpenAI usage charges. The page shows `response.done` usage and an estimate based on the published rates, or “unavailable” when details are missing. Verify actual charges in OpenAI billing
- Never record API keys or audio content in screenshots, recordings, Issues, PRs, or Todoist

### Protection Scope and Limitations

| Threat | Protection | Details |
|--------|------------|---------|
| Access from other websites | ✅ Protected | Blocked automatically by browser |
| Direct storage inspection | ⚠️ Partial | Session-only by default, but readable during an active session |
| Network eavesdropping | ✅ Protected | HTTPS encryption |
| Shared computer usage | ⚠️ Partial | Keep persistence OFF. Close the tab/browser when done |
| Malware / malicious extensions | ❌ Not protected | Can access browser data |

### Recommendations for Users
- Use the Application on trusted devices and networks
- On shared PCs, close the tab/browser and manually clear keys when done
- Rotate API keys regularly
- Revoke unused or compromised API keys promptly

### Reporting Security Issues
- General issues: [GitHub Issues](https://github.com/gatyoukatyou/ai-meeting-assistant/issues)
- Serious vulnerabilities: [Security Advisories](https://github.com/gatyoukatyou/ai-meeting-assistant/security/advisories/new)

---

## CI Security Checks / CIセキュリティチェック

### 自動チェック項目
- **CodeQL**: JavaScript静的解析（脆弱性検出）
- **gitleaks**: シークレット漏洩スキャン
- **dependency-review**: 依存関係の脆弱性チェック（PR時）

### ブランチ保護設定（管理者向け）

1. Settings > Branches > Add branch protection rule
2. Branch name pattern: `main`
3. 以下を有効化:
   - [x] Require status checks to pass before merging
   - 必須チェック: `CodeQL Analysis`, `Secret Scanning`, `Dependency Review`, `lint`
   - [x] Require branches to be up to date before merging
4. Save changes
