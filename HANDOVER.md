# AI Meeting Assistant - 開発引き継ぎドキュメント

## プロジェクト概要

**プロジェクト名**: AI参加会議
**リポジトリ**: https://github.com/gatyoukatyou/ai-meeting-assistant
**GitHub Pages**: https://gatyoukatyou.github.io/ai-meeting-assistant/
**ローカルパス**: `/Users/nakazatonaoya/ai-meeting-assistant`

### 概要
会議中にAIがリアルタイムで文字起こし・要約・意見・アイデア提案を行うWebアプリケーション。
完全にクライアントサイドで動作し、複数のAI API（Gemini、Claude、OpenAI、Groq）に対応。

---

## 現在の状態（2025-12-19時点）

### Git状態
```
ブランチ: main
最新コミット: 03c0e4e (HEAD -> main, origin/main)
状態: すべて同期済み（working tree clean）
```

### 最近のコミット履歴
```
03c0e4e feat: 設定画面を別ページ（config.html）に分離
87b488a design: UI/UXを業務向けミニマルデザインに刷新
ba36c5d docs: READMEを最新の仕様に合わせて修正
0851ad2 v0.6.0: マルチプロバイダー対応 & 法的ドキュメント追加
```

### ファイル構成
```
ai-meeting-assistant/
├── index.html (1,796行) - メイン画面
├── config.html (727行) - 設定画面（新規作成済み）
├── js/
│   └── secure-storage.js (166行) - 暗号化モジュール（新規作成済み）
├── docs/
│   ├── SECURITY.md
│   ├── PRIVACY.md
│   ├── TERMS.md
│   └── CHANGELOG.md
├── README.md
└── LICENSE
```

---

## 完了した作業

### 1. READMEの更新
- 最新の仕様に合わせて記述を修正
- 文字起こしプロバイダー選択肢（Gemini/OpenAI）を明記
- 使い方セクションを詳細化

### 2. UI/UXデザイン刷新
- ダークモード風 → 白基調のミニマルデザインに変更
- ビジネス環境での利用を想定した落ち着いた配色
- カラーパレット更新（primary: #4f46e5）

### 3. 設定画面の分離
- `config.html`を新規作成（人前でAPIキーが見えないよう独立）
- `js/secure-storage.js`を外部ファイル化（共通利用）
- index.htmlから設定モーダルを削除（約160行削減）
- 設定ボタンをconfig.htmlへのリンクに変更

---

## 進行中の作業：フェーズ1リファクタリング

### 目的
セキュリティ強化とコード品質向上（ビジネス利用に必要な水準を確保）

### 作業リスト（優先度順）

#### 🔴 1. XSS対策: innerHTML使用箇所の修正
**状態**: 未着手
**箇所**:
- `index.html:1432` - カスタム質問履歴の追加
  ```javascript
  qaHistory.innerHTML += `<div class="qa-item"><div class="qa-question">Q: ${customQ}</div>...`;
  ```
- `index.html:1434` - ローディング表示
  ```javascript
  document.getElementById(`response-${type}`).innerHTML = '<span class="loading"></span> 回答を生成中...';
  ```

**修正方法**:
```javascript
// innerHTML を DOM操作に変更
const qaItem = document.createElement('div');
qaItem.className = 'qa-item';
const question = document.createElement('div');
question.className = 'qa-question';
question.textContent = `Q: ${customQ}`;
qaItem.appendChild(question);
// ... 以下続く
qaHistory.appendChild(qaItem);
```

**推定時間**: 1時間

---

#### 🔴 2. CSP（Content Security Policy）ヘッダーの追加
**状態**: 未着手
**追加場所**: `index.html`, `config.html`の`<head>`内

**実装コード**:
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               script-src 'self' 'unsafe-inline';
               connect-src 'self' https://generativelanguage.googleapis.com https://api.anthropic.com https://api.openai.com https://api.groq.com;
               style-src 'self' 'unsafe-inline';">
```

**推定時間**: 30分

---

#### 🔴 3. APIキー暗号化をWeb Crypto APIに改善
**状態**: 未着手
**現状の問題**: XOR暗号化が脆弱（古典的な手法）

**修正ファイル**: `js/secure-storage.js`

**実装方針**:
- XOR暗号化 → AES-GCM に変更
- PBKDF2で鍵導出
- Web Crypto API を使用

**サンプルコード**:
```javascript
async function encryptApiKey(apiKey, password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    enc.encode(apiKey)
  );

  return {
    encrypted: Array.from(new Uint8Array(encrypted)),
    iv: Array.from(iv),
    salt: Array.from(salt)
  };
}
```

**注意点**:
- 非同期処理になるため、既存の同期コードを修正する必要あり
- localStorageにはJSONで保存（encrypted, iv, saltを含む）

**推定時間**: 4-6時間

---

#### 🟡 4. CSS共通化（common.css作成）
**状態**: 未着手
**目的**: index.htmlとconfig.htmlで重複している約400行のCSSを共通化

**手順**:
1. `css/common.css`を作成
2. 重複しているスタイルを抽出
   - `:root`変数
   - `.btn`クラス
   - `.setting-*`クラス
   - `.security-*`クラス
   - モーダル関連
3. index.html, config.htmlで読み込み
   ```html
   <link rel="stylesheet" href="css/common.css">
   ```

**推定時間**: 2-3時間

---

#### 🟡 5. 重複関数の削除
**状態**: 未着手
**対象**: `getDefaultModel()`が2箇所で定義（index.html:1367, 1573）

**修正方法**:
- 1箇所に統一（1367行目を残す）
- 1573行目の定義を削除

**推定時間**: 15分

---

## 次のフェーズ（参考）

### フェーズ2: 構造改善（2-3週間）
1. index.htmlの分割（CSS/JS抽出）
2. モジュール化（recorder, llm, cost-tracker等）
3. `callLLM()`リファクタリング
4. ARIA属性追加
5. キーボード操作対応

### フェーズ3: 機能拡張（1-2ヶ月）
1. 会議セッション管理
2. 話者識別
3. TypeScript化
4. VAD実装

詳細は分析レポート（前のメッセージ）を参照。

---

## 重要なファイルパスとコマンド

### よく使うGitコマンド
```bash
# 状態確認
git status

# 変更をステージング
git add .

# コミット
git commit -m "メッセージ"

# プッシュ
git push

# ログ確認
git log --oneline -5 --decorate
```

### ディレクトリ構成
- メインアプリ: `/Users/nakazatonaoya/ai-meeting-assistant/index.html`
- 設定画面: `/Users/nakazatonaoya/ai-meeting-assistant/config.html`
- セキュリティモジュール: `/Users/nakazatonaoya/ai-meeting-assistant/js/secure-storage.js`

### テスト用URL（ローカル）
```bash
# ローカルサーバー起動（ポート8000）
cd /Users/nakazatonaoya/ai-meeting-assistant
python3 -m http.server 8000
# → http://localhost:8000/
```

---

## 注意事項

### セキュリティ
- APIキーは暗号化してlocalStorageに保存
- 外部サーバーには一切送信しない
- CSP実装時、インラインスクリプトが多いため`'unsafe-inline'`が必要

### コミットメッセージ規則
```
feat: 新機能追加
fix: バグ修正
refactor: リファクタリング
docs: ドキュメント更新
style: コードスタイル変更（動作に影響なし）
perf: パフォーマンス改善
test: テスト追加
```

### GitHub Pages
- プッシュ後、1-2分で反映
- URL: https://gatyoukatyou.github.io/ai-meeting-assistant/

---

## 問い合わせ先

### ユーザー要望の確認
- フェーズ1の作業を優先
- ビジネス利用を前提とした改善

### 開発環境
- OS: macOS (Darwin 22.6.0)
- ブラウザ: Chrome/Edge推奨
- Node.js: 不要（純粋なHTML/CSS/JS）

---

## 引き継ぎ時刻
2025-12-19 (日本時間)

## 引き継ぎ元
KURO（Claude Code CLI）

## 引き継ぎ先
CodeXCLI

---

**以上で引き継ぎを完了します。フェーズ1のセキュリティ強化から開始してください。**
