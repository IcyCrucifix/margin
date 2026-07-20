from __future__ import annotations

import subprocess
import threading
from pathlib import Path


MAX_CONCURRENT_PDF_RENDERS = 2
_PDF_RENDER_SLOTS = threading.BoundedSemaphore(MAX_CONCURRENT_PDF_RENDERS)


def render_pdf_page_to_png(
    *,
    executable: str,
    pdf_path: Path,
    output_prefix: Path,
    page_number: int,
    resolution: int,
    timeout_seconds: int = 60,
) -> Path | None:
    """Render one PDF page without allowing request fan-out to exhaust memory."""
    output_path = Path(f"{output_prefix}.png")
    with _PDF_RENDER_SLOTS:
        if output_path.exists() and output_path.stat().st_size:
            return output_path
        process = subprocess.run(
            [
                executable,
                "-f",
                str(page_number),
                "-l",
                str(page_number),
                "-singlefile",
                "-png",
                "-r",
                str(resolution),
                str(pdf_path),
                str(output_prefix),
            ],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    if process.returncode == 0 and output_path.exists() and output_path.stat().st_size:
        return output_path
    return None
