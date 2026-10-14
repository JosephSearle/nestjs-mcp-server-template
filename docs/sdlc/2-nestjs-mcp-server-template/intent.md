---
author: Joseph Searle
status: draft
linked_issue: https://github.com/JosephSearle/nestjs-mcp-server-template/issues/2
created: 2026-10-14
---

# Intent: Production-ready NestJS MCP server template

## Problem
There's no standard starting point for building MCP servers. Each new server has to re-solve the production essentials — auth, telemetry, rate limiting, transport and state handling — so they get implemented differently per server, or skipped. There's no agreed way for a server to sit behind an MCP gateway, and no single place to roll out a security fix across every server. On top of that, the 2026-07-28 MCP revision made HTTP sessionless and per-request and removed server-to-client requests, so patterns built for the earlier session-based protocol are now out of date.

## Proposed outcome
A strengthened template where a developer only adds tools, resources and prompts, and everything production-critical is already in place:

- **Shared core package** (working name `@newrocket/mcp-core`) built on `@rekog/mcp-nest`, holding all the hardening. Fixes reach every server through a version bump, not a re-scaffold.
- **Thin GitHub template repo** that depends on the core package. Developers touch config and their `@McpController` classes only.
- **Transport**: Streamable HTTP for deployed servers; stdio for local development and testing only.
- **Protocol**: modern MCP (2026-07-28) only.
- **State**: stateless by default, with an optional pluggable external store for application state that must survive between requests.
- **Auth**: servers act as OAuth resource servers, provider-agnostic, with Entra ID as the recommended default.
- **Gateway**: gateway-agnostic, with a documented gateway contract (identity forwarding, trace propagation, rate-limit headers) and a list of recommended gateways (Azure API Management as the Azure-native default).
- **Standard production concerns**: rate limiting, OpenTelemetry tracing and metrics, structured logging, health and readiness checks, graceful shutdown.
- **MCP Inspector built in**: npm scripts for the web UI against stdio and local HTTP, a committed Inspector config pinned to the modern protocol era, and Inspector CLI smoke tests in CI.

v1 is done when:
- The core package has passed security review before wider adoption.
- A fresh repo created from the template passes CI out of the box: lint, tests and Inspector CLI smoke tests.

## Affected users and systems
- **Users**: AI Foundry engineers building MCP servers for internal and client use; the MCP clients (e.g. Claude) and agents that consume those servers through a gateway.
- **Systems**: GitHub Enterprise (template repo, core package publishing, CI); OAuth providers (Entra ID by default); MCP gateways (Azure API Management recommended); hosting (Azure recommended, not mandated); the telemetry backend that receives OpenTelemetry data; whatever store backs optional application state.

## Constraints
- TypeScript and NestJS, built on `@rekog/mcp-nest`.
- Modern MCP (2026-07-28) only — no legacy session support and no legacy toggle.
- Agnostic by design: gateway, OAuth provider, hosting and state store are recommendations, not mandates.
- stdio is for local development and testing only and is never deployed.
- The Inspector requires Node 22.19 or newer, so the template targets that.
- Python equivalent is out of scope.

## Open questions
- Does `@rekog/mcp-nest` support the 2026-07-28 revision yet? Its latest release (v1.9.11, 14 July 2026) predates it, and its elicitation uses the server-to-client style that fails on modern connections. If support isn't there: contribute upstream, fork, or wait?
- Home repo once this moves into the org (NRAI Arch or NR-AI-Delivery).
- Are MCP-Nest's built-in authorization server (beta), a scaffolding CLI, and deployment IaC in or out of v1?
- Should servers still validate tokens themselves when the gateway has already authenticated the request (defence in depth)?
- Recommended default state store and the shape of the state-store interface.
- Where the core package is published, and its versioning and upgrade policy.
- Which gateways make the recommended list beyond Azure API Management.
- Who carries out the security review, and what it covers.
