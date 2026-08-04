from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from content_reader.store import VaultStore
from tests.test_store import sample_pdf


class LazyRawNoteTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.vault = self.root / "Vault"
        (self.vault / ".obsidian").mkdir(parents=True)
        config = self.root / "config.json"
        config.write_text(json.dumps({"vault_path": str(self.vault)}), encoding="utf-8")
        self.store = VaultStore(config)
        self.store.ensure_layout()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def open_lecture(self, title: str = "Lazy Notes") -> dict:
        source = self.root / f"{title}.pdf"
        source.write_bytes(sample_pdf(1))
        return self.store.access_document(
            source_path=source,
            library_path=source.name,
            course="TEST1001",
            title=title,
            lecture_date="2026-08-04",
        )

    def test_open_and_blank_autosave_do_not_create_raw_note(self) -> None:
        record = self.open_lecture()
        raw_path = self.vault / record["raw_note_path"]

        self.assertFalse(raw_path.exists())
        self.assertEqual(self.store.get_notes(record["id"]), {"1": ""})
        self.store.save_note(record["id"], 1, "   ")

        self.assertFalse(raw_path.exists())
        self.assertEqual(self.store.pending_documents(), [])
        hub = (self.store.notes_root / "Lecture Notes Hub.md").read_text(encoding="utf-8")
        self.assertIn("Not started", hub)
        self.assertNotIn(f"[[{record['raw_note_path'][:-3]}", hub)

    def test_first_nonempty_memo_materializes_raw_note(self) -> None:
        record = self.open_lecture()
        raw_path = self.vault / record["raw_note_path"]

        saved = self.store.save_note(record["id"], 1, "The first real memo.")

        self.assertTrue(raw_path.is_file())
        self.assertTrue(saved["has_notes"])
        self.assertEqual(self.store.get_notes(record["id"])["1"], "The first real memo.")
        self.assertEqual([item["id"] for item in self.store.pending_documents()], [record["id"]])

    def test_migration_archives_only_untouched_empty_templates(self) -> None:
        pristine = self.open_lecture("Pristine")
        edited = self.open_lecture("Edited")
        pristine_path = self.vault / pristine["raw_note_path"]
        edited_path = self.vault / edited["raw_note_path"]
        pristine_path.parent.mkdir(parents=True, exist_ok=True)
        pristine_path.write_text(self.store._raw_note_template(pristine), encoding="utf-8")
        edited_path.write_text(
            self.store._raw_note_template(edited) + "\nUser text outside the memo markers.\n",
            encoding="utf-8",
        )

        archived = self.store.archive_pristine_raw_notes()

        self.assertEqual(archived, 1)
        self.assertFalse(pristine_path.exists())
        self.assertTrue((self.store.empty_raw_archive_root / f"{pristine['id']}.md").is_file())
        self.assertTrue(edited_path.is_file())


if __name__ == "__main__":
    unittest.main()
