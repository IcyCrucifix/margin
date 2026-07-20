"""Language contracts shared by storage, Stage 2, and the browser API."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


DEFAULT_LANGUAGE = "en"


@dataclass(frozen=True)
class LanguageSpec:
    code: str
    english_name: str
    native_name: str
    output_instruction: str
    lecture_links_heading: str
    course_label: str
    source_label: str
    raw_notes_label: str
    source_link_label: str
    raw_link_label: str


LANGUAGES: dict[str, LanguageSpec] = {
    "en": LanguageSpec(
        code="en",
        english_name="English",
        native_name="English",
        output_instruction="Write the complete note body in clear English.",
        lecture_links_heading="Lecture links",
        course_label="Course",
        source_label="Original source",
        raw_notes_label="Class memos",
        source_link_label="Open lecture file",
        raw_link_label="Open page-linked raw notes",
    ),
    "zh-Hans": LanguageSpec(
        code="zh-Hans",
        english_name="Simplified Chinese",
        native_name="简体中文",
        output_instruction=(
            "Write the complete note body in natural Simplified Chinese (简体中文). "
            "Keep formulas, code, identifiers, and established English technical terms "
            "where they improve precision."
        ),
        lecture_links_heading="讲义链接",
        course_label="课程",
        source_label="原始讲义",
        raw_notes_label="课堂笔记",
        source_link_label="打开讲义文件",
        raw_link_label="打开按页面关联的课堂笔记",
    ),
}


def language_spec(code: str | None) -> LanguageSpec:
    """Return a supported language, treating missing legacy values as English."""
    return LANGUAGES.get(code or DEFAULT_LANGUAGE, LANGUAGES[DEFAULT_LANGUAGE])


def validate_language(code: Any) -> str:
    if not isinstance(code, str) or code not in LANGUAGES:
        supported = ", ".join(LANGUAGES)
        raise ValueError(f"Language must be one of: {supported}.")
    return code


def language_options() -> list[dict[str, str]]:
    return [
        {
            "code": spec.code,
            "english_name": spec.english_name,
            "native_name": spec.native_name,
        }
        for spec in LANGUAGES.values()
    ]


def language_payload(code: str | None) -> dict[str, str]:
    spec = language_spec(code)
    return {
        "code": spec.code,
        "english_name": spec.english_name,
        "native_name": spec.native_name,
    }
