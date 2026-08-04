from __future__ import annotations

import re
from pathlib import Path


class RawNoteMarkerError(ValueError):
    pass


def empty_page_notes(page_count: int) -> dict[str, str]:
    return {str(page_number): "" for page_number in range(1, page_count + 1)}


def read_page_notes(path: Path, page_count: int) -> dict[str, str]:
    """Return an empty memo set when a lazy raw note has not been created yet."""
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return empty_page_notes(page_count)

    notes: dict[str, str] = {}
    for page_number in range(1, page_count + 1):
        pattern = re.compile(
            rf"<!-- content-reader:page:{page_number}:start -->\n(.*?)\n"
            rf"<!-- content-reader:page:{page_number}:end -->",
            re.DOTALL,
        )
        match = pattern.search(text)
        notes[str(page_number)] = match.group(1).strip("\n") if match else ""
    return notes


def replace_page_note(text: str, page_number: int, content: str) -> str:
    pattern = re.compile(
        rf"(<!-- content-reader:page:{page_number}:start -->)\n.*?\n"
        rf"(<!-- content-reader:page:{page_number}:end -->)",
        re.DOTALL,
    )
    updated, count = pattern.subn(
        lambda match: f"{match.group(1)}\n{content}\n{match.group(2)}",
        text,
        count=1,
    )
    if count != 1:
        raise RawNoteMarkerError("The raw note page marker is missing or duplicated.")
    return updated


def archive_pristine_raw_note(
    raw_path: Path,
    archive_path: Path,
    expected_content: str,
) -> bool:
    """Hide only a byte-for-byte generated empty note; preserve every edited file."""
    try:
        content = raw_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return False
    if content != expected_content:
        return False

    archive_path.parent.mkdir(parents=True, exist_ok=True)
    if archive_path.exists():
        if archive_path.read_text(encoding="utf-8") != content:
            return False
        raw_path.unlink()
    else:
        raw_path.rename(archive_path)
    return True
