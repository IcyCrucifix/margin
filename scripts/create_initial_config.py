#!/usr/bin/env python3
"""Create Margin's first local-only configuration without overwriting one."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 4:
        raise SystemExit("usage: create_initial_config.py CONFIG MODE STORAGE_PATH")
    config_path = Path(sys.argv[1])
    storage_mode = sys.argv[2]
    storage_path = sys.argv[3]
    if storage_mode not in {"folder", "obsidian"}:
        raise SystemExit("storage mode must be folder or obsidian")
    if config_path.exists():
        raise SystemExit(f"refusing to overwrite {config_path}")

    path_key = "notes_path" if storage_mode == "folder" else "vault_path"
    config = {
        "storage_mode": storage_mode,
        path_key: storage_path,
        "notes_root": "Lecture Notes",
        "host": "127.0.0.1",
        "port": 4317,
        "route_to_existing_course_folder": storage_mode == "obsidian",
        "max_upload_mb": 250,
        "polish_command": None,
        "auto_polish": {
            "enabled": False,
            "daily_at": "23:00",
            "run_on_start": False,
        },
    }
    config_path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    print(f"Created {config_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
