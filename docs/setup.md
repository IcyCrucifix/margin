# Setup

Margin is a local Python server plus a browser front end. It does not require cloud hosting, an Apple Developer account, Obsidian, or an AI for page-linked note taking.

## Requirements

| Dependency | Needed for | macOS example |
|---|---|---|
| Python 3.12+ | everything | `brew install python` |
| `pypdf`, `python-pptx`, `Pillow` | reading files and fallback page images | `python3 -m pip install -r requirements.txt` |
| Poppler (`pdftoppm`) | rendering PDF pages and thumbnails | `brew install poppler` |
| LibreOffice (`soffice`) | optional real slide images for `.pptx` | `brew install --cask libreoffice` |
| Obsidian | optional vault integration only | [obsidian.md](https://obsidian.md) |
| A local AI agent | optional Stage 2 polishing only | see [polish.md](polish.md) |

Without LibreOffice, PowerPoint pages display as text placeholders and notes still work. Node/pnpm are only needed when editing `web/editor-source.js`; the browser bundle is already built.

## Choose storage

### Ordinary folder — default, no Obsidian

```bash
cp config.example.json config.json
```

The default uses:

```json
{
  "storage_mode": "folder",
  "notes_path": "~/Documents/Margin Notes"
}
```

Margin creates the folder when it first starts. Generated notes use ordinary relative Markdown links, so they work in file browsers, GitHub, VS Code, Typora, MarkText, and other Markdown readers.

### Obsidian vault

```bash
cp config.obsidian.example.json config.json
```

Set `vault_path` to an existing vault containing `.obsidian/`. Obsidian mode uses wiki links, PDF page embeds, and optional course-folder routing. See [obsidian-sync.md](obsidian-sync.md).

Choose one storage mode before importing lectures. Margin does not automatically rewrite an existing library when switching modes.

## Configuration

| Key | Meaning | Default |
|---|---|---|
| `storage_mode` | `folder` or `obsidian`; omitted legacy configs remain Obsidian | `obsidian` for legacy configs |
| `notes_path` | root directory for `folder` mode | required in folder mode |
| `vault_path` | vault root for `obsidian` mode | required in Obsidian mode |
| `notes_root` | Margin library folder inside the selected root | `Lecture Notes` |
| `route_to_existing_course_folder` | Obsidian-only routing to matching course folders | `true` in the Obsidian example |
| `host` / `port` | local server address | `127.0.0.1` / `4317` |
| `max_upload_mb` | maximum imported file size | `250` |
| `polish_command` | custom local AI command array; `null` uses Codex | `null` |
| `auto_polish` | optional built-in daily pending queue | disabled |

`config.json` is gitignored, so personal paths and AI settings do not enter the repository.

## Run

```bash
python3 -m content_reader.server --open
```

On macOS, `start.command` does the same thing. Otherwise open <http://127.0.0.1:4317>. The storage card at the bottom-left reports the active mode and proves read/write access.

The server listens on loopback by default. Mutating requests require Margin's private local header and reject cross-site origins.

## Start at login (optional)

Any service manager can keep Margin running. On macOS, create `~/Library/LaunchAgents/com.margin.content-reader.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.margin.content-reader</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>cd /path/to/margin &amp;&amp; exec python3 -m content_reader.server</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/margin-server.log</string>
  <key>StandardErrorPath</key><string>/tmp/margin-server.log</string>
</dict></plist>
```

Load it with `launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.margin.content-reader.plist`. On recent macOS versions, use `cd` inside the shell command rather than a `WorkingDirectory` under `~/Documents`.

If built-in daily polishing is enabled, Margin must be running at the configured time. `run_on_start: true` additionally processes the pending queue whenever the server starts.

## Tests

```bash
python3 -m unittest discover -s tests
```

The tests create temporary notes roots and never touch the user's configured folder or vault.
