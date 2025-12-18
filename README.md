# AI Meeting Assistant

会議中にAIが参加し、文字起こし・要約・意見・アイデア提案を行うWebアプリケーションです。

## 機能

- **リアルタイム文字起こし**: Web Speech APIを使用して音声をリアルタイムでテキスト化
- **AI要約**: 会議内容をOpenAI GPTモデルで自動要約
- **意見・提案**: AIによる建設的な意見や提案の提供
- **アイデア生成**: 議論に関連する新しいアイデアの提案
- **音声ビジュアライザー**: 録音中の音声レベルを視覚的に表示

## 必要条件

- **ブラウザ**: Chrome または Microsoft Edge (Web Speech API対応)
- **OpenAI API Key**: GPT機能を使用するために必要

## 使い方

1. ブラウザで `index.html` を開く
2. OpenAI API Keyを入力
3. 「🎤 録音開始」ボタンをクリック
4. マイクへのアクセスを許可
5. 会議を開始 - 自動的に文字起こしが行われます
6. 必要に応じて「今すぐ要約」「意見を求める」「アイデア提案」ボタンを使用

## 設定オプション

| 設定 | 説明 |
|------|------|
| AIモデル | GPT-4o, GPT-4o mini, GPT-4 Turbo, GPT-3.5 Turboから選択 |
| 分析間隔 | 自動要約の実行間隔（30-300秒） |
| 自動要約 | 一定間隔で自動的に要約を生成 |
| 意見・提案 | AIの意見や提案を表示 |
| アイデア生成 | 新しいアイデアの自動生成 |

## 技術スタック

- HTML5 / CSS3 / JavaScript (バニラJS)
- Web Speech API (音声認識)
- Web Audio API (ビジュアライザー)
- OpenAI Chat Completions API

## 対応環境

### 推奨環境
- Google Chrome (最新版)
- Microsoft Edge (最新版)

### 動作確認済み
- Windows 10/11
- macOS (Chrome/Edge使用時)

### 注意事項
- Safari は Web Speech API の対応が限定的です
- Firefox は Web Speech API をサポートしていません

## ファイル構成

```
ai-meeting-assistant/
├── index.html      # メインアプリケーション
├── README.md       # このファイル
├── LICENSE         # MITライセンス
└── docs/
    └── CHANGELOG.md # 変更履歴
```

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照してください。

## バージョン

現在のバージョン: v0.4.0

変更履歴は [CHANGELOG](docs/CHANGELOG.md) を参照してください。
