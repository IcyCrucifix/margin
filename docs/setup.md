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

## Connect the hosted workspace

The hosted interface at <https://icycrucifix.github.io/margin/workspace/> does not replace the local companion. Each user runs their own Margin process and connects the hosted interface to that process. For this mode, the companion must use the default `127.0.0.1:4317`; the published interface does not discover custom hosts or ports.

### Access required

| Access | Why Margin needs it | Scope |
|---|---|---|
| Chrome loopback permission | lets the HTTPS workspace call the companion running on the same computer | `https://icycrucifix.github.io` to `http://127.0.0.1:4317` only |
| Pairing confirmation | proves that the user intentionally approved this browser tab | one origin-scoped session held only in JavaScript memory |
| Pop-up permission, if blocked | opens the local confirmation page after the user clicks **Connect** | the local `/connect` window only |
| Notes-folder or vault access | lets the companion save sources, raw memos, and polished notes | only the folder or Obsidian vault configured in `config.json` |
| Lecture-file access | lets the companion copy and render a PDF or PowerPoint | only files the user explicitly selects or drops into Margin |

Recent Chrome versions split access to the local machine from access to other devices on the local network. Because Margin connects to `127.0.0.1`, it needs the loopback permission, which Chrome may label **Apps on device**. Older Chrome versions may show the combined **Local network** permission instead. Margin does not scan the LAN and does not need router, printer, or other-device access.

On macOS, Chrome may also appear under **System Settings → Privacy & Security → Local Network**. Enable Google Chrome there only if macOS has disabled it and the site-level permission alone does not work.

### First connection

1. Install Margin with `./install.command` and choose the local notes folder or Obsidian vault it may use.
2. Start the companion with `./start.command`. Keep it running and confirm that <http://127.0.0.1:4317> opens locally.
3. Open <https://icycrucifix.github.io/margin/workspace/> in desktop Chrome and choose **Connect to local Margin**.
4. Accept Chrome's prompt to connect to the app on this device. If no prompt appears after an earlier denial, open the icon left of the address bar, choose **Site settings**, and set **Apps on device** or **Local network** to **Allow**.
5. If Chrome blocks the local confirmation window, allow pop-ups for `icycrucifix.github.io` and try again.
6. In the **Connect Margin** window, confirm that the requesting origin is exactly `https://icycrucifix.github.io`, then choose **Allow connection**.
7. Return to the workspace tab. The library and reader appear only after the authenticated loopback checks succeed.

The session credential expires after 12 hours without activity, when Margin restarts, or when the user chooses **Disconnect**. Reconnect by repeating steps 3–6. Do not expose Margin on `0.0.0.0`, forward port `4317`, or publish `config.json`; hosted-workspace mode is designed for loopback only.

### Troubleshooting

| Symptom | Check |
|---|---|
| **Local Margin could not be reached** | start `./start.command` and verify <http://127.0.0.1:4317> opens |
| Confirmation window does not appear | allow pop-ups for `icycrucifix.github.io`, then click **Connect** again |
| Pairing was approved but the workspace cannot connect | allow **Apps on device** or **Local network** in Chrome site settings, reload the workspace, and reconnect |
| Permission is allowed but macOS still blocks access | enable Google Chrome in **System Settings → Privacy & Security → Local Network** |
| Work or school Chrome still blocks the request | ask the administrator whether loopback/local-network enterprise policy blocks `https://icycrucifix.github.io` |
| Companion uses another port | restore `"host": "127.0.0.1"` and `"port": 4317` for hosted-workspace support |

Files, notes, page images, Obsidian access, and Stage 2 continue to use `127.0.0.1:4317`; GitHub serves only static HTML, CSS, and JavaScript. The public page receives no direct filesystem permission, and it has no account, upload service, analytics, or cloud storage.

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
