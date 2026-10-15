# Changelog

All notable changes to this template are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the template uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Changes to coding-agent files (`.claude/`, `AGENTS.md`, `CLAUDE.md`, `.mcp.json`) are listed under **Agent files** in every release.

## [Unreleased]

### Added

- NestJS 12 project on `@rekog/mcp-nest` 2.0.8, with the `src/platform/` and `src/app/` split and `src/app/app.module.ts` as the one seam.
- Biome as the only linter and formatter, with `noFloatingPromises` at `error`.
- Jest unit tests, strict TypeScript and the `dev`, `build`, `start`, `lint`, `format`, `typecheck` and `test` scripts.
- Node 22.22.3 or newer on 22.x, or 24.15.0 or newer, set in `engines` and `.nvmrc`.
- ADR-0001 (platform/app split) and ADR-0008 (Biome).
- Apache-2.0 licence.
- Config validated at startup by a Zod schema through `@nestjs/config`. Invalid config exits 1 and lists every problem as `<KEY>: <what's wrong>. <what to do>`, without values. Read it through `ConfigService<AppConfig, true>`.
- `.env.example` listing every variable, with no real values.
- Biome `noProcessEnv` at `error` in `src/`, except `src/platform/config/`.
- Biome test rules at `error` in `test/`: no focused or skipped tests, no `done` callbacks, no deeply nested `describe` blocks.
- ADR-0004 (config schema, transport by entry point, auth by `AUTH_MODE`).
- CI workflow on pull requests and `main`, on Node 22.22.3 and 24: `biome ci`, typecheck, test, build and `npm audit --omit=dev --audit-level=high`. Read-only token, no secrets.
- CodeQL scanning for `javascript-typescript` and `actions` on pull requests, `main` and weekly.
- Dependabot for `npm`, `github-actions`, `docker` and `terraform`, weekly, with minor and patch updates grouped.
- Every third-party action pinned to a commit SHA.

### Fixed

- README is UTF-8 with a single heading.
- `.gitattributes` keeps line endings LF on every checkout, so `npm run lint` passes on Windows.

### Agent files

- Added `.claude/settings.json` with a `PostToolUse` hook that runs `.claude/hooks/biome-check.mjs` after Claude Code writes or edits a file. It runs `biome check` on that file only, with fixed arguments and no shell, and reports failures back to Claude.
