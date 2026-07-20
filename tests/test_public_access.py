from __future__ import annotations

import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from unittest.mock import patch

from content_reader.public_access import (
    PUBLIC_MARGIN_ORIGIN,
    PublicAccessError,
    PublicSessionRegistry,
)
from content_reader.server import ContentReaderServer
from content_reader.store import VaultStore


class PublicAccessIntegrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        notes = root / "notes"
        config = root / "config.json"
        config.write_text(
            json.dumps({"storage_mode": "folder", "notes_path": str(notes)}),
            encoding="utf-8",
        )
        store = VaultStore(config)
        store.ensure_layout()
        self.server = ContentReaderServer(("127.0.0.1", 0), store)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temporary.cleanup()

    def request(self, path: str, *, method: str = "GET", headers=None, payload=None):
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request_headers = dict(headers or {})
        if payload is not None:
            request_headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            self.base + path,
            data=body,
            method=method,
            headers=request_headers,
        )
        try:
            response = urllib.request.urlopen(request, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        content = response.read()
        parsed = json.loads(content) if response.headers.get_content_type() == "application/json" else content
        return response.status, response.headers, parsed

    def pair(self) -> str:
        challenge = "a" * 32
        query = urllib.parse.urlencode({"origin": PUBLIC_MARGIN_ORIGIN, "challenge": challenge})
        status, _, page = self.request(f"/connect?{query}")
        self.assertEqual(status, 200)
        self.assertIn(b"Allow connection", page)
        status, _, result = self.request(
            "/api/connect/approve",
            method="POST",
            headers={"Origin": self.base, "X-Content-Reader": "1"},
            payload={"origin": PUBLIC_MARGIN_ORIGIN, "challenge": challenge},
        )
        self.assertEqual(status, 200)
        return result["token"]

    def test_status_preflight_and_origin_restriction(self) -> None:
        status, headers, payload = self.request(
            "/api/connect/status", headers={"Origin": PUBLIC_MARGIN_ORIGIN}
        )
        self.assertEqual(status, 200)
        self.assertEqual(
            set(payload),
            {"ok", "app_version", "protocol_version", "pairing_required"},
        )
        self.assertEqual(payload["protocol_version"], 1)
        self.assertEqual(headers["Access-Control-Allow-Origin"], PUBLIC_MARGIN_ORIGIN)
        self.assertIsNone(headers.get("Access-Control-Allow-Credentials"))

        status, headers, _ = self.request(
            "/api/connect/status",
            method="OPTIONS",
            headers={
                "Origin": PUBLIC_MARGIN_ORIGIN,
                "Access-Control-Request-Private-Network": "true",
            },
        )
        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Private-Network"], "true")

        status, _, _ = self.request(
            "/api/connect/status", headers={"Origin": "https://example.com"}
        )
        self.assertEqual(status, 403)
        status, _, _ = self.request(
            "/api/connect/status", headers={"Origin": "null"}
        )
        self.assertEqual(status, 403)

        wrong_query = urllib.parse.urlencode(
            {"origin": "https://example.com", "challenge": "c" * 32}
        )
        status, _, _ = self.request(f"/connect?{wrong_query}")
        self.assertEqual(status, 403)

    def test_public_data_requires_a_revocable_session(self) -> None:
        status, _, _ = self.request(
            "/api/library", headers={"Origin": PUBLIC_MARGIN_ORIGIN}
        )
        self.assertEqual(status, 401)
        status, _, _ = self.request(
            "/api/library",
            headers={"Origin": PUBLIC_MARGIN_ORIGIN, "X-Margin-Session": "invalid"},
        )
        self.assertEqual(status, 401)
        status, _, _ = self.request(
            "/api/import?filename=blocked.pdf",
            method="POST",
            headers={"Origin": PUBLIC_MARGIN_ORIGIN},
        )
        self.assertEqual(status, 401)

        token = self.pair()
        public_headers = {"Origin": PUBLIC_MARGIN_ORIGIN, "X-Margin-Session": token}
        status, _, payload = self.request("/api/library", headers=public_headers)
        self.assertEqual(status, 200)
        self.assertEqual(payload["documents"], [])

        status, _, _ = self.request(
            "/api/connect/disconnect", method="POST", headers=public_headers
        )
        self.assertEqual(status, 200)
        status, _, _ = self.request("/api/library", headers=public_headers)
        self.assertEqual(status, 401)


class PublicSessionRegistryTest(unittest.TestCase):
    def test_challenges_are_single_use_and_sessions_expire(self) -> None:
        registry = PublicSessionRegistry()
        with patch("content_reader.public_access.time.monotonic", return_value=10):
            registry.register_challenge(PUBLIC_MARGIN_ORIGIN, "b" * 32)
            token = registry.approve(PUBLIC_MARGIN_ORIGIN, "b" * 32)
            self.assertTrue(registry.authorize(token, PUBLIC_MARGIN_ORIGIN))
            with self.assertRaises(PublicAccessError):
                registry.approve(PUBLIC_MARGIN_ORIGIN, "b" * 32)
        with patch("content_reader.public_access.time.monotonic", return_value=50_000):
            self.assertFalse(registry.authorize(token, PUBLIC_MARGIN_ORIGIN))


if __name__ == "__main__":
    unittest.main()
