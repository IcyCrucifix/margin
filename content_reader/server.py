from __future__ import annotations

import argparse
import json
import mimetypes
import threading
import traceback
import urllib.parse
import uuid
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from .polish import run_codex_polish
from .store import DEFAULT_CONFIG_PATH, PROJECT_ROOT, StoreError, VaultStore


WEB_ROOT = PROJECT_ROOT / "web"


class JobManager:
    def __init__(self, store: VaultStore):
        self.store = store
        self._jobs: dict[str, dict[str, Any]] = {}
        self._active_by_document: dict[str, str] = {}
        self._lock = threading.Lock()

    def start(self, document_id: str) -> dict[str, Any]:
        record = self.store.get_document(document_id)
        current_hash = self.store.input_hash(record)
        polished_path = self.store.vault / record["polished_note_path"]
        if polished_path.exists() and record.get("polished_input_hash") == current_hash:
            return {
                "status": "skipped",
                "message": "Already up to date — Stage 2 found no source or memo changes.",
            }
        with self._lock:
            active_id = self._active_by_document.get(document_id)
            if active_id and self._jobs.get(active_id, {}).get("status") == "running":
                return dict(self._jobs[active_id])
            job_id = uuid.uuid4().hex[:12]
            job = {
                "id": job_id,
                "document_id": document_id,
                "status": "running",
                "message": "Stage 2 is reading the lecture and raw memos…",
            }
            self._jobs[job_id] = job
            self._active_by_document[document_id] = job_id
        threading.Thread(
            target=self._run, args=(job_id, document_id), daemon=True
        ).start()
        return dict(job)

    def _run(self, job_id: str, document_id: str) -> None:
        try:
            result = run_codex_polish(self.store, document_id)
            update = {"status": result["status"], **result}
        except Exception as exc:
            update = {"status": "failed", "message": str(exc)}
        with self._lock:
            self._jobs[job_id].update(update)
            self._active_by_document.pop(document_id, None)

    def get(self, job_id: str) -> dict[str, Any]:
        with self._lock:
            try:
                return dict(self._jobs[job_id])
            except KeyError as exc:
                raise StoreError("Polishing job not found.") from exc


class ContentReaderServer(ThreadingHTTPServer):
    def __init__(self, address: tuple[str, int], store: VaultStore):
        super().__init__(address, RequestHandler)
        self.store = store
        self.jobs = JobManager(store)
        self.store_lock = threading.RLock()
        self.max_upload_bytes = int(store.config.get("max_upload_mb", 250)) * 1024 * 1024


class RequestHandler(BaseHTTPRequestHandler):
    server: ContentReaderServer

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def do_GET(self) -> None:
        try:
            self._do_get()
        except StoreError as exc:
            self._json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception:
            traceback.print_exc()
            self._json({"error": "Unexpected local server error."}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self) -> None:
        try:
            self._require_local_mutation()
            self._do_post()
        except StoreError as exc:
            self._json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception:
            traceback.print_exc()
            self._json({"error": "Unexpected local server error."}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_PUT(self) -> None:
        try:
            self._require_local_mutation()
            self._do_put()
        except StoreError as exc:
            self._json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception:
            traceback.print_exc()
            self._json({"error": "Unexpected local server error."}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def _do_get(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == "/api/health":
            self._json({"ok": True, **self.server.store.vault_health()})
            return
        if path == "/api/library":
            self._json({"documents": self.server.store.list_documents()})
            return
        match = self._match(path, r"/api/doc/([a-f0-9]{16})/notes")
        if match:
            self._json({"notes": self.server.store.get_notes(match[0])})
            return
        match = self._match(path, r"/api/doc/([a-f0-9]{16})/thumbnail/(\d+)")
        if match:
            thumbnail_path = self.server.store.render_thumbnail(match[0], int(match[1]))
            self._file(thumbnail_path, "image/png", cache="private, max-age=86400")
            return
        match = self._match(path, r"/api/doc/([a-f0-9]{16})/page/(\d+)")
        if match:
            page_path = self.server.store.render_page(match[0], int(match[1]))
            self._file(page_path, "image/png", cache="private, max-age=86400")
            return
        match = self._match(path, r"/api/jobs/([a-f0-9]{12})")
        if match:
            self._json(self.server.jobs.get(match[0]))
            return
        self._serve_static(path)

    def _do_post(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == "/api/import":
            query = urllib.parse.parse_qs(parsed.query)
            filename = self._query_value(query, "filename")
            course = self._query_value(query, "course")
            title = self._query_value(query, "title")
            lecture_date = self._query_value(query, "date")
            length = self._content_length()
            if length > self.server.max_upload_bytes:
                raise StoreError("That file is larger than the configured import limit.")
            content = self.rfile.read(length)
            with self.server.store_lock:
                record = self.server.store.import_document(
                    filename=filename,
                    content=content,
                    course=course,
                    title=title,
                    lecture_date=lecture_date,
                )
            self._json({"document": record}, HTTPStatus.CREATED)
            return
        match = self._match(path, r"/api/doc/([a-f0-9]{16})/polish")
        if match:
            result = self.server.jobs.start(match[0])
            self._json(result, HTTPStatus.ACCEPTED if result.get("status") == "running" else HTTPStatus.OK)
            return
        raise StoreError("Unknown action.")

    def _do_put(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        match = self._match(parsed.path, r"/api/doc/([a-f0-9]{16})/note")
        if not match:
            raise StoreError("Unknown action.")
        payload = self._read_json()
        page = payload.get("page")
        content = payload.get("content")
        if not isinstance(page, int) or not isinstance(content, str):
            raise StoreError("A page number and Markdown content are required.")
        with self.server.store_lock:
            result = self.server.store.save_note(match[0], page, content)
        self._json(result)

    def _serve_static(self, path: str) -> None:
        if path == "/":
            path = "/index.html"
        relative = Path(urllib.parse.unquote(path).lstrip("/"))
        if ".." in relative.parts:
            raise StoreError("Invalid path.")
        target = (WEB_ROOT / relative).resolve()
        try:
            target.relative_to(WEB_ROOT.resolve())
        except ValueError as exc:
            raise StoreError("Invalid path.") from exc
        if not target.is_file():
            self._json({"error": "Not found."}, HTTPStatus.NOT_FOUND)
            return
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self._file(target, mime, cache="no-cache")

    def _file(self, path: Path, content_type: str, cache: str) -> None:
        content = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(content)

    def _json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        content = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(content)

    def _read_json(self) -> dict[str, Any]:
        length = self._content_length()
        if length > 2 * 1024 * 1024:
            raise StoreError("Request is too large.")
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise StoreError("Invalid JSON request.") from exc
        if not isinstance(payload, dict):
            raise StoreError("Invalid request body.")
        return payload

    def _content_length(self) -> int:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise StoreError("Invalid content length.") from exc
        if length < 0:
            raise StoreError("Invalid content length.")
        return length

    def _require_local_mutation(self) -> None:
        if self.headers.get("X-Content-Reader") != "1":
            raise StoreError("This local action requires the Content Reader interface.")
        origin = self.headers.get("Origin")
        if origin:
            parsed = urllib.parse.urlparse(origin)
            if parsed.hostname not in {"127.0.0.1", "localhost"}:
                raise StoreError("Cross-site requests are not allowed.")

    @staticmethod
    def _match(path: str, pattern: str) -> tuple[str, ...] | None:
        import re

        match = re.fullmatch(pattern, path)
        return match.groups() if match else None

    @staticmethod
    def _query_value(query: dict[str, list[str]], name: str) -> str:
        value = query.get(name, [""])[0].strip()
        if not value:
            raise StoreError(f"Missing {name}.")
        return value


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the local Content Reader + Notes app.")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--host")
    parser.add_argument("--port", type=int)
    parser.add_argument("--open", action="store_true", help="Open the app in the default browser.")
    args = parser.parse_args()
    store = VaultStore(args.config)
    store.ensure_layout()
    host = args.host or store.config.get("host", "127.0.0.1")
    port = args.port or int(store.config.get("port", 4317))
    server = ContentReaderServer((host, port), store)
    url = f"http://{host}:{server.server_address[1]}"
    print(f"Content Reader + Notes is running at {url}")
    print(f"Obsidian notes: {store.notes_root}")
    if args.open:
        threading.Timer(0.35, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Content Reader + Notes.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
