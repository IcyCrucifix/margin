# Margin Update Blog

**Current version:** 1.2.0

**Last updated:** July 20, 2026

This is the canonical update history for Margin. The local copy and the copy published on GitHub are kept as the same version-controlled file.

## Version 1.2.0 — Secure hosted workspace

**Released:** July 20, 2026

Version 1.2.0 made it possible to open Margin's interface from GitHub Pages while keeping every lecture, note, vault path, and write operation on the user's own computer.

### New features

- Added the hosted workspace at `https://icycrucifix.github.io/margin/workspace/`.
- Added a local companion protocol so the hosted interface can use the installed Margin library through `127.0.0.1:4317`.
- Added explicit, origin-scoped connection approval. A user must approve the GitHub Pages origin in a local confirmation window before the workspace can read or edit the local library.
- Kept the session credential in browser memory and made it expire after inactivity, a Margin restart, or manual disconnection.
- Preserved the local-only privacy boundary: GitHub receives no lecture files, notes, vault paths, session credentials, or filesystem access.
- Added a guided macOS installer, initial configuration helper, and LaunchAgent setup for the local companion.
- Added application-version and companion-protocol reporting to the health endpoint.
- Reused Margin's existing reader and editor through a shared API client instead of maintaining a separate hosted app.

### Bug fixes

- Fixed hosted-workspace connection handling, Chrome loopback access, and stale API-client caching.

## Version 1.1.0 — Public release and workflow expansion

**Updated:** July 14–19, 2026

Version 1.1.0 strengthened everyday reading and note-taking, introduced bilingual use, and added the first GitHub Pages product site.

### New features

- Made uploads with the same complete filename share their page notes, including future edits on pages present in each matching upload.
- Added a keyboard-shortcuts dialog and improved keyboard-driven navigation.
- Added English and Simplified Chinese interface switching.
- Added per-lecture polished-note language selection and the ability to request a new polished version in another supported language.
- Added a public Margin product site and a GitHub Pages build/deployment workflow.
- Added a strict public-artifact allowlist so private configuration, notes, and local runtime data cannot enter the Pages bundle.

### Bug fixes

- Fixed PDF reload behavior so the reader restores the correct file and page more reliably.
- Fixed the language switcher after local service updates.
- Limited concurrent PDF page rendering so a burst of requests cannot exhaust memory.
- Kept the Python and frontend package versions synchronized.

## Version 1.0.0 — Initial Margin application

**Developed:** July 13, 2026

**Published:** July 14, 2026

Version 1.0.0 established Margin's complete local lecture-reading and note-polishing workflow.

### What's included

- A local browser reader for PDF and PowerPoint lecture files.
- A separate Markdown memo for every page or slide, with autosave and live preview.
- CodeMirror editing and LaTeX-oriented suggestions for symbols such as `\omega` and `\Omega`.
- Original lecture files kept untouched while source copies, raw memos, and polished notes are stored separately.
- Plain-folder and Obsidian-vault storage modes with portable Markdown links.
- A generated lecture hub linking source material, raw notes, and polished notes.
- Stage 2 polishing through the existing `scripts/polish_pending.py` workflow.
- Hash-based pending-work detection and guarded finalization so changed inputs are not overwritten by stale polishing results.
- A note-only Stage 2 boundary: the polishing workflow may update note artifacts but not application code, configuration, tests, or documentation.
- Local startup through `start.command`, plus the optional `margin.local` redirect helper.

The original local development commits were consolidated into the public-release snapshot. At that point, the Python package reported `1.0.0` while the frontend package file already contained `1.1.0`; commit `e373f16` later made both surfaces report `1.1.0`. This log uses the Python application version to identify the initial release and records the mismatch rather than rewriting the historical metadata.

## History coverage

The complete reachable GitHub history was reviewed to reconstruct this blog. Commits, pushes, pull requests, merges, branch synchronizations, documentation-only edits, and wording-only edits are not counted as product updates by themselves. A changelog entry is included only when the repository history shows a new feature or a bug fix.

Git records commits and merges, not the exact time or command used for each `git push`, so unavailable push-event timestamps are not invented here.
