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
- MCP over Streamable HTTP on `/mcp` (`src/main.ts`) and over stdio (`src/main.stdio.ts`), both serving revision `2026-07-28` only. 2025-era requests get the unsupported-protocol-version error.
- `/mcp` is a Nest controller, so a guard can cover every request. Stateless, with private cache hints, `requestState` signed with `MCP_REQUEST_STATE_SECRET`, and round limits from config.
- HTTP body limit from `MCP_MAX_REQUEST_BYTES` (413) and request deadline from `MCP_REQUEST_TIMEOUT_MS` (503), both answered as JSON-RPC errors.
- The stdio entry logs to stderr only, opens no port, needs no `.env`, and refuses to start when `NODE_ENV=production`.
- `dev:stdio` script.
- Example tool (`echo`), resource (`example://about`) and prompt (`summarise`) in `src/app/`, registered in `app.module.ts`.
- Platform tests that fail on `statefulMode`, `serverMutator` or dynamic registration in `src/`.
- JSON logs through `nestjs-pino`, to stdout (stderr under stdio). Every line carries `trace_id` and `span_id`.
  - `authorization`, `cookie` and `set-cookie` headers are redacted, as is any key containing `token` or `secret` and any `requestState` key.
  - The client address is dropped, and bodies are never logged.
- OpenTelemetry Node SDK started with `node --import ./dist/platform/telemetry/instrumentation.js` (the `start` and `dev` scripts). Only `http`, `express` and `ioredis` are instrumented.
  - OTLP is configured only by the standard `OTEL_*` variables. `OTEL_EXPORTER_OTLP_PROTOCOL` is `http/protobuf` (default) or `grpc`.
  - Nothing is exported, and nothing connects, when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset.
- A span for every `tools/call`, `resources/read` and `prompts/get`, named `<mcp.method.name> <name>` and parented on the `_meta` trace context when present.
- Metrics:
  - `mcp.server.operation.duration`, by method and tool, for every request including lists;
  - `mcp.server.errors`, by JSON-RPC code as sent;
  - `mcp.server.auth.failures`, by reason, emitted once the token guard lands.
- Identity recorded only as `enduser.pseudo.id`, HMAC-SHA256 of `sub` keyed with `LOG_PSEUDONYM_KEY`. Client address and raw identity attributes are scrubbed from spans, and no setting records them.
- ADR-0005 (logging, OpenTelemetry and pseudonyms).

### Changed

- Biome parses parameter decorators, and `useImportType` is off: its fix breaks Nest dependency injection (ADR-0008).

### Fixed

- README is UTF-8 with a single heading.
- `.gitattributes` keeps line endings LF on every checkout, so `npm run lint` passes on Windows.

### Agent files

- Added `.claude/settings.json` with a `PostToolUse` hook that runs `.claude/hooks/biome-check.mjs` after Claude Code writes or edits a file. It runs `biome check` on that file only, with fixed arguments and no shell, and reports failures back to Claude.
