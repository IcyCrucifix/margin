# Margin — Content Reader + Notes

Margin is a local browser workspace for page-linked lecture notes. It opens PDF and PowerPoint files, saves raw Markdown/LaTeX memos beside their exact pages, and writes the resulting note system into **your Obsidian vault** without modifying the source file.

It is a local web app, not a signed macOS application. It does not require an Apple Developer account, App Store distribution, an AI API key, or a public deployment. Everything stays on your machine.

## Quick start

```bash
cp config.example.json config.json     # set vault_path to your Obsidian vault
python3 -m pip install -r requirements.txt
python3 -m content_reader.server --open
```

Full requirements (Poppler, optional LibreOffice), login auto-start, and the optional `margin.local` address: [docs/setup.md](docs/setup.md).

## Stage 1: take page-linked notes

1. Choose **Open lecture** and select a `.pdf` or `.pptx` file.
2. Enter the course code, lecture title, and date.
3. Select a page thumbnail, or focus the viewer and use **Left/Right Arrow**, to move through the lecture.
4. Write Markdown in the right-hand Live Preview editor. LaTeX stays as source while the cursor is inside it, then renders in place when the cursor leaves—matching Obsidian's editing model while preserving the original Markdown.
5. Type `\` followed by a symbol name to open LaTeX suggestions. For example, `\omega` offers both `\omega` and `\Omega`. Continue typing an unmatched name to dismiss the menu.

Notes autosave into the Obsidian vault. The source is copied byte-for-byte and remains untouched.

## Stage 2: polish

Choose **Stage 2 — Polish now** to have an AI agent read the full lecture source plus every page memo and create a comprehensive Obsidian-compatible polished note. The built-in integration uses a signed-in Codex CLI installation — no API key — and the agent is swappable: the same pipeline runs with Claude Code, Gemini CLI, another agent, or no AI at all. See [docs/polish.md](docs/polish.md) for the manual/nightly entry points and the bring-your-own-AI contract.

Stage 2 hashes the source and page memos. If they are unchanged and the polished note already exists, it returns **Already up to date** and does not rewrite the note. If a memo changes while Stage 2 is running, the stale result is rejected and can be rerun safely.

The nightly automation runs the same Stage 2 pipeline for all lectures that are missing a polished note or have changed inputs. Every Stage 2 run first rescans the vault for course-code folders, moves any misplaced lecture files, and repairs the affected Obsidian links before checking whether polishing is needed.

Polishing is note-only. The agent process can write only to Margin's private draft directory and the Obsidian vault; the project source tree is read-only to it.

## Obsidian layout

If the vault already has a folder whose name matches the course code, Margin routes that course into `<matching course folder>/Lecture Notes/`:

```text
Lecture Notes/
  _Sources/     untouched PDF/PPTX copies
  Raw/          page-linked class memos
  Polished/     Stage 2 lecture notes
```

Otherwise it uses the central `<vault>/Lecture Notes/` library. The central `Lecture Notes Hub.md` indexes every lecture across both locations. Raw and polished notes contain two-way Obsidian wiki links, and PDFs are embedded under their matching page headings. The exact file formats, page-marker contract, and routing/reconciliation rules are specified in [docs/obsidian-sync.md](docs/obsidian-sync.md).

## Configuration

`config.json` (copy from `config.example.json`; gitignored) controls the vault location, local host/port, course-folder routing, and import size limit. The server binds only to `127.0.0.1`; mutating requests require a local-only header and reject cross-site origins.

## Documentation

- [docs/setup.md](docs/setup.md) — install, configure, auto-start, tests
- [docs/obsidian-sync.md](docs/obsidian-sync.md) — the vault write contract (use your own vault)
- [docs/polish.md](docs/polish.md) — Stage 2 manual/nightly pipeline and bring-your-own-AI contract
