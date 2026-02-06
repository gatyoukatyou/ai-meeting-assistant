#!/usr/bin/env python3
"""Convert exported meeting Markdown into a simple DOCX file.

This script intentionally uses only Python stdlib so it can run without extra deps.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import re
from typing import List
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile


HEADING_RE = re.compile(r"^\s*(#{1,6})\s+(?P<title>.+?)\s*$")
CHECKBOX_RE = re.compile(r"^\s*[-*+]\s+\[(?P<done>[ xX])\]\s+(?P<body>.+)$")
BULLET_RE = re.compile(r"^\s*[-*+]\s+(?P<body>.+)$")
NUMBERED_RE = re.compile(r"^\s*(?P<num>\d+)[.)]\s+(?P<body>.+)$")


CONTENT_TYPES_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
"""

RELS_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"""


def clean_inline_markdown(text: str) -> str:
    value = text.strip()
    value = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1", value)
    value = value.replace("**", "").replace("__", "")
    value = value.replace("`", "")
    return re.sub(r"\s+", " ", value).strip()


def markdown_to_paragraphs(markdown: str) -> List[str]:
    paragraphs: List[str] = []

    for line in markdown.splitlines():
        if not line.strip():
            paragraphs.append("")
            continue

        heading = HEADING_RE.match(line)
        if heading:
            level = len(heading.group(1))
            title = clean_inline_markdown(heading.group("title"))
            if level == 1:
                paragraphs.append(f"【{title}】")
            elif level == 2:
                paragraphs.append(f"■ {title}")
            elif level == 3:
                paragraphs.append(f"● {title}")
            else:
                paragraphs.append(f"- {title}")
            continue

        checkbox = CHECKBOX_RE.match(line)
        if checkbox:
            mark = "☑" if checkbox.group("done").lower() == "x" else "☐"
            paragraphs.append(f"{mark} {clean_inline_markdown(checkbox.group('body'))}")
            continue

        bullet = BULLET_RE.match(line)
        if bullet:
            paragraphs.append(f"・ {clean_inline_markdown(bullet.group('body'))}")
            continue

        numbered = NUMBERED_RE.match(line)
        if numbered:
            paragraphs.append(f"{numbered.group('num')}. {clean_inline_markdown(numbered.group('body'))}")
            continue

        if line.lstrip().startswith(">"):
            paragraphs.append(f"引用: {clean_inline_markdown(line.lstrip('> '))}")
            continue

        paragraphs.append(clean_inline_markdown(line))

    return paragraphs


def paragraph_xml(text: str) -> str:
    if text == "":
        return "<w:p/>"
    escaped = escape(text)
    return (
        "<w:p><w:r><w:t xml:space=\"preserve\">"
        f"{escaped}"
        "</w:t></w:r></w:p>"
    )


def build_document_xml(paragraphs: List[str]) -> str:
    body = "".join(paragraph_xml(p) for p in paragraphs)
    return (
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
        "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">"
        "<w:body>"
        f"{body}"
        "<w:sectPr>"
        "<w:pgSz w:w=\"11906\" w:h=\"16838\"/>"
        "<w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\" "
        "w:header=\"708\" w:footer=\"708\" w:gutter=\"0\"/>"
        "</w:sectPr>"
        "</w:body></w:document>"
    )


def write_docx(markdown: str, output_path: Path) -> None:
    paragraphs = markdown_to_paragraphs(markdown)
    document_xml = build_document_xml(paragraphs)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output_path, "w", compression=ZIP_DEFLATED) as docx:
        docx.writestr("[Content_Types].xml", CONTENT_TYPES_XML)
        docx.writestr("_rels/.rels", RELS_XML)
        docx.writestr("word/document.xml", document_xml)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert Markdown to DOCX")
    parser.add_argument("input", type=Path, help="Input markdown file")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output DOCX path (default: <input>.docx)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = args.input
    output_path = args.output or input_path.with_suffix(".docx")

    markdown = input_path.read_text(encoding="utf-8")
    write_docx(markdown, output_path)
    print(f"[docx] wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
