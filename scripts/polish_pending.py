#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from content_reader.polish import run_codex_polish  # noqa: E402
from content_reader.store import StoreError, VaultStore  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run Stage 2 for never-polished or input-changed lecture notes."
    )
    parser.add_argument("--doc-id", help="Polish only one lecture.")
    args = parser.parse_args()
    store = VaultStore()
    store.reconcile_course_locations()
    if args.doc_id:
        document_ids = [args.doc_id]
    else:
        document_ids = [item["id"] for item in store.pending_documents()]
    results = []
    for document_id in document_ids:
        try:
            result = run_codex_polish(store, document_id)
            results.append({"document_id": document_id, **result})
        except (OSError, StoreError, TimeoutError) as exc:
            results.append({"document_id": document_id, "status": "failed", "message": str(exc)})
    print(json.dumps({"count": len(results), "results": results}, ensure_ascii=False, indent=2))
    return 1 if any(item["status"] == "failed" for item in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
