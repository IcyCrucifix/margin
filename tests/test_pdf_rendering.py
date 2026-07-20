from __future__ import annotations

import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from content_reader.pdf_rendering import (
    MAX_CONCURRENT_PDF_RENDERS,
    render_pdf_page_to_png,
)


class PdfRenderingTest(unittest.TestCase):
    def test_rendering_limits_concurrent_pdftoppm_processes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            pdf_path = root / "lecture.pdf"
            pdf_path.write_bytes(b"%PDF-test")
            active_count = 0
            maximum_active_count = 0
            counter_lock = threading.Lock()

            def fake_run(command: list[str], **_kwargs: object) -> SimpleNamespace:
                nonlocal active_count, maximum_active_count
                with counter_lock:
                    active_count += 1
                    maximum_active_count = max(maximum_active_count, active_count)
                time.sleep(0.03)
                Path(f"{command[-1]}.png").write_bytes(b"png")
                with counter_lock:
                    active_count -= 1
                return SimpleNamespace(returncode=0)

            def render(page_number: int) -> Path | None:
                return render_pdf_page_to_png(
                    executable="pdftoppm",
                    pdf_path=pdf_path,
                    output_prefix=root / f"page-{page_number}",
                    page_number=page_number,
                    resolution=36,
                )

            with patch("content_reader.pdf_rendering.subprocess.run", side_effect=fake_run):
                with ThreadPoolExecutor(max_workers=6) as executor:
                    outputs = list(executor.map(render, range(1, 7)))

            self.assertTrue(all(output and output.exists() for output in outputs))
            self.assertLessEqual(maximum_active_count, MAX_CONCURRENT_PDF_RENDERS)


if __name__ == "__main__":
    unittest.main()
