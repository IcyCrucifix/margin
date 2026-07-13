# Instructions & Work Record — Margin (Content Reader + Notes)

This is the project's instruction markdown. It records the original assignment, the deliberate work done so far (with reasoning), and the standing rules. Any AI agent continuing this project must read this file fully before changing anything.

## 1. Original project prompt (verbatim, from the owner)

> I want you to build an app-like system.
>
> This is for taking notes in class and polishing them later. The system should be able to open files, including .pptx and .pdf as the majority.
>
> I should be able to add notes for each page of the given file, acting like memos (the notes that i've taken will not directly affect the original file, but simply adding content to a separate markdown file or so, and the notes of each pages should be marked and matched with the pages they are noted at)
>
> the notes should be in markdown format, and should be compatible with LaTeX. Special request is that, in order to improve efficiency while noting formulas, there should be an auto suggestion of mathematic symbols. for example, when i type in omega, there should be suggestions of both the Small Omega and the Big Omega (as probably $\omega$ in the LaTeX way); and if i don't want them (i simply want the word itself) i can simply continue typing and the suggestion should disappear.
>
> the suggestion should be activated when i type in \, as in LaTeX symbols starts with \.
>
> The taken notes should be sorted, and stored inside the Obsidian Vault HKU_Obsidian. You are given access to use it.
>
> Set up an automation, at the end of every day the system should sort all the notes taken, read the original ppt / pdf of the course, and create a polished note of the lecture, including all contents from the lecture and all notes / guides that i have noted. The polished note should be in markdown & LaTeX, also stored in Obsidian. Make sure the syntax are compatible with Obsidian.
>
> the original notes should also be kept, doubly-linked with the polished note.

## 2. Architecture (as built)

- **Local web app**, no cloud. Python 3.12 stdlib HTTP server (`content_reader/server.py`) serving `web/` and a JSON API on `127.0.0.1:4317`.
- `content_reader/store.py` — vault storage: imports PDF/PPTX byte-for-byte into the Obsidian vault (`config.json` → `/Users/icycrucifix/Desktop/HKU/HKU_Obsidian`), extracts page text (pypdf / python-pptx), renders page images with `pdftoppm` (PPTX converted via LibreOffice `soffice`), and keeps page-linked memos inside `... - Raw Notes.md` between `<!-- content-reader:page:N:start/end -->` markers.
- `content_reader/polish.py` — Stage 2: shells out to the **Codex CLI** (signed-in ChatGPT app) to write polished notes; guarded by input hashes and a lock file. `scripts/` holds the finalizer and nightly batch entry points.
- `web/` — vanilla JS front end (`app.js`), CodeMirror 6 editor bundle (`editor-source.js` → built into `editor-bundle.js` via `node build-editor.mjs`, esbuild). Live LaTeX preview with MathJax; `\`-triggered symbol autocomplete.
- Tests in `tests/` (pytest style). Runtime caches live in `runtime/` (gitignored — contains private lecture renders).

## 3. Owner's standing constraints — do not violate

1. **Automations run in Codex, not elsewhere.** Do not create new scheduling/automation systems (no cron, no extra agents) for the nightly polish.
2. **Don't change features beyond what is asked.** Fix bugs, but keep behavior otherwise identical.
3. Original lecture files and raw memos must never be modified by tooling; notes live only between the page marker comments.
4. Never publish private data: `runtime/`, the Obsidian vault contents, and `pkcs11.txt` are gitignored and must stay out of the public repo.

## 4. Infrastructure set up on the owner's Mac (July 13, 2026)

Three user LaunchAgents in `~/Library/LaunchAgents/` (RunAtLoad + KeepAlive; manage with `launchctl bootstrap/bootout gui/$UID <plist>`):

| Label | Purpose |
|---|---|
| `com.margin.content-reader` | Runs the app server on 127.0.0.1:4317 (logs: `/tmp/margin-server.log`) |
| `com.margin.redirect` | `scripts/margin_redirect.py` on port 80; 302-redirects to the app; refuses non-loopback clients |
| `com.margin.mdns` | `dns-sd -P` registers the memorable address **http://margin.local** |

Python used everywhere: `~/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3` (has pypdf, python-pptx, PIL), falling back to `python3`. Note: launchd jobs cannot use a `WorkingDirectory` inside `~/Documents` (macOS privacy protection, exit code 78) — `cd` inside the `zsh -c` command instead.

## 5. Publishing

Source is public at `github.com/IcyCrucifix/icycrucifix.github.io` under `margin/` (SSH auth as IcyCrucifix works from this machine). It is a **code mirror only** — GitHub Pages cannot run the Python server. Sync procedure: commit locally here, then shallow-clone the site repo, `rm -rf margin`, `git archive HEAD | tar -x -C <clone>/margin`, commit, push.

## 6. Hard-won lessons from the previous session

- The thumbnail-sidebar "won't scroll" bug was **not** an event-handler problem: `.app-shell`/`.reader-layout` grid rows were auto-sized, so tall content silently grew the layout past the viewport and the sidebar never overflowed internally. Rows are now pinned with `grid-template-rows: minmax(0, 1fr)` (plus `min-height: 0` on `.workspace`). Avoid `scrollIntoView` for the thumbnail rail — it scrolls all scrollable ancestors and shifts the whole app; scroll `#pageList` via `scrollTo` only.
- Page navigation is **Left/Right arrows** (owner's explicit choice; Up/Down previously fought with scrolling).
- Cache-busting: bump the `?v=` query strings in `web/index.html` when changing `app.js`/`styles.css`.
- To verify layout/DOM behavior headlessly on this machine (no Chrome, no node on PATH): compile-free WebKit probe — a Swift script with an offscreen `WKWebView` that loads `http://127.0.0.1:4317`, clicks a lecture card, and `evaluateJavaScript`-measures the DOM. Owner's browser is ChatGPT Atlas (Chromium); it cannot be driven headless while running.
- Editor changes require rebuilding: edit `web/editor-source.js`, then `node build-editor.mjs` (esbuild binary at `node_modules/.bin/esbuild`).

## 7. Deliberate work record (chronological)

### Phase A — initial build (earlier sessions, via Codex)
Built the complete system from the original prompt: local Python server + web reader, page-linked memo storage with HTML marker comments in the raw note, CodeMirror live-preview editor with MathJax and `\`-triggered LaTeX symbol autocomplete (e.g. `\omega` suggests ω and Ω; typing past an unmatched name dismisses it), byte-for-byte source copies, Obsidian vault layout with two-way wiki links between raw and polished notes, hub index note, course-folder routing, and the Stage-2 / nightly polish pipeline running through the signed-in Codex CLI. The nightly automation lives **in Codex** — that is deliberate and must stay there.

### Phase B — sidebar scrolling + hardening (session of 2026-07-13, via Claude)

1. **Request:** make the thumbnail sidebar scroll like Apple Preview's; fix crash-prone code; change nothing else.
2. First pass replaced a window-level wheel-capture hijack (which blocked native momentum scrolling and stole editor focus on every tick) with native list scrolling, and added smooth follow-the-selection. Also fixed three latent front-end bugs: `formatDate` threw `RangeError` on malformed dates and killed the whole library render; the drag-drop handler could throw on null `dataTransfer`; dismissing the import dialog with Esc left stale state that silently broke re-selecting the same file.
3. **Regression found by owner:** arrow keys made the whole page shift, and the sidebar still didn't scroll. Two causes: (a) `scrollIntoView` scrolls *all* scrollable ancestors, not just the list — replaced with `scrollTo` on `#pageList` only; (b) per owner's choice, page navigation moved from Up/Down to **Left/Right arrows** (hints and ARIA labels updated).
4. **Root cause finally identified and verified:** `.app-shell` and `.reader-layout` used auto-sized CSS grid rows, so tall content (32 thumbnails ≈ 3300px, tall page renders, long notes) grew the entire layout past the viewport. The sidebar was stretched to full content height — there was nothing to scroll *inside* it, and scroll gestures moved the hidden page overflow instead. Fixed by pinning rows: `grid-template-rows: minmax(0, 1fr)` on `.app-shell` and `.reader-layout`, `min-height: 0` on `.workspace`. Verified headlessly with an offscreen-WKWebView Swift probe against the live server: list 879px viewport / 3277px content (overflows correctly), wheel scrolls the list only, document stays at 0, layout no longer exceeds the viewport.

### Phase C — stability (same session)
The server died with every reboot/terminal close. Installed LaunchAgent `com.margin.content-reader` (RunAtLoad + KeepAlive). Lesson: launchd `WorkingDirectory` inside `~/Documents` fails with exit 78 (macOS privacy protection) — `cd` inside the `zsh -c` command instead. Verified vault read/write and library through the agent-run server.

### Phase D — publishing (same session)
Owner granted GitHub access ("upload it to my github.io repo so that it becomes public"). Machine authenticates via SSH as **IcyCrucifix**. Made the project's first git commit (private data excluded via `.gitignore`: `runtime/`, `pkcs11.txt`, caches) and pushed the source as a `margin/` folder in `icycrucifix.github.io` (a Jekyll blog; files pass through statically). Made explicit to the owner: GitHub Pages is a code mirror only — it cannot run the Python backend.

### Phase E — memorable address (same session)
Owner wanted a letter-based link. Result: **http://margin.local**. Implementation: loopback port 80 needs root on this Mac, but binding `0.0.0.0:80` is allowed unprivileged — so `scripts/margin_redirect.py` listens there, refuses non-loopback clients, and 302-redirects to `127.0.0.1:4317`; LaunchAgent `com.margin.mdns` registers the `margin.local` name via `dns-sd -P`. Verified end-to-end, README updated, public repo synced.

## 8. Current state / loose ends

- All requested features work and are verified: import, per-page memos, LaTeX autocomplete, live math preview, Obsidian sync, Stage-2 polish (Codex), auto-start, margin.local.
- Ideas the owner has not requested (ask before doing): continuous scroll in the main viewer, pinch-zoom, multi-vault support, auth-protected remote hosting.
