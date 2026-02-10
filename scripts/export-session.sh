#!/usr/bin/env bash
# export-session.sh - SessionEnd hook for Claude Code
# Copies the session transcript to docs/ai/sessions/claude/
# Also checks whether /wrapup was executed during the session.
#
# Called automatically by Claude Code's SessionEnd hook.
# Input: $1 = transcript_path (provided by Claude Code)
#
# Usage (manual): ./scripts/export-session.sh /path/to/transcript.md

set -euo pipefail

TRANSCRIPT_PATH="${1:-}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SESSION_DIR="${REPO_ROOT}/docs/ai/sessions/claude"

if [ -z "$TRANSCRIPT_PATH" ]; then
  echo "[export-session] No transcript path provided. Skipping."
  exit 0
fi

if [ ! -f "$TRANSCRIPT_PATH" ]; then
  echo "[export-session] Transcript not found: $TRANSCRIPT_PATH"
  exit 0
fi

# --- /wrapup execution check ---
# Look for evidence that /wrapup was run during this session.
# The wrapup command outputs "=== Session Wrapup ===" as its first step.
if ! grep -q "Session Wrapup" "$TRANSCRIPT_PATH" 2>/dev/null; then
  echo ""
  echo "⚠️  WARNING: /wrapup was NOT executed in this session."
  echo "   Please run /wrapup before ending sessions to ensure proper"
  echo "   session summaries and handoff notes are generated."
  echo ""
fi

# Ensure target directory exists
mkdir -p "$SESSION_DIR"

# Generate filename: YYYY-MM-DD_HHMM_branch.md
BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
# Sanitize branch name for filename
BRANCH_SAFE="$(echo "$BRANCH" | sed 's/[^a-zA-Z0-9_-]/-/g')"
TIMESTAMP="$(date +%F_%H%M)"
DEST="${SESSION_DIR}/${TIMESTAMP}_${BRANCH_SAFE}.md"

cp "$TRANSCRIPT_PATH" "$DEST"
echo "[export-session] Saved to: $DEST"
