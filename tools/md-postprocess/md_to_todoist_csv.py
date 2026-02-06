#!/usr/bin/env python3
"""Convert exported meeting Markdown into Todoist-importable CSV."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import List

from task_parser import Task, build_chunk_path, chunk_tasks, extract_tasks, read_markdown


TODOIST_FIELDS = [
    "TYPE",
    "CONTENT",
    "DESCRIPTION",
    "PRIORITY",
    "INDENT",
    "AUTHOR",
    "RESPONSIBLE",
    "DATE",
    "DATE_LANG",
    "TIMEZONE",
]


def map_todoist_priority(task: Task, default_priority: int) -> str:
    if task.priority == "high":
        return "4"
    if task.priority == "medium":
        return "3"
    return str(default_priority)


def write_todoist_csv(output_path: Path, tasks: List[Task], default_priority: int) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=TODOIST_FIELDS)
        writer.writeheader()
        for task in tasks:
            description = f"Source: {task.source_section}"
            if task.completed:
                description += " / Status: completed"
            writer.writerow(
                {
                    "TYPE": "task",
                    "CONTENT": task.content,
                    "DESCRIPTION": description,
                    "PRIORITY": map_todoist_priority(task, default_priority),
                    "INDENT": "1",
                    "AUTHOR": "",
                    "RESPONSIBLE": task.assignee,
                    "DATE": task.due_date,
                    "DATE_LANG": "en",
                    "TIMEZONE": "Asia/Tokyo",
                }
            )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert Markdown to Todoist CSV")
    parser.add_argument("input", type=Path, help="Input markdown file")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output CSV path (default: <input>.todoist.csv)",
    )
    parser.add_argument(
        "--max-tasks-per-file",
        type=int,
        default=0,
        help="Split output when task count exceeds this number (0 = no split)",
    )
    parser.add_argument(
        "--default-priority",
        type=int,
        choices=[1, 2, 3, 4],
        default=1,
        help="Default Todoist priority when no explicit priority is found",
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
    output_base = args.output or input_path.with_suffix(".todoist.csv")

    markdown = read_markdown(input_path)
    tasks = extract_tasks(markdown, include_completed=not args.exclude_completed)

    chunks = chunk_tasks(tasks, args.max_tasks_per_file)
    for index, chunk in enumerate(chunks):
        output_path = build_chunk_path(output_base, index, len(chunks))
        write_todoist_csv(output_path, chunk, args.default_priority)
        print(f"[todoist] wrote {len(chunk)} tasks -> {output_path}")

    if not tasks:
        print("[todoist] no tasks detected; header-only CSV generated")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
