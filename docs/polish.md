# Stage 2 Polish — selected, pending, or automatic

Stage 2 turns a lecture's source plus page-linked memos into one comprehensive polished note. Obsidian is not required: the finalizer emits wiki links in Obsidian mode and ordinary relative Markdown links in folder mode.

The design separates what the AI does (write one body draft) from what Margin does (select inputs, verify freshness, install the note, and maintain links).

## Pipeline

Every entry point runs the same guarded sequence:

1. Reconcile course routing in Obsidian mode; plain-folder libraries remain central.
2. Refuse lectures with no memos and skip polished notes whose recorded input hash is current.
3. Compute `sha256(source_sha256 + page-memo JSON)` and acquire a per-lecture lock.
4. Give the AI the original source, extracted page text, raw memo path, draft path, and exact finalizer command.
5. Run `scripts/finalize_polished_note.py` with the expected hash. If a memo changed while the draft was being written, reject the stale result.
6. Atomically install the polished note, update raw-note status and the library hash, then regenerate the hub.

An unchanged lecture is never re-polished.

## Manual options in the app

- **Stage 2 — Polish now** opens options for the selected lecture.
- **Polish pending** opens the same options for all missing or stale polished notes. Direct batch processing remains sequential so several local AI agents are not launched at once.

The options dialog checks whether direct polishing is ready. For the default Codex path, Margin checks both that the executable exists and that `codex login status` succeeds. For a custom `polish_command`, it validates the command template and executable.

When direct polishing is unavailable, the dialog says so and keeps the direct-run button disabled. It still provides two one-click copy actions:

- **Copy one-time polish prompt** — a selected-lecture or pending-batch prompt that tells the user's AI to discover the current input hash, read the three authoritative inputs, write only under `runtime/drafts/`, and install through `finalize_polished_note.py`.
- **Copy nightly automation prompt** — a provider-neutral request to create a recurring automation in the user's own AI system at the configured `daily_at` time, using the same pending-list and finalizer contract.

The prompt bodies are not displayed in the interface. Margin generates them with the current absolute project path and copies one only when its button is pressed. Neither prompt edits `config.json`, installs cron, or grants an AI permission to edit the Margin project.

The corresponding local endpoints are:

```text
POST /api/doc/<id>/polish
POST /api/polish/pending
GET  /api/jobs/<job-id>
GET  /api/polish/prompts?scope=selected&document_id=<id>
```

Headless entry points remain available:

```bash
python3 scripts/pending_lectures.py --json
python3 scripts/polish_pending.py
```

## Built-in daily schedule

Users do not need Codex Automations, cron, or a platform-specific scheduler. Enable the optional scheduler in `config.json`:

```json
"auto_polish": {
  "enabled": true,
  "daily_at": "23:00",
  "run_on_start": false
}
```

- `daily_at` is local 24-hour `HH:MM` time.
- Margin checks the pending queue once per calendar date at or after that time.
- The local Margin server must be running.
- `run_on_start: true` additionally launches the pending queue whenever the server starts.
- The last scheduled date and launch result are stored under gitignored `runtime/auto-polish-state.json`.

The scheduler only triggers the existing note-polishing pipeline. It does not modify application code or create another agent service. It is disabled by default.

## Select an AI agent

With `"polish_command": null`, Margin uses a signed-in Codex CLI and starts it with the drafts directory as its workspace plus the notes root as the only additional writable directory.

For another local agent, set a JSON argument array. No shell is used:

```json
"polish_command": [
  "my-agent-wrapper",
  "--prompt",
  "{prompt}"
]
```

Supported placeholders are:

| Placeholder | Value |
|---|---|
| `{prompt}` | complete generated Stage 2 instructions; required |
| `{drafts_root}` | absolute gitignored draft directory |
| `{notes_path}` | absolute folder/vault root |
| `{project_root}` | absolute Margin checkout |

The first argument must resolve to an executable. The command must exit non-zero on failure. It runs with `runtime/drafts/` as its working directory.

Different AI CLIs expose different permission flags, so Margin does not guess them. Put the agent's narrowest read/write policy in a wrapper command and grant writes only to `{drafts_root}` and `{notes_path}`. The generated prompt requires the agent to create one draft and invoke the deterministic finalizer.

Important: the finalizer protects note correctness and freshness, but it cannot sandbox an arbitrary third-party executable. Filesystem isolation for a custom agent is the wrapper author's responsibility.

## No AI

Stage 1 works completely without an AI. A user can also act as the Stage 2 writer:

```bash
python3 scripts/pending_lectures.py --json
# Read the listed source, extracted text, and raw memo paths; write runtime/drafts/body.md.
python3 scripts/finalize_polished_note.py --doc-id <id> \
  --body-file runtime/drafts/body.md --expected-hash <input_hash>
```

This produces the same metadata, links, status update, and hub entry.

## Safety contract

- Original source files are never modified.
- The AI must not edit raw memos; it creates one draft and calls the finalizer.
- Drafts outside the Margin project, empty bodies, frontmatter-bearing bodies, and stale hashes are rejected.
- Codex's default command enforces the notes/drafts write boundary. Custom commands must provide equivalent isolation.
- Automatic and manual batches use the same per-document locks and freshness checks.
- Folder mode requests portable CommonMark; Obsidian mode requests Obsidian-compatible Markdown. Both use `$...$` and `$$...$$` math.

## Common failures

| Message | Meaning |
|---|---|
| *Add at least one page memo…* | Stage 2 requires user notes. |
| *Already up to date* | The source and memos are unchanged. |
| *already polishing this lecture* | A lock is held by another run. |
| *Raw notes changed while polishing* | The stale result was rejected; run again. |
| *Configured AI command is unavailable* | Install/fix the executable named by `polish_command`. |
| *Codex is unavailable* | Install/sign in to Codex or configure another agent command. |
| *finished without installing a current polished note* | The agent did not invoke the finalizer successfully. |
