from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from content_reader.import_paths import normalize_import_path
from content_reader.source_access import inspect_source_selection
from content_reader.store import StoreError, VaultStore
from tests.test_store import sample_pdf


class FolderImportTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.vault = self.root / "Vault"
        (self.vault / ".obsidian").mkdir(parents=True)
        config = self.root / "config.json"
        config.write_text(
            json.dumps({"vault_path": str(self.vault), "notes_root": "Lecture Notes"}),
            encoding="utf-8",
        )
        self.store = VaultStore(config)
        self.store.ensure_layout()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_recursive_paths_and_duplicate_aliases_persist(self) -> None:
        source = sample_pdf(1)
        first = self.store.import_document(
            filename="lecture.pdf",
            import_path="Semester/Week 1/lecture.pdf",
            content=source,
            course="ELEC2441",
            title="Lecture",
            lecture_date="2026-08-03",
        )
        second = self.store.import_document(
            filename="lecture.pdf",
            import_path="Semester/Review/lecture.pdf",
            content=source,
            course="ELEC2441",
            title="Lecture",
            lecture_date="2026-08-03",
        )
        repeated = self.store.import_document(
            filename="lecture.pdf",
            import_path="Semester/Review/lecture.pdf",
            content=source,
            course="ELEC2441",
            title="Lecture",
            lecture_date="2026-08-03",
        )

        self.assertEqual(first["id"], second["id"])
        self.assertEqual(repeated["import_paths"], second["import_paths"])
        self.assertEqual(
            self.store.list_documents()[0]["import_paths"],
            ["Semester/Week 1/lecture.pdf", "Semester/Review/lecture.pdf"],
        )

    def test_unsafe_or_mismatched_folder_paths_are_rejected(self) -> None:
        for import_path in ("../lecture.pdf", "/tmp/lecture.pdf", "Week/other.pdf"):
            with self.subTest(import_path=import_path):
                with self.assertRaises(StoreError):
                    self.store.import_document(
                        filename="lecture.pdf",
                        import_path=import_path,
                        content=sample_pdf(1),
                        course="ELEC2441",
                        title="Lecture",
                    )
        self.assertEqual(self.store.list_documents(), [])

    def test_standalone_upload_uses_the_filename_as_its_tree_path(self) -> None:
        self.assertEqual(normalize_import_path("Lecture 1.pdf", None), "Lecture 1.pdf")

    def test_folder_access_references_sources_and_removal_keeps_disk_files(self) -> None:
        source_root = self.root / "Course Files"
        source_path = source_root / "Week 1" / "lecture.pdf"
        source_path.parent.mkdir(parents=True)
        source_path.write_bytes(sample_pdf(1))
        selection = inspect_source_selection(str(source_root))
        descriptor = selection.sources[0]

        record = self.store.access_document(
            source_path=descriptor.source_path,
            library_path=descriptor.library_path,
            course="ELEC2441",
            title="Lecture",
            lecture_date="2026-08-03",
        )

        self.assertEqual(record["source_mode"], "reference")
        self.assertEqual(record["source_reference"], str(source_path.resolve()))
        self.assertEqual(record["library_paths"], ["Course Files/Week 1/lecture.pdf"])
        self.assertTrue(source_path.exists())
        self.assertEqual(list(self.vault.rglob("*.pdf")), [])
        raw_note = self.vault / record["raw_note_path"]
        self.assertFalse(raw_note.exists())

        self.store.save_note(record["id"], 1, "A retained memo.")
        self.assertTrue(raw_note.exists())

        result = self.store.remove_library_access(
            document_id=record["id"],
            library_path=descriptor.library_path,
            kind="file",
        )
        self.assertEqual(result["hidden_document_ids"], [record["id"]])
        self.assertEqual(self.store.list_documents(), [])
        self.assertTrue(source_path.exists())
        self.assertTrue(raw_note.exists())

        restored = self.store.access_document(
            source_path=descriptor.source_path,
            library_path=descriptor.library_path,
            course="ELEC2441",
            title="Lecture",
            lecture_date="2026-08-03",
        )
        self.assertEqual(restored["id"], record["id"])
        self.assertEqual(restored["raw_note_path"], record["raw_note_path"])

    def test_removing_folder_access_removes_only_matching_tree_aliases(self) -> None:
        source_path = self.root / "lecture.pdf"
        source_path.write_bytes(sample_pdf(1))
        record = self.store.access_document(
            source_path=source_path,
            library_path="Semester/Week 1/lecture.pdf",
            course="ELEC2441",
            title="Lecture",
        )
        self.store.access_document(
            source_path=source_path,
            library_path="Semester/Review/lecture.pdf",
            course="ELEC2441",
            title="Lecture",
        )

        self.store.remove_library_access(
            document_id=None,
            library_path="Semester/Week 1",
            kind="folder",
        )

        visible = self.store.list_documents()[0]
        self.assertEqual(visible["id"], record["id"])
        self.assertEqual(visible["library_paths"], ["Semester/Review/lecture.pdf"])
        self.assertTrue(source_path.exists())

    def test_unavailable_reference_degrades_only_that_library_record(self) -> None:
        source_path = self.root / "lecture.pdf"
        source_path.write_bytes(sample_pdf(1))
        record = self.store.access_document(
            source_path=source_path,
            library_path="lecture.pdf",
            course="ELEC2441",
            title="Lecture",
        )
        source_path.unlink()

        visible = self.store.list_documents()[0]

        self.assertEqual(visible["id"], record["id"])
        self.assertFalse(visible["source_available"])
        self.assertFalse((self.vault / visible["raw_note_path"]).exists())


if __name__ == "__main__":
    unittest.main()
