# Specs

A spec says **what** we are building and **how we will know it works**. It is
written before the code exists, reviewed like code, and kept after the work
ships.

## Layout

```
specs/<slug>/
  spec.md    what and why: context, acceptance criteria, out of scope
  plan.md    how: approach, work breakdown  (only when the work needs one)
```

`<slug>` is a short name chosen when the spec is written, such as
`1712-daily-note-previous-link`. A spec that came from an issue is prefixed
with its number; one that came from an idea is not. Slugs are unique across
the repo and never change once the spec exists.

**The active spec is the one the contributor names, or the only one under
`specs/` whose work is unfinished.** There is no index file to keep in sync.

## Two tiers

- `specs/` is tracked. Work that is going to happen.
- `specs.local/` is gitignored, same layout. Exploration that has not
  graduated, and thinking that may never leave your machine. Promote a spec by
  copying it into `specs/`.

## The flow

In the fork, all of this happens in the working tree:

1. Write `spec.md`.
2. Write `plan.md` (skip it when the work is small).
3. Write a failing test, then the change.
4. Review, then the contributor commits.

A spec is committed with its feature's change, so everything under `specs/` in
`main` is finished work. Nothing needs archiving.

Upstream drives the same steps with automation: labeling an issue `agent:spec`
and commenting `@claude plan` or `@claude implement` on the pull request. The
fork does not have that automation; its workflows are excluded (see
`AGENTS.md`, "Excluded upstream content").

## Does this need a spec?

Ask: *would I want acceptance criteria written down before the code exists?*

A bug with an obvious fix does not need one — the failing test says everything
a spec would. A change to user-visible behaviour usually does.

## Writing acceptance criteria

Use Given-When-Then, and say how each criterion is verified — `unit`, `e2e` or
`human`:

```markdown
- **AC-1**: Given a daily note for Monday and no note for Sunday, when the
  daily note for Tuesday is created, then the previous-note link points at
  Monday's note.
  _verify: unit_
```

A declared verification is a promise, not an aspiration. CI runs the whole
`foam-vscode` suite, unit and e2e, on every pull request, so `e2e` is fair to
declare. `human` means somebody looks at it before merge, and is a promise to
the same standard.

Keep solution approaches out of `spec.md`. They belong in `plan.md`, which the
code reviewer deliberately does not read — a reviewer who knows the intended
approach checks whether the code matches the plan, when the job is to check
whether the code is right.

If a spec passes roughly ten acceptance criteria, propose splitting it. Review
effort grows faster than diff size.
