---
author: Joseph Searle
status: draft
linked_issue: https://github.com/JosephSearle/nestjs-mcp-server-template/issues/2
created: 2026-10-14
---

# Intent: Production-ready NestJS MCP server template

## Problem
There's no strong starting point for building MCP servers on NestJS. Each new server has to re-solve the production essentials — auth, telemetry, transport, state handling and how it sits behind an MCP gateway — so they get implemented differently per server, or skipped. On top of that, the 2026-07-28 MCP revision made HTTP sessionless and per-request and removed server-to-client requests, so patterns built for the earlier session-based protocol are now out of date.

## Proposed outcome
A GitHub template repository that engineers create new MCP servers from. It leans on `@rekog/mcp-nest` as it is, with no wrapper or extra package, and adds the production setup around it. An engineer adds tools, resources and prompts and picks the options that fit their server:

- **Template repository**: created with GitHub's "Use this template". Everything lives in the repo, so engineers can change any part of it.
- **Transport**: Streamable HTTP for deployed servers; stdio for local development and testing only.
- **Protocol**: modern MCP (2026-07-28) only.
- **Auth**: OAuth through MCP-Nest's own auth support. The template shows how to configure the common strategies (an external provider such as Entra ID, Auth0 or Keycloak) and uses MCP-Nest's built-in authorization server for local development and demos only. Servers validate every token themselves (issuer, audience, expiry, scopes), even behind a gateway.
- **Gateway**: gateway-agnostic. The template documents what it expects from a gateway (identity forwarding, trace propagation) and gives worked setup for recommended gateways, with Azure API Management as the Azure-native default. Rate limiting is the gateway's job, not the server's.
- **State**: stateless by default. The template documents how to keep application state that must survive between requests, with Redis as the worked example.
- **Production setup**: OpenTelemetry tracing and metrics, structured logging, health and readiness checks, graceful shutdown, config validated at startup.
- **MCP Inspector built in**: npm scripts for the web UI against stdio and local HTTP, a committed Inspector config pinned to the modern protocol era, and Inspector CLI smoke tests in CI.
- **Deployment IaC** in Terraform for a reference deployment on Azure Container Apps.
- **Releases**: the template is versioned with tagged releases and a changelog, so engineers can see what changed since they created their server.

v1 is done when:
- The template has passed security review: a self-review against the OWASP MCP and API Top 10 and the security baseline, with CodeQL and Dependabot running in CI.
- A fresh repo created from the template passes CI out of the box: lint, tests and Inspector CLI smoke tests.

## Affected users and systems
- **Users**: engineers building production MCP servers from the template; the MCP clients (e.g. Claude) and agents that consume those servers through a gateway.
- **Systems**: GitHub (template repo, CI, releases); OAuth providers (Entra ID by default); MCP gateways (Azure API Management recommended); hosting (Azure Container Apps for the reference deployment, not mandated); the telemetry backend that receives OpenTelemetry data; Redis or another store when a server needs application state.

## Constraints
- Lean on `@rekog/mcp-nest` v2 (2.0.0 or later) directly. No wrapper and no separate package to maintain. v2 targets the 2026-07-28 revision through MCP TypeScript SDK v2 and supports multi-round tool requests for elicitation, sampling and roots.
- Don't over-engineer: prefer configuration, examples and docs over new abstractions.
- No rate limiting in the server. It belongs at the MCP gateway.
- Modern MCP (2026-07-28) only — no legacy session support and no legacy toggle.
- Agnostic by design: gateway, OAuth provider, hosting and state store are recommendations, not mandates.
- stdio is for local development and testing only and is never deployed.
- The Inspector requires Node 22.19 or newer, so the template targets that.
- Python equivalent is out of scope.

## Open questions
- Is a scaffolding CLI still needed for v1, or does GitHub's "Use this template" plus a short setup guide cover it?
- Which gateways join Azure API Management on the recommended list. The spec evaluates two or three candidates and records the choice in an ADR.
