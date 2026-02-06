#!/usr/bin/env python3
"""Convert exported meeting Markdown into Asana-importable CSV."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import List

from task_parser import Task, build_chunk_path, chunk_tasks, extract_tasks, read_markdown


ASANA_FIELDS = [
    "Task Name",
    "Description",
    "Assignee",
    "Due Date",
    "Section/Column",
    "Tags",
]


def write_asana_csv(output_path: Path, tasks: List[Task]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=ASANA_FIELDS)
        writer.writeheader()
        for task in tasks:
            tags = []
            if task.completed:
                tags.append("completed")
            if task.priority:
                tags.append(task.priority)
            writer.writerow(
                {
                    "Task Name": task.content,
                    "Description": f"Source: {task.source_section}",
                    "Assignee": task.assignee,
                    "Due Date": task.due_date,
                    "Section/Column": task.source_section,
                    "Tags": ", ".join(tags),
                }
            )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert Markdown to Asana CSV")
    parser.add_argument("input", type=Path, help="Input markdown file")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output CSV path (default: <input>.asana.csv)",
    )
    parser.add_argument(
        "--max-tasks-per-file",
        type=int,
        default=0,
        help="Split output when task count exceeds this number (0 = no split)",
    )
    parser.add_argument(
        "--exclude-completed",
        action="store_true",
        help="Exclude completed tasks ([x]) from export",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = args.input
    output_base = args.output or input_path.with_suffix(".asana.csv")

    markdown = read_markdown(input_path)
    tasks = extract_tasks(markdown, include_completed=not args.exclude_completed)

    chunks = chunk_tasks(tasks, args.max_tasks_per_file)
    for index, chunk in enumerate(chunks):
        output_path = build_chunk_path(output_base, index, len(chunks))
        write_asana_csv(output_path, chunk)
        print(f"[asana] wrote {len(chunk)} tasks -> {output_path}")

    if not tasks:
        print("[asana] no tasks detected; header-only CSV generated")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
