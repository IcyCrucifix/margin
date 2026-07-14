# Storage — ordinary folders and Obsidian vaults

Margin has no private note database. The selected notes root is the store: imports, page memos, extracted text, polished notes, and the library index are ordinary files that remain usable without Margin.

## Two modes, one data model

| Mode | Root setting | Link format | Extra behavior |
|---|---|---|---|
| Plain folder | `storage_mode: "folder"` + `notes_path` | relative Markdown links | no other application required |
| Obsidian | `storage_mode: "obsidian"` + `vault_path` | `[[wiki links]]` and PDF embeds | course-folder routing and Obsidian callouts |

Legacy configs that omit `storage_mode` keep the original Obsidian behavior. Plain-folder roots are created automatically. Obsidian roots must already exist; the health check also verifies `.obsidian/`.

## Files created per lecture

With the default `notes_root`, an import creates:

| Artifact | Central location | Purpose |
|---|---|---|
| Source copy | `Lecture Notes/_Sources/<course>/<date> - <title> - <id6>.<type>` | byte-for-byte PDF/PPTX copy; never modified |
| Raw note | `Lecture Notes/Raw/<course>/<date> - <title> - Raw Notes.md` | page-linked class memos |
| Extracted text | `Lecture Notes/.content-reader/extracted/<id>.md` | page-by-page source text for Stage 2 |
| Polished note | `Lecture Notes/Polished/<course>/<date> - <title> - Polished.md` | installed by Stage 2 |

The library also contains:

- `.content-reader/library.json` — machine index, source hashes, paths, timestamps, and last polished input hash;
- `Lecture Notes Hub.md` — human-facing course index with links appropriate to the selected mode.

Re-importing the same course, title, and source bytes returns the existing record.
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

[Open original PDF at page 3](../../_Sources/COMP1010/lecture.pdf#page=3)

### Class notes
<!-- content-reader:page:3:start -->
Your memo lives here, in Markdown + LaTeX.
<!-- content-reader:page:3:end -->
```

Obsidian mode uses an embedded `![[source.pdf#page=3]]` in the same location.

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

- Source files are copied byte-for-byte and never rewritten.
- Page saves edit only their marker-delimited memo region.
- Markdown and JSON writes are atomic (`tempfile` plus `os.replace`).
- `$...$` and `$$...$$` math stays as source-compatible LaTeX.
- Page renders, AI drafts, job logs, locks, and scheduler state stay under the project's gitignored `runtime/` directory, outside the notes root.

Choose the storage mode before importing lectures. Automatic conversion of an existing library between wiki links and relative Markdown links is intentionally not attempted.
