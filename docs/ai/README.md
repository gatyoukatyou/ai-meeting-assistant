# AI Session Logs & Reports

## Directory Structure

```
docs/ai/
├── sessions/           # Raw session logs (gitignored)
│   ├── claude/         # KURO (Claude Code) session exports
│   ├── codex/          # Codex session logs
│   └── gemini/         # JEM (Gemini CLI) session logs
├── reports/            # Education reports (committed)
│   └── YYYY-MM-DD.md
└── README.md           # This file
```

## Sessions (gitignored)

生のセッションログ。機密情報を含む可能性があるため Git にコミットしない。

- **Claude Code**: `/wrapup` コマンドまたは SessionEnd hook で自動エクスポート
- **Codex**: 手動または `$dev-edu-report` skill 実行時に参照
- **Gemini CLI**: 手動エクスポート

## Reports (committed)

非エンジニア向けの教育レポート。コミット対象。

- **生成者**: 主に JEM (Gemini CLI) または Codex の `$dev-edu-report` skill
- **フォーマット**: `YYYY-MM-DD.md`
- **内容**: 概要 / 変更点 / 背景 / 影響 / テスト / 用語解説 / 次アクション
