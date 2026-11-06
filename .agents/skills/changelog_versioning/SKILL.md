---
name: changelog_versioning
description: How to record a change in the Foam for Gollum extension's CHANGELOG.md and when to bump its version. Read before editing packages/foam-vscode/CHANGELOG.md, changing the "version" in packages/foam-vscode/package.json, preparing a release, or finishing any change that users will notice.
---

# Changelog and Versioning

Applies to the Foam for Gollum extension, `packages/foam-vscode/` (`CHANGELOG.md` and
`package.json` `"version"`). The fork edits `CHANGELOG.md` directly; upstream's changesets
flow (`.changeset/`, the `/update-changelog` command) is not used for its releases.

## Rule

**Do not bump the version for every change.** Add each change to the **first unreleased
version** -- the topmost `## <version>` entry in `CHANGELOG.md`, when that version has not
been released. `package.json` already carries that version, so it stays as it is.

Only when the topmost version **has** been released:

1. Add a new `## <version>` entry above it.
2. Set `package.json` `"version"` to the same version, once. Later changes join this entry.
3. Choose the bump: **patch** for fixes; **minor** for new features or a change to default
   behavior; **major** only after asking the user. If a later change in the same unreleased
   version needs a larger bump than the entry has, raise that version (entry heading and
   `package.json` together) rather than adding another entry.

There is never more than one unreleased version in the changelog.

## Is a version released?

A version is released when either exists:

- a packaged extension `packages/foam-vscode/foam-vscode-gollum-<version>.vsix` (gitignored,
  so it exists only on the machine that built it), or
- a git tag `v<version>` (newer releases are tagged).

If neither exists, the version is unreleased. If you cannot tell -- a fresh clone with no
`.vsix` files and no matching tag -- ask the user. If the topmost changelog version and
`package.json` `"version"` disagree, stop and ask.

## Entry format

Match the existing entries:

```markdown
## <version>

### Minor Changes

- Add <feature, in user terms>.

### Patch Changes

- Fix <what the user saw going wrong>.
```

- One line per user-visible change, written for users; no file names.
- Only the headings that have entries; `### Minor Changes` before `### Patch Changes`.
- Internal changes (tests, tooling, refactors) get no entry.
