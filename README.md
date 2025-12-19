# AI参加会議

会議中にAIがリアルタイムで参加し、文字起こし・要約・意見・アイデア提案を行うWebアプリケーションです。

## 特徴

- 🎤 **安定した文字起こし** - Gemini Audio / OpenAI Whisper から選択可能
- 💬 **AIへの質問機能** - 会議内容に基づいて、要約・意見・アイデアをAIに質問
- 🤖 **複数LLM対応** - Gemini / Claude / GPT-4 / Groq から自動選択
- 💰 **API利用料概算表示** - リアルタイムで概算コストを表示
- 📚 **履歴管理** - AI回答をタブで管理、自由質問はQ&A形式で履歴保持
- 📥 **エクスポート** - 会議内容とAI回答をMarkdown形式で出力
- 🔒 **セキュリティ** - APIキーは暗号化してローカル保存（外部送信なし）

## デモ

GitHub Pages: https://gatyoukatyou.github.io/ai-meeting-assistant/

## セキュリティ

このアプリでは、ユーザーのAPIキーを安全に取り扱います：

- ✅ APIキーは**暗号化**してブラウザのローカルストレージに保存
- ✅ 外部サーバーには**一切送信されません**
- ✅ **自動削除オプション**で共有PCでも安心
- ✅ 設定の**暗号化エクスポート/インポート**対応

詳細は [SECURITY.md](docs/SECURITY.md) をご覧ください。

## 必要条件

- モダンブラウザ（Chrome / Edge 推奨）
- 文字起こし用APIキー（以下のいずれか1つが必須）
  - Gemini API または OpenAI API
- LLM用APIキー（任意：質問応答に使用）
  - Gemini / Claude / OpenAI / Groq から選択

## 使い方

### 1. アプリにアクセス

`index.html` をブラウザで開く、または GitHub Pages の URL にアクセス

### 2. APIキーを設定

1. 初回起動時のウェルカム画面、または右上の「⚙️ 設定」をクリック
2. 文字起こし用APIキーを入力（Gemini API または OpenAI API のいずれか必須）
3. 必要に応じて他のLLMのAPIキーを入力
4. 文字起こしプロバイダーとLLM優先順位を選択（任意）
5. 「保存」をクリック

**APIキーの取得先:**
- [Google AI Studio](https://aistudio.google.com/apikey) - Gemini
- [Anthropic Console](https://console.anthropic.com/) - Claude
- [OpenAI Platform](https://platform.openai.com/api-keys) - GPT-4
- [Groq Console](https://console.groq.com/keys) - Groq

### 3. 録音開始

1. 文字起こしプロバイダー（Gemini / OpenAI）を選択
2. 録音間隔（15秒/30秒/60秒/2分）を選択
3. 「🎤 録音開始」をクリック
4. マイクへのアクセスを許可
5. 設定した間隔ごとに自動で文字起こし

### 4. AIに質問

- **要約**: 会議内容を要約（上書き）
- **意見を聞く**: AIの見解を取得（蓄積）
- **アイデア**: 新しい提案を生成（蓄積）
- **自由質問**: カスタム質問を入力（Q&A形式で蓄積）

テキストを選択してから質問すると、選択部分についてのみ回答します。

### 5. エクスポート

「📥 エクスポート」をクリックすると、会議内容とAI回答をMarkdownファイルとしてダウンロードできます。

## 設定のバックアップ

設定画面から、APIキー含む設定を暗号化エクスポートできます：

1. 「📤 エクスポート」をクリック
2. パスワードを設定
3. JSONファイルがダウンロードされます

別のデバイスへインポートする際は：

1. 「📥 インポート」をクリック
2. エクスポートしたファイルを選択
3. エクスポート時のパスワードを入力

## ファイル構成

```
ai-meeting-assistant/
├── index.html          # メインアプリケーション
├── README.md           # このファイル
├── LICENSE             # MITライセンス
└── docs/
    ├── SECURITY.md     # セキュリティについて
    ├── PRIVACY.md      # プライバシーポリシー
    ├── TERMS.md        # 利用規約
    └── CHANGELOG.md    # 変更履歴
```

## 法的情報

- [利用規約](docs/TERMS.md) - 本アプリの利用条件
- [プライバシーポリシー](docs/PRIVACY.md) - 個人情報の取り扱い
- [セキュリティ](docs/SECURITY.md) - APIキーの保護について

## 対応環境

| ブラウザ | 対応状況 |
|----------|----------|
| Chrome | ✅ 推奨 |
| Edge | ✅ 推奨 |
| Firefox | ⚠️ 一部機能制限あり |
| Safari | ⚠️ 一部機能制限あり |

## ライセンス

MIT License

## バージョン

v0.6.0 - 法的ドキュメント追加版

変更履歴は [CHANGELOG.md](docs/CHANGELOG.md) をご覧ください。

## 注意事項

- 会議の録音を行う際は、参加者全員の同意を得てください
- API利用料金は各サービス提供元に直接請求されます
- 表示されるコストは概算であり、実際の請求額とは異なる場合があります
