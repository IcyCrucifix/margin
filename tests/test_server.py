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


class ServerIntegrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.vault = self.root / "Test_Obsidian"
        self.vault.mkdir()
        (self.vault / ".obsidian").mkdir()
        config = self.root / "config.json"
        config.write_text(
            json.dumps(
                {
                    "vault_path": str(self.vault),
                    "notes_root": "Lecture Notes",
                    "route_to_existing_course_folder": True,
                    "max_upload_mb": 10,
                }
            ),
            encoding="utf-8",
        )
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

    def request(self, path: str, *, method: str = "GET", body: bytes | None = None, json_body=None):
        headers = {}
        if method != "GET":
            headers["X-Content-Reader"] = "1"
        if json_body is not None:
            body = json.dumps(json_body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base + path, data=body, method=method, headers=headers)
        with urllib.request.urlopen(request, timeout=30) as response:
            content = response.read()
            if response.headers.get_content_type() == "application/json":
                return json.loads(content)
            return content

    def test_import_save_render_and_stage_two_noop(self) -> None:
        health = self.request("/api/health")
        self.assertTrue(health["connected"])
        self.assertEqual(health["storage_mode"], "obsidian")
        self.assertTrue(health["obsidian_detected"])
        self.assertTrue(health["read_verified"])
        self.assertTrue(health["write_verified"])
        self.assertFalse(health["automation"]["enabled"])
        query = urllib.parse.urlencode(
            {
                "filename": "lecture.pdf",
                "course": "MATH1853",
                "title": "Vectors",
                "date": "2026-07-13",
            }
        )
        imported = self.request(f"/api/import?{query}", method="POST", body=sample_pdf(1))
        document = imported["document"]
        self.request(
            f"/api/doc/{document['id']}/note",
            method="PUT",
            json_body={"page": 1, "content": "Vector length is $\\sqrt{x^2+y^2}$."},
        )
        notes = self.request(f"/api/doc/{document['id']}/notes")["notes"]
        self.assertIn("\\sqrt", notes["1"])
        shell = self.request("/")
        self.assertIn(b'id="reloadFileButton"', shell)
        self.assertIn(b'id="shortcutHelpButton"', shell)
        self.assertIn(b">Keyboard Shortcuts</span>", shell)
        self.assertIn(b'id="shortcutsDialog"', shell)
        self.assertIn(b"Keyboard shortcuts", shell)
        prompts = self.request(
            f"/api/polish/prompts?scope=selected&document_id={document['id']}"
        )
        self.assertIn(document["id"], prompts["manual_prompt"])
        self.assertIn("Create a recurring automation", prompts["nightly_prompt"])
        self.assertIn("available", prompts["runner"])
        image = self.request(f"/api/doc/{document['id']}/page/1")
        self.assertTrue(image.startswith(b"\x89PNG"))
        reloaded_image = self.request(f"/api/doc/{document['id']}/page/1?reload=123")
        self.assertTrue(reloaded_image.startswith(b"\x89PNG"))
        reloaded_notes = self.request(f"/api/doc/{document['id']}/notes")["notes"]
        self.assertEqual(reloaded_notes["1"], notes["1"])
        thumbnail = self.request(f"/api/doc/{document['id']}/thumbnail/1")
        self.assertTrue(thumbnail.startswith(b"\x89PNG"))
        self.assertLess(len(thumbnail), len(image))

        input_hash = self.store.input_hash(document["id"])
        self.store.finalize_polished(
            document["id"], "## Vectors\n\nA vector has magnitude and direction.", input_hash
        )
        result = self.request(f"/api/doc/{document['id']}/polish", method="POST", body=b"")
        self.assertEqual(result["status"], "skipped")
        self.assertIn("Already up to date", result["message"])
        batch = self.request("/api/polish/pending", method="POST", body=b"")
        self.assertEqual(batch["status"], "skipped")
        self.assertIn("No pending lectures", batch["message"])


if __name__ == "__main__":
    unittest.main()
