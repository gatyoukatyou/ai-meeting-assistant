# セキュリティ / Security

最終更新日 / Last Updated: 2026-02-02

---

## 日本語（Japanese）

### 免責事項（最初にお読みください）

**このアプリの保護機能は完璧ではありません。**

- 共有PC・公共PCではAPIキーの安全性を保証できません
- マルウェアやブラウザ拡張機能による漏洩リスクは防げません
- APIキーはセッション内のみ保持されますが、完璧な保護ではありません
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
- APIキーはセッション内のみ保持され、タブ/ブラウザを閉じると消えます
- 開発者のサーバーに送信されることはありません
- HTTPS通信のみを使用します

### 保護の範囲と限界

| 脅威 | 保護状況 | 詳細 |
|------|----------|------|
| 他のWebサイトからのアクセス | ✅ 対応 | ブラウザが自動的にブロック |
| 保存場所を直接閲覧 | ⚠️ 部分的 | セッション内のみだが、実行中は閲覧可能 |
| 通信の盗聴 | ✅ 対応 | HTTPS暗号化で保護 |
| 共用パソコンでの使用 | ⚠️ 部分的 | セッション内のみ。終了時はタブ/ブラウザを閉じる |
| マルウェア・悪意ある拡張機能 | ❌ 非対応 | ブラウザ内データにアクセス可能 |

### ユーザーへの推奨事項
- 信頼できる端末・ネットワークで利用してください
- 共用PCではタブ/ブラウザを閉じ、使い終わったら手動で削除してください
- APIキーは定期的にローテーションしてください
- 不要になったAPIキーは無効化してください

### セキュリティ問題の報告
- 一般的な問題: [GitHub Issues](https://github.com/gatyoukatyou/ai-meeting-assistant/issues)
- 深刻な脆弱性: [Security Advisories](https://github.com/gatyoukatyou/ai-meeting-assistant/security/advisories/new)

---

## English

### Disclaimer (Please Read First)

**The protection features of this application are not perfect.**

- API key security cannot be guaranteed on shared or public PCs
- Leakage risks from malware or browser extensions cannot be prevented
- API keys are session-only, but protection is not perfect
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
- API keys are session-only and cleared when the tab/browser closes
- They are never transmitted to developer-controlled servers
- All communication uses HTTPS

### Protection Scope and Limitations

| Threat | Protection | Details |
|--------|------------|---------|
| Access from other websites | ✅ Protected | Blocked automatically by browser |
| Direct storage inspection | ⚠️ Partial | Session-only, but readable during an active session |
| Network eavesdropping | ✅ Protected | HTTPS encryption |
| Shared computer usage | ⚠️ Partial | Session-only. Close the tab/browser when done |
| Malware / malicious extensions | ❌ Not protected | Can access browser data |

### Recommendations for Users
- Use the Application on trusted devices and networks
- On shared PCs, close the tab/browser and manually clear keys when done
- Rotate API keys regularly
- Revoke unused or compromised API keys promptly

### Reporting Security Issues
- General issues: [GitHub Issues](https://github.com/gatyoukatyou/ai-meeting-assistant/issues)
- Serious vulnerabilities: [Security Advisories](https://github.com/gatyoukatyou/ai-meeting-assistant/security/advisories/new)
