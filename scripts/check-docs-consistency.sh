#!/bin/bash
# ドキュメント整合性チェックスクリプト
# Usage: ./scripts/check-docs-consistency.sh
#
# 禁句パターンと仕様値を検証し、ドキュメント不整合を防止する

set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== ドキュメント整合性チェック ==="
echo ""

ERRORS=0
WARNINGS=0

SOURCE_DOCS="README.md README.en.md docs/TERMS.md docs/PRIVACY.md docs/SECURITY.md index.html config.html"
FACTS_DOC="docs/FACTS.md"

format_with_commas() {
  local n="$1"
  while [[ "$n" =~ ^([0-9]+)([0-9]{3})$ ]]; do
    n="${BASH_REMATCH[1]},${BASH_REMATCH[2]}"
  done
  printf "%s" "$n"
}

# 禁句パターン1: Gemini Audio をSTTとして記載している箇所
# ただしCHANGELOGの履歴（「※現在は」で注釈されているもの）は除外
echo "[1/6] Gemini Audio + STT 混同チェック..."
GEMINI_STT=$(grep -RIn --include='*.md' --include='*.html' \
  -E "Gemini Audio.*(文字起こし|STT|transcrib|音声認識)|文字起こし.*(Gemini Audio|Gemini/OpenAI)" \
  $SOURCE_DOCS 2>/dev/null || true)

if [ -n "$GEMINI_STT" ]; then
  echo "  [ERROR] Gemini + STT の混同を検出:"
  echo "$GEMINI_STT" | sed 's/^/    /'
  ERRORS=$((ERRORS + 1))
else
  echo "  [OK] Gemini + STT の混同なし"
fi

# 禁句パターン2: Web Speech APIを現在の機能として記載
echo ""
echo "[2/6] Web Speech API チェック..."
WEB_SPEECH=$(grep -RIn --include='*.md' --include='*.html' \
  -E "Web Speech API" \
  $SOURCE_DOCS 2>/dev/null || true)

if [ -n "$WEB_SPEECH" ]; then
  echo "  [WARN] Web Speech API の記載を検出（廃止された機能）:"
  echo "$WEB_SPEECH" | sed 's/^/    /'
  WARNINGS=$((WARNINGS + 1))
else
  echo "  [OK] Web Speech API の記載なし"
fi

# 禁句パターン3: APIキー保存仕様の誤記（#84再発防止）
echo ""
echo "[3/6] APIキー保存仕様チェック..."
KEY_STORAGE_MISMATCH=$(grep -RIn --include='*.md' \
  -E "APIキー.*(localStorage|ローカルストレージ).*保存|API keys?.*(stored|saved).*(local ?storage|localStorage)" \
  docs/TERMS.md docs/PRIVACY.md 2>/dev/null || true)

if [ -n "$KEY_STORAGE_MISMATCH" ]; then
  echo "  [ERROR] APIキー保存仕様の誤記（localStorage）を検出:"
  echo "$KEY_STORAGE_MISMATCH" | sed 's/^/    /'
  ERRORS=$((ERRORS + 1))
else
  echo "  [OK] APIキー保存仕様は実装と一致（sessionStorage）"
fi

# 禁句パターン4: FACTSの旧仕様文言（#85再発防止）
echo ""
echo "[4/6] FACTS旧仕様チェック..."
FACTS_OLD=$(grep -nE "PDF.*未対応|未対応.*PDF|Phase 2で検討" "$FACTS_DOC" 2>/dev/null || true)
if [ -n "$FACTS_OLD" ]; then
  echo "  [ERROR] FACTSに旧仕様文言を検出:"
  echo "$FACTS_OLD" | sed 's/^/    /'
  ERRORS=$((ERRORS + 1))
else
  echo "  [OK] FACTSに旧仕様文言なし"
fi

# 仕様値チェック: file-extractor実装値とFACTSの記載一致
echo ""
echo "[5/6] FACTS実装値整合チェック..."
PDF_MAX_PAGES=$(grep -E "const PDF_MAX_PAGES = [0-9]+" js/file-extractor.js | head -1 | sed -E 's/.*= ([0-9]+).*/\1/')
EXTRACTION_MAX_CHARS=$(grep -E "const EXTRACTION_MAX_CHARS = [0-9]+" js/file-extractor.js | head -1 | sed -E 's/.*= ([0-9]+).*/\1/')
CSV_MAX_ROWS=$(grep -E "const CSV_MAX_ROWS = [0-9]+" js/file-extractor.js | head -1 | sed -E 's/.*= ([0-9]+).*/\1/')
EXTRACTION_MAX_CHARS_COMMA=$(format_with_commas "$EXTRACTION_MAX_CHARS")

if [ -z "$PDF_MAX_PAGES" ] || [ -z "$EXTRACTION_MAX_CHARS" ] || [ -z "$CSV_MAX_ROWS" ]; then
  echo "  [ERROR] js/file-extractor.js から制限値を抽出できません"
  ERRORS=$((ERRORS + 1))
else
  FACTS_ERRORS=0
  if ! grep -q "PDF" "$FACTS_DOC" || ! grep -q "DOCX" "$FACTS_DOC" || ! grep -q "CSV" "$FACTS_DOC"; then
    echo "  [ERROR] FACTSに対応形式（PDF/DOCX/CSV）が不足"
    FACTS_ERRORS=$((FACTS_ERRORS + 1))
  fi
  if ! grep -Eq "${PDF_MAX_PAGES}ページ" "$FACTS_DOC"; then
    echo "  [ERROR] FACTSにPDFページ上限（${PDF_MAX_PAGES}）が不足"
    FACTS_ERRORS=$((FACTS_ERRORS + 1))
  fi
  if ! grep -Eq "${CSV_MAX_ROWS}行" "$FACTS_DOC"; then
    echo "  [ERROR] FACTSにCSV行上限（${CSV_MAX_ROWS}）が不足"
    FACTS_ERRORS=$((FACTS_ERRORS + 1))
  fi
  if ! grep -Eq "${EXTRACTION_MAX_CHARS}文字|${EXTRACTION_MAX_CHARS_COMMA}文字" "$FACTS_DOC"; then
    echo "  [ERROR] FACTSに抽出文字上限（${EXTRACTION_MAX_CHARS}）が不足"
    FACTS_ERRORS=$((FACTS_ERRORS + 1))
  fi

  if [ $FACTS_ERRORS -eq 0 ]; then
    echo "  [OK] FACTSの対応形式・制限値は実装と一致"
  else
    ERRORS=$((ERRORS + FACTS_ERRORS))
  fi
fi

# 参考チェック: STTプロバイダー整合（警告のみ）
echo ""
echo "[6/6] STTプロバイダー整合性チェック..."

# コードから許可されたSTTプロバイダーを抽出
CODE_STT=$(sed -n "/const ALLOWED_STT_PROVIDERS = new Set(\\[/,/\\]);/p" js/app.js | grep -Eo "'[a-z0-9_]+'" | tr -d "'" | sort -u || true)
echo "  コード上のSTTプロバイダー: $(echo "$CODE_STT" | tr '\n' ' ')"

# READMEでSTTとして記載されているプロバイダーを確認
if grep -q "OpenAI Whisper" README.md && \
   grep -q "Deepgram" README.md; then
  echo "  [OK] README.md のSTTプロバイダー記載がコードと一致"
else
  echo "  [WARN] README.md のSTTプロバイダー記載を確認してください"
  WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "=== チェック完了 ==="
echo "Errors: $ERRORS / Warnings: $WARNINGS"

if [ $ERRORS -gt 0 ]; then
  echo "[FAILED] $ERRORS 件のエラーが見つかりました"
  exit 1
else
  echo "[PASSED] すべてのチェックをパスしました"
  exit 0
fi
