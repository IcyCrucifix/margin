# Margin — Content Reader + Notes

Margin is a local browser workspace for page-linked lecture notes. It opens PDF and PowerPoint files, keeps Markdown/LaTeX memos matched to their exact pages, and can turn the source plus those memos into polished notes later.

Obsidian is optional. Margin can store notes in either:

- any ordinary local folder, using portable Markdown links; or
- an Obsidian vault, using wiki links, PDF page embeds, and course-folder routing.

The source file is always copied byte-for-byte and never edited. Everything stays on the user's machine.

## Quick start — no Obsidian required

```bash
cp config.example.json config.json
python3 -m pip install -r requirements.txt
python3 -m content_reader.server --open
```

The example creates `~/Documents/Margin Notes` automatically. To use Obsidian instead:

```bash
cp config.obsidian.example.json config.json
# edit vault_path, then start Margin
```

See [docs/setup.md](docs/setup.md) for dependencies, configuration, and auto-start.

## Stage 1 — take page-linked notes

1. Choose **Open lecture** and select a `.pdf` or `.pptx` file.
2. Enter the course code, lecture title, and date.
3. Select a thumbnail, or focus the viewer and use **Left/Right Arrow**, to change pages.
4. Write Markdown in the right-hand editor. `$...$` and `$$...$$` math renders in place.
5. Type `\` followed by a symbol name for LaTeX suggestions such as `\omega` and `\Omega`.

Notes autosave. Each memo lives between stable page markers in a separate Markdown file; the lecture source remains untouched.

## Stage 2 — polish manually or automatically

Margin provides three entry points to the same guarded pipeline:

- **Polish now** — process the selected lecture.
- **Polish pending** — process every missing or stale polished note, one at a time.
- **Optional daily schedule** — enable `auto_polish` in `config.json`; Margin runs the pending queue while its local server is running.

Pressing a Stage 2 action opens simple options. If a signed-in Codex CLI or configured AI command is ready, Margin can run directly. Otherwise, Margin explains that direct polishing is unavailable and offers one-click buttons to copy a hidden one-time polishing prompt or a hidden nightly-automation template into the user's own AI system. Users never need to open the Python source to obtain either prompt.

Codex CLI is used when `polish_command` is `null`. Other local AI agents can still be connected with a JSON command template. AI is optional for Stage 1; advanced users can also write a Stage 2 draft themselves and run the deterministic finalizer.

Stage 2 hashes the source and page memos, rejects stale results, and never rewrites an unchanged polished note. See [docs/polish.md](docs/polish.md).

## Storage layouts

Both modes use the same durable structure:

```text
Lecture Notes/
  _Sources/       untouched PDF/PPTX copies
  Raw/            page-linked class memos
  Polished/       Stage 2 notes
  .content-reader/library.json
  Lecture Notes Hub.md
```

Plain-folder mode uses ordinary relative Markdown links and keeps everything under this central library. Obsidian mode additionally supports wiki links, embedded PDF pages, and routing into existing course-code folders.

The exact file and marker contract is in [docs/storage.md](docs/storage.md). Obsidian-specific behavior is in [docs/obsidian-sync.md](docs/obsidian-sync.md).

## Configuration and safety

`config.json` is gitignored. It controls storage mode/path, local host/port, optional AI command, and optional daily polishing. The server binds to `127.0.0.1` by default; mutations require Margin's local-only header and reject cross-site origins.

Stage 1 works without an AI. For Stage 2, custom agent commands should be wrapped with the narrowest filesystem permissions that agent supports. Margin's finalizer still independently validates the draft path and input hash.

## Documentation

- [docs/setup.md](docs/setup.md) — install, select storage, configure, auto-start, tests
- [docs/storage.md](docs/storage.md) — portable folder and shared file-format contract
- [docs/obsidian-sync.md](docs/obsidian-sync.md) — Obsidian-only wiki links and course routing
- [docs/polish.md](docs/polish.md) — manual queue, built-in daily schedule, own-AI command, no-AI path
