"""Redirect http://margin.local/ (port 80) to the Margin app on 127.0.0.1:4317.

Bound to 0.0.0.0 because macOS only allows unprivileged low-port binds on
INADDR_ANY, but non-loopback clients are refused before the redirect.
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TARGET = "http://127.0.0.1:4317"


class RedirectHandler(BaseHTTPRequestHandler):
    def _redirect(self) -> None:
        if self.client_address[0] not in ("127.0.0.1", "::1"):
            self.send_error(403, "Margin is local-only.")
            return
        self.send_response(302)
        self.send_header("Location", f"{TARGET}{self.path}")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", "0")
        self.end_headers()

    do_GET = _redirect
    do_HEAD = _redirect

    def log_message(self, fmt, *args) -> None:
        pass


def main() -> int:
    server = ThreadingHTTPServer(("0.0.0.0", 80), RedirectHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
