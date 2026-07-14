# Obsidian Sync — how Margin writes into your vault

Margin does not have its own database. The Obsidian vault **is** the store: every import, memo, and polished note becomes plain files in your vault, readable and linkable in Obsidian without any plugin. This page specifies the exact contract so you can point Margin at your own vault — or build your own tooling on top of the files it writes.

## The vault contract

- `vault_path` in `config.json` must be a folder containing `.obsidian/` (open it in Obsidian once to create it). The health check in the app verifies: folder exists → `.obsidian` present → a write+read-back proof file succeeds.
- Margin creates one library folder in the vault root, named by `notes_root` (default `Lecture Notes`).
- Margin **never** edits any file it did not create. Your existing notes are untouched.

## Files created per lecture

Importing a `.pdf`/`.pptx` produces four artifacts:

| Artifact | Central location (default) | Purpose |
|---|---|---|
| Source copy | `Lecture Notes/_Sources/<course>/<date> - <title> - <id6>.pdf` | byte-for-byte copy of the lecture file; never modified |
| Raw note | `Lecture Notes/Raw/<course>/<date> - <title> - Raw Notes.md` | your page-linked class memos |
| Extracted text | `Lecture Notes/.content-reader/extracted/<id>.md` | machine-extracted page text, one `## Page N` per page, used by Stage 2 |
| Polished note | `Lecture Notes/Polished/<course>/<date> - <title> - Polished.md` | created later by Stage 2 ([polish.md](polish.md)) |

Plus two vault-wide files:

- `Lecture Notes/.content-reader/library.json` — the index. Each record holds `id` (16-hex digest of course+title+file hash), paths of the four artifacts, `page_count`, `source_sha256`, timestamps, and `polished_input_hash` once polished. Re-importing the same course+title+file is a no-op returning the existing record.
- `Lecture Notes/Lecture Notes Hub.md` — a human-facing index note, one table per course with wiki links to raw/polished/source. Regenerated after every change.

## Raw note format (the sync-critical part)

The raw note is a normal Obsidian Markdown file with YAML frontmatter (`content_reader: raw`, `document_id`, `course`, `lecture_date`, `source_sha256`, `page_count`, `status`, and the linked paths). For each page it contains:

```markdown
## Page 3
^page-3

![[Lecture Notes/_Sources/COMP1010/2026-07-13 - Caches - a1b2c3.pdf#page=3]]

### Class notes
<!-- content-reader:page:3:start -->
Your memo lives here, in Markdown + LaTeX.
<!-- content-reader:page:3:end -->
```

Rules the app enforces:

- **Memos live only between the marker comments.** Saving a page memo replaces exactly the text between its `start`/`end` markers, atomically (temp file + rename). Everything else in the file — including anything you type outside the markers in Obsidian — is preserved verbatim.
- Memo content may not contain the string `<!-- content-reader:` (reserved for synchronization).
- PDF pages are embedded with `![[source#page=N]]` so Obsidian shows the exact page above each memo; PPTX raw notes link to the original file once instead.
- `^page-N` block anchors let other notes deep-link to a page's memos.
- When Stage 2 installs a polished note, the raw note's `status: raw` flips to `status: polished-available`; raw and polished notes carry two-way wiki links.

You can edit memos in Obsidian directly: as long as your text stays between a page's markers, the app reads it back and Stage 2 treats it as changed input.

## Course-folder routing

With `route_to_existing_course_folder: true`, Margin scans the vault (outside its own library, skipping hidden folders, `.obsidian`, `.git`, `node_modules`) for a folder whose name — compared alphanumerically, case-insensitively — matches the course code. If one exists, that course's artifacts live inside it instead of the central library:

```text
<Your course folder>/Lecture Notes/
  _Sources/   Raw/   Polished/
```

The shallowest match wins. If no folder matches (or routing is off), the central layout above is used. The hub indexes both locations.

**Reconciliation:** every Stage 2 run (and each nightly batch) first calls `reconcile_course_locations()`. If you have since created or renamed a course folder, the affected source/raw/polished files are moved to the new destination and every wiki link inside the raw, polished, and extracted notes is rewritten to the new paths. A move is refused (with an error, no data loss) if the destination already contains a *different* file with the same name.

## Guarantees

- Source files are copied byte-for-byte and never rewritten; memos are the only region tooling edits, and only between markers.
- All Markdown/JSON writes are atomic (`tempfile` + `os.replace`) — a crash cannot leave a half-written note.
- Everything is plain Markdown with `$…$` / `$$…$$` math — the vault stays fully usable if you stop using Margin.
- Page images and Stage-2 drafts are cached under the project's `runtime/` folder, **outside** the vault, so sync tools (Obsidian Sync, iCloud, git) never see render caches.

## Using your own vault — checklist

1. Open (or create) the vault in Obsidian once, so `.obsidian/` exists.
2. Point `config.json` → `vault_path` at it; pick a `notes_root` name that doesn't collide with an existing folder you use for something else.
3. Start the server and confirm the vault card says read/write verified.
4. Optional: create course-code folders (e.g. `COMP1010/`) anywhere in the vault to route those courses' notes there.
