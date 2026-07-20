#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from content_reader.store import StoreError, VaultStore  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Safely install a Stage 2 polished lecture note.")
    parser.add_argument("--doc-id", required=True)
    parser.add_argument("--body-file", required=True, type=Path)
    expected = parser.add_mutually_exclusive_group(required=True)
    expected.add_argument("--expected-hash")
    expected.add_argument("--expected-request-hash")
    args = parser.parse_args()
    body_path = args.body_file.expanduser().resolve()
    try:
        body_path.relative_to(PROJECT_ROOT)
    except ValueError:
        print("The draft must be inside the Content Reader workspace.", file=sys.stderr)
        return 2
    try:
        body = body_path.read_text(encoding="utf-8")
        output = VaultStore().finalize_polished(
            args.doc_id,
            body,
            expected_hash=args.expected_hash,
            expected_request_hash=args.expected_request_hash,
        )
    except (OSError, StoreError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(f"Installed polished note: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
