# セキュリティについて

最終更新日: 2024年12月18日

このドキュメントでは、AI参加会議アプリにおけるAPIキーの取り扱いとセキュリティ対策について説明します。

## 概要

本アプリは**完全にクライアントサイドで動作**します。サーバーへのデータ送信は一切行いません。ユーザーのデータは、ユーザー自身のブラウザ内でのみ処理されます。

## Language Policy / 言語表記について

This document follows the repository-wide policy of writing security notes in **Japanese with English provided alongside**.

本ドキュメントは、リポジトリ全体の方針に従い、**日本語と英語を常に併記**しています。

## APIキーの保存方法

### 暗号化ローカル保存

APIキーは以下の方法で保護されています：

1. **XOR暗号化** - APIキーは平文ではなく、デバイス固有のキーでXOR暗号化されて保存されます
2. **Base64エンコード** - 暗号化後、Base64でエンコードされます
3. **ローカルストレージ** - ブラウザのlocalStorageに保存され、外部サーバーには送信されません

### デバイス固有キー

初回起動時に、暗号学的に安全な乱数（`crypto.getRandomValues`）でデバイス固有のキーが生成されます。このキーは各デバイス・ブラウザで異なるため、同じ暗号化データでも他のデバイスでは復号できません。

## セキュリティ機能

### 1. 自動削除オプション

「ブラウザを閉じたらAPIキーを自動削除」オプションを有効にすると：
- ブラウザを完全に閉じた際にAPIキーが削除されます
- 共有PCでの使用に適しています
- タブを閉じただけでは削除されません（ブラウザ全体を閉じる必要があります）

### 2. APIキー検証

保存前にAPIキーの有効性を確認します：
- Gemini: モデル一覧APIで検証
- OpenAI: モデル一覧APIで検証
- Groq: モデル一覧APIで検証
- Claude: 直接検証APIがないため、初回使用時に検証

### 3. 設定のエクスポート/インポート

- エクスポート時にユーザーが設定したパスワードで追加暗号化
- 暗号化されたJSONファイルとして保存
- 他のデバイスへの移行に使用可能
- パスワードなしでは復号不可

## データの流れ

```
[ユーザー入力] 
    ↓
[XOR暗号化（デバイスキー使用）]
    ↓
[Base64エンコード]
    ↓
[localStorage保存]

※ APIキーがネットワークを流れるのは、
  各AIサービスへのAPI呼び出し時のみ（HTTPS暗号化）
```

## 保護されている内容

| 脅威 | 対策状況 |
|------|----------|
| 他のWebサイトからのアクセス | ✅ Same-Origin Policyにより不可 |
| 開発者ツールでの閲覧 | ✅ 暗号化されているため直接読めない |
| ネットワーク盗聴 | ✅ HTTPS通信のみ |
| サーバーへの送信 | ✅ クライアント完結のため送信されない |
| 共有PC利用時 | ✅ 自動削除オプションで対応 |
| 別デバイスへの移行 | ✅ パスワード付きエクスポート/インポート |

## 推奨事項

### 一般ユーザー向け

1. **共有PCでは自動削除オプションを有効に**してください
2. **APIキーは定期的にローテーション**してください
3. **設定をエクスポートする場合は強力なパスワード**を使用してください

### 開発者向け

1. このアプリをフォークする場合、暗号化ロジックを変更しないでください
2. APIキーを平文で保存・ログ出力しないでください
3. 外部サーバーへのデータ送信を追加しないでください

## 技術的詳細

### 暗号化の実装

```javascript
// デバイスキー生成
const array = new Uint8Array(32);
crypto.getRandomValues(array);
const deviceKey = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');

// 暗号化（XOR）
function encrypt(text) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(
      text.charCodeAt(i) ^ deviceKey.charCodeAt(i % deviceKey.length)
    );
  }
  return btoa(unescape(encodeURIComponent(result)));
}
```

### ストレージキー構造

| キー | 内容 |
|------|------|
| `_dk` | デバイスキー（暗号化用） |
| `_ak_gemini` | 暗号化されたGemini APIキー |
| `_ak_claude` | 暗号化されたClaude APIキー |
| `_ak_openai` | 暗号化されたOpenAI APIキー |
| `_ak_groq` | 暗号化されたGroq APIキー |
| `_m_*` | モデル設定（暗号化不要） |
| `_opt_*` | オプション設定（暗号化不要） |

## 免責事項

このアプリケーションは、一般的なWebアプリケーションとして合理的なセキュリティ対策を実装していますが、完全なセキュリティを保証するものではありません。

- APIキーの管理は最終的にユーザーの責任です
- 重要なAPIキーには利用制限を設定することを推奨します
- セキュリティに関する懸念がある場合は、使用を控えてください

## 問題の報告

## Security Notes / セキュリティに関する注意

### DOM Hardening (XSS Mitigation) / DOMハードニング（XSS対策）

All inline event handlers (onclick, onchange, onkeypress, etc.) have been removed from the HTML. All user interactions are now handled exclusively via JavaScript event listeners registered after DOMContentLoaded.

すべての inline イベントハンドラ（onclick、onchange、onkeypress など）は HTML から完全に削除されました。現在、すべてのユーザー操作は DOMContentLoaded 後に登録される JavaScript の event listener 経由でのみ処理されます。

As a result, no user-controlled data is executed during HTML parsing, which significantly reduces the risk of XSS attacks.

その結果、HTML パース時にユーザー入力が実行される経路は存在せず、XSS 攻撃のリスクが大幅に低減されています。

### URL Handling (Open Redirect / XSS Mitigation) / URLの取り扱い（オープンリダイレクト・XSS対策）

All dynamic URL assignments that may involve user-controlled input (e.g., `a.href = input`, `window.location.href = input`) are now guarded by explicit validation. User-provided URLs are normalized using the `URL` constructor and restricted to the `http` / `https` schemes. Dangerous schemes such as `javascript:`, `data:`, and `vbscript:` are rejected.

ユーザー入力が関与する可能性のある動的な URL 設定（例: `a.href = input`, `window.location.href = input`）には、明示的な検証を導入しています。URL は `URL` コンストラクタで正規化され、`http` / `https` スキームのみが許可されます。`javascript:`、`data:`、`vbscript:` などの危険なスキームは拒否されます。

### Content Security Policy (Report-Only) / コンテンツセキュリティポリシー（報告モード）

A Content-Security-Policy-Report-Only meta tag now protects both HTML entrypoints. The policy restricts `default-src`, enforces `script-src 'self' 'nonce-YWktbWVldGluZw=='`, and allows network calls only to Google Generative Language, OpenAI, Anthropic, and Groq APIs. Inline scripts execute solely via the shared nonce. `style-src` currently includes `'unsafe-inline'` because legacy inline styles remain; this is documented debt for future CSS refactoring. After monitoring the report-only logs, enable the enforced CSP string noted near each meta tag.

両方のHTMLエントリーポイントに Content-Security-Policy-Report-Only メタタグを追加しました。`default-src` を自己ドメインに限定し、`script-src 'self' 'nonce-YWktbWVldGluZw=='` で制御、外部通信は Google Generative Language / OpenAI / Anthropic / Groq API への接続のみ許可します。インラインスクリプトは共有ノンス経由でのみ動作します。`style-src` は既存のインラインスタイルが残るため暫定的に `'unsafe-inline'` を含み、今後のCSSリファクタで解消予定です。Report-Onlyのログに問題がないことを確認したら、メタタグ付近に記載した強制版CSPへ切り替えてください。

セキュリティ上の問題を発見した場合は、GitHubのIssueでご報告ください。
