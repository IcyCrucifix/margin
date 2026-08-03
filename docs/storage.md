# Storage — ordinary folders and Obsidian vaults

Margin has no private note database. The selected notes root stores page memos, extracted text, polished notes, and the library index as ordinary files. Selected PDFs and PowerPoints remain at their original paths and are never copied or moved into the notes root.

## Two modes, one data model

| Mode | Root setting | Link format | Extra behavior |
|---|---|---|---|
| Plain folder | `storage_mode: "folder"` + `notes_path` | relative Markdown links | no other application required |
| Obsidian | `storage_mode: "obsidian"` + `vault_path` | `[[wiki links]]` and PDF embeds | course-folder routing and Obsidian callouts |

Legacy configs that omit `storage_mode` keep the original Obsidian behavior. Plain-folder roots are created automatically. Obsidian roots must already exist; the health check also verifies `.obsidian/`.

## Files created per lecture

With the default `notes_root`, opening a source creates:

| Artifact | Central location | Purpose |
|---|---|---|
| Source reference | original selected path outside or inside the notes root | read in place; never copied, moved, or deleted by Margin |
| Raw note | `Lecture Notes/Raw/<course>/<date> - <title> - Raw Notes.md` | page-linked class memos |
| Extracted text | `Lecture Notes/.content-reader/extracted/<id>.md` | page-by-page source text for Stage 2 |
| Polished note | `Lecture Notes/Polished/<course>/<date> - <title> - Polished.md` | installed by Stage 2 |

The library also contains:

- `.content-reader/library.json` — machine index, source references/hashes, display paths, timestamps, the selected polished-note language, and the last polished input/request hashes;
- `Lecture Notes Hub.md` — human-facing course index with links appropriate to the selected mode.

Each library record uses `polished_note_language` (`en` or `zh-Hans`) for the next polished note and `installed_polished_note_language` for the language of the file currently installed. A requested language change sets `language_repolish_requested` until Stage 2 installs the new version. This keeps raw memos, source paths, YAML keys, and tags language-neutral.

Opening the same course, title, and source bytes returns the existing record. Removing its file or folder entry hides only the matching library display path; the source and raw/polished notes remain untouched, and reopening the source reattaches the existing record.
If the bytes differ but the uploaded filename is the same (case-insensitive), the
new record keeps its own source and raw-note files while inheriting the existing
page memos. Editing a page memo from any matching upload mirrors that page into
every same-named upload that contains it; extra pages on a longer version remain
attached only to versions that contain those pages.

## Raw-note marker contract

Every page has one stable editable region:

```markdown
## Page 3
^page-3

[Open original PDF at page 3](file:///Users/example/Lectures/lecture.pdf#page=3)

### Class notes
<!-- content-reader:page:3:start -->
Your memo lives here, in Markdown + LaTeX.
<!-- content-reader:page:3:end -->
```

Obsidian mode uses the same local file link for a referenced source. Legacy records that already contain managed vault copies retain their embedded `![[source.pdf#page=3]]` links.

The app replaces only the content between the matching `start` and `end` comments. Text outside those markers is preserved. Memo content cannot contain `<!-- content-reader:` because that prefix is reserved for synchronization.

## Plain-folder behavior

- All artifacts stay inside the central `Lecture Notes/` library.
- Links are relative, percent-encoded Markdown destinations; note links keep their `.md` suffix.
- PDFs are linked at `#page=N` rather than embedded because embedding is application-specific.
- Blockquotes use ordinary Markdown rather than Obsidian callout markers.
- Existing course-code directories outside Margin's library are ignored, preventing the app from reorganizing an arbitrary notes folder.

The folder can be synced with any file-sync service or committed to a private repository, but the user is responsible for the privacy policy of that external tool.

## Obsidian behavior

Obsidian mode preserves the original wiki-link, PDF-embed, and course-routing contract. See [obsidian-sync.md](obsidian-sync.md).

## Guarantees

- Source files are read in place and never copied, moved, rewritten, or deleted.
- Page saves edit only their marker-delimited memo region.
- Markdown and JSON writes are atomic (`tempfile` plus `os.replace`).
- `$...$` and `$$...$$` math stays as source-compatible LaTeX.
- Page renders, AI drafts, job logs, locks, and scheduler state stay under the project's gitignored `runtime/` directory, outside the notes root.

Choose the storage mode before opening lectures. Automatic conversion of an existing library between wiki links and relative Markdown links is intentionally not attempted.
