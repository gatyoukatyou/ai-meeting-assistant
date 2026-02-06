#!/usr/bin/env python3
"""Shared Markdown task extraction utilities for post-processing tools."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Iterable, List

HEADING_RE = re.compile(r"^\s*#{1,6}\s+(?P<title>.+?)\s*$")
CHECKBOX_RE = re.compile(r"^\s*[-*+]\s+\[(?P<done>[ xX])\]\s+(?P<body>.+)$")
TODO_PREFIX_RE = re.compile(r"^\s*(?:TODO|Todo|todo|Task|TASK|タスク|対応)\s*[:：]\s*(?P<body>.+)$")
BULLET_RE = re.compile(r"^\s*[-*+]\s+(?P<body>.+)$")
NUMBERED_RE = re.compile(r"^\s*\d+[.)]\s+(?P<body>.+)$")

DATE_INLINE_RE = re.compile(r"\d{4}[/-]\d{1,2}[/-]\d{1,2}")
DATE_WITH_LABEL_RE = re.compile(r"(?:期限|due|deadline)\s*[:：]\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2})", re.IGNORECASE)
ASSIGNEE_AT_RE = re.compile(r"@([^\s,、)]+)")
ASSIGNEE_LABEL_RE = re.compile(r"(?:担当|owner|assignee)\s*[:：]\s*([^,、)）\s]+)", re.IGNORECASE)

TODO_SECTION_KEYWORDS = [
    "todo",
    "to do",
    "action",
    "actions",
    "next action",
    "next actions",
    "task",
    "tasks",
    "アクション",
    "次アクション",
    "タスク",
    "対応",
    "やること",
]

HIGH_PRIORITY_KEYWORDS = ["p1", "urgent", "緊急", "高優先", "最優先"]
MEDIUM_PRIORITY_KEYWORDS = ["p2", "medium", "中優先", "優先"]


@dataclass
class Task:
    content: str
    source_section: str
    completed: bool = False
    assignee: str = ""
    due_date: str = ""
    priority: str = ""


def read_markdown(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def strip_markdown_tokens(text: str) -> str:
    value = text.strip()
    value = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1", value)
    value = value.replace("**", "").replace("__", "")
    value = value.replace("`", "")
    return normalize_whitespace(value)


def normalize_date(value: str) -> str:
    parts = value.replace("/", "-").split("-")
    if len(parts) != 3:
        return value.replace("/", "-")
    year, month, day = parts
    try:
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
    except ValueError:
        return value.replace("/", "-")


def detect_due_date(text: str) -> str:
    labeled = DATE_WITH_LABEL_RE.search(text)
    if labeled:
        return normalize_date(labeled.group(1))
    plain = DATE_INLINE_RE.search(text)
    if plain:
        return normalize_date(plain.group(0))
    return ""


def detect_assignee(text: str) -> str:
    labeled = ASSIGNEE_LABEL_RE.search(text)
    if labeled:
        return labeled.group(1).strip()
    tagged = ASSIGNEE_AT_RE.search(text)
    if tagged:
        return tagged.group(1).strip()
    return ""


def detect_priority(text: str) -> str:
    lowered = text.lower()
    for keyword in HIGH_PRIORITY_KEYWORDS:
        if keyword in lowered:
            return "high"
    for keyword in MEDIUM_PRIORITY_KEYWORDS:
        if keyword in lowered:
            return "medium"
    return ""


def strip_task_metadata(text: str) -> str:
    result = text
    result = re.sub(r"^\s*(?:TODO|Todo|todo|Task|TASK|タスク|対応)\s*[:：]\s*", "", result)
    result = DATE_WITH_LABEL_RE.sub("", result)
    result = DATE_INLINE_RE.sub("", result)
    result = ASSIGNEE_LABEL_RE.sub("", result)
    result = ASSIGNEE_AT_RE.sub("", result)
    result = re.sub(r"[\(（](?:担当|owner|assignee)[^)）]*[\)）]", "", result, flags=re.IGNORECASE)
    result = re.sub(r"[\(（](?:期限|due|deadline)[^)）]*[\)）]", "", result, flags=re.IGNORECASE)
    result = re.sub(r"[（(]\s*[)）]", "", result)
    result = re.sub(r"[（(]\s*$", "", result)
    return strip_markdown_tokens(result)


def is_todo_section(section_title: str) -> bool:
    lowered = (section_title or "").lower()
    return any(keyword in lowered for keyword in TODO_SECTION_KEYWORDS)


def make_task(body: str, section: str, completed: bool) -> Task | None:
    assignee = detect_assignee(body)
    due_date = detect_due_date(body)
    priority = detect_priority(body)
    content = strip_task_metadata(body)
    if not content:
        return None
    return Task(
        content=content,
        source_section=section or "(no section)",
        completed=completed,
        assignee=assignee,
        due_date=due_date,
        priority=priority,
    )


def extract_tasks(markdown_text: str, include_completed: bool = True) -> List[Task]:
    section = "(root)"
    tasks: List[Task] = []
    dedupe = set()

    for raw_line in markdown_text.splitlines():
        heading_match = HEADING_RE.match(raw_line)
        if heading_match:
            section = strip_markdown_tokens(heading_match.group("title"))
            continue

        checkbox = CHECKBOX_RE.match(raw_line)
        if checkbox:
            task = make_task(checkbox.group("body"), section, checkbox.group("done").lower() == "x")
            if task:
                key = task.content.casefold()
                if key not in dedupe and (include_completed or not task.completed):
                    dedupe.add(key)
                    tasks.append(task)
            continue

        todo_prefix = TODO_PREFIX_RE.match(raw_line)
        if todo_prefix:
            task = make_task(todo_prefix.group("body"), section, completed=False)
            if task:
                key = task.content.casefold()
                if key not in dedupe:
                    dedupe.add(key)
                    tasks.append(task)
            continue

        if not is_todo_section(section):
            continue

        bullet = BULLET_RE.match(raw_line)
        if bullet:
            task = make_task(bullet.group("body"), section, completed=False)
            if task:
                key = task.content.casefold()
                if key not in dedupe:
                    dedupe.add(key)
                    tasks.append(task)
            continue

        numbered = NUMBERED_RE.match(raw_line)
        if numbered:
            task = make_task(numbered.group("body"), section, completed=False)
            if task:
                key = task.content.casefold()
                if key not in dedupe:
                    dedupe.add(key)
                    tasks.append(task)

    return tasks


def chunk_tasks(tasks: List[Task], max_tasks_per_file: int) -> List[List[Task]]:
    if max_tasks_per_file <= 0 or len(tasks) <= max_tasks_per_file:
        return [tasks]

    chunks: List[List[Task]] = []
    for index in range(0, len(tasks), max_tasks_per_file):
        chunks.append(tasks[index:index + max_tasks_per_file])
    return chunks


def build_chunk_path(base_output: Path, chunk_index: int, total_chunks: int) -> Path:
    if total_chunks <= 1:
        return base_output
    return base_output.with_name(f"{base_output.stem}_part{chunk_index + 1}{base_output.suffix}")
