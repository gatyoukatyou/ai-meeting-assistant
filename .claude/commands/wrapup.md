---
description: "セッション終了前のまとめ・ログ保存・次回引き継ぎ情報を生成する"
allowed-tools: Bash(bash -lc *), Bash(git *), Bash(date *)
---

## セッション終了処理

以下の手順でセッションのまとめとログ保存を行ってください。

### Step 1: 現状確認

```bash
echo "=== Session Wrapup ==="
echo "DATE=$(date +%F)"
echo "TIME=$(date +%H%M)"
echo "BRANCH=$(git rev-parse --abbrev-ref HEAD)"
echo "EXPORT_DIR=docs/ai/sessions/claude"
echo "EXPORT_FILE=docs/ai/sessions/claude/$(date +%F_%H%M)_$(git rev-parse --abbrev-ref HEAD).md"
```

```bash
git status --short
```

```bash
git diff --stat
```

### Step 2: セッション要約を作成

以下の情報をまとめてください：

1. **今回のセッションで行ったこと**（箇条書き3-5項目）
2. **変更したファイル**（主要なもの）
3. **テスト状況**（実施/未実施、結果）
4. **未完了・次回への引き継ぎ**（あれば）
5. **判断・決定事項**（設計判断など、記録すべきもの）

### Step 3: ログをエクスポート

上記 Step 1 で表示した `EXPORT_FILE` パスに `/export` してください：

```
/export docs/ai/sessions/claude/YYYY-MM-DD_HHMM_branch-name.md
```

### Step 4: 未コミットの変更があれば確認

未コミットの変更がある場合、コミットするかどうかユーザーに確認してください。

### Step 5: 完了報告

セッション終了の要約を表示して完了です。
