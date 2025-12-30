# セキュリティ / Security

最終更新日 / Last Updated: 2024-12-29

---

## 日本語（Japanese）

### 免責事項（最初にお読みください）

**このアプリの保護機能は完璧ではありません。**

- 共有PC・公共PCではAPIキーの安全性を保証できません
- マルウェアやブラウザ拡張機能による漏洩リスクは防げません
- 保護は「難読化」であり、強力な暗号化ではありません
- APIキーの管理は、最終的にユーザー自身の責任です
- 重要なAPIキーには、プロバイダー側で使用金額の上限を設定してください

### 基本方針
本アプリは、セキュリティリスクを最小化する設計を採用しています。

### クライアントサイド設計
- 会議音声や文字起こしデータはサーバーに保存されません
- 処理の大部分はブラウザ内で完結します

### APIキーの扱い
- APIキーはローカルストレージに難読化して保存されます
- 開発者のサーバーに送信されることはありません
- HTTPS通信のみを使用します

### 保護の範囲と限界

| 脅威 | 保護状況 | 詳細 |
|------|----------|------|
| 他のWebサイトからのアクセス | ✅ 対応 | ブラウザが自動的にブロック |
| 保存場所を直接閲覧 | ⚠️ 部分的 | 難読化されているが解読可能 |
| 通信の盗聴 | ✅ 対応 | HTTPS暗号化で保護 |
| 共用パソコンでの使用 | ⚠️ 部分的 | 自動削除オプションで軽減 |
| マルウェア・悪意ある拡張機能 | ❌ 非対応 | ブラウザ内データにアクセス可能 |

### ユーザーへの推奨事項
- 信頼できる端末・ネットワークで利用してください
- 共用PCでは「ブラウザを閉じたら削除」をONにしてください
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
- Protection uses obfuscation, not strong encryption
- API key management is ultimately the user's responsibility
- Set spending limits with your API provider for important keys

### Security Principles
The Application is designed to minimize security risks.

### Client-Side Architecture
- Meeting audio and transcripts are not stored on servers
- Most processing occurs entirely within the user's browser

### Handling of API Keys
- API keys are obfuscated and stored in browser local storage
- They are never transmitted to developer-controlled servers
- All communication uses HTTPS

### Protection Scope and Limitations

| Threat | Protection | Details |
|--------|------------|---------|
| Access from other websites | ✅ Protected | Blocked automatically by browser |
| Direct storage inspection | ⚠️ Partial | Obfuscated but decodable |
| Network eavesdropping | ✅ Protected | HTTPS encryption |
| Shared computer usage | ⚠️ Partial | Mitigated by auto-delete option |
| Malware / malicious extensions | ❌ Not protected | Can access browser data |

### Recommendations for Users
- Use the Application on trusted devices and networks
- Enable "Delete on browser close" on shared PCs
- Rotate API keys regularly
- Revoke unused or compromised API keys promptly

### Reporting Security Issues
- General issues: [GitHub Issues](https://github.com/gatyoukatyou/ai-meeting-assistant/issues)
- Serious vulnerabilities: [Security Advisories](https://github.com/gatyoukatyou/ai-meeting-assistant/security/advisories/new)
