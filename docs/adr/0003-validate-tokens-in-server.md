---
status: accepted
date: 2026-10-15
decision-makers: Joseph Searle
---

# Validate every bearer token in the server with jose, even behind a gateway

## Context and problem statement

Every HTTP request to `/mcp` must come from an authenticated caller (FR-5). Production deployments sit behind an MCP gateway (spec §4), which may validate tokens too. The server is a pure OAuth resource server in `external` mode: an external issuer (Entra ID, Auth0, Keycloak) mints tokens and the server checks them. MCP clients discover the issuer from RFC 9728 metadata and expect `WWW-Authenticate` challenges on 401 and 403 (FR-9).

Where are tokens validated, with what, and what does a rejection look like? (Spec §3; concern 3.)

## Decision drivers

- Defence in depth. A misrouted request, a gateway misconfiguration or a caller inside the network must not reach a tool unauthenticated.
- No token passthrough. Identity comes only from a validated token, never from a header a gateway sets.
- Known JWT attacks closed by default: `alg: none`, algorithm confusion (HMAC keyed with the public key), keys fetched from a URL in the token (`jku`, `x5u`).
- Template-owned security code (concern 3): small, reviewed, and covered by a negative-case suite.
- No new abstractions where a library will do (NFR-6).

## Considered options

Where:

1. Validate in the server on every request.
2. Trust the gateway and read identity from headers it sets.

With what:

1. `jose` (`jwtVerify`, `createRemoteJWKSet`) in a Nest guard.
2. Passport with `passport-jwt` and `jwks-rsa`.
3. `@rekog/mcp-nest-auth`'s `McpAuthJwtGuard`.

## Decision outcome

Chosen: **validate in the server, with `jose` in `McpTokenGuard`**.

`McpHttpController` carries `@UseGuards(McpTokenGuard)`, so the guard runs on every request to `/mcp`. `TokenVerifier` (`src/platform/auth/token-verifier.ts`) does the checks:

- **Algorithms.** Only `AUTH_ALGORITHMS`, which the config schema limits to asymmetric algorithms. `none` and HMAC never verify.
- **Keys.** From `AUTH_JWKS_URI`, or from the issuer's OpenID discovery document, whose `issuer` must equal `AUTH_ISSUER` exactly. jose never reads `jku`, `x5u` or `x5c` when given a key-set function, so a token can't choose where its key comes from. Keys load inside jose's key callback, after the token parses and its algorithm passes, so junk tokens cause no fetch. A failed discovery is retried on the next request.
- **Claims.** `iss` equal to `AUTH_ISSUER`; `aud` includes `AUTH_AUDIENCE` (default `MCP_PUBLIC_URL` + `/mcp`, RFC 8707); `exp` and `nbf` with `AUTH_CLOCK_TOLERANCE_SECONDS`; `exp`, `iat` and `sub` required; `exp - iat` at most `AUTH_MAX_TOKEN_LIFETIME_SECONDS`.
- **Scopes at the door.** Every `AUTH_REQUIRED_SCOPES` scope must be in the token's `scope` claim (a space-delimited string or an array). #18 replaces this read with the `AUTH_PROVIDER` claim map.

On success the claims become `req.user`, which mcp-nest reads for `@ToolScopes` and `@ToolRoles`, and which logs and spans record only as `enduser.pseudo.id`.

**Rejections.**

| Case | Status | `WWW-Authenticate` | `reason` |
| --- | --- | --- | --- |
| No `Authorization` header | 401 | `Bearer resource_metadata="…"` | `missing` |
| Not `Bearer`, or not a JWT | 401 | `Bearer error="invalid_token", resource_metadata="…"` | `malformed` |
| `alg` not allowed, bad signature, unknown `kid` | 401 | same | `invalid_signature` |
| Wrong `iss` / `aud` | 401 | same | `wrong_issuer` / `wrong_audience` |
| Expired / not yet valid | 401 | same | `expired` / `not_yet_valid` |
| Missing `exp`, `iat` or `sub` | 401 | same | `malformed` |
| `exp - iat` over the cap | 401 | same | `lifetime_exceeded` |
| Missing `AUTH_REQUIRED_SCOPES` scope | 403 | `Bearer error="insufficient_scope", scope="…", resource_metadata="…"` | `insufficient_scope` |
| Missing `@ToolScopes` scope | 403 | same, from mcp-nest's `stepUpAuthorization` | `insufficient_scope` |
| Issuer keys unreachable | 503 | none | not counted |

Each body is a JSON-RPC error with a generic message and no id, so clients don't mistake the server for a legacy one. Each counted rejection increments `mcp.server.auth.failures` with its `reason`. An unreachable issuer is a 503 rather than a 401, because a challenge would send clients into a login that can't help; the cause is logged without the token.

`GET /.well-known/oauth-protected-resource/mcp` (unauthenticated) returns `resource`, `authorization_servers`, `scopes_supported` (from `src/app/scopes.ts`, passed in by `PlatformModule.forRoot({ scopes })`), `bearer_methods_supported: ["header"]` and `mcp_versions_supported: ["2026-07-28"]`. Tokens are accepted only in the `Authorization` header.

### Consequences

- Good: a request reaches a tool only with a token this server has checked itself, whatever is in front of it.
- Good: the known JWT attacks fail closed, and each has a test.
- Good: one small guard and one dependency (`jose`, already used by the MCP SDK's client).
- Bad: tokens are checked twice when the gateway also validates. The cost is one signature check per request; keys are cached by jose.
- Bad: the first request after start fetches discovery and the JWKS. Readiness waits for that in #20.
- Neutral: the guard rejects everything over HTTP in `AUTH_MODE=dev` until #18 wires the built-in authorization server.

### Confirmation

- `test/platform/auth/token-guard.spec.ts` sends each case in the table to the real app and checks the status, the challenge and the metric: `alg: none`, HS256 keyed with the public key, an ES256 key outside `AUTH_ALGORITHMS`, another key, unknown `kid`, `jku`/`x5u` (and that neither is fetched), wrong issuer, wrong audience, expired, not yet valid, skew within tolerance, lifetime over the cap, each missing required claim, a missing required scope, a malformed token and a non-Bearer header. It also checks step-up on a `@ToolScopes` tool.
- `test/platform/auth/token-verifier.spec.ts` covers discovery, a discovery document for another issuer, `AUTH_JWKS_URI`, an unreachable JWKS, and that junk tokens fetch nothing.
- `test/platform/auth/protected-resource.spec.ts` checks the metadata.
- `test/platform/auth/no-token-forwarding.spec.ts` fails if code outside `src/platform/auth/` reads the `Authorization` header (the logger names it only to redact it).

## Pros and cons of the options

### Validate in the server

- Good: defence in depth; no trust in network position or headers.
- Bad: duplicate work behind a validating gateway.

### Trust the gateway

- Good: no auth code in the server.
- Bad: any request that bypasses the gateway is trusted, and identity headers can be forged. The intent rules it out.

### jose

- Good: no dependencies, current, safe defaults for the attacks above, and remote key sets with caching and cooldown built in.
- Bad: the guard, challenges and metadata are template code, so the template owns their tests.

### Passport with passport-jwt and jwks-rsa

- Good: familiar in Nest projects.
- Bad: three packages for what jose does alone, and Passport's failure handling hides the reason the metric and the challenge need.

### mcp-nest-auth's McpAuthJwtGuard

- Good: already integrated with mcp-nest.
- Bad: built for tokens from mcp-nest-auth's own authorization server, which is dev-only here (spec §3, #18).
