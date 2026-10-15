---
status: accepted
date: 2026-10-15
decision-makers: Joseph Searle
---

# Use Biome as the single linter and formatter

## Context and problem statement

The template needs linting and formatting that every server inherits. Un-awaited promises are the main correctness risk in the code the template owns: the token guard, shutdown and drain, and engineers' tool handlers. CI must catch them.

Which tool lints and formats, and how are floating promises caught? (Spec §9.)

## Decision drivers

- One tool and one config file.
- Fast enough to run on every edit and in CI.
- Floating promises fail CI.

## Considered options

1. ESLint with typescript-eslint, plus Prettier.
2. Biome alone, with nursery `noFloatingPromises` at `error`.
3. Biome, plus a minimal typescript-eslint step for promise rules only.

## Decision outcome

Chosen option: **2, Biome alone**.

- `@biomejs/biome` is exact-pinned like every other dependency. `biome.json` holds the config.
- `linter.rules.nursery.noFloatingPromises` is `error`. Its default is `info`, so it must be set explicitly.
- No ESLint or Prettier anywhere in the repo.

### Consequences

- Good: one fast tool with no ESLint and Prettier rule conflicts.
- Bad: nursery rules can change between Biome releases. The exact pin contains this, and Dependabot bumps to Biome are reviewed for rule changes.
- Bad: Biome infers types itself rather than using the TypeScript compiler, so it may miss floating promises that typescript-eslint would catch. `tsc` with `strict` and the tests are the backstop.

### Confirmation

`npm run lint` fails on a statement that calls an async function without `await`, `.catch`, `return` or `void`.

### Revisit when

- A floating-promise bug ships. Then add option 3: a minimal typescript-eslint step for promise rules only.
- `noFloatingPromises` leaves the nursery and its coverage is documented.

## Pros and cons of the options

### ESLint with typescript-eslint, plus Prettier

- Good: mature, type-aware promise rules using the TypeScript compiler.
- Bad: two tools, several config files and rule overlap to manage.
- Bad: slow on type-aware rules.

### Biome alone

- Good: one tool, one config, fast.
- Bad: the promise rule is in the nursery and uses Biome's own type inference.

### Biome plus typescript-eslint for promise rules

- Good: compiler-backed promise checks.
- Bad: brings back ESLint config and dependencies for one rule. Held in reserve as the revisit option.
