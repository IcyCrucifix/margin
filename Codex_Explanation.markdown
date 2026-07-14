# A Brief Explanation Given By Codex


## 1. Notes syncing

The default GitHub configuration uses an ordinary local folder:

```json
"storage_mode": "folder",
"notes_path": "~/Documents/Margin Notes"
```

When someone imports a PDF or PowerPoint, Margin creates:

```text
Margin Notes/
└── Lecture Notes/
    ├── _Sources/        Original PDF/PPTX copies
    ├── Raw/             Page-linked user memos
    ├── Polished/        Stage 2 results
    ├── .content-reader/
    │   ├── library.json
    │   └── extracted/   Page-by-page extracted text
    └── Lecture Notes Hub.md
```

For each page, the raw note contains an editable region:

```markdown
## Page 3

### Class notes
<!-- content-reader:page:3:start -->
The user's memo goes here.
<!-- content-reader:page:3:end -->
```

When the user writes in Margin:

1. The browser autosaves the current page memo.
2. Margin finds that page’s marker pair.
3. It replaces only the text between the markers.
4. It writes the updated Markdown atomically, preventing half-written files.
5. The original lecture file and text outside the markers remain untouched.

Users can also edit the Markdown file with another editor. Margin and Stage 2 read the current contents between those markers.

For cross-device synchronization, users can place `notes_path` inside iCloud Drive, Dropbox, OneDrive, Syncthing, or another synchronized folder. That external service moves the files; Margin only performs local file reads and writes.

### Optional Obsidian mode

If a user selects:

```json
"storage_mode": "obsidian",
"vault_path": "/their/Obsidian/Vault"
```

Margin writes directly into that vault. It then uses Obsidian wiki links, embedded PDF pages, and optional course-folder routing. Obsidian Sync is still an external service—Margin does not require an Obsidian plugin or communicate with Obsidian’s servers.

## 2. Stage 2 polishing

Stage 2 combines:

- the original PDF/PPTX;
- extracted page text;
- the user’s page memos;
- an AI-generated body draft.

It then produces one comprehensive polished Markdown note.

The guarded pipeline works as follows:

1. Margin checks that the lecture has at least one memo.
2. It calculates an input hash from the original source hash and current page memos.
3. If that hash matches the previously polished version, it reports **Already up to date**.
4. It acquires a per-lecture lock so two processes cannot polish the same lecture simultaneously.
5. It gives the configured AI the source, extracted text, raw note, draft destination, and finalizer instructions.
6. The AI writes a temporary body draft.
7. Margin’s deterministic finalizer recalculates the input hash.
8. If the memos changed while the AI was working, the draft is rejected as stale.
9. Otherwise, Margin atomically installs the polished note and updates the raw-note status, library index, and notes hub.

The AI therefore does the writing, but Margin controls validation and installation.

## 3. Users without nightly automation

The GitHub version does not require your Codex nightly automation. It provides three choices:

- **Polish now:** polish the currently selected lecture.
- **Polish pending:** sequentially polish every missing or outdated lecture.
- **Optional daily scheduler:** run the pending queue at a configured local time while the Margin server is running.

The scheduler is disabled by default:

```json
"auto_polish": {
  "enabled": false,
  "daily_at": "23:00",
  "run_on_start": false
}
```

This is built into Margin itself—users do not need cron, Codex Automations, or Obsidian.

## 4. Users with their own AI

If this remains `null`:

```json
"polish_command": null
```

Margin tries to use a signed-in Codex CLI.

A user can instead connect another local AI:

```json
"polish_command": [
  "my-agent-wrapper",
  "--prompt",
  "{prompt}"
]
```

Margin passes the complete instructions through `{prompt}`. It launches the command without a shell and expects the agent to create a draft and run the supplied finalizer.

Users without any AI can still use all Stage 1 note-taking features. They may also write the Stage 2 draft manually and run the same finalizer themselves.

The GitHub documentation for these contracts is in [storage.md](https://github.com/IcyCrucifix/margin/blob/public/docs/storage.md), [polish.md](https://github.com/IcyCrucifix/margin/blob/public/docs/polish.md), and [obsidian-sync.md](https://github.com/IcyCrucifix/margin/blob/public/docs/obsidian-sync.md).
