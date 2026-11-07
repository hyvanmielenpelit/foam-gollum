# Smart Folders

## Smart Folders

The new **Smart Folders** panel allows you to use filters to view a subset of your notes.

Filters use the same query syntax as `foam-query` blocks.

For example this will create the "Work in Progress" smart folder:

```yaml
# .foam/queries/work-in-progress.yaml
name: Work in Progress
filter:
  and:
    - tag: '#wip'
    - not:
        tag: '#archive'
sort: title ASC
```

Queries used for Smart Folders are also exposed in the CLI and via MCP tools.

[Learn more about Smart Folders](https://github.com/hyvanmielenpelit/foam-gollum/blob/main/docs/user/features/smart-folders.md)

## Foam CLI

Foam now ships a command-line interface — interact with your workspace from the terminal without opening VS Code.

```bash
# Run without installing
npx foam-cli <command> [options]

# Or install globally
npm install -g foam-cli
foam <command> [options]
```

[Learn more about the command-line interface](https://github.com/hyvanmielenpelit/foam-gollum/blob/main/docs/user/tools/cli.md)

## Graph revamp

The graph view has been significantly improved:

- Redesigned for better UX
- **Node groups** let you visually cluster notes in a flexible way
- Added **Graph Views**

[Learn more about the graph view](https://github.com/hyvanmielenpelit/foam-gollum/blob/main/docs/user/features/graph-view.md)

## Block references

In case you missed it, some time ago we added full support for referencing and embedding blocks in the editor and the preview.

[Learn more about blocks](https://github.com/hyvanmielenpelit/foam-gollum/blob/main/docs/user/features/block-anchors.md)

## Foam Queries

Embed dynamic, auto-updating note lists directly in the Markdown preview using `foam-query` code blocks:

````markdown
```foam-query
filter: "#project"
sort: title ASC
select: [title, path]
```
````

Results render inline as a linked list of matching notes. The query updates automatically as your notes change.

[Learn more about Foam Queries](https://github.com/hyvanmielenpelit/foam-gollum/blob/main/docs/user/features/foam-queries.md)

## Footnotes

Foam now supports footnotes with proper rendering and navigation in editor and the Markdown preview.

[Learn more about footnotes](https://github.com/hyvanmielenpelit/foam-gollum/blob/main/docs/user/features/footnotes.md)

## Notes Explorer filtering

The Notes Explorer panel now supports filtering, making it easier to navigate large vaults.
