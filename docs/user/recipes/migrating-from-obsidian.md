# Coming from Obsidian

Good news: an Obsidian vault is, for the most part, already a Foam workspace. Both store your notes as plain Markdown files in a directory, so in most cases you can just open your vault folder in VS Code with the Foam extension installed and start working.

## Try it in 30 seconds

1. Install the [Foam for Gollum extension](https://marketplace.visualstudio.com/items?itemName=Hyvnmielenpelitry.foam-vscode-gollum) in VS Code.
2. **File → Open Folder…** and pick your existing Obsidian vault.
3. Obsidian writes wikilinks in MediaWiki style (`[[note|alias]]`), while Foam for Gollum expects Gollum style by default. Create `.vscode/settings.json` in the vault with:

   ```json
   {
     "foam.wikilinks.syntax": "mediawiki",
     "foam.wikilinks.caseInsensitive": false,
     "foam.useCustomFileDropdownProvider": false
   }
   ```

4. That's it — wikilinks, backlinks, the graph, and tags should all work.

You can keep using Obsidian on the same folder side-by-side. Foam doesn't change your files unless you ask it to.

## What works the same

| Obsidian              | Foam                |
| --------------------- | ------------------- |
| `[[wikilinks]]`       | [[../features/wikilinks]]       |
| `![[embeds]]`         | [[../features/embeds]]          |
| `[[note#^block-id]]`  | [[../features/block-anchors]]   |
| Backlinks panel       | [[../features/backlinking]]     |
| Graph view            | [[../features/graph-view]]      |
| Daily notes           | [[../features/daily-notes]]     |
| Templates             | [[../features/templates]]       |
| Tags (`#tag`)         | [[../features/tags]]            |
| Frontmatter / aliases | [[../features/note-properties]] |

## What's different or missing

These are the things most likely to surprise you:

- **Live preview / WYSIWYG editing.** Foam uses VS Code's standard split editor + preview pane rather than inline rendering.
- **Community plugins.** Obsidian plugins don't run in Foam. Foam relies on the wider VS Code extension ecosystem instead — see [[../getting-started/recommended-extensions]].
- **Canvas.** Not supported (tracked in [#1450](https://github.com/foambubble/foam/issues/1450)).
- **Tasks plugin syntax.** Not supported (tracked in [#1466](https://github.com/foambubble/foam/issues/1466)).
- **Callouts / Admonitions** (`> [!note]`). Not rendered natively; works as a normal blockquote.
- **Wikilink resolution.** Foam and Obsidian agree on most cases but resolve identifier-style links slightly differently. See the [[comparison table|../features/wikilinks#compatibility-with-other-apps]].

## A few practical tips

- **`.obsidian/` folder.** Leave it alone if you're keeping both tools. Add it to `.gitignore` if you only want to track notes.
- **Templates.** Foam templates live in `.foam/templates/` — see [[../features/templates]] for the format.
- **Don't see something here?** Search [open issues](https://github.com/hyvanmielenpelit/foam-gollum/issues) — chances are someone has already asked.

## Related

- [[../features/wikilinks]] — full link syntax reference
- [[../getting-started/first-workspace]] — set up Foam from scratch
- [[../getting-started/recommended-extensions]] — VS Code extensions that pair well with Foam

[../features/wikilinks]: ../features/wikilinks.md "Wikilinks"
[../features/embeds]: ../features/embeds.md "Note Embeds"
[../features/block-anchors]: ../features/block-anchors.md "Block Anchors"
[../features/backlinking]: ../features/backlinking.md "Backlinks"
[../features/graph-view]: ../features/graph-view.md "Graph Visualization"
[../features/daily-notes]: ../features/daily-notes.md "Daily Notes"
[../features/templates]: ../features/templates.md "Note Templates"
[../features/tags]: ../features/tags.md "Tags"
[../features/note-properties]: ../features/note-properties.md "Note Properties"
[../getting-started/recommended-extensions]: ../getting-started/recommended-extensions.md "Recommended Extensions"
[../getting-started/first-workspace]: ../getting-started/first-workspace.md "Creating Your First Workspace"
[comparison table|../features/wikilinks#compatibility-with-other-apps]: ../features/wikilinks.md#compatibility-with-other-apps "Wikilinks"
