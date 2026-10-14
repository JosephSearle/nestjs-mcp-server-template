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

- **Shared core package** (`@neptune/mcp-core`) built on `@rekog/mcp-nest`, holding all the hardening. Published to the public npm registry and versioned with SemVer through Changesets, with release notes generated per release. Fixes reach every server through a version bump, not a re-scaffold.
- **Thin GitHub template repo** that depends on the core package. Developers touch config and their `@McpController` classes only.
- **Scaffolding CLI** that creates a new server from the template and asks for the choices that differ per server.
- **Deployment IaC** in Terraform for a reference deployment on Azure Container Apps.
- **Transport**: Streamable HTTP for deployed servers; stdio for local development and testing only.
- **Protocol**: modern MCP (2026-07-28) only.
- **State**: stateless by default, with an optional pluggable store for application state that must survive between requests. Ships a Redis-compatible adapter as the recommended default and an in-memory adapter for local development.
- **Auth**: servers act as OAuth resource servers, provider-agnostic, with Entra ID as the recommended default. Servers validate every token themselves (issuer, audience, expiry, scopes), even behind a gateway that has already authenticated the request. MCP-Nest's built-in authorization server is supported for local development and demos only, so a developer can run the full OAuth flow without an identity provider. Production uses an external provider.
- **Gateway**: gateway-agnostic, with a documented gateway contract (identity forwarding, trace propagation, rate-limit headers) and a list of recommended gateways (Azure API Management as the Azure-native default).
- **Standard production concerns**: rate limiting, OpenTelemetry tracing and metrics, structured logging, health and readiness checks, graceful shutdown.
- **MCP Inspector built in**: npm scripts for the web UI against stdio and local HTTP, a committed Inspector config pinned to the modern protocol era, and Inspector CLI smoke tests in CI.

v1 is done when:
- The core package has passed security review before wider adoption: a self-review against the OWASP MCP and API Top 10 and the security baseline, with CodeQL, Dependabot and npm provenance running in CI.
- A fresh repo created from the template passes CI out of the box: lint, tests and Inspector CLI smoke tests.

## Affected users and systems
- **Users**: developers building production MCP servers from the template; the MCP clients (e.g. Claude) and agents that consume those servers through a gateway.
- **Systems**: GitHub (template repo, CI); the npm registry (core package); OAuth providers (Entra ID by default); MCP gateways (Azure API Management recommended); hosting (Azure Container Apps for the reference deployment, not mandated); the telemetry backend that receives OpenTelemetry data; whatever store backs optional application state.

## Constraints
- TypeScript and NestJS, built on `@rekog/mcp-nest` v2 (2.0.0 or later). v2 targets the 2026-07-28 revision through MCP TypeScript SDK v2 and supports multi-round tool requests for elicitation, sampling and roots.
- Modern MCP (2026-07-28) only — no legacy session support and no legacy toggle.
- Agnostic by design: gateway, OAuth provider, hosting and state store are recommendations, not mandates.
- stdio is for local development and testing only and is never deployed.
- The Inspector requires Node 22.19 or newer, so the template targets that.
- Fixes ship on the latest minor version only.
- The `@neptune` npm org must be claimed before the first publish.
- Python equivalent is out of scope.

## Open questions
- The shape of the state-store interface. To settle in the spec.
- Which gateways join Azure API Management on the recommended list. The spec evaluates two or three candidates against the gateway contract and records the choice in an ADR.
