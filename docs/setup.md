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

Without Poppler, PDF pages display as readable text placeholders; without LibreOffice, PowerPoint pages do the same. Page-linked notes still work in both cases. Node/pnpm are only needed when editing `web/editor-source.js`; the browser bundle is already built.

## Guided macOS install

Run the signed-in user's local installer from the cloned Margin folder:

```bash
./install.command
```

It creates `.venv`, installs only the Python packages in `requirements.txt`, and asks whether to use a Markdown folder or an existing Obsidian vault. It reports the exact Homebrew commands for missing Poppler or LibreOffice but never installs system software silently. At the final prompt, you may opt into a per-user LaunchAgent that starts Margin at sign-in.

## Choose storage

### Ordinary folder (non-Obsidian)

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
./start.command
```

`start.command` prefers the project `.venv` and otherwise uses the system `python3`; it has no dependency on a private Codex or ChatGPT runtime. Open <http://127.0.0.1:4317> for the direct local interface. The storage card at the bottom-left reports the active mode and proves read/write access.

You can instead open <https://icycrucifix.github.io/margin/workspace/> and choose **Connect to local Margin**. The local confirmation page identifies the requesting GitHub Pages origin and requires an explicit **Allow**. Its session credential stays only in JavaScript memory and expires after 12 hours without activity, when Margin restarts, or when you disconnect. Files, notes, page images, Obsidian access, and Stage 2 continue to use `127.0.0.1:4317`; GitHub serves only the static interface.

The companion accepts public-workspace sessions only from `https://icycrucifix.github.io`; wildcard, opaque, and other origins are rejected. Direct local access keeps its existing same-origin behavior.

## Start at login (optional)

Pass `--launch-agent` to the guided installer, or answer yes at its final prompt:

```bash
./install.command --launch-agent
```

Margin refuses to overwrite an existing `~/Library/LaunchAgents/com.margin.content-reader.plist`. The generated agent runs this checkout's `.venv` and writes output to `~/Library/Logs/Margin.log`.

If built-in daily polishing is enabled, Margin must be running at the configured time. `run_on_start: true` additionally processes the pending queue whenever the server starts.

## Tests

```bash
.venv/bin/python3 -m unittest discover -s tests -t .
```

The tests create temporary notes roots and never touch the user's configured folder or vault.
