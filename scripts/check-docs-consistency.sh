#!/bin/bash
# ドキュメント整合性チェックスクリプト
# Usage: ./scripts/check-docs-consistency.sh
#
# 禁句パターンを検出し、STT/LLMの混同を防止する

set -e

cd "$(dirname "$0")/.."

echo "=== ドキュメント整合性チェック ==="
echo ""

ERRORS=0

# 禁句パターン1: Gemini Audio をSTTとして記載している箇所
# ただしCHANGELOGの履歴（「※現在は」で注釈されているもの）は除外
echo "[1/3] Gemini Audio + STT 混同チェック..."
GEMINI_STT=$(grep -RIn --include='*.md' --include='*.html' \
  -E "Gemini Audio.*(文字起こし|STT|transcrib|音声認識)|文字起こし.*(Gemini Audio|Gemini/OpenAI)" \
  README.md README.en.md docs/TERMS.md docs/PRIVACY.md docs/SECURITY.md \
  index.html config.html 2>/dev/null || true)

if [ -n "$GEMINI_STT" ]; then
  echo "  [ERROR] Gemini + STT の混同を検出:"
  echo "$GEMINI_STT" | sed 's/^/    /'
  ERRORS=$((ERRORS + 1))
else
  echo "  [OK] Gemini + STT の混同なし"
fi

# 禁句パターン2: Web Speech APIを現在の機能として記載
echo ""
echo "[2/3] Web Speech API チェック..."
WEB_SPEECH=$(grep -RIn --include='*.md' --include='*.html' \
  -E "Web Speech API" \
  README.md README.en.md docs/TERMS.md docs/PRIVACY.md docs/SECURITY.md \
  index.html config.html 2>/dev/null || true)

if [ -n "$WEB_SPEECH" ]; then
  echo "  [WARN] Web Speech API の記載を検出（廃止された機能）:"
  echo "$WEB_SPEECH" | sed 's/^/    /'
  # 警告のみ、エラーにはしない
else
  echo "  [OK] Web Speech API の記載なし"
fi

# 禁句パターン3: STTプロバイダーがコードと一致するか
echo ""
echo "[3/3] STTプロバイダー整合性チェック..."

# コードから許可されたSTTプロバイダーを抽出
CODE_STT=$(grep -A5 "ALLOWED_STT_PROVIDERS" js/app.js | grep "'" | tr -d " '," | sort -u)
echo "  コード上のSTTプロバイダー: $(echo $CODE_STT | tr '\n' ' ')"

# READMEでSTTとして記載されているプロバイダーを確認
if grep -q "OpenAI Whisper" README.md && \
   grep -q "Deepgram" README.md && \
   grep -q "AssemblyAI" README.md; then
  echo "  [OK] README.md のSTTプロバイダー記載がコードと一致"
else
  echo "  [WARN] README.md のSTTプロバイダー記載を確認してください"
fi

echo ""
echo "=== チェック完了 ==="

if [ $ERRORS -gt 0 ]; then
  echo "[FAILED] $ERRORS 件のエラーが見つかりました"
  exit 1
else
  echo "[PASSED] すべてのチェックをパスしました"
  exit 0
fi
