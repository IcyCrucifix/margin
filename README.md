# Margin — Content Reader + Notes

Margin is a local browser workspace for page-linked lecture notes. It opens PDF and PowerPoint files, saves raw Markdown/LaTeX memos beside their exact pages, and writes the resulting note system into `HKU_Obsidian` without modifying the source file.

It is a local web app, not a signed macOS application. It does not require an Apple Developer account, App Store distribution, an OpenAI API key, or a public deployment.

## Start

Margin runs automatically: a login agent starts the local server at every boot and restarts it if it stops. Open **http://margin.local** (or `http://127.0.0.1:4317`) in your browser.

To run it by hand instead, double-click `start.command`; it serves the same address. Keep that Terminal window open while using Margin and press `Control-C` to stop it.

## Stage 1: take page-linked notes

1. Choose **Open lecture** and select a `.pdf` or `.pptx` file.
2. Enter the course code, lecture title, and date.
3. Select a real page thumbnail, or focus the viewer and use **Left/Right Arrow**, to move through the lecture.
4. Write Markdown in the right-hand Live Preview editor. LaTeX stays as source while the cursor is inside it, then renders in place when the cursor leaves—matching Obsidian's editing model while preserving the original Markdown.
5. Type `\` followed by a symbol name to open LaTeX suggestions. For example, `\omega` offers both `\omega` and `\Omega`. Continue typing an unmatched name to dismiss the menu.

Notes autosave into the Obsidian vault. The source is copied byte-for-byte and remains untouched.

## Stage 2: polish

Choose **Stage 2 — Polish now** to have Codex read the full lecture source plus every page memo and create a comprehensive Obsidian-compatible polished note. The button uses the signed-in Codex installation, not an API key.

Stage 2 hashes the source and page memos. If they are unchanged and the polished note already exists, it returns **Already up to date** and does not rewrite the note. If a memo changes while Stage 2 is running, the stale result is rejected and can be rerun safely.

The nightly Codex automation runs the same Stage 2 pipeline for all lectures that are missing a polished note or have changed inputs. Every Stage 2 run first rescans the vault for course-code folders, moves any misplaced lecture files, and repairs the affected Obsidian links before checking whether polishing is needed.

## Obsidian layout

If the vault already has a folder whose name matches the course code, Margin routes that course into `<matching course folder>/Lecture Notes/`:

```text
Lecture Notes/
  _Sources/     untouched PDF/PPTX copies
  Raw/          page-linked class memos
  Polished/     Stage 2 lecture notes
```

Otherwise it uses the central `HKU_Obsidian/Lecture Notes/` library. The central `Lecture Notes Hub.md` indexes every lecture across both locations. Raw and polished notes contain two-way Obsidian wiki links, and PDFs are embedded under their matching page headings.

## Configuration

`config.json` controls the vault location, local host/port, course-folder routing, and import size limit. The server binds only to `127.0.0.1`; mutating requests require a local-only header and reject cross-site origins.
