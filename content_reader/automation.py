from __future__ import annotations

import json
import re
import threading
from datetime import datetime, time, timedelta
from pathlib import Path
from typing import Any

from .store import StoreError, VaultStore, _atomic_write_text


class DailyPolishScheduler:
    """Opt-in daily trigger for the existing pending-polish pipeline."""

    def __init__(
        self,
        store: VaultStore,
        jobs: Any,
        *,
        state_path: Path | None = None,
        poll_seconds: float = 30.0,
    ):
        config = store.config.get("auto_polish", {})
        if config is None:
            config = {}
        if not isinstance(config, dict):
            raise StoreError("auto_polish must be a JSON object.")
        self.store = store
        self.jobs = jobs
        self.enabled = bool(config.get("enabled", False))
        self.daily_at = str(config.get("daily_at", "23:00"))
        self.run_on_start = bool(config.get("run_on_start", False))
        self.daily_time = self._parse_time(self.daily_at)
        self.state_path = state_path or store.runtime_root / "auto-polish-state.json"
        self.poll_seconds = poll_seconds
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._state = self._load_state()

    @staticmethod
    def _parse_time(value: str) -> time:
        match = re.fullmatch(r"(\d{2}):(\d{2})", value)
        if not match:
            raise StoreError("auto_polish.daily_at must use 24-hour HH:MM format.")
        hour, minute = (int(part) for part in match.groups())
        if hour > 23 or minute > 59:
            raise StoreError("auto_polish.daily_at must be a valid local time.")
        return time(hour=hour, minute=minute)

    def _load_state(self) -> dict[str, Any]:
        try:
            value = json.loads(self.state_path.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return {}

    def _save_state(self) -> None:
        _atomic_write_text(
            self.state_path,
            json.dumps(self._state, ensure_ascii=False, indent=2) + "\n",
        )

    def start(self) -> None:
        if not self.enabled or self._thread is not None:
            return
        if self.run_on_start:
            try:
                startup_result = self.jobs.start_pending(trigger="startup")
            except Exception as exc:
                startup_result = {"status": "failed", "message": str(exc)}
            self._state["last_startup_result"] = {
                "status": startup_result.get("status"),
                "message": startup_result.get("message"),
            }
            self._save_state()
        self.run_due()
        self._thread = threading.Thread(
            target=self._loop,
            name="margin-auto-polish",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=min(2.0, self.poll_seconds + 0.1))

    def _loop(self) -> None:
        while not self._stop.wait(self.poll_seconds):
            self.run_due()

    def run_due(self, now: datetime | None = None) -> dict[str, Any] | None:
        if not self.enabled:
            return None
        now = now or datetime.now().astimezone()
        today = now.date().isoformat()
        if (now.hour, now.minute) < (self.daily_time.hour, self.daily_time.minute):
            return None
        if self._state.get("last_scheduled_date") == today:
            return None
        try:
            result = self.jobs.start_pending(trigger="automatic")
        except Exception as exc:
            result = {"status": "failed", "message": str(exc)}
        self._state.update(
            {
                "last_scheduled_date": today,
                "last_scheduled_at": now.isoformat(timespec="seconds"),
                "last_result": {
                    "status": result.get("status"),
                    "message": result.get("message"),
                },
            }
        )
        self._save_state()
        return result

    def status(self, now: datetime | None = None) -> dict[str, Any]:
        now = now or datetime.now().astimezone()
        next_run: str | None = None
        if self.enabled:
            scheduled = datetime.combine(now.date(), self.daily_time).replace(tzinfo=now.tzinfo)
            if scheduled <= now and self._state.get("last_scheduled_date") == now.date().isoformat():
                scheduled += timedelta(days=1)
            next_run = scheduled.isoformat(timespec="minutes")
        return {
            "enabled": self.enabled,
            "daily_at": self.daily_at,
            "run_on_start": self.run_on_start,
            "next_run": next_run,
            "last_scheduled_date": self._state.get("last_scheduled_date"),
            "last_result": self._state.get("last_result"),
        }
