---
author: Joseph Searle
status: accepted
linked_intent: docs/sdlc/5-nestjs-mcp-server-template/intent.md
linked_spec: docs/sdlc/5-nestjs-mcp-server-template/spec.md
linked_issue: https://github.com/JosephSearle/nestjs-mcp-server-template/issues/9
linked_epic: https://github.com/JosephSearle/nestjs-mcp-server-template/issues/5
created: 2026-10-15
---

# Plan: v1 NestJS MCP server template build

The order Build issues land in, under [spec #4](spec.md) (epic #5), and the ADR each one writes.
A batch is a set of issues whose dependencies are all in earlier batches, so issues in the same
batch can be built in parallel; issues in later batches can't start until theirs close.

## Batch order and critical path

| Batch | Issues | Status |
| --- | --- | --- |
| 0 | #7, #8 | Closed |
| 1 | #9 (this plan) | In progress |
| 2 | #10 | Open |
| 3 | #11, #12 | Open |
| 4 | #13, #14 | Open |
| 5 | #15, #16, #17 | Open |
| 6 | #18, #19, #20, #21 | Open |
| 7 | #22, #23, #24 | Open |
| 8 | #25, #26, #27, #28, #29 | Open |
| 9 | #30 | Open |

**Critical path:** #7 → #9 → #10 → #11 → #13 → #15 → #20 → #23 → #25 → #30 (9 steps after #7;
#8 joins independently at batch 0). Every batch-8 issue sits at the same depth, so #30 can't open
until all five close — slippage in any one delays the v0.1.0 tag equally.

**Bottleneck: #23 (Terraform).** It's the only batch-7 issue blocking more than one later issue:
#25, #26, #28 and #29 all name it directly in "Blocked by". #23 itself needs both #20 (health
endpoints, for the Container App probes) and #16 (the container image, for anything to deploy),
making it the latest point by which the template's runtime behaviour must be settled before
infrastructure, deploy and security docs can start.

## Build issues

| Issue | Title | Component | Blocked by | FRs owned | ADR |
| --- | --- | --- | --- | --- | --- |
| #9 | Write the Build plan (plan.md) | Docs | #7 | — | — |
| #10 | Scaffold the NestJS project (platform/app split, Biome, Jest, README) | Template repo | #9 | FR-2 | 0001, 0008 |
| #11 | Validate env config with a Zod schema | Template repo | #10 | FR-11 | 0004 |
| #12 | CI, CodeQL and Dependabot workflows | CI/CD | #10 | FR-15 | — |
| #13 | Streamable HTTP + stdio transports, example tool/resource/prompt | Template repo | #11 | FR-3, FR-4, FR-10 | — |
| #14 | pino logging, OpenTelemetry, HMAC pseudonyms | Template repo | #11 | FR-12 | 0005 |
| #15 | `jose` token guard + protected-resource metadata | Template repo | #13 | FR-5, FR-9 | 0003 |
| #16 | Non-root, digest-pinned container image | Template repo | #13, #14 | FR-3 | — |
| #17 | AGENTS.md, Claude Code settings, rules, .mcp.json | Template repo | #13, #12 | FR-19 | 0007 |
| #18 | AUTH_PROVIDER claim presets + dev auth mode | Template repo | #15 | FR-6, FR-7 | 0002 |
| #19 | Explicit access decorator on every tool + PR checklist | Template repo | #15 | FR-8 | — |
| #20 | /healthz, /readyz, graceful shutdown | Template repo | #15 | FR-13 | — |
| #21 | Gateway, state and operations docs | Docs | #15, #14 | FR-10, FR-18 | — |
| #22 | Inspector config + CLI smoke tests | Template repo | #19, #12 | FR-14, FR-15 | — |
| #23 | Terraform reference deployment (Container Apps) | Template repo | #20, #16 | FR-16 | 0006 |
| #24 | Auth guides (overview, Entra ID, Auth0, Keycloak, local dev) | Docs | #18, #19 | FR-6 | — |
| #25 | OpenTelemetry Collector app → Application Insights | Template repo | #14, #23 | FR-16 (extends) | — |
| #26 | Manual deploy workflow (Azure OIDC) | CI/CD | #23 | FR-16 | — |
| #27 | template-add-tool/resource/prompt, template-upgrade skills | Template repo | #19, #22, #17 | FR-19 | — |
| #28 | OWASP security self-review, privacy doc, SECURITY.md | Docs | #19, #14, #23 | — (§13 policy table, NFR-4) | — |
| #29 | Setup and upgrading guides, finished README | Docs | #22, #23, #17 | FR-1 | — |
| #30 | Release workflow, tag v0.1.0 | CI/CD | #7, #8, #25, #26, #27, #24, #21, #28, #29 | FR-17 | — |

`#7` and `#8` (batch 0) are closed; FR-1 is split across both: #7 sets the repo-level template
switch, #29 writes the setup guide that uses it. `#25` doesn't own an FR directly — it extends
#23's reference deployment with the telemetry pipeline FR-12 requires in production. `#28` owns
no FR; it closes out the §13 policy assessment and NFR-4 instead.

## FR coverage

Every functional requirement from spec §Requirements, by the issue(s) that implement it:

| FR | Issue(s) |
| --- | --- |
| FR-1 | #7, #29 |
| FR-2 | #10 |
| FR-3 | #13, #16 |
| FR-4 | #13 |
| FR-5 | #15 |
| FR-6 | #18, #24 |
| FR-7 | #18 |
| FR-8 | #19 |
| FR-9 | #15 |
| FR-10 | #13, #21 |
| FR-11 | #11 |
| FR-12 | #14 |
| FR-13 | #20 |
| FR-14 | #22 |
| FR-15 | #12, #22 |
| FR-16 | #23, #26 |
| FR-17 | #30 |
| FR-18 | #21 |
| FR-19 | #17, #27 |

## ADR map

Spec §14 lists eight ADRs to write during Build. Each is written in the PR for the issue below,
alongside the code it documents:

| ADR | Decision | Issue |
| --- | --- | --- |
| 0001 | `src/platform` vs `src/app` split with one seam | #10 |
| 0002 | One token guard plus `AUTH_PROVIDER` claim presets and overrides | #18 |
| 0003 | Validate every token in the server, even behind a gateway | #15 |
| 0004 | Zod env schema; transport by entry point; auth by `AUTH_MODE` | #11 |
| 0005 | `nestjs-pino`, OTel Node SDK, HMAC pseudonyms, self-run Collector | #14 |
| 0006 | One reusable Terraform module plus a reference environment; internal ingress by default | #23 |
| 0007 | `AGENTS.md` as source, `template-` prefixed skills, path-scoped rules | #17 |
| 0008 | Biome as the single linter and formatter | #10 |
