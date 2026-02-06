# MD Postprocess Tools

AI参加会議のエクスポートMarkdownを、社内利用向けフォーマットに変換する付属ツールです。

- `md_to_docx.py`: Markdown -> Word（`.docx`）
- `md_to_todoist_csv.py`: Markdown -> Todoist import CSV
- `md_to_asana_csv.py`: Markdown -> Asana import CSV

## 前提

- Python 3.9+
- 追加ライブラリ不要（標準ライブラリのみ）

## 使い方

### 1) DOCX 変換

```bash
python3 tools/md-postprocess/md_to_docx.py \
  tools/md-postprocess/samples/meeting_export_sample.md \
  -o /tmp/meeting.docx
```

### 2) Todoist CSV 変換

```bash
python3 tools/md-postprocess/md_to_todoist_csv.py \
  tools/md-postprocess/samples/meeting_export_sample.md \
  -o /tmp/todoist.csv
```

### 3) Asana CSV 変換

```bash
python3 tools/md-postprocess/md_to_asana_csv.py \
  tools/md-postprocess/samples/meeting_export_sample.md \
  -o /tmp/asana.csv
```

## 分割出力（タスクが多い場合）

`--max-tasks-per-file` を指定すると、CSVを分割して出力します。

```bash
python3 tools/md-postprocess/md_to_todoist_csv.py \
  tools/md-postprocess/samples/meeting_export_sample.md \
  -o /tmp/todoist.csv \
  --max-tasks-per-file 100
```

例: `todoist_part1.csv`, `todoist_part2.csv` が出力されます。

## タスク抽出ルール（揺れ吸収の固定ルール）

抽出対象は以下の優先順です。

1. チェックボックス形式
- `- [ ] ...`
- `- [x] ...`

2. `TODO:` / `Task:` / `タスク:` / `対応:` の接頭辞行

3. `TODO` / `Action` / `Next Actions` / `タスク` などの見出し配下にある
- 箇条書き
- 番号付き行

補助抽出:

- 担当者: `@name` または `担当:`, `owner:`, `assignee:`
- 期限: `YYYY-MM-DD`, `YYYY/MM/DD`, `期限:`, `due:`, `deadline:`
- 優先度: `P1`, `urgent`, `緊急`, `P2` など

## サンプル

- 入力: `tools/md-postprocess/samples/meeting_export_sample.md`

このサンプルで3スクリプトすべての動作確認ができます。

## 制約

- Markdown方言の完全対応は対象外（エクスポートMD向けに最適化）
- DOCXは「議事録体裁の最小構成」で出力（高度なスタイル設定はしない）
- Asana/Todoist側のUI仕様変更により、列要件が変わる可能性があります
