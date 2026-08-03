from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable

from .import_paths import normalize_import_path


SUPPORTED_SOURCE_SUFFIXES = {".pdf", ".pptx"}


@dataclass(frozen=True)
class SourceDescriptor:
    source_path: str
    library_path: str
    filename: str
    title: str
    lecture_date: str
    size: int

    def as_payload(self) -> dict[str, str | int]:
        return asdict(self)


@dataclass(frozen=True)
class SourceSelection:
    kind: str
    name: str
    sources: tuple[SourceDescriptor, ...]
    skipped_count: int

    def as_payload(self) -> dict[str, object]:
        return {
            "kind": self.kind,
            "name": self.name,
            "sources": [source.as_payload() for source in self.sources],
            "skipped_count": self.skipped_count,
        }


def inspect_source_selection(path_value: str) -> SourceSelection:
    source = _resolve_existing_path(path_value)
    if source.is_file():
        descriptor = _describe(source, source.name)
        return SourceSelection("file", source.name, (descriptor,), 0)
    if not source.is_dir():
        raise ValueError("Choose a PDF, PowerPoint, or folder.")

    supported: list[SourceDescriptor] = []
    skipped_count = 0
    for candidate in sorted(source.rglob("*"), key=lambda item: item.as_posix().casefold()):
        if not candidate.is_file():
            continue
        if candidate.suffix.lower() not in SUPPORTED_SOURCE_SUFFIXES:
            skipped_count += 1
            continue
        relative = candidate.relative_to(source).as_posix()
        supported.append(_describe(candidate, f"{source.name}/{relative}"))
    if not supported:
        raise ValueError("That folder contains no PDF or PowerPoint files.")
    return SourceSelection("folder", source.name, tuple(supported), skipped_count)


def normalize_source_paths(values: Iterable[object]) -> list[str]:
    paths = [str(value).strip() for value in values if isinstance(value, str) and value.strip()]
    if len(paths) != 1:
        raise ValueError("Choose one file or folder at a time.")
    return paths


def _resolve_existing_path(path_value: str) -> Path:
    source = Path(path_value).expanduser()
    if not source.is_absolute():
        raise ValueError("The selected source path must be absolute.")
    try:
        return source.resolve(strict=True)
    except OSError as exc:
        raise ValueError("The selected file or folder is no longer available.") from exc


def _describe(source: Path, library_path: str) -> SourceDescriptor:
    if source.suffix.lower() not in SUPPORTED_SOURCE_SUFFIXES:
        raise ValueError("Only PDF and PowerPoint files are supported.")
    try:
        stat = source.stat()
    except OSError as exc:
        raise ValueError(f"Margin cannot read {source.name}.") from exc
    normalized = normalize_import_path(source.name, library_path)
    modified = datetime.fromtimestamp(stat.st_mtime).astimezone().date().isoformat()
    return SourceDescriptor(
        source_path=str(source),
        library_path=normalized,
        filename=source.name,
        title=source.stem.replace("_", " ").replace("-", " "),
        lecture_date=modified,
        size=stat.st_size,
    )
