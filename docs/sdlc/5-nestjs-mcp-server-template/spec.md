---
status: draft
linked_intent: docs/sdlc/5-nestjs-mcp-server-template/intent.md
linked_issue: https://github.com/JosephSearle/nestjs-mcp-server-template/issues/4
linked_epic: https://github.com/JosephSearle/nestjs-mcp-server-template/issues/5
persona: personal
skills_applied:
  - security-baseline
  - security-api        # added beyond the personal row: ticked on issue #4
  - security-mcp        # added beyond the personal row: ticked on issue #4
  - compliance-gdpr
  - compliance-eu-ai-act
  - brand-personal
  - ux-personal
skills_not_applied:
  - security-llm        # unticked on issue #4: the template never calls a model
  - security-agent      # the server is a tool provider, not an autonomous agent
created: 2026-10-14
---

# Spec: v1 NestJS MCP server template

Requirements and design for the v1 template accepted in [intent #2](intent.md) (epic #5).
Library facts are checked against `@rekog/mcp-nest` 2.0.8 and its docs as of 2026-10-14.

## Requirements

### Functional

| ID | Requirement | Source |
| --- | --- | --- |
| FR-1 | Engineers create a server with GitHub's "Use this template" and a setup guide. No package, no CLI. | Intent: template repository |
| FR-2 | Template-owned setup lives apart from engineer-owned tools, resources and prompts, so later template releases merge with few conflicts. | Issue #4 scope |
| FR-3 | Deployed servers serve Streamable HTTP on `/mcp`. stdio exists for local dev and tests only, and is never the container entry point. | Intent: transport |
| FR-4 | Both transports serve MCP revision `2026-07-28` only. 2025-era requests are rejected. | Intent: protocol |
| FR-5 | Every HTTP request to `/mcp` carries a bearer token that the server validates itself: signature, issuer, audience, expiry, not-before and required scopes. A gateway in front changes nothing. | Intent: auth |
| FR-6 | Engineers pick an OAuth provider by config. Worked examples cover Entra ID, Auth0 and Keycloak. | Intent: auth |
| FR-7 | MCP-Nest's built-in authorization server is available for local dev and demos, and refuses to start in production. | Intent: auth |
| FR-8 | Per-tool authorization by scope and role. Tools are protected by default. | security-mcp §7 |
| FR-9 | The server publishes RFC 9728 protected-resource metadata and answers 401/403 with `WWW-Authenticate`. | MCP auth spec |
| FR-10 | No state is kept in process between requests. Redis is the documented example for state that must survive. | Intent: state |
| FR-11 | Config is validated at startup. Invalid config stops the process with a list of what's wrong. | Intent: production setup |
| FR-12 | OpenTelemetry traces and metrics, and structured JSON logs correlated with traces. | Intent: production setup |
| FR-13 | Liveness and readiness endpoints, and graceful shutdown on `SIGTERM`. | Intent: production setup |
| FR-14 | npm scripts open the Inspector web UI against stdio and local HTTP, using a committed Inspector config. | Intent: Inspector |
| FR-15 | CI runs lint, type-check, unit tests, Inspector CLI smoke tests, CodeQL and Dependabot. | Intent: v1 done |
| FR-16 | A Terraform reference deployment on Azure Container Apps. | Intent: deployment |
| FR-17 | Tagged releases with a changelog. | Intent: releases |
| FR-18 | A gateway expectations document. A gateway is required for production; none is set up or recommended. | Intent: gateway; concern 1 |
| FR-19 | Coding-agent guidance ships with the template: `AGENTS.md` for any agent, plus Claude Code settings, path-scoped rules, skills and a project MCP config. | Product owner, 2026-10-14 |

### Non-functional

| ID | Requirement |
| --- | --- |
| NFR-1 | Node 22.19 or newer (`engines`, `.nvmrc`, CI, Dockerfile). |
| NFR-2 | A fresh repo from the template passes CI with no secrets, no Azure access and no edits. |
| NFR-3 | Deployed dependencies pinned to exact versions, with a committed lockfile. Third-party actions pinned to a commit SHA. |
| NFR-4 | No secrets, tokens or raw personal data in logs, traces or metrics. |
| NFR-5 | Zero-config local start: `npm install && npm run dev:stdio` works without a `.env` file. |
| NFR-6 | No new abstractions where config, an example or a doc will do. |

## Design approach

### 1. Repo layout (ADR-0001)

```
src/
  main.ts                      # HTTP entry. Template-owned, thin.
  main.stdio.ts                # stdio entry. Template-owned. Local use only.
  platform/                    # Template-owned. Updated by template releases.
    config/                    # Zod env schema, loader, typed ConfigService
    auth/                      # Token guard, claim mapping, metadata controller, dev auth wiring
    mcp/                       # McpStrategy factory, transports, guarded /mcp controller
    telemetry/                 # instrumentation.ts (OTel SDK), logger, tool-call interceptor
    health/                    # /healthz, /readyz
    lifecycle/                 # Shutdown and drain
    platform.module.ts
  app/                         # Engineer-owned. Template releases never touch it after creation.
    app.module.ts              # The one seam: lists the engineer's @McpController classes
    tools/example.tools.ts     # One scoped tool, one tool showing an ownership check
    resources/example.resources.ts
    prompts/example.prompts.ts
test/
  platform/                    # Template tests
  app/                         # Engineer tests, starting with the examples
  smoke/                       # Inspector CLI smoke tests and the test JWKS stub
infra/terraform/               # See section 10
docs/
  setup.md  upgrading.md  gateway.md  state.md  operations.md
  security.md  privacy.md  auth/{overview,entra-id,auth0,keycloak,local-dev}.md
  adr/0001-…0007-….md
.claude/                       # See section 12
  settings.json
  rules/  skills/
AGENTS.md  CLAUDE.md  .mcp.json
inspector.config.json
.env.example  Dockerfile  .dockerignore  .nvmrc
CHANGELOG.md  SECURITY.md  README.md
```

- `src/app/app.module.ts` is the only file `platform/` imports from `app/`. `platform/` never imports engineer code otherwise.
- `docs/upgrading.md` explains pulling a template release: add the template as a remote, merge the release tag, resolve conflicts. Conflicts should only appear in `platform/`, `docs/`, CI, `infra/` and the template-owned agent files in section 12.
- Rejected: a separate `platform` workspace package. It's a package in all but name, which the intent ruled out.

### 2. MCP wiring

MCP-Nest v2 has no `McpModule`. MCP runs as a NestJS microservice strategy.

- `platform/mcp/` builds one `McpStrategy` with `name` and `version` from config, `transports`, `resolveUser`, `cacheHints`, `requestState` and `inputRequired` options.
- HTTP: `new StreamableHttpTransport({ protocol: 'modern-only', responseMode: 'auto', security: { allowedOrigins, allowedHosts } })`. The route is a Nest controller, `@Controller('mcp') @UseGuards(McpTokenGuard)`, extending `McpHttpControllerFor(transport)`. The guard therefore covers every request to `/mcp`.
- stdio: `new StdioTransport({ legacy: 'reject' })` in `main.stdio.ts`. Logs go to stderr. The entry refuses to start when `NODE_ENV=production`.
- Transport is chosen by entry point, not by config. The Dockerfile only runs `dist/main.js`, so stdio can't be deployed by changing a variable.
- HTTP adapter: Express (NestJS default; Fastify would add a second set of request-shape rules for `resolveUser`).
- Cache hints stay `cacheScope: 'private'` for every list result. `tools/list` is filtered per caller, so `public` would leak one caller's tool set to another.
- Multi-round requests (elicitation, sampling): `requestState.verify` uses `createRequestStateCodec` with an HMAC key from `MCP_REQUEST_STATE_SECRET`. All replicas share the key, so a retry can land on any replica. `inputRequired.maxRounds` and `roundTimeoutMs` are set from config.
- No dynamic tool registration (`serverMutator`, dynamic capabilities) in the template. Tool definitions are static code reviewed through PRs.

### 3. Auth (ADR-0002, ADR-0003)

Two modes, set by `AUTH_MODE`:

**`external` (default, the only mode allowed in production).** An external OAuth 2.1 / OIDC issuer (Entra ID, Auth0, Keycloak) mints tokens. The server is a pure resource server.

- `McpTokenGuard` uses `jose` (`createRemoteJWKSet`, `jwtVerify`):
  - Algorithms allowlisted (`AUTH_ALGORITHMS`, default `RS256`). `none` and HMAC algorithms are rejected.
  - `iss` must equal `AUTH_ISSUER` exactly.
  - `aud` must include `AUTH_AUDIENCE` (default: `MCP_PUBLIC_URL` + `/mcp`, per RFC 8707).
  - `exp` and `nbf` checked with `AUTH_CLOCK_TOLERANCE_SECONDS` (default 30).
  - Token lifetime (`exp - iat`) must not exceed `AUTH_MAX_TOKEN_LIFETIME_SECONDS` (default 5400, the top of Entra's default range). This bounds how long a stolen token works.
  - `AUTH_REQUIRED_SCOPES` (optional) must all be present to enter at all.
  - The JWKS URL comes from `AUTH_JWKS_URI` or the issuer's discovery document. `jku`, `x5u` and other key-location headers in the token are ignored.
- Failures return 401 with `WWW-Authenticate: Bearer resource_metadata="<MCP_PUBLIC_URL>/.well-known/oauth-protected-resource/mcp"`. A missing per-tool scope returns 403 with `error="insufficient_scope"` and the needed `scope`, so clients can step up.
- Claims are normalised to `{ sub, scopes[], roles[] }` by a claim map chosen with `AUTH_PROVIDER` (`entra`, `auth0`, `keycloak`, `generic`). For example, Entra puts scopes in `scp` and roles in `roles`; Keycloak puts roles in `realm_access.roles`. `resolveUser` returns the normalised user, which MCP-Nest's `@ToolScopes` and `@ToolRoles` read.
- `/.well-known/oauth-protected-resource/mcp` returns `resource`, `authorization_servers`, `scopes_supported`, `bearer_methods_supported: ['header']` and `mcp_versions_supported: ['2026-07-28']`.
- **Choice: one guard plus a config switch, not one module per provider.** The three providers differ only in issuer format, audience and claim names, which is config plus a small map. Provider steps (app registration, audience, token version, scopes) live in `docs/auth/<provider>.md`.

**`dev`.** Wires `@rekog/mcp-nest-auth` (`McpAuthModule`) so the server runs its own authorization server, delegating login to GitHub or Google. Startup fails when `NODE_ENV=production` or `MCP_PUBLIC_URL` isn't a `localhost` URL. Documented in `docs/auth/local-dev.md`. `mcpVersionsSupported` is narrowed to `['2026-07-28']`.

**stdio** has no HTTP request and no token. It's a local process the developer starts, so it runs without auth. This is why stdio is never deployed.

**Per-tool authorization.** No `allowUnauthenticatedAccess`. Tools without a decorator still need an authenticated caller. `@PublicTool()` is not used anywhere in the template, and `docs/security.md` says when it's acceptable.

**Object-level checks.** The template can't know an engineer's objects. The example tool shows the pattern: read `ctx.getUser().sub` and check ownership before touching an ID from the arguments. `docs/security.md` has the review checklist.

**No token passthrough.** The server never forwards its inbound token to another API. `docs/auth/overview.md` shows the two allowed patterns for calling downstream APIs: on-behalf-of / token exchange for a token audienced to that API, or the server's own managed identity.

### 4. Gateway expectations (`docs/gateway.md`)

The server reads:

| Input | Use |
| --- | --- |
| `Authorization: Bearer` | Validated per section 3. Its audience must be this server. |
| `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` | Revision `2026-07-28` routing headers. Passed through unchanged. |
| `traceparent`, `tracestate`, `baggage` (HTTP headers and `_meta`) | Trace parent. `_meta` wins when both exist, since it is set by the MCP client. |
| `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host` | Trusted only for `TRUST_PROXY_HOPS` hops (default 0). |
| `Origin`, `Host` | Checked against `MCP_ALLOWED_ORIGINS` / `MCP_ALLOWED_HOSTS` when set. |

The server emits `WWW-Authenticate` on 401 and 403, and JSON-RPC errors with generic messages.

**A production deployment must sit behind an MCP gateway.** The server is built to scale horizontally behind one: it is stateless, so the gateway can spread load across any number of replicas, and it owns rate limiting, quotas and abuse protection. The server never rate-limits and offers no in-process fallback. Running without a gateway is for local development and demos only. `docs/gateway.md`, `docs/setup.md` and the Terraform README all say so up front.

A gateway must:

- Forward the client's token unchanged, or exchange it for one audienced to this server. The server ignores identity headers such as `X-User-Id`; identity comes only from a validated token.
- Propagate W3C trace context.
- Enforce rate limits, request timeouts and TLS.
- Not cache responses across callers.

### 5. State

- No in-process state between requests. The template never sets `statefulMode` (it's legacy-era only), and a platform test fails if it's enabled.
- `docs/state.md` shows Redis through `ioredis`: a provider in `src/app/`, keys namespaced by the caller's `sub`, a TTL on every key, and a delete-by-user example (`SCAN` on the user prefix). `ioredis` is not a default dependency.
- `/readyz` checks Redis when `REDIS_URL` is set.

### 6. Config (ADR-0004)

- A Zod schema over `process.env` in `platform/config/`, run through `@nestjs/config`'s `validate` hook. Zod is already a peer dependency for tool schemas.
- Failure prints every problem as `<KEY>: <what's wrong>. <what to do>`, never the value. For example: `AUTH_ISSUER: required when AUTH_MODE=external. Set it to your issuer URL.` Exit code 1.
- Typed `AppConfig` injected through Nest DI. No `process.env` reads outside `platform/config/`.
- OpenTelemetry uses its own standard `OTEL_*` variables rather than template-specific ones.

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` disables `dev` auth and stdio |
| `PORT` | `3000` | |
| `MCP_SERVER_NAME` | `name` in `package.json` | |
| `MCP_SERVER_VERSION` | `version` in `package.json` | |
| `MCP_PUBLIC_URL` | `http://localhost:3000` | Required in production. Builds the resource URL and default audience |
| `MCP_ALLOWED_ORIGINS`, `MCP_ALLOWED_HOSTS` | unset | Comma-separated |
| `MCP_MAX_REQUEST_BYTES` | `1048576` | Body limit |
| `MCP_REQUEST_TIMEOUT_MS` | `60000` | |
| `MCP_INPUT_MAX_ROUNDS`, `MCP_INPUT_ROUND_TIMEOUT_MS` | `5`, `300000` | Multi-round limits |
| `MCP_REQUEST_STATE_SECRET` | random per process in development | Required in production |
| `AUTH_MODE` | `external` | `external` or `dev` |
| `AUTH_PROVIDER` | `generic` | `entra`, `auth0`, `keycloak`, `generic` |
| `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URI` | — | `AUTH_ISSUER` required for `external` |
| `AUTH_ALGORITHMS` | `RS256` | |
| `AUTH_REQUIRED_SCOPES` | unset | |
| `AUTH_CLOCK_TOLERANCE_SECONDS` | `30` | |
| `AUTH_MAX_TOKEN_LIFETIME_SECONDS` | `5400` | |
| `LOG_LEVEL` | `info` | |
| `LOG_PSEUDONYM_KEY` | random per process in development | Required in production. See section 7 |
| `TRUST_PROXY_HOPS` | `0` | |
| `SHUTDOWN_TIMEOUT_MS` | `25000` | Below Container Apps' 30 s grace period |
| `REDIS_URL` | unset | Only when the Redis example is used |

The HTTP server in development starts without `AUTH_ISSUER` only if `AUTH_MODE=dev`. NFR-5 is met through stdio, which needs no auth config.

### 7. Logging and OpenTelemetry (ADR-0005)

**Logging.** `nestjs-pino`. JSON to stdout (stderr under stdio). Every line carries `trace_id` and `span_id`. Redaction paths: `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]`, any `*token*`, `*secret*` and `requestState` key. Tool arguments and results are not logged by default.

**Tracing.** `@opentelemetry/sdk-node`, loaded with `node --import ./dist/platform/telemetry/instrumentation.js` so it starts before Nest. Instrumentations limited to `http`, `express` and `ioredis` (if present). OTLP over HTTP/protobuf, configured by `OTEL_EXPORTER_OTLP_ENDPOINT`; no exporter runs when it's unset. A Nest interceptor wraps every MCP call in a span named `<mcp.method.name> <tool or resource name>`, following the OpenTelemetry MCP semantic conventions (development status), with the `_meta` trace context as parent when present.

**Metrics.** Request count and duration by method and tool, error count by JSON-RPC code, auth failures by reason (`missing`, `invalid_signature`, `wrong_audience`, `expired`, `insufficient_scope`).

**Resource attributes.** `service.name`, `service.version`, `deployment.environment.name`.

**Personal data in telemetry.**

- Identity appears as `enduser.pseudo.id` = HMAC-SHA256 of `sub` keyed with `LOG_PSEUDONYM_KEY`. Raw `sub`, email, name and tokens are never recorded.
- Client IP (`client.address`) is dropped by default.
- `docs/privacy.md` lists what the template records and why, and gives a record-of-processing entry for the deployer to complete.

### 8. Health and shutdown

- `GET /healthz`: liveness. 200 while the process runs.
- `GET /readyz`: readiness. 200 when config is loaded, the JWKS has been fetched at least once and Redis answers (if configured). 503 once shutdown starts.
- Both unauthenticated, return `{"status":"ok"}` or `{"status":"unavailable"}` only, and are excluded from traces.
- On `SIGTERM`: readiness goes 503, the server stops accepting connections, in-flight requests drain up to `SHUTDOWN_TIMEOUT_MS`, telemetry flushes, the process exits 0. Uses `app.enableShutdownHooks()` and `@nestjs/terminus`.

### 9. Inspector, scripts and CI

**npm scripts.** npm's colon convention is used for script names (an ecosystem override of brand-personal §2's kebab-case).

| Script | Does |
| --- | --- |
| `dev`, `dev:stdio` | Run HTTP or stdio entry with watch |
| `build`, `start` | Compile; run `dist/main.js` with instrumentation |
| `lint`, `format`, `typecheck` | ESLint (flat config, typescript-eslint), Prettier, `tsc --noEmit` |
| `test` | Jest unit tests |
| `inspect` | Inspector web UI against the stdio server from `inspector.config.json` |
| `inspect:http` | Inspector web UI against `http://localhost:3000/mcp` |
| `test:smoke` | Inspector CLI against stdio and HTTP |

- `@modelcontextprotocol/inspector` is an exact-pinned dev dependency.
- `inspector.config.json` defines `local-stdio` (`node dist/main.stdio.js`) and `local-http` (`streamable-http`, `http://localhost:3000/mcp`), pinned to `2026-07-28` (see open questions).
- **Smoke tests.** stdio: `tools/list`, call the example tool, read the example resource, get the example prompt. HTTP: same calls with a bearer token, plus one call without a token expecting 401 and one with a wrong audience expecting 401. The HTTP run starts a test JWKS stub (generated key pair, served on localhost) and mints tokens from it, so the real guard runs with no external issuer and no secrets.

**Workflows** (`.github/workflows/`, `permissions: contents: read` unless stated, actions pinned to SHAs):

- `ci.yml` on pull requests and `main`: install, lint, typecheck, test, build, smoke tests, `npm audit --omit=dev --audit-level=high`, Docker build (no push), `terraform fmt -check` and `terraform init -backend=false && terraform validate`. Node 22.19.x and 24.x.
- `codeql.yml`: `javascript-typescript` and `actions`, on pull requests, `main` and weekly.
- `.github/dependabot.yml`: `npm`, `github-actions`, `docker`, `terraform`, weekly, minor and patch grouped.
- `release.yml` on `v*` tags: runs CI, then creates a GitHub Release from that version's `CHANGELOG.md` section (`contents: write`).
- `deploy.yml`: `workflow_dispatch` only. Azure login with OIDC federated credentials, image build and push, `terraform apply`. Skips with a message when its repo variables are unset, so it never fails a fresh repo.

**Releases.** SemVer for the template. A breaking change to env vars, endpoint paths, the `app.module.ts` seam or npm script names is a major release. `CHANGELOG.md` follows Keep a Changelog, newest first, grouped Added/Changed/Fixed/Removed. `docs/setup.md` tells engineers to start their own changelog and keep a note of the template version they came from.

**Container.** Multi-stage `Dockerfile`, `node:22-alpine` pinned by digest, `npm ci --omit=dev`, non-root user, `CMD` runs the HTTP entry only.

### 10. Terraform (ADR-0006)

```
infra/terraform/
  modules/container-app/       # Container App, identity, probes, ingress, secrets
  envs/reference/
    main.tf  variables.tf  outputs.tf  versions.tf
    backend.tf                 # azurerm backend, partial config
    terraform.tfvars.example
    .terraform.lock.hcl        # committed
```

- `azurerm` provider pinned with the lock file. State in an Azure Storage backend configured at `init`; no state in the repo.
- Resources: Log Analytics workspace (retention variable, default 30 days), Container Apps environment, user-assigned managed identity, Azure Container Registry (AcrPull for the identity), Key Vault with RBAC holding `MCP_REQUEST_STATE_SECRET` and `LOG_PSEUDONYM_KEY`, referenced as Container App secrets, and the Container App.
- Container App: HTTPS only, liveness and readiness probes on `/healthz` and `/readyz`, `min_replicas` 1, `max_replicas` a variable (default 3) as a cost ceiling, HTTP scale rule.
- `external_ingress` is a required variable with no default. Whoever deploys decides whether the server is public.
- Telemetry goes to `OTEL_EXPORTER_OTLP_ENDPOINT`. The reference wires the Container Apps managed OpenTelemetry agent to Application Insights (see open questions).
- Redis is not provisioned. `docs/state.md` points to Azure Managed Redis.
- No gateway is provisioned. On its own, the reference deployment is not production-ready; its README says a gateway must front it in production (section 4).

### 11. Docs and repo hygiene

- `README.md`: one heading (fixes the triplicated heading, which is also UTF-16; convert to UTF-8), one-line description, "Use this template" setup, usage, then config, docs index and licence.
- `SECURITY.md` points to private vulnerability reporting.
- `docs/security.md`: the OWASP API and MCP Top 10 self-review, one row per item with how the template addresses it, what the engineer owns, and the evidence. Filling it in for the template is the v1 security review.
- Docs follow brand-personal §1: short sentences, imperative mood, no marketing language.

### 12. Coding-agent tooling (ADR-0007)

The guidance is written for engineers building servers from the template, not for maintaining the template. Every file below ships to every server created from it.

**Instructions.**

- `AGENTS.md` is the single source of agent guidance, readable by Claude Code, Copilot and other agents. It covers: the `platform`/`app` split and the one seam; the npm scripts and what "done" means (`lint`, `typecheck`, `test`, `test:smoke` pass); the tool-authoring rules below in summary; and where the docs live. It ends with an `## Engineer notes` section that template releases never edit.
- `CLAUDE.md` imports it with `@AGENTS.md` and adds only Claude Code specifics: that path rules live in `.claude/rules/` and which skills exist. No guidance is duplicated between the two files.

**`.claude/settings.json`** (kept small, since template and engineers both edit it):

- `permissions.allow`: the npm scripts in section 9 and read-only `git` commands.
- `permissions.ask`: edits to `src/platform/**`, `.github/**` and `infra/**`.
- `permissions.deny`: reading `.env` and `.env.*` (except `.env.example`), `infra/**/*.tfstate*` and `infra/**/*.tfvars` (except `*.tfvars.example`).
- One `PostToolUse` hook after edits to `src/**`: runs `npm run lint -- --quiet` and `npm run typecheck` on fixed arguments, with no file paths or tool input interpolated into the command.
- `.claude/settings.local.json` is git-ignored for personal overrides.

**`.claude/rules/`**, path-scoped with `paths` frontmatter:

| File | Paths | Says |
| --- | --- | --- |
| `platform.md` | `src/platform/**`, `test/platform/**` | Template-owned. Prefer config or `src/app/`; changes here are upstream changes and conflict on upgrade. |
| `mcp-tools.md` | `src/app/**` | Every tool gets `@ToolScopes` or `@ToolRoles` unless deliberately public; check ownership before using an ID from arguments; Zod schemas use `.strict()`; return only needed fields; no shell string concatenation; allowlist outbound URLs and recheck redirects; mark third-party content in results; never log tool arguments containing personal data; add a test per tool. |
| `config.md` | `src/platform/config/**`, `.env.example` | New variables are SCREAMING_SNAKE_CASE, validated in the Zod schema, documented in the section 6 table in `docs/operations.md`, and never given real values in `.env.example`. |
| `terraform.md` | `infra/**` | Secrets via Key Vault references only; no public ingress without the explicit variable; pin providers; run `terraform fmt` and `validate`. |

**`.claude/skills/`**, prefixed `template-` so engineers' own skills never collide on upgrade:

| Skill | Does |
| --- | --- |
| `template-add-tool` | Scaffold a tool in `src/app/tools/`, register it in `app.module.ts`, add a test and a smoke-test call, and apply `mcp-tools.md`. |
| `template-add-resource` | Same for a resource or resource template. |
| `template-add-prompt` | Same for a prompt. |
| `template-upgrade` | Merge a template release tag, read its changelog entry, resolve conflicts with `src/app/` and engineer notes winning, run the full check. |

**`.mcp.json`** (repo root; Claude Code does not read `.claude/mcp.json`):

- One server, `local`: the server's own stdio build, `node dist/main.stdio.js`, so the agent can call the tools it is building.
- No remote servers, no credentials, no `env` with secrets. Claude Code asks before first use of a project server.

**Not shipped:** the template maintainer's own SDLC and policy skills. They live at user level; servers created from the template don't depend on them.

### 13. Policy assessment summary

| Policy | Outcome |
| --- | --- |
| security-baseline §1 secrets | Key Vault references and env injection; `.env` git-ignored; `.env.example` has no values; agents denied reading `.env*`, state and real `tfvars` (section 12). Met. |
| security-baseline §2 dependencies | Exact pins, lockfile, Dependabot, CodeQL. Beta upstream: concern 2. Agent files as a shipped dependency: concern 9. |
| security-baseline §3 exposure | Health endpoints minimal; ingress a deliberate variable. Concern 6. |
| security-baseline §4 data handling | Redaction and pseudonyms (section 7). Concern 4. |
| security-baseline §5 vulnerabilities | Dependabot, `npm audit`, `SECURITY.md`, upstream-change issue form. Met. |
| security-api §1 BOLA | Example, checklist and the `mcp-tools.md` agent rule. Concern 8. |
| security-api §2 authentication | Section 3. Met. Guard ownership: concern 3. |
| security-api §3 BOPLA | Tool schemas are Zod objects; the example uses `.strict()` and returns only needed fields. Checklist item. |
| security-api §4 resource consumption | Rate limiting at the required gateway (concern 1, resolved). Server adds body limit, timeouts, round limits and replica cap. Met in production. |
| security-api §5 BFLA | `@ToolScopes` / `@ToolRoles`, tools protected by default. Met. |
| security-api §6 business flows | Engineer-owned. Checklist item. |
| security-api §7 SSRF | Only outbound call is the configured JWKS. Engineer fetches: checklist item (allowlist, recheck redirects). |
| security-api §8 misconfiguration | Generic errors in production, no CORS, Origin allowlist, no stack traces. Met. |
| security-api §9 inventory | One endpoint, one protocol era, documented interfaces. Met. |
| security-api §10 third-party APIs | Engineer-owned. Checklist item. |
| security-mcp §1 tokens | Per-user tokens, no shared credentials, no passthrough. Met. |
| security-mcp §2 scope creep | Lifetime cap; scope review is IdP config. Checklist item. |
| security-mcp §3 tool poisoning | Static tool definitions reviewed in PRs; no dynamic registration. Met for the server side. |
| security-mcp §4 supply chain | As baseline §2. Concern 2. `.mcp.json` names only the local build. |
| security-mcp §5 command injection | No shell-outs in the template. The edit hook runs fixed commands with no interpolated input. Checklist item and `mcp-tools.md` rule: argument arrays only. |
| security-mcp §6 prompt injection via outputs | Checklist item: delimit third-party content in tool results. |
| security-mcp §7 authn/authz | Sections 3 and 4. Met. |
| security-mcp §8 audit | Per-call spans and metrics with pseudonymous identity. Concern 4. |
| security-mcp §9 shadow servers | Name and version in discovery and telemetry; `docs/gateway.md` asks for gateway inventory registration. Met. |
| security-mcp §10 over-sharing | Server-side: private cache scope, per-user Redis keys. Client-side trifecta is out of the server's control. |
| compliance-gdpr | Template is neither controller nor processor; each deployer is the controller. Privacy by default (section 7), `docs/privacy.md`, retention default. Concern 4. |
| compliance-eu-ai-act | The template is not an AI system. Servers built from it sit in an agent's action layer (§3), so a deployer whose agent is high-risk inherits logging and cybersecurity duties. The per-call telemetry supports those. No obligations on the template itself. |
| brand-personal | Voice in docs, errors and agent instructions; kebab-case repo and skill names; SCREAMING_SNAKE_CASE env vars; changelog format. npm script colons and the `AGENTS.md`/`CLAUDE.md` file names are ecosystem overrides. No visual identity needed: no UI. |
| ux-personal §4 | Config errors name the key and the fix; JSON-RPC errors carry a code and message; zero-config stdio start; runnable examples; SemVer for breaking changes. No UI, so §2 and §3 don't apply. |

### 14. ADRs to write during Build

Recorded in `docs/adr/` (MADR format): 0001–0006 are the decisions listed on issue #4, 0007 was added during design. The decision in each is the one this spec proposes.

| ADR | Decision |
| --- | --- |
| 0001 | `src/platform` vs `src/app` split with one seam (section 1) |
| 0002 | One generic token guard plus `AUTH_PROVIDER` claim map, not one module per provider (section 3) |
| 0003 | Validate every token in the server, even behind a gateway (section 3) |
| 0004 | Zod env schema via `@nestjs/config`; transport by entry point; auth by `AUTH_MODE` (sections 2, 6) |
| 0005 | `nestjs-pino`, OTel Node SDK with OTLP, HMAC pseudonyms (section 7) |
| 0006 | One reusable module plus a reference environment; ingress as a required decision (section 10) |
| 0007 | `AGENTS.md` as the source with `CLAUDE.md` importing it; `template-` prefixed skills and path-scoped rules; `.mcp.json` limited to the local build (section 12) |

## Open questions resolved

The intent had no open questions. Questions that came up during design:

| Question | Resolution |
| --- | --- |
| Does MCP-Nest serve modern-only? | Yes. Default is dual-era; `protocol: 'modern-only'` on HTTP and `legacy: 'reject'` on stdio give modern-only. |
| Express or Fastify? | Express. Default for Nest and simplest for `resolveUser`. |
| How do CI smoke tests authenticate without secrets? | A local test JWKS stub and minted tokens, exercising the real guard. |
| How is stdio kept out of deployments? | Separate entry point; the container only runs the HTTP entry; stdio refuses `NODE_ENV=production`. |
| How do multi-round requests stay stateless across replicas? | Shared HMAC key for `requestState`. |
| Test runner? | Jest, the Nest default. |

Carried forward, to verify at the start of Build:

1. **Inspector protocol pinning.** Confirm `inspector.config.json` can pin `2026-07-28`. If it can't, the server's `modern-only` posture is the enforcement and the intent's "config pinned to the modern protocol" is met only indirectly.
2. **Inspector CLI headers.** Confirm the CLI can send `Authorization` for HTTP smoke tests. Fallback: a small `@modelcontextprotocol/client` script pinned to `2026-07-28`.
3. **Entra ID client registration.** Confirm Entra's support for Client ID Metadata Documents. See concern 5.
4. **Agent file formats.** Confirm the `paths` frontmatter for `.claude/rules/`, the `@AGENTS.md` import and the hook schema against current Claude Code docs, and that Copilot reads `AGENTS.md`.
5. **Container Apps managed OpenTelemetry agent.** Confirm it's generally available and accepts OTLP traces and metrics for Application Insights. Fallback: an OpenTelemetry Collector sidecar.

## Areas of concern

Joseph Searle owns every policy area for this personal project. Each item needs a decision before this spec is accepted.

1. **security-api §4 (resource consumption) vs intent constraint "no rate limiting in the server".** A server without a gateway, including the reference Container Apps deployment, has no rate limit. The design caps body size, request time, multi-round rounds and replica count, which bounds cost but not abuse. Options: (a) accept and state in `docs/gateway.md` and the Terraform README that production needs a gateway; (b) add an opt-in in-process limiter, off by default; (c) make the reference deployment internal-only.
   **Resolved 2026-10-14 (Joseph Searle): (a), as a hard requirement.** Every production deployment sits behind an MCP gateway, the same as a production API. The gateway owns rate limiting, and stateless servers scale horizontally behind it. No in-process limiter, not even opt-in: engineers should never have to build or tune one. Section 4, section 10 and FR-18 updated.

2. **security-baseline §2 / security-mcp §4 (supply chain): beta dependencies.** `@rekog/mcp-nest` 2.0.8 peers on `@modelcontextprotocol/core`, `/node` and `/server` `^2.0.0-beta.5`. A "production-ready" v1 would rest on a beta SDK. `@rekog/mcp-nest-auth` is also marked Beta, though only `dev` mode uses it. Options: (a) ship v1 on exact-pinned betas, label it in the README, and track SDK GA with an Upstream change issue; (b) hold the v1 tag until SDK v2 is GA. Proposed: (a).

3. **Intent constraint "OAuth through MCP-Nest's own support" vs security-api §2 / security-mcp §7.** MCP-Nest's own auth (`McpAuthModule`) is an authorization server. For external issuers it ships no resource-server guard; its examples hand-roll one. Meeting "validate every token" therefore needs a template-owned guard of about 100 lines on `jose`, which is security-critical code the template now maintains. Options: (a) template-owned `jose` guard (proposed, section 3); (b) a third-party middleware such as `express-oauth2-jwt-bearer`, mapped via `resolveUser`. Both depart from "MCP-Nest's own support" for production; the intent wording needs confirming.

4. **security-mcp §1 and §8 (attributable audit) vs compliance-gdpr §1 (data minimisation) and security-baseline §4.** Audit needs to tie each call to a person; GDPR and the baseline want no personal data in telemetry without reason. Proposed default: HMAC pseudonym of `sub`, no raw identifiers, no client IP, 30-day retention. A keyed pseudonym is still personal data under UK/EU GDPR, so deployers need a lawful basis (likely legitimate interests: security monitoring) and a record of processing; `docs/privacy.md` says so. Decide whether the default is pseudonym, raw `sub` behind a flag, or nothing.

5. **Intent (Entra ID as default provider) vs MCP client registration.** Entra ID does not offer Dynamic Client Registration, and its support for Client ID Metadata Documents is unconfirmed. MCP clients may then need a pre-registered client ID, or a gateway that brokers registration. The template's token validation is unaffected; the zero-configuration client experience is. Decide whether Entra stays the documented default or Auth0/Keycloak lead the docs with Entra marked "pre-registered clients only".

6. **security-baseline §3 (exposure is a deliberate decision).** The reference deployment needs a reachable endpoint to be useful, but no gateway ships with it. `external_ingress` is a required variable with no default, so the decision is explicit per deployment. Confirm this is enough, or default to internal ingress.

7. **Intent constraint "no new abstractions" vs FR-6.** The `AUTH_PROVIDER` claim map is a small abstraction. Without it, each provider doc would tell engineers to edit guard code in `src/platform/`, which breaks the upgrade path in section 1. Proposed: keep the map.

8. **security-api §1 (BOLA) and §3 (BOPLA): engineer-owned.** The template can't enforce object- or property-level checks in tools it hasn't seen. Mitigated by the example tool, the `docs/security.md` checklist and the `mcp-tools.md` rule, which puts the checklist in front of coding agents as they write tools. Accept as residual risk owned by each server's engineer.

9. **security-baseline §2 / security-mcp §3 (agent files are a shipped dependency).** `AGENTS.md`, `.claude/rules/`, skills, hooks and `.mcp.json` are instructions and commands that coding agents act on in every server created from the template. A careless or compromised template release could change them, much like a tool-definition rug pull: engineers merging a release would pick up new agent behaviour, or a hook that runs new commands, without noticing. Proposed: list every agent-file change in its own changelog subsection, have `template-upgrade` show the diff of `.claude/`, `AGENTS.md` and `.mcp.json` and ask before accepting it, and keep hooks to fixed commands. Decide whether that is enough or whether hooks should be left out of the template entirely.

10. **Scope beyond the accepted intent.** The intent doesn't mention coding-agent tooling; FR-19 and section 12 were added by the product owner during design. It doesn't contradict any constraint, but it is new scope. Options: (a) accept it at spec level and note it on epic #5; (b) amend `intent.md` in this PR so intent and spec agree. Proposed: (b), a one-line addition to Proposed outcome.
