# Update Changelog Command

Draft the `CHANGELOG.md` lines missing for commits since the last release of the Foam for Gollum extension, and add them to the unreleased entry of `packages/foam-vscode/CHANGELOG.md`. The fork edits `CHANGELOG.md` directly, following the [changelog_versioning skill](../../.agents/skills/changelog_versioning/SKILL.md); upstream's changesets flow (`.changeset/` fragments, `yarn version-packages`) is not used.

## Usage

```
/update-changelog
```

## Description

This command:

1. Reads the changelog_versioning skill and applies it throughout.
2. Finds the unreleased version as the skill describes: the topmost `## <version>` entry in `CHANGELOG.md`, unreleased when there is neither a `packages/foam-vscode/foam-vscode-gollum-<version>.vsix` nor a `v<version>` tag. If the topmost version has been released, it adds the new entry and sets `package.json` `"version"` as the skill's rule says; it asks before a major bump. If it cannot tell whether a version is released, or the changelog and `package.json` disagree, it stops and asks.
3. Finds the last release: the `v<version>` tag of the newest released version. If there is no such tag, it asks the developer which commit was released.
4. Lists the commits between that release and `HEAD` that change what the extension ships: `packages/foam-vscode/**`, and `packages/foam-core/**`, which the extension bundles.
5. Reads the unreleased entry; a commit is covered if a line there plausibly describes it.
6. For commits **not** covered, drafts lines and adds them to the unreleased entry under `### Minor Changes` or `### Patch Changes`, in the skill's entry format. Changes that arrive in an upstream merge go as sub-items of an `Update to Foam <version>:` line, as in the existing entries.
7. Prints a summary: covered commits, newly drafted lines, commits intentionally skipped (with reason).

Write each line for users: what changed for them, not why or how, and no file names. If a commit message is ambiguous, look at the diff or linked PR for intent.

## Constraints

- Do NOT commit anything — leave the edited `CHANGELOG.md` for the developer to review
- Do NOT write `.changeset/` fragments or run `yarn version-packages` or `changeset version`
- Do NOT change entries of released versions
- Do NOT invent issue numbers or contributor names — check `gh pr view` / `gh issue view` if a PR is referenced in the commit message
- Internal changes (tests, tooling, refactors) get no line
- Group trivial commits (typo fixes, minor refactors in the same area) into one line rather than padding
- If a commit is too low-level to summarize meaningfully (e.g. "wip", "fix lint"), skip it and report it in the summary
- If you are unsure whether a line already covers a commit, ask the developer rather than writing a duplicate
