---
status: accepted
date: 2026-10-15
decision-makers: Joseph Searle
---

# Split template-owned and engineer-owned code into `src/platform` and `src/app`

## Context and problem statement

Engineers create servers from this template, then pull later template releases by merging a release tag. Template releases change setup code: config, auth, MCP wiring, telemetry, health and shutdown. Engineers write tools, resources and prompts. If the two share files, every template release conflicts with engineer code.

How should the repo separate the two so upgrades merge with few conflicts? (Spec §1, FR-2.)

## Decision drivers

- Template releases merge with conflicts only in template-owned files.
- Ownership of every file is obvious from its path.
- No packaging overhead. The intent rules out shipping the template as a package.

## Considered options

1. A flat `src/` with no boundary.
2. A separate `platform` workspace package.
3. A `src/platform/` and `src/app/` directory split with one seam.

## Decision outcome

Chosen option: **3, a directory split with one seam**.

- `src/platform/` is template-owned. Template releases update it.
- `src/app/` is engineer-owned. Template releases never touch it after a server is created.
- `src/app/app.module.ts` is the only seam. It lists the engineer's MCP controllers and imports `PlatformModule`.
- `src/platform/` never imports from `src/app/`. The entry points (`src/main.ts`, and later `src/main.stdio.ts`) bootstrap `AppModule`.

### Consequences

- Good: upgrade conflicts stay in `src/platform/`, `docs/`, CI, `infra/` and template-owned agent files.
- Good: one file to read to see what an engineer has added.
- Bad: nothing enforces the boundary automatically yet. Reviewers check that `src/platform/` has no import from `src/app/`.
- Bad: an engineer who edits `src/platform/` takes on merge conflicts at every upgrade. `docs/upgrading.md` and the agent rules will say so.

### Confirmation

Search `src/platform/` for imports from `app/`. There must be none.

## Pros and cons of the options

### A flat `src/`

- Good: simplest layout.
- Bad: template and engineer code share files and folders, so every release conflicts.

### A separate `platform` workspace package

- Good: the boundary is enforced by the package system.
- Bad: it's a package in all but name, which the intent ruled out.
- Bad: workspace tooling and versioning overhead for one consumer.

### A directory split with one seam

- Good: clear ownership by path, with no tooling.
- Bad: the boundary is a convention until a check enforces it.
