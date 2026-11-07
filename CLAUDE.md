# CLAUDE.md

@AGENTS.md

The rest of this file is specific to Claude Code.

## Slash commands

Defined in `.claude/commands/`:

- `/research-issue <issue>` — researches a GitHub issue into `.agent/tasks/<issue>-<sanitized-title>.md`. Before working on an issue, check whether that file exists; if not, suggest running the command.
- `/prepare-pr` — PR title and description ready to paste, the commit message and commands for the contributor to run, and reviewer notes.
- `/update-changelog` — drafts the lines missing from the unreleased entry of `packages/foam-vscode/CHANGELOG.md` for commits since the last release, which the fork edits directly (see `changelog-versioning`), not changeset fragments.
- `/review-docs [user|dev]` — audits the docs tree for stubs, stale content, and dangling references.

## Skills

Defined in `.claude/skills/`:

- `fork-upstream-policy` and `changelog-versioning` — pointer stubs for the fork skills in `.agents/skills/` that AGENTS.md "This fork" names.

## Permissions

Bash calls are matched against the contributor's allowlist in `.claude/settings.local.json` (untracked). Simple single-purpose commands match; compound ones prompt — that's why AGENTS.md asks for simple commands. Introducing a new command shape (`cd && python`, `cd && cargo`)? Add it to the allowlist first.

## Working outside the main checkout

The Bash tool's CWD is always the main checkout, not wherever you last `cd`'d. To avoid a prompt per call:

- `git -C <path> <subcommand>` for git
- For yarn, in order of preference: `yarn workspace <package> <cmd>`, `yarn --cwd <path> <cmd>`, `cd <path> && yarn <cmd>`
- `cd <path> && npm <cmd>` for npm
- Don't mix `git -C` with `cd &&` in one command

`.agent/` scratch — plans and issue research — lives only in the main checkout, never in a worktree. Tracked specs under `specs/` are ordinary repo files and are changed like any other repository file.
