# Changelog

All notable changes to this template are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the template uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Changes to coding-agent files (`.claude/`, `AGENTS.md`, `CLAUDE.md`, `.mcp.json`) are listed under **Agent files** in every release.

## [Unreleased]

### Added

- NestJS 12 project on `@rekog/mcp-nest` 2.0.8, with the `src/platform/` and `src/app/` split and `src/app/app.module.ts` as the one seam.
- Biome as the only linter and formatter, with `noFloatingPromises` at `error`.
- Jest unit tests, strict TypeScript and the `dev`, `build`, `start`, `lint`, `format`, `typecheck` and `test` scripts.
- Node 22.19 or newer, set in `engines` and `.nvmrc`.
- ADR-0001 (platform/app split) and ADR-0008 (Biome).
- Apache-2.0 licence.

### Fixed

- README is UTF-8 with a single heading.

### Agent files

- None.
