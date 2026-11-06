---
name: fork_upstream_policy
description: Policy for this fork's relationship with upstream foambubble/foam. Read before contributing to upstream, opening pull requests or issues against foambubble/foam, offering a patch upstream, merging from or syncing with upstream/main, or porting an upstream commit into the fork.
---

# Fork Upstream Policy

`hyvanmielenpelit/foam-gollum` is a fork of `foambubble/foam` (remote `upstream`).
Upstream does not want Gollum-related changes.

## Rules

- **Never propose changes to upstream foam** -- no pull requests, issues, or patches.
  Every fix stays in the fork, generic ones (for example Windows fixes) included.
- **Port upstream changes only when easy**: a fix that is small and applies in isolation,
  with no dependency on other unported upstream work. Name the upstream commit in the
  change description.
- **A full upstream merge is its own task**, done only when the user asks.

## Sync State

The fork's past upstream syncs were not real merges, so `git merge-base HEAD upstream/main`
is not a meaningful sync point: the fork contains upstream work newer than the merge base.
To decide whether an upstream change is already in the fork, compare file contents
(`git diff HEAD upstream/main -- <path>`), not commit ancestry.
