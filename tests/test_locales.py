from __future__ import annotations

import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
LOCALES_ROOT = PROJECT_ROOT / "web" / "locales"


class LocaleCatalogTest(unittest.TestCase):
    def load_catalog(self, locale: str) -> dict[str, str]:
        return json.loads((LOCALES_ROOT / f"{locale}.json").read_text(encoding="utf-8"))

    def test_simplified_chinese_covers_every_english_message(self) -> None:
        english = self.load_catalog("en")
        simplified_chinese = self.load_catalog("zh-Hans")
        self.assertEqual(set(english), set(simplified_chinese))

    def test_simplified_chinese_messages_are_nonempty_strings(self) -> None:
        simplified_chinese = self.load_catalog("zh-Hans")
        invalid = [
            key
            for key, value in simplified_chinese.items()
            if not isinstance(value, str) or not value.strip()
        ]
        self.assertEqual([], invalid)


if __name__ == "__main__":
    unittest.main()
