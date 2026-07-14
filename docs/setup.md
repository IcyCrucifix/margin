# Setup

Margin is a local web app: a Python server plus a browser front end. Nothing leaves your machine.

## Requirements

| Dependency | Needed for | Install (macOS) |
|---|---|---|
| Python 3.12+ | everything | `brew install python` |
| `pypdf`, `python-pptx`, `Pillow` | reading PDFs/PPTX, placeholder images | `python3 -m pip install -r requirements.txt` |
| Poppler (`pdftoppm`) | rendering PDF pages and thumbnails | `brew install poppler` |
| LibreOffice (`soffice`) | optional — real slide images for `.pptx` | `brew install --cask libreoffice` |
| An Obsidian vault | where all notes are stored | [obsidian.md](https://obsidian.md) |
| An AI agent (Codex CLI, Claude Code, …) | optional — only for Stage 2 polishing | see [polish.md](polish.md) |

Without LibreOffice, PPTX pages display as text placeholders; notes still work. Node/pnpm are **not** required to run the app — the editor bundle is prebuilt. They are only needed if you edit `web/editor-source.js` (then run `pnpm install && node build-editor.mjs`).

## Configure

1. Copy the example config:

   ```bash
   cp config.example.json config.json
   ```

2. Set `vault_path` to your Obsidian vault folder. The folder must contain a `.obsidian` directory — open it in Obsidian once if it doesn't. `~` is expanded.

| Key | Meaning | Default |
|---|---|---|
| `vault_path` | absolute path to your Obsidian vault | — (required) |
| `notes_root` | name of Margin's library folder inside the vault | `Lecture Notes` |
| `route_to_existing_course_folder` | if a vault folder matches a course code, keep that course's notes there (see [obsidian-sync.md](obsidian-sync.md)) | `true` |
| `host` / `port` | where the local server listens | `127.0.0.1` / `4317` |
| `max_upload_mb` | import size limit | `250` |

`config.json` is gitignored — your vault path never enters the repository.

## Run

```bash
python3 -m content_reader.server --open
```

or double-click `start.command` on macOS. Then open <http://127.0.0.1:4317>. The vault card at the bottom-left proves read/write access to your vault; click it to re-verify.

The server binds to `127.0.0.1` only, and mutating requests require a local-only header and reject cross-site origins.

## Start at login (macOS, optional)

Create `~/Library/LaunchAgents/com.margin.content-reader.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.margin.content-reader</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>cd /path/to/margin && exec python3 -m content_reader.server</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/margin-server.log</string>
  <key>StandardErrorPath</key><string>/tmp/margin-server.log</string>
</dict></plist>
```

Load it with `launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.margin.content-reader.plist`. Note: launchd's `WorkingDirectory` fails inside `~/Documents` on modern macOS (privacy protection, exit code 78) — `cd` inside the shell command as shown.

## Memorable address (optional)

`scripts/margin_redirect.py` serves a 302 redirect on port 80 (it binds `0.0.0.0` because loopback port 80 needs root, but refuses non-loopback clients). Registering the name `margin.local` via `dns-sd -P "Margin" _http._tcp local 80 margin.local 127.0.0.1` makes **http://margin.local** open the app. Run both under LaunchAgents like the server if you want them permanent.

## Tests

```bash
python3 -m unittest discover -s tests
```

The tests build their own throwaway vault under a temp directory; they never touch your configured vault.
