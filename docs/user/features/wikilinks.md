# Wikilinks

Wikilinks are internal links that connect files in your knowledge base using `[[double bracket]]` syntax.

Foam for Gollum writes wikilinks the way [Gollum](https://github.com/gollum/gollum) wikis do, including GitHub's repository wikis. If your notes use the MediaWiki style of upstream Foam and Obsidian, switch to [[MediaWiki syntax|#mediawiki-syntax]].

## Creating Wikilinks

1. **Type `[[`** and start typing a note name
2. **Select from autocomplete** and press `Tab`
3. **Navigate** with `Ctrl+Click` (`Cmd+Click` on Mac) or `F12`
4. **Create new notes** by clicking on non-existent wikilinks

Example: [[graph-view]]

## Writing a Link

A link is the note's file name without `.md`, relative to the folder of the note you are writing in. From a note in the `projects` folder:

| Link                | Opens                                                         |
| ------------------- | ------------------------------------------------------------- |
| `[[Plan]]`          | `projects/Plan.md`                                            |
| `[[house/Todo]]`    | `projects/house/Todo.md`                                      |
| `[[../Ideas]]`      | `Ideas.md`, one folder up                                     |
| `[[/Ideas]]`        | `Ideas.md` in the wiki root, the folder you opened in VS Code |
| `[[Meeting notes]]` | `projects/Meeting notes.md`                                   |

- **The alias comes first.** `[[The plan|Plan]]` opens `projects/Plan.md` and shows "The plan".
- Each `../` climbs one folder. A link that climbs above the wiki root links to nothing.
- A file that isn't a note keeps its extension: `[[/uploads/report.pdf]]`.
- A link always names a page, never a folder.

### Uppercase and Lowercase

Case doesn't matter by default: `[[plan]]` opens `Plan.md`. When two files differ only by case, the exact match wins. To make links match case exactly, set `foam.wikilinks.caseInsensitive` to `false`.

## Placeholders

Wikilinks to non-existent files create placeholder links, styled differently to show they need files created. They're useful for planning your knowledge structure.

View placeholders in the graph with `Foam: Show Graph` command or in the `Placeholders` panel.

## Section Links

Link to a heading with `#` and the heading's anchor: the heading in lowercase, with punctuation removed and spaces replaced by dashes. The heading `4. Risk Assessment` in `Plan.md` is `[[Plan#4-risk-assessment]]`, and `[[#4-risk-assessment]]` links to it from inside `Plan.md`. Foam provides autocomplete for section titles.

Standard Markdown links use the same anchors:

- External file: `[link text](other-file.md#section-name)`
- Same document: `[link text](#section-name)`

## Block Links

Link to a specific paragraph, list item, heading, or blockquote using `[[note-name#^blockid]]` syntax. Add a `^your-id` anchor at the end of any block element, then reference it from other notes.

See [[block-anchors]] for full details.

## Link Syncing on Rename

When you rename or move a note or folder, Foam automatically updates all wikilinks pointing to it. This is enabled by default and can be turned off via the `foam.links.sync.enable` setting.

For standard markdown links (e.g. `[text](path/to/note.md)`), VS Code has a built-in feature that handles this. Enable it in VS Code settings: set `markdown.updateLinksOnFileMove.enabled` to `always` or `prompt`.

## Completing Links

When you pick a note from the suggestions, Foam inserts its path from the wiki root, such as `[[/projects/Plan]]`. When both notes are in the wiki root, it leaves out the slash: `[[Plan]]`.

These settings change what completion does:

- `foam.completion.useAlias`: `never` (default), or `whenPathDiffersFromTitle` to add the note's title as the alias when it differs from the file name: `[[Project Plan|/projects/plan]]`.
- `foam.completion.linkFormat`: `wikilink` (default), or `link` to insert a standard Markdown link instead.
- `foam.completion.label`: what the suggestion list shows in MediaWiki syntax: `path` (default), `title` or `identifier`. In Gollum syntax, the list shows paths.

## Dropping Files into a Note

Drag a file from the Explorer or from your computer into a note, and Foam inserts a link to it. A file from outside the workspace is first copied to an uploads folder that mirrors the note's location: files dropped into `Items/Amulets.md` go to `uploads/Items/Amulets/`.

| Setting                                 | Default    | What it does                                                                                    |
| --------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| `foam.useCustomFileDropdownProvider`    | `true`     | Makes Foam's "Insert as Gollum upload" the default drop. Set to `false` for VS Code's own drop. |
| `foam.fileDropdown.uploadsFolderName`   | `uploads`  | The folder in the wiki root that dropped files are copied to                                    |
| `foam.fileDropdown.fileTemplateFormat`  | `markdown` | How a dropped file is linked: `markdown`, `html` or `gollum`                                    |
| `foam.fileDropdown.imageTemplateFormat` | `markdown` | How a dropped image is linked: `markdown`, `html` or `gollum`                                   |

What each format inserts:

- `markdown`: `[Text](Link)` for a file, `![Text](Link)` for an image
- `html`: `<a href="Link">Text</a>` for a file, `<img src="Link" alt="Text" width="Width" height="Height" />` for an image
- `gollum`: `[[Text|Link]]` for a file, `[[Link|alt=Text, width=Widthpx, height=Heightpx]]` for an image

## Markdown Compatibility

Foam can automatically generate [[link-reference-definitions]] at the bottom of files to make wikilinks compatible with standard Markdown processors.

## MediaWiki Syntax

Upstream Foam and Obsidian write wikilinks in the MediaWiki style:

- The alias comes last: `[[Plan|The plan]]`.
- A section link uses the heading text: `[[note-name#Section Title]]`.
- A link names a note anywhere in the workspace, not relative to the current folder.

To use it, set `foam.wikilinks.syntax` to `mediawiki` (the default is `gollum`). If only some of your repositories use MediaWiki syntax, put these settings in each such repository's `.vscode/settings.json`:

```json
{
  "foam.wikilinks.syntax": "mediawiki",
  "foam.wikilinks.caseInsensitive": false,
  "foam.useCustomFileDropdownProvider": false
}
```

The [[Foam CLI|../tools/cli]] uses MediaWiki syntax when `foam.wikilinks.syntax` is not set, so a Gollum wiki needs `"foam.wikilinks.syntax": "gollum"` in its `.vscode/settings.json` for the CLI.

The rest of this section applies to MediaWiki syntax only.

### Path vs Identifier Links

Wikilinks come in two forms:

- **Identifier links** — `[[filename]]`, `[[folder/filename]]` — identify a resource by name, resolved relative to the whole workspace
- **Path links** — `[[./file]]`, `[[../other/file]]`, `[[/from/root]]` — identify a resource by its file path

The rule: if the link starts with `/` or `.`, it's a path reference; otherwise it's an identifier.

For identifier links, you can use any suffix that uniquely identifies the file. Given `projects/house/todo.md` and `work/todo.md`, the identifiers `[[todo]]` (ambiguous), `[[house/todo]]` (unique), and `[[projects/house/todo]]` (unique) are all valid — Foam picks the shortest unambiguous form.

### Ambiguous Links

When the same filename exists in multiple locations, `[[todo]]` is ambiguous. Foam resolves it alphabetically (deterministic), and shows a warning diagnostic so you can use a more specific identifier like `[[house/todo]]`.

### Directory Links

Linking to a folder name navigates to that folder's index file — either `index.md` or `README.md`. This works for both wikilinks and regular markdown links:

- `[[projects]]` → opens `projects/index.md` (or `projects/README.md`)
- `[Projects](projects)` → same
- `[Projects](projects/)` → trailing slash is ignored

If a file named `projects.md` exists alongside the `projects/` folder, it takes priority.

To disable this behavior, set `foam.links.directory.mode` to `disabled` in your VS Code settings.

### Compatibility with Other Apps

| Wikilink                       | Obsidian                        | Foam                            |
| ------------------------------ | ------------------------------- | ------------------------------- |
| `[[notes]]`                    | ✔ unique identifier in repo     | ✔ unique identifier in repo     |
| `[[/work/notes]]`              | ✔ valid path from repo root     | ✔ valid path from repo root     |
| `[[work/notes]]`               | ✔ valid path from repo root     | ✔ valid identifier in repo      |
| `[[project/house/todo]]`       | ✔ valid path from repo root     | ✔ valid unique identifier       |
| `[[/project/house/todo]]`      | ✔ valid path from repo root     | ✔ valid path from repo root     |
| `[[house/todo]]`               | ✔ valid unique identifier       | ✔ valid unique identifier       |
| `[[todo]]` (ambiguous)         | ✘ ambiguous identifier          | ✘ ambiguous identifier          |
| `[[/house/todo]]` (wrong path) | ✘ incorrect path from repo root | ✘ incorrect path from repo root |

## Related

- [[footnotes]] - Adding references and side notes
- [[block-anchors]] - Linking to specific blocks within a note
- [[templates]] - Creating new notes

[link-reference-definitions]: link-reference-definitions.md 'Link Reference Definitions'
[footnotes]: footnotes.md 'Footnotes'
[block-anchors]: block-anchors.md 'Block Anchors'
[graph-view]: graph-view.md "Graph Visualization"
[templates]: templates.md "Note Templates"
[MediaWiki syntax|#mediawiki-syntax]: #mediawiki-syntax "Wikilinks"
[Foam CLI|../tools/cli]: ../tools/cli.md "Foam CLI"
