from __future__ import annotations

import json
import os
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Any

from .store import PROJECT_ROOT, StoreError, VaultStore


def polish_prompt(store: VaultStore, document_id: str, input_hash: str) -> tuple[str, Path]:
    record = store.get_document(document_id)
    raw_path = store.vault / record["raw_note_path"]
    extracted_path = store.vault / record["extracted_path"]
    source_path = store.vault / record["source_path"]
    draft_path = store.drafts_root / f"{document_id}-{input_hash[:10]}.md"
    python = shutil.which("python3") or "python3"
    finalizer = PROJECT_ROOT / "scripts" / "finalize_polished_note.py"

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
4. Use Obsidian-compatible Markdown. Use `$...$` for inline math and `$$...$$` for display math. Do not use `\\(...\\)` or `\\[...\\]` delimiters. Keep LaTeX commands valid.
5. Do not invent facts that are absent from the source or memos. Mark uncertain extraction with an Obsidian callout.
6. The body should normally contain: overview and learning goals, required foundations, the taught material in logical sections, worked explanations/examples where supported, a formula/key-ideas section when relevant, and a concise review checklist.
7. Return only the body below the title. Do not add YAML frontmatter, the H1 title, source links, or raw-note links; the finalizer adds those deterministically.
8. Never edit or delete the original source or raw memo file.
9. This is a note-polishing task only. Do not edit Margin project code, configuration, scripts, tests, documentation, LaunchAgents, or any other completed implementation file. If code appears to need a change, stop and report the issue; editing code requires the owner's explicit approval.
10. The only file you may create or edit directly is the draft path below. Make all permitted vault updates only by running the deterministic finalizer command.

Before installing the result, check the raw memo once more and confirm internally that every non-empty page memo is represented. Then create the UTF-8 draft at:
{draft_path}

Use the workspace editing tool to create that draft; do not use shell redirection. Finally run exactly:
{python} {finalizer} --doc-id {document_id} --body-file {draft_path} --expected-hash {input_hash}

If the finalizer reports that inputs changed, stop without retrying so a later run can polish the new version.
"""
    return prompt, draft_path


def run_codex_polish(store: VaultStore, document_id: str) -> dict[str, Any]:
    store.reconcile_course_locations()
    record = store.get_document(document_id)
    if not store._document_has_notes(record):
        raise StoreError("Add at least one page memo before running Stage 2.")
    input_hash = store.input_hash(record)
    polished_path = store.vault / record["polished_note_path"]
    if polished_path.exists() and record.get("polished_input_hash") == input_hash:
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

    codex = shutil.which("codex") or "/Applications/ChatGPT.app/Contents/Resources/codex"
    if not Path(codex).exists():
        lock_path.unlink(missing_ok=True)
        raise StoreError("Codex is unavailable. Open the Codex app and try again.")
    prompt, draft_path = polish_prompt(store, document_id, input_hash)
    job_id = uuid.uuid4().hex[:12]
    last_message = job_dir / f"{job_id}-last-message.txt"
    log_path = job_dir / f"{job_id}.log"
    command = [
        codex,
        "exec",
        "--ephemeral",
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
    ]
    try:
        with log_path.open("w", encoding="utf-8") as log:
            process = subprocess.run(
                command,
                stdout=log,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=45 * 60,
            )
        if process.returncode != 0:
            detail = (
                last_message.read_text(encoding="utf-8").strip()
                if last_message.exists()
                else "The Codex polishing process did not complete."
            )
            raise StoreError(detail)
        refreshed = store.get_document(document_id)
        if (
            not polished_path.exists()
            or refreshed.get("polished_input_hash") != input_hash
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
