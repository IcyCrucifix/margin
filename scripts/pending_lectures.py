#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from content_reader.store import VaultStore  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="List lectures whose Stage 2 output is stale or missing.")
    parser.add_argument("--json", action="store_true", help="Print structured JSON.")
    args = parser.parse_args()
    store = VaultStore()
    store.reconcile_course_locations()
    pending = store.pending_documents()
    if args.json:
        print(json.dumps(pending, ensure_ascii=False, indent=2))
    elif not pending:
        print("No pending lectures.")
    else:
        for document in pending:
            print(f"{document['id']}\t{document['course']}\t{document['title']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
