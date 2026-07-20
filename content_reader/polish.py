from __future__ import annotations

import os
import shutil
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any

from .store import PROJECT_ROOT, StoreError, VaultStore
from .languages import language_spec


DIRECT_POLISH_UNAVAILABLE = (
    "Direct manual polishing is unavailable. You may copy one of the prompts below "
    "into your AI automation to activate your own polishing system."
)
CODEX_LOGIN_ATTEMPTS = 2
DIRECT_POLISH_REASONING_EFFORT = "medium"


def _resolve_executable(command: str) -> str | None:
    executable = Path(command).expanduser()
    return str(executable.resolve()) if executable.is_file() else shutil.which(command)


def _polish_template_values(store: VaultStore, prompt: str) -> dict[str, str]:
    return {
        "prompt": prompt,
        "drafts_root": str(store.drafts_root),
        "notes_path": str(store.vault),
        "project_root": str(PROJECT_ROOT),
    }


def _codex_environment() -> dict[str, str]:
    environment = os.environ.copy()
    environment.setdefault("HOME", str(Path.home()))
    environment.setdefault("CODEX_HOME", str(Path.home() / ".codex"))
    return environment


def _codex_is_signed_in(codex: str) -> bool:
    for attempt in range(CODEX_LOGIN_ATTEMPTS):
        auth = subprocess.run(
            [codex, "login", "status"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=12,
            check=False,
            env=_codex_environment(),
        )
        if auth.returncode == 0:
            return True
        if attempt + 1 < CODEX_LOGIN_ATTEMPTS:
            time.sleep(0.15)
    return False


def polish_runner_status(store: VaultStore) -> dict[str, Any]:
    """Report whether Margin can launch a configured AI without starting a polish job."""
    template = store.config.get("polish_command")
    if template is not None:
        if (
            not isinstance(template, list)
            or not template
            or not all(isinstance(part, str) and part for part in template)
        ):
            return {
                "available": False,
                "kind": "configured",
                "label": "Configured AI",
                "reason": "polish_command must be a non-empty JSON array of command arguments.",
                "message": DIRECT_POLISH_UNAVAILABLE,
            }
        if not any("{prompt}" in part for part in template):
            return {
                "available": False,
                "kind": "configured",
                "label": "Configured AI",
                "reason": "polish_command must include a {prompt} placeholder.",
                "message": DIRECT_POLISH_UNAVAILABLE,
            }
        try:
            sample_command = [
                part.format(**_polish_template_values(store, "<generated Stage 2 prompt>"))
                for part in template
            ]
        except (KeyError, ValueError) as exc:
            return {
                "available": False,
                "kind": "configured",
                "label": "Configured AI",
                "reason": f"polish_command contains an invalid placeholder: {exc}",
                "message": DIRECT_POLISH_UNAVAILABLE,
            }
        resolved = _resolve_executable(sample_command[0])
        if not resolved:
            return {
                "available": False,
                "kind": "configured",
                "label": "Configured AI",
                "reason": f"Configured AI command is unavailable: {sample_command[0]}",
                "message": DIRECT_POLISH_UNAVAILABLE,
            }
        return {
            "available": True,
            "kind": "configured",
            "label": "Configured AI agent",
            "reason": f"Ready to run {Path(resolved).name}.",
        }

    codex = shutil.which("codex") or "/Applications/ChatGPT.app/Contents/Resources/codex"
    if not Path(codex).exists():
        return {
            "available": False,
            "kind": "codex",
            "label": "Codex CLI",
            "reason": "Codex CLI is not installed.",
            "message": DIRECT_POLISH_UNAVAILABLE,
        }
    try:
        is_signed_in = _codex_is_signed_in(codex)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {
            "available": False,
            "kind": "codex",
            "label": "Codex CLI",
            "reason": f"Codex sign-in could not be verified: {exc}",
            "message": DIRECT_POLISH_UNAVAILABLE,
        }
    if not is_signed_in:
        return {
            "available": False,
            "kind": "codex",
            "label": "Codex CLI",
            "reason": "Codex CLI is installed but not signed in.",
            "message": DIRECT_POLISH_UNAVAILABLE,
        }
    return {
        "available": True,
        "kind": "codex",
        "label": "Codex CLI",
        "reason": "Codex CLI is installed and signed in.",
    }


def _safe_polish_instructions(store: VaultStore, target: str) -> str:
    python = shutil.which("python3") or "python3"
    pending_script = PROJECT_ROOT / "scripts" / "pending_lectures.py"
    finalizer = PROJECT_ROOT / "scripts" / "finalize_polished_note.py"
    markdown_format = (
        "Use Obsidian-compatible Markdown for the body."
        if store.storage_mode == "obsidian"
        else "Use portable CommonMark Markdown for the body."
    )
    return f"""Work only on Margin lecture notes. Do not edit Margin source code, configuration,
tests, documentation, the original lecture files, or the raw memo files.

Margin project root: {PROJECT_ROOT}
Target: {target}

1. Run `{python} {pending_script} --json` and read its JSON output.
2. Select only the target lecture(s). If a target is absent, it is already current; report that and do nothing.
3. For every selected item, completely read `source_absolute`, `extracted_absolute`, and `raw_note_absolute`.
4. Write a comprehensive, prerequisite-first Markdown lecture-note body. Preserve every substantive memo, cover the complete source, explain jargon before using it, keep valid `$...$` and `$$...$$` LaTeX, and never invent unsupported facts. Follow each pending item's `polished_note_language` and its language instruction. {markdown_format} Return body content only: no YAML frontmatter, H1 title, or source links.
5. Create the body as a UTF-8 file under `{PROJECT_ROOT / 'runtime' / 'drafts'}`. Do not write anywhere else directly.
6. Install it only by running `{python} {finalizer} --doc-id <item id> --body-file <draft path> --expected-request-hash <item polish_request_hash>`.
7. If the finalizer reports changed inputs, stop for that lecture without retrying. Continue only with other independently pending lectures.
8. Report which polished notes were installed, skipped, or rejected. Never claim success unless the finalizer succeeds."""


def manual_polish_automation_prompt(
    store: VaultStore, document_id: str | None = None
) -> str:
    if document_id is not None:
        record = store.get_document(document_id)
        target = (
            f"Polish only document `{document_id}` — {record['course']} — {record['title']} — "
            "using its current pending-list entry."
        )
    else:
        target = "Polish every lecture currently returned by the pending-list command, one at a time."
    return f"""Run Margin Stage 2 now with your own AI tools.

{_safe_polish_instructions(store, target)}"""


def nightly_polish_automation_prompt(store: VaultStore) -> str:
    automation = store.config.get("auto_polish") or {}
    daily_at = automation.get("daily_at", "23:00") if isinstance(automation, dict) else "23:00"
    target = "At each run, polish every lecture currently returned by the pending-list command, sequentially."
    return f"""Create a recurring automation named `Margin nightly polish` in this AI system.

Schedule it every day at {daily_at} in my local timezone. Each scheduled run must follow the instructions below exactly. Do not replace this with an operating-system cron job or edit Margin configuration. If this AI system cannot create recurring automations, tell me clearly that no automation was created.

{_safe_polish_instructions(store, target)}"""


def polish_prompt(store: VaultStore, document_id: str, request_hash: str) -> tuple[str, Path]:
    record = store.get_document(document_id)
    raw_path = store.vault / record["raw_note_path"]
    extracted_path = store.vault / record["extracted_path"]
    source_path = store.vault / record["source_path"]
    draft_path = store.drafts_root / f"{document_id}-{request_hash[:10]}.md"
    python = shutil.which("python3") or "python3"
    finalizer = PROJECT_ROOT / "scripts" / "finalize_polished_note.py"
    markdown_requirement = (
        "Use Obsidian-compatible Markdown"
        if store.storage_mode == "obsidian"
        else "Use portable CommonMark Markdown with ordinary Markdown links"
    )
    uncertainty_requirement = (
        "Mark uncertain extraction with an Obsidian callout"
        if store.storage_mode == "obsidian"
        else "Mark uncertain extraction with a normal Markdown blockquote"
    )
    language_instruction = language_spec(record.get("polished_note_language")).output_instruction

    prompt = f"""You are running Stage 2 of the local lecture-note workflow for one lecture.

Read these inputs completely:
- Original source (authoritative): {source_path}
- Page-by-page extracted source text: {extracted_path}
- Page-linked raw class memos: {raw_path}

Create comprehensive, polished lecture notes for {record['course']} — {record['title']}.

Requirements:
1. Preserve every substantive fact, question, warning, formula, and guide from the raw class memos. Do not silently drop a memo.
2. Cover the complete lecture source, page by page, while reorganizing it into a prerequisite-first teaching structure rather than merely copying slide bullets.
3. Explain abbreviations and jargon before relying on them. Separate what a concept is from what it does when that distinction helps.
4. {markdown_requirement}. Use `$...$` for inline math and `$$...$$` for display math. Do not use `\\(...\\)` or `\\[...\\]` delimiters. Keep LaTeX commands valid.
5. {language_instruction}
6. Do not invent facts that are absent from the source or memos. {uncertainty_requirement}.
7. The body should normally contain: overview and learning goals, required foundations, the taught material in logical sections, worked explanations/examples where supported, a formula/key-ideas section when relevant, and a concise review checklist.
8. Return only the body below the title. Do not add YAML frontmatter, the H1 title, source links, or raw-note links; the finalizer adds those deterministically.
9. Never edit or delete the original source or raw memo file.
10. This is a note-polishing task only. Do not edit Margin project code, configuration, scripts, tests, documentation, LaunchAgents, or any other completed implementation file. If code appears to need a change, stop and report the issue; editing code requires the owner's explicit approval.
11. The only file you may create or edit directly is the draft path below. Make all permitted notes-workspace updates only by running the deterministic finalizer command.

Before installing the result, check the raw memo once more and confirm internally that every non-empty page memo is represented. Then create the UTF-8 draft at:
{draft_path}

Create that draft with your normal file-writing tool; do not use shell redirection. Finally run exactly:
{python} {finalizer} --doc-id {document_id} --body-file {draft_path} --expected-request-hash {request_hash}

If the finalizer reports that inputs changed, stop without retrying so a later run can polish the new version.
"""
    return prompt, draft_path


def build_polish_command(
    store: VaultStore, prompt: str, last_message: Path
) -> tuple[list[str], str]:
    template = store.config.get("polish_command")
    if template is not None:
        if (
            not isinstance(template, list)
            or not template
            or not all(isinstance(part, str) and part for part in template)
        ):
            raise StoreError("polish_command must be a non-empty JSON array of command arguments.")
        if not any("{prompt}" in part for part in template):
            raise StoreError("polish_command must include a {prompt} placeholder.")
        values = _polish_template_values(store, prompt)
        try:
            command = [part.format(**values) for part in template]
        except (KeyError, ValueError) as exc:
            detail = exc.args[0] if isinstance(exc, KeyError) else str(exc)
            raise StoreError(f"Invalid polish_command placeholder: {detail}") from exc
        resolved = _resolve_executable(command[0])
        if not resolved:
            raise StoreError(f"Configured AI command is unavailable: {command[0]}")
        command[0] = resolved
        return command, "configured AI agent"

    codex = shutil.which("codex") or "/Applications/ChatGPT.app/Contents/Resources/codex"
    if not Path(codex).exists():
        raise StoreError(
            "Codex is unavailable. Install/sign in to Codex, or set polish_command for another local AI agent."
        )
    return (
        [
            codex,
            "exec",
            "--ephemeral",
            "--ignore-user-config",
            "--config",
            f'model_reasoning_effort="{DIRECT_POLISH_REASONING_EFFORT}"',
            "--color",
            "never",
            "--sandbox",
            "workspace-write",
            "--cd",
            str(store.drafts_root),
            "--add-dir",
            str(store.vault),
            "--output-last-message",
            str(last_message),
            prompt,
        ],
        "Codex",
    )


def run_codex_polish(store: VaultStore, document_id: str) -> dict[str, Any]:
    store.reconcile_course_locations()
    record = store.get_document(document_id)
    if not store._document_has_notes(record):
        raise StoreError("Add at least one page memo before running Stage 2.")
    input_hash = store.input_hash(record)
    polished_path = store.vault / record["polished_note_path"]
    if (
        polished_path.exists()
        and record.get("polished_input_hash") == input_hash
        and not record.get("language_repolish_requested", False)
    ):
        return {
            "status": "skipped",
            "message": "Already up to date — the source and raw memos have not changed.",
        }

    job_dir = store.runtime_root / "jobs"
    job_dir.mkdir(parents=True, exist_ok=True)
    store.drafts_root.mkdir(parents=True, exist_ok=True)
    lock_path = job_dir / f"{document_id}.lock"
    try:
        lock_fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        return {
            "status": "skipped",
            "message": "Stage 2 is already polishing this lecture.",
        }
    os.close(lock_fd)

    request_hash = store.polish_request_hash(record)
    prompt, draft_path = polish_prompt(store, document_id, request_hash)
    job_id = uuid.uuid4().hex[:12]
    last_message = job_dir / f"{job_id}-last-message.txt"
    log_path = job_dir / f"{job_id}.log"
    try:
        command, agent_name = build_polish_command(store, prompt, last_message)
        with log_path.open("w", encoding="utf-8") as log:
            process = subprocess.run(
                command,
                cwd=store.drafts_root,
                stdout=log,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=45 * 60,
                env=_codex_environment(),
            )
        if process.returncode != 0:
            if last_message.exists():
                detail = last_message.read_text(encoding="utf-8").strip()
            else:
                log_tail = log_path.read_text(encoding="utf-8", errors="replace")[-2000:].strip()
                detail = log_tail or f"The {agent_name} polishing process did not complete."
            raise StoreError(detail)
        refreshed = store.get_document(document_id)
        if (
            not polished_path.exists()
            or refreshed.get("polished_input_hash") != input_hash
            or refreshed.get("installed_polished_note_language")
            != language_spec(record.get("polished_note_language")).code
            or refreshed.get("language_repolish_requested", False)
        ):
            raise StoreError("Stage 2 finished without installing a current polished note.")
        return {
            "status": "completed",
            "message": "Polished note created and linked to the raw memos.",
            "polished_note_path": str(polished_path),
            "draft_path": str(draft_path),
            "job_log": str(log_path),
        }
    finally:
        lock_path.unlink(missing_ok=True)
