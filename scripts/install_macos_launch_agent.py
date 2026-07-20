#!/usr/bin/env python3
"""Install Margin's opt-in per-user macOS LaunchAgent."""

from __future__ import annotations

import os
import plistlib
import shlex
import subprocess
import sys
from pathlib import Path


LABEL = "com.margin.content-reader"


def main() -> int:
    if sys.platform != "darwin":
        raise SystemExit("The LaunchAgent installer is available only on macOS.")
    if len(sys.argv) != 2:
        raise SystemExit("usage: install_macos_launch_agent.py PROJECT_ROOT")

    project_root = Path(sys.argv[1]).resolve()
    python = project_root / ".venv" / "bin" / "python3"
    if not python.is_file():
        raise SystemExit(f"Margin virtual environment is missing: {python}")

    agent_path = Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"
    if agent_path.exists():
        raise SystemExit(f"LaunchAgent already exists; leaving it unchanged: {agent_path}")

    log_path = Path.home() / "Library" / "Logs" / "Margin.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    agent_path.parent.mkdir(parents=True, exist_ok=True)
    launch_command = (
        f"cd {shlex.quote(str(project_root))} && "
        f"exec {shlex.quote(str(python))} -m content_reader.server"
    )
    payload = {
        "Label": LABEL,
        "ProgramArguments": ["/bin/zsh", "-lc", launch_command],
        "RunAtLoad": True,
        "KeepAlive": True,
        "StandardOutPath": str(log_path),
        "StandardErrorPath": str(log_path),
    }
    with agent_path.open("wb") as handle:
        plistlib.dump(payload, handle)

    domain = f"gui/{os.getuid()}"
    result = subprocess.run(
        ["launchctl", "bootstrap", domain, str(agent_path)],
        check=False,
        text=True,
        capture_output=True,
    )
    if result.returncode:
        agent_path.unlink(missing_ok=True)
        detail = result.stderr.strip() or result.stdout.strip()
        raise SystemExit(f"launchctl could not load Margin: {detail}")
    print(f"Installed and started {agent_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
