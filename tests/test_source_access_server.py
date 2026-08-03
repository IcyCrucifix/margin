from __future__ import annotations

import json
import tempfile
import threading
import unittest
import urllib.parse
import urllib.request
from pathlib import Path

from content_reader.server import ContentReaderServer
from content_reader.store import VaultStore
from tests.test_store import sample_pdf


class SourceAccessServerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.vault = self.root / "Vault"
        (self.vault / ".obsidian").mkdir(parents=True)
        config = self.root / "config.json"
        config.write_text(json.dumps({"vault_path": str(self.vault)}), encoding="utf-8")
        self.store = VaultStore(config)
        self.store.ensure_layout()
        self.server = ContentReaderServer(("127.0.0.1", 0), self.store)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temporary.cleanup()

    def request(self, path: str, *, method: str = "GET", payload=None):
        body = json.dumps(payload).encode() if payload is not None else None
        headers = {"X-Content-Reader": "1"} if method != "GET" else {}
        if payload is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base + path, data=body, method=method, headers=headers)
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read())

    def test_reference_access_and_delete_keep_source_and_notes(self) -> None:
        source_path = self.root / "Sources" / "lecture.pdf"
        source_path.parent.mkdir()
        source_path.write_bytes(sample_pdf(1))
        selection = self.request(
            "/api/source-access/inspect",
            method="POST",
            payload={"paths": [str(source_path)]},
        )["selection"]
        descriptor = selection["sources"][0]
        opened = self.request(
            "/api/library/access",
            method="POST",
            payload={
                **descriptor,
                "course": "TEST1001",
                "title": "Reference Lecture",
                "date": "2026-08-03",
                "polished_note_language": "en",
            },
        )["document"]
        raw_note = self.vault / opened["raw_note_path"]
        query = urllib.parse.urlencode(
            {
                "kind": "file",
                "library_path": descriptor["library_path"],
                "document_id": opened["id"],
            }
        )

        removed = self.request(f"/api/library/access?{query}", method="DELETE")

        self.assertEqual(removed["hidden_document_ids"], [opened["id"]])
        self.assertEqual(self.request("/api/library")["documents"], [])
        self.assertTrue(source_path.exists())
        self.assertTrue(raw_note.exists())


if __name__ == "__main__":
    unittest.main()
