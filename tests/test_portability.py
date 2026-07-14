from __future__ import annotations

import json
import tempfile
import time
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from content_reader.automation import DailyPolishScheduler
from content_reader.polish import (
    DIRECT_POLISH_UNAVAILABLE,
    manual_polish_automation_prompt,
    nightly_polish_automation_prompt,
    polish_runner_status,
    run_codex_polish,
)
from content_reader.server import JobManager
from content_reader.store import VaultStore
from tests.test_store import sample_pdf


class PortableMarginTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.notes = self.root / "Plain Notes"
        (self.notes / "CS101").mkdir(parents=True)
        self.config = self.root / "config.json"
        self.config.write_text(
            json.dumps(
                {
                    "storage_mode": "folder",
                    "notes_path": str(self.notes),
                    "notes_root": "Lecture Notes",
                    "route_to_existing_course_folder": True,
                    "auto_polish": {"enabled": False},
                }
            ),
            encoding="utf-8",
        )
        self.store = VaultStore(self.config)
        self.store.ensure_layout()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def import_with_note(self, title: str = "Portable Notes") -> dict:
        record = self.store.import_document(
            filename="lecture.pdf",
            content=sample_pdf(1),
            course="CS101",
            title=title,
            lecture_date="2026-07-14",
        )
        self.store.save_note(record["id"], 1, "A portable page memo with $x^2$.")
        return record

    def test_plain_folder_uses_portable_markdown_links(self) -> None:
        health = self.store.vault_health()
        self.assertTrue(health["connected"])
        self.assertEqual(health["storage_mode"], "folder")
        self.assertFalse(health["obsidian_detected"])

        record = self.import_with_note()
        self.assertTrue(record["source_path"].startswith("Lecture Notes/_Sources/CS101/"))
        raw_path = self.notes / record["raw_note_path"]
        raw = raw_path.read_text(encoding="utf-8")
        self.assertNotIn("[[", raw)
        self.assertNotIn("[!abstract]", raw)
        self.assertIn("[Original PDF](", raw)
        self.assertIn("[Open original PDF at page 1](", raw)

        polished_path = self.store.finalize_polished(
            record["id"],
            "## Result\n\nThe page memo is preserved.",
            expected_hash=self.store.input_hash(record["id"]),
        )
        polished = polished_path.read_text(encoding="utf-8")
        hub = (self.store.notes_root / "Lecture Notes Hub.md").read_text(encoding="utf-8")
        self.assertIn("[Open lecture file](", polished)
        self.assertIn("[Open page-linked raw notes](", polished)
        self.assertNotIn("[[", polished)
        self.assertNotIn("[[", hub)

    def test_configured_agent_command_receives_generated_prompt(self) -> None:
        record = self.import_with_note("Custom Agent")
        self.store.config["polish_command"] = ["fake-agent", "--prompt", "{prompt}"]
        captured: list[str] = []

        def fake_run(command: list[str], **_kwargs: object) -> SimpleNamespace:
            captured.extend(command)
            self.store.finalize_polished(
                record["id"],
                "## Custom result\n\nThe memo is represented.",
                expected_hash=self.store.input_hash(record["id"]),
            )
            return SimpleNamespace(returncode=0)

        def fake_which(executable: str) -> str:
            if executable == "fake-agent":
                return "/usr/bin/true"
            return "/usr/bin/python3"

        with patch("content_reader.polish.shutil.which", side_effect=fake_which), patch(
            "content_reader.polish.subprocess.run", side_effect=fake_run
        ):
            result = run_codex_polish(self.store, record["id"])

        self.assertEqual(result["status"], "completed")
        self.assertEqual(captured[:2], ["/usr/bin/true", "--prompt"])
        self.assertIn("portable CommonMark Markdown", captured[-1])
        self.assertNotIn("--add-dir", captured)

    def test_copy_prompts_drive_the_finalizer_without_exposing_project_writes(self) -> None:
        record = self.import_with_note("Copy Prompt")
        manual = manual_polish_automation_prompt(self.store, record["id"])
        nightly = nightly_polish_automation_prompt(self.store)

        self.assertIn(record["id"], manual)
        self.assertIn("pending_lectures.py", manual)
        self.assertIn("finalize_polished_note.py", manual)
        self.assertIn("portable CommonMark Markdown", manual)
        self.assertIn("Do not edit Margin source code", manual)
        self.assertIn("Create a recurring automation", nightly)
        self.assertIn("every day at 23:00", nightly)
        self.assertIn("finalize_polished_note.py", nightly)

        index = (Path(__file__).resolve().parents[1] / "web" / "index.html").read_text(
            encoding="utf-8"
        )
        self.assertIn('id="copyManualPromptButton"', index)
        self.assertIn('id="copyNightlyPromptButton"', index)
        self.assertNotIn("pending_lectures.py", index)
        self.assertNotIn("finalize_polished_note.py", index)

    def test_codex_runner_status_requires_login(self) -> None:
        self.store.config["polish_command"] = None
        with patch("content_reader.polish.shutil.which", return_value="/usr/bin/true"), patch(
            "content_reader.polish.subprocess.run",
            return_value=SimpleNamespace(returncode=1),
        ) as login_status:
            status = polish_runner_status(self.store)

        self.assertFalse(status["available"])
        self.assertIn("not signed in", status["reason"])
        self.assertEqual(status["message"], DIRECT_POLISH_UNAVAILABLE)
        self.assertEqual(login_status.call_args.args[0][-2:], ["login", "status"])

    def test_batch_polish_processes_pending_lectures_serially(self) -> None:
        record = self.import_with_note("Batch")
        manager = JobManager(self.store)

        def fake_polish(store: VaultStore, document_id: str) -> dict:
            store.finalize_polished(
                document_id,
                "## Batch result\n\nComplete.",
                expected_hash=store.input_hash(document_id),
            )
            return {"status": "completed", "message": "done"}

        with patch(
            "content_reader.server.polish_runner_status",
            return_value={"available": True, "label": "Test AI", "reason": "ready"},
        ), patch("content_reader.server.run_codex_polish", side_effect=fake_polish):
            started = manager.start_pending()
            deadline = time.monotonic() + 2
            job = manager.get(started["id"])
            while job["status"] == "running" and time.monotonic() < deadline:
                time.sleep(0.01)
                job = manager.get(started["id"])

        self.assertEqual(job["status"], "completed")
        self.assertEqual(job["completed"], 1)
        self.assertEqual(job["failed"], 0)
        self.assertTrue((self.notes / record["polished_note_path"]).exists())

    def test_missing_runner_returns_copy_prompt_fallback(self) -> None:
        record = self.import_with_note("No Runner")
        manager = JobManager(self.store)
        runner = {
            "available": False,
            "label": "Codex CLI",
            "reason": "Codex CLI is not installed.",
            "message": DIRECT_POLISH_UNAVAILABLE,
        }
        with patch("content_reader.server.polish_runner_status", return_value=runner):
            result = manager.start(record["id"])

        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(result["message"], DIRECT_POLISH_UNAVAILABLE)
        self.assertEqual(result["reason"], "Codex CLI is not installed.")

    def test_daily_scheduler_runs_only_once_per_date(self) -> None:
        self.store.config["auto_polish"] = {
            "enabled": True,
            "daily_at": "23:00",
            "run_on_start": False,
        }
        jobs = SimpleNamespace(
            start_pending=Mock(return_value={"status": "skipped", "message": "nothing pending"})
        )
        scheduler = DailyPolishScheduler(
            self.store,
            jobs,
            state_path=self.root / "scheduler-state.json",
        )

        self.assertIsNone(scheduler.run_due(datetime(2026, 7, 14, 22, 59)))
        self.assertEqual(scheduler.run_due(datetime(2026, 7, 14, 23, 1))["status"], "skipped")
        self.assertIsNone(scheduler.run_due(datetime(2026, 7, 14, 23, 30)))
        self.assertEqual(scheduler.run_due(datetime(2026, 7, 15, 23, 1))["status"], "skipped")
        self.assertEqual(jobs.start_pending.call_count, 2)


if __name__ == "__main__":
    unittest.main()
