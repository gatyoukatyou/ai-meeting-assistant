# 技術仕様（Single Source of Truth）

このドキュメントは、コード実装に基づく「唯一の真実」です。
README・TERMS・その他ドキュメントを更新する際は、必ずこのファイルを参照してください。

最終更新: 2024-12-29

---

## 料金体系

- **BYOK（Bring Your Own Key）方式**: ユーザーが自分でAPIキーを取得・管理
- **従量課金**: 各AIサービスの利用量に応じて課金（このアプリからの請求はなし）
- **無保証の目安表示**: 画面に表示されるコストは推定値であり、実際の請求とは異なる場合がある

---

## 文字起こし（STT: Speech-to-Text）

### 対応プロバイダー

| Provider ID | 表示名 | タイプ | 備考 |
|-------------|--------|--------|------|
| `openai_stt` | OpenAI Whisper | チャンク送信（HTTP） | 安定、疑似リアルタイム |
| `deepgram_realtime` | Deepgram | WebSocket | 真のリアルタイム、低遅延 |
| `assemblyai_realtime` | AssemblyAI | WebSocket | 真のリアルタイム、高精度 |

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
| `gemini` | Google Gemini | gemini-2.0-flash, gemini-1.5-flash, gemini-1.5-pro |
| `claude` | Anthropic Claude | claude-sonnet-4, claude-3.5-sonnet |
| `openai_llm` | OpenAI | gpt-4o, gpt-4o-mini, gpt-4-turbo |
| `groq` | Groq | llama-3.3-70b, llama-3.1-70b, llama-3.1-8b |

**ソース**: `js/app.js` の `callLLM()` 関数、`config.html`

---

## 禁句リスト（ドキュメント整合チェック用）

以下のパターンがドキュメントに現れた場合、誤記の可能性が高い：

- `Gemini Audio` + `STT` / `文字起こし` / `音声認識`
- `Gemini` を STT プロバイダーとして記載
- `Web Speech API` を現在の機能として記載

---

## 更新履歴

- 2024-12-29: 初版作成（STT/LLM分離の明確化、BYOK方式の明記）
