---
status: accepted
date: 2026-10-15
decision-makers: Joseph Searle
---

# Validate config with a Zod schema, choose transport by entry point and auth by `AUTH_MODE`

## Context and problem statement

Every server built from the template reads its setup from environment variables: public URL, issuer, secrets, limits. A missing issuer or a short secret should stop the process at startup with a message that says what to fix, not fail on the first request. The template also serves two transports (Streamable HTTP and stdio) and two auth modes (an external issuer, or MCP-Nest's built-in authorization server for local use). Neither stdio nor the built-in server may reach production.

How is config validated and read, and how are transport and auth mode chosen? (Spec §2, §3, §6, FR-11.)

## Decision drivers

- Invalid config stops the process with exit code 1 and lists every problem as `<KEY>: <what's wrong>. <what to do>`, never the value.
- Code reads typed values, not strings from `process.env`.
- stdio and dev auth can't be deployed by changing a variable.
- `npm install && npm run dev:stdio` works with no `.env` file (NFR-5).
- No new abstractions where config will do (NFR-6).

## Considered options

1. Read `process.env` where each value is needed.
2. A Zod schema run through `@nestjs/config`'s `validate` hook.
3. A Zod schema run by a custom config module.

## Decision outcome

Chosen option: **2, a Zod schema through the `validate` hook**.

- `src/platform/config/config.schema.ts` has one Zod field per variable, named as the variable, with the spec §6 defaults. Zod is already a dependency for tool schemas.
- `parseConfig` adds the cross-variable rules. With `NODE_ENV=production`, `MCP_PUBLIC_URL`, `MCP_REQUEST_STATE_SECRET`, `LOG_PSEUDONYM_KEY`, and `AUTH_ISSUER` (when `AUTH_MODE=external`) must be set, and `AUTH_MODE=dev` is refused. `AUTH_MODE=dev` needs its OAuth app and a localhost `MCP_PUBLIC_URL`. These rules read the raw values, so a type error doesn't hide them and every problem is reported in one pass.
- Messages come from the template's own text per key, never from Zod or the input, so values can't leak.
- Code injects `ConfigService<AppConfig, true>` and reads `config.get("PORT", { infer: true })`. `AppConfig` is typed from the schema. No wrapper class.
- Biome's `noProcessEnv` rule fails lint on `process.env` anywhere in `src/` outside `src/platform/config/`.

**Transport is chosen by entry point.** `src/main.ts` serves HTTP. `src/main.stdio.ts` (#13) serves stdio and refuses `NODE_ENV=production`. The container runs only `dist/main.js`. There is no transport variable.

**Auth is chosen by `AUTH_MODE`.** `external` (default, the only mode allowed in production) validates tokens from `AUTH_ISSUER`. `dev` runs the built-in authorization server for local use.

**The `AUTH_ISSUER` rule depends on the entry point.** Outside production, the HTTP entry needs `AUTH_ISSUER` when `AUTH_MODE=external`. It checks this with `httpEntryProblems` after the app is created. stdio has no HTTP request and no token, so it skips the check and starts with no auth config (NFR-5). In production the schema itself requires `AUTH_ISSUER`, whatever the entry.

**The validate hook exits by itself.** `ConfigModule.forRoot()` runs `validate` when `platform.module.ts` is imported, before `bootstrap()`. A thrown error would surface through Nest's `abortOnError`, which logs a stack trace and calls `process.abort()` (exit 134). So `validateConfig` writes the problems to stderr and calls `process.exit(1)`.

### Consequences

- Good: one place lists every variable, its type and default, and the rules between them.
- Good: one run shows every problem, without the values.
- Good: a stray `process.env` read fails lint.
- Bad: the config module calls `process.exit`, which tests must stub.
- Bad: the HTTP-only rule runs after the app is created, so a missing issuer is reported in a second pass if other problems exist outside production.
- Neutral: `MCP_SERVER_NAME` and `MCP_SERVER_VERSION` default from `package.json` in the working directory, so the server starts from the project root, as npm scripts and the container do.

### Confirmation

- `test/platform/config/validate-config.spec.ts` covers defaults, each production rule, dev-mode rules, type errors, one-pass reporting, the message format and that values never appear.
- `npm run lint` fails on `process.env` outside `src/platform/config/`.

## Pros and cons of the options

### Read `process.env` where needed

- Good: no code.
- Bad: no startup check; a missing value fails on first use.
- Bad: strings everywhere, parsed differently in each place.

### A Zod schema through the `validate` hook

- Good: the standard Nest config path; `ConfigService` is already typed and injectable.
- Bad: validation runs at import time, so the hook has to exit by itself.

### A Zod schema in a custom config module

- Good: validation at bootstrap time, with full control of errors.
- Bad: a new module and provider that does what `@nestjs/config` already does (NFR-6).
