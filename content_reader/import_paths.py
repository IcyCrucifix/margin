from __future__ import annotations

import unicodedata
from pathlib import PurePosixPath


MAX_IMPORT_PATH_LENGTH = 1024
MAX_IMPORT_PATH_DEPTH = 64


def normalize_import_path(filename: str, import_path: str | None) -> str:
    """Return a safe display-only path rooted at the selected import folder.

    The path is metadata and is never used as a filesystem destination. Its
    final component must still identify the uploaded file so a client cannot
    make one lecture appear under a misleading filename.
    """
    basename = _normalized_basename(filename)
    candidate = unicodedata.normalize("NFC", import_path or basename).replace("\\", "/")
    if not candidate or len(candidate) > MAX_IMPORT_PATH_LENGTH:
        raise ValueError("The folder path is empty or too long.")
    if candidate.startswith("/"):
        raise ValueError("The folder path must be relative.")

    raw_parts = candidate.split("/")
    if any(part in {"", ".", ".."} for part in raw_parts):
        raise ValueError("The folder path contains an unsafe segment.")
    if len(raw_parts) > MAX_IMPORT_PATH_DEPTH:
        raise ValueError("The folder path is nested too deeply.")
    if any(_has_control_characters(part) for part in raw_parts):
        raise ValueError("The folder path contains unsupported characters.")

    normalized = PurePosixPath(*raw_parts).as_posix()
    if _normalized_basename(normalized).casefold() != basename.casefold():
        raise ValueError("The folder path must end with the uploaded filename.")
    return normalized


def _normalized_basename(value: str) -> str:
    normalized = unicodedata.normalize("NFC", str(value)).replace("\\", "/")
    basename = normalized.rsplit("/", 1)[-1].strip()
    if not basename or basename in {".", ".."} or _has_control_characters(basename):
        raise ValueError("The uploaded filename is invalid.")
    return basename


def _has_control_characters(value: str) -> bool:
    return any(unicodedata.category(character) == "Cc" for character in value)
