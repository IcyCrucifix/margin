from __future__ import annotations

import json
import unittest
from pathlib import Path

from content_reader import __version__


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class VersionConsistencyTest(unittest.TestCase):
    def test_python_and_frontend_versions_match(self) -> None:
        package = json.loads((PROJECT_ROOT / "package.json").read_text(encoding="utf-8"))

        self.assertEqual(__version__, package["version"])
