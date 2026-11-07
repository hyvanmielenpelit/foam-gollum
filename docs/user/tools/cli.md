# Foam CLI

The `foam` command line tool lets you work with your Foam workspace from the terminal — search, inspect, and manage notes without opening VS Code.

## Installation

Foam for Gollum does not publish its CLI. The `foam-cli` package on npm is upstream Foam's CLI, which does not understand Gollum wikilinks, so do not use it on a Gollum wiki. `foam update` checks that npm package too, so its answer does not apply to this CLI.

To use this CLI, build it from a clone of the [Foam for Gollum repository](https://github.com/hyvanmielenpelit/foam-gollum):

```bash
yarn
yarn build
yarn foam <command> [options]
```

The CLI reads `foam.wikilinks.syntax` from the workspace's `.vscode/settings.json`. Unlike the VS Code extension, it uses MediaWiki syntax when the setting is missing, so set `"foam.wikilinks.syntax": "gollum"` there for a Gollum wiki.

## Usage

```
foam <command> [options]
```

Set the `FOAM_WORKSPACE` environment variable to avoid typing `--workspace` on every command:

```bash
export FOAM_WORKSPACE=/path/to/your/notes
```

All commands accept `--format json` for machine-readable output, useful for scripting.

## Files outside the workspace

Commands only change files inside the workspace. If a path leads outside it, for example through a folder that is a symlink to somewhere else, the command stops with `Cannot write outside the workspace: <path>` instead of writing there. To work with those files, run the command with `--workspace` pointing at the folder they live in.

## Commands

| Command     | Description                                       |
| ----------- | ------------------------------------------------- |
| [[cli/daily]]   | Show or create the daily note for a date          |
| [[cli/grep]]    | Search note content by pattern                    |
| [[cli/links]]   | Show links to and from a note                     |
| [[cli/lint]]    | Check notes for issues                            |
| [[cli/list]]    | List notes, tags, orphans, placeholders, and more |
| [[cli/mcp]]     | Expose the workspace to AI agents via MCP         |
| [[cli/note]]    | Show, create, move, or delete notes               |
| [[cli/outline]] | Show the heading structure of a note              |
| [[cli/rename]]  | Rename notes, tags, sections, or block anchors    |
| [[cli/search]]  | Search notes by title, tag, or frontmatter        |
| [[cli/tag]]     | List, rename, or search tags                      |
| [[cli/update]]  | Check for a newer version of foam-cli             |

[cli/daily]: cli/daily.md "foam daily"
[cli/grep]: cli/grep.md "foam grep"
[cli/links]: cli/links.md "foam links"
[cli/lint]: cli/lint.md "foam lint"
[cli/list]: cli/list.md "foam list"
[cli/mcp]: cli/mcp.md "foam mcp"
[cli/note]: cli/note.md "foam note"
[cli/outline]: cli/outline.md "foam outline"
[cli/rename]: cli/rename.md "foam rename"
[cli/search]: cli/search.md "foam search"
[cli/tag]: cli/tag.md "foam tag"
[cli/update]: cli/update.md "foam update"
