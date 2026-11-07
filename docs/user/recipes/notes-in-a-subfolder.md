# Keep your notes in a subfolder

Sometimes your notes live inside a bigger project rather than in a repository of their own — a `knowledge-base` folder next to your source code, say:

```
my-project/
├── knowledge-base/     ← your notes
├── src/
└── README.md
```

Foam works in this layout with three bits of configuration. There's no single "Foam root" setting: instead you tell Foam which files to index, where your templates live, and where new notes should go.

## 1. Index only your notes

In `.vscode/settings.json`:

```json
{
  "foam.files.include": ["knowledge-base/**"]
}
```

Foam now builds the graph from your notes alone and ignores the rest of the project. Reload the window to apply it.

## 2. Point at your templates

```json
{
  "foam.files.include": ["knowledge-base/**"],
  "foam.templates.folder": "knowledge-base/.foam/templates"
}
```

Your [[../features/templates]] live at `knowledge-base/.foam/templates/` rather than the project root.

## 3. Create new notes in the right place

By default, clicking a `[[new-note]]` placeholder creates the file at the top of the project. To send it to your notes folder instead, create `knowledge-base/.foam/templates/new-note.md`:

```markdown
---
foam_template:
  filepath: 'knowledge-base/${FOAM_TITLE}.md'
---

# ${FOAM_TITLE}
```

Foam uses `new-note.md` whenever it creates a note without being told where to put it, so this covers Ctrl+clicking a placeholder as well as the **Foam: Create New Note** command.

For [[../features/daily-notes]], do the same in `knowledge-base/.foam/templates/daily-note.md`:

```markdown
---
foam_template:
  filepath: 'knowledge-base/journal/${FOAM_DATE_YEAR}-${FOAM_DATE_MONTH}-${FOAM_DATE_DATE}.md'
---

# ${FOAM_DATE_YEAR}-${FOAM_DATE_MONTH}-${FOAM_DATE_DATE}
```

## Linking

`[[wikilinks]]` work exactly as they do anywhere else: a link is relative to the folder of the note it is in, so `[[my-note]]` in `knowledge-base/ideas.md` opens `knowledge-base/my-note.md`.

The one thing to know is that a leading slash means "the folder you opened in VS Code", not "my notes folder". So `[[/my-note]]` and `[my note](/my-note.md)` point at `my-project/my-note.md`, which isn't where your notes are. Write `[[/knowledge-base/my-note]]` for the full path, which is what completion inserts — or a path relative to the current note, such as `[[my-note]]`.

This also means you can link out to the rest of the project: `[the build script](/scripts/build.sh)` does what you'd expect, and works on GitHub too.

## What stays at the project root

When you delete a note, Foam moves it to `.foam/trash/` at the top of the project, and [[../features/smart-folders]] are saved under `.foam/queries/`. If you'd rather keep everything together, move those folders into your notes directory by hand — Foam will recreate them at the project root next time, so it's a matter of taste rather than correctness.

## Related

- [[../getting-started/first-workspace]] — setting up a Foam workspace
- [[../features/templates]] — the full template reference
- [[../features/wikilinks]] — link syntax, including paths

[../features/templates]: ../features/templates.md "Note Templates"
[../features/daily-notes]: ../features/daily-notes.md "Daily Notes"
[../features/smart-folders]: ../features/smart-folders.md "Smart Folders"
[../getting-started/first-workspace]: ../getting-started/first-workspace.md "Creating Your First Workspace"
[../features/wikilinks]: ../features/wikilinks.md "Wikilinks"
