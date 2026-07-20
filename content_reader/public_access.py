from __future__ import annotations

import secrets
import threading
import time
from dataclasses import dataclass
from http import HTTPStatus


PUBLIC_MARGIN_ORIGIN = "https://icycrucifix.github.io"
PUBLIC_PROTOCOL_VERSION = 1
CHALLENGE_LIFETIME_SECONDS = 5 * 60
SESSION_IDLE_SECONDS = 12 * 60 * 60


class PublicAccessError(RuntimeError):
    def __init__(self, message: str, status: HTTPStatus):
        super().__init__(message)
        self.status = status


@dataclass
class _Challenge:
    origin: str
    expires_at: float


@dataclass
class _Session:
    origin: str
    expires_at: float


class PublicSessionRegistry:
    """Own short-lived credentials for the public UI without persisting secrets."""

    def __init__(self, allowed_origin: str = PUBLIC_MARGIN_ORIGIN):
        self.allowed_origin = allowed_origin
        self._challenges: dict[str, _Challenge] = {}
        self._sessions: dict[str, _Session] = {}
        self._lock = threading.Lock()

    def register_challenge(self, origin: str, challenge: str) -> None:
        self._require_allowed_origin(origin)
        if not 32 <= len(challenge) <= 128 or any(character not in "0123456789abcdef" for character in challenge):
            raise PublicAccessError("Invalid connection challenge.", HTTPStatus.BAD_REQUEST)
        now = time.monotonic()
        with self._lock:
            self._discard_expired(now)
            self._challenges[challenge] = _Challenge(
                origin=origin,
                expires_at=now + CHALLENGE_LIFETIME_SECONDS,
            )

    def approve(self, origin: str, challenge: str) -> str:
        self._require_allowed_origin(origin)
        now = time.monotonic()
        with self._lock:
            self._discard_expired(now)
            pending = self._challenges.pop(challenge, None)
            if pending is None or pending.origin != origin:
                raise PublicAccessError("The connection request expired.", HTTPStatus.BAD_REQUEST)
            token = secrets.token_urlsafe(32)
            self._sessions[token] = _Session(
                origin=origin,
                expires_at=now + SESSION_IDLE_SECONDS,
            )
            return token

    def authorize(self, token: str | None, origin: str) -> bool:
        if origin != self.allowed_origin or not token:
            return False
        now = time.monotonic()
        with self._lock:
            self._discard_expired(now)
            session = self._sessions.get(token)
            if session is None or session.origin != origin:
                return False
            session.expires_at = now + SESSION_IDLE_SECONDS
            return True

    def revoke(self, token: str | None, origin: str) -> None:
        if not token:
            return
        with self._lock:
            session = self._sessions.get(token)
            if session is not None and session.origin == origin:
                self._sessions.pop(token, None)

    def _require_allowed_origin(self, origin: str) -> None:
        if origin != self.allowed_origin:
            raise PublicAccessError("This site is not allowed to connect to Margin.", HTTPStatus.FORBIDDEN)

    def _discard_expired(self, now: float) -> None:
        self._challenges = {
            key: value for key, value in self._challenges.items() if value.expires_at > now
        }
        self._sessions = {
            key: value for key, value in self._sessions.items() if value.expires_at > now
        }
