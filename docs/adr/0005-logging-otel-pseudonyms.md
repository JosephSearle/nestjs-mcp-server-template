---
status: accepted
date: 2026-10-15
decision-makers: Joseph Searle
---

# Log with nestjs-pino, trace with the OpenTelemetry Node SDK over vendor-neutral OTLP, and record identity as an HMAC pseudonym

## Context and problem statement

Every server built from the template needs structured logs, traces and metrics that work with whatever backend the deployer runs (FR-12). Logs must be joinable to traces. Security review needs each MCP call attributable to a caller (security-mcp §8). But logs, traces and metrics must hold no secrets, tokens or raw personal data (NFR-4, compliance-gdpr §1). The reference deployment sends telemetry to Application Insights.

How does the server log, trace and count, how does telemetry leave the process, and how does identity appear in it? (Spec §7, §10; concern 4.)

## Decision drivers

- Vendor-neutral. The server never uses a vendor-specific exporter or distro. Changing backend changes collector config, not code.
- Off by default. With no endpoint configured, nothing is exported and nothing tries to connect.
- Every log line carries `trace_id` and `span_id`.
- Every MCP call has a span named `<mcp.method.name> <name>`, following the OpenTelemetry MCP semantic conventions, parented on the caller's `_meta` trace context when present.
- Credentials and raw identity can't be logged by accident, and no setting turns them on.
- No new abstractions where a library will do (NFR-6).

## Considered options

Logging:

1. `nestjs-pino`: pino with pino-http as the Nest logger.
2. Nest's `ConsoleLogger` with JSON output.
3. Logs exported through the OpenTelemetry logs SDK.

Telemetry:

1. The OpenTelemetry Node SDK, with OTLP selected by the standard `OTEL_*` variables.
2. A vendor distro, such as the Azure Monitor OpenTelemetry distro.

Identity:

1. HMAC-SHA256 pseudonym of `sub`.
2. Raw `sub` behind a flag.
3. Nothing.

Collector in the reference deployment:

1. A self-run OpenTelemetry Collector container app.
2. The Container Apps managed OpenTelemetry agent.

## Decision outcome

Chosen: **`nestjs-pino`, the Node SDK over vendor-neutral OTLP, an HMAC pseudonym, and a self-run Collector**.

### Logging

`src/platform/telemetry/log-options.ts` sets up pino as follows.

- **Destination.** JSON goes to stdout. Under stdio it goes to stderr, because stdout carries the protocol there. `startStdio` calls `logToStderr()` before creating the app.
- **Trace IDs.** A `mixin` adds `trace_id` and `span_id` from the active span, read through `@opentelemetry/api`. This needs no pino instrumentation.
- **Fixed redaction paths.** Pino's `redact` covers `req.headers.authorization`, `req.headers.cookie` and `res.headers["set-cookie"]`.
- **Key-based redaction.** Any key containing `token` or `secret`, and any `requestState` key, is redacted by walking each finished line in `hooks.streamWrite`. Pino paths can't match part of a key. Pino also skips its bindings formatter for child loggers, which is where pino-http puts `req`, so the walk has to run on the finished line. Lines with no such key are written without parsing.
- **What is not logged.** The request serializer drops `remoteAddress` and `remotePort`. Bodies are never logged, so tool arguments and results are not logged.

### Tracing and metrics

`node --import ./dist/platform/telemetry/instrumentation.js` starts the SDK before Nest, so the instrumentations patch `http` and `express` before Nest imports them.

- **ESM hook.** Nest 12 is ESM, so the bootstrap registers the `import-in-the-middle` hook.
- **Instrumentations.** Only `http`, `express` and `ioredis`. Health paths are not traced.
- **Exporters.** `OTEL_EXPORTER_OTLP_ENDPOINT` decides whether anything is exported. `OTEL_EXPORTER_OTLP_PROTOCOL` chooses `http/protobuf` (default) or `grpc`; any other value stops the process with a config problem. The exporters read their other settings from the standard variables.
- **No endpoint.** Every SDK option is still given explicitly, because the SDK otherwise falls back to an OTLP exporter on localhost for traces, metrics and logs. A no-op span processor keeps the tracer provider running, so log lines still get trace IDs.
- **Scrubbing.** A `ScrubbingSpanProcessor` removes `client.address`, peer addresses and raw identity attributes before export.

**MCP spans and metrics come from two interceptors.** mcp-nest runs Nest interceptors only around `tools/call`, `resources/read` and `prompts/get`. Lists and `server/discover`, and requests rejected before dispatch (unknown tool, invalid arguments, denied access), never reach the pipeline. `serverMutator` could reach them, but the spec rules it out.

- `McpTelemetryInterceptor` (`APP_INTERCEPTOR`) opens a `SERVER` span per call, named `<mcp.method.name> <name>`.
  - It takes `_meta.traceparent` as the parent when present, and links to the HTTP span.
  - It sets `mcp.method.name`, `gen_ai.tool.name` or `gen_ai.prompt.name`, `mcp.resource.uri`, `mcp.protocol.version`, `network.transport` and `enduser.pseudo.id`.
  - On failure, the span keeps the error code the handler threw.
- `McpHttpInterceptor` on `McpHttpController` handles every HTTP request, lists included.
  - It names the HTTP span from the `Mcp-Method` and `Mcp-Name` headers, which the SDK checks against the body.
  - It records `mcp.server.operation.duration`. Its count is the request count.
  - It records `mcp.server.errors` from the response actually sent: the JSON-RPC `error.code`, an `isError` tool result, or an HTTP status of 400 or above.
  - It reads the outcome from the response body (up to 256 KiB). Errors raised before dispatch, such as an unknown tool, are sent with HTTP 200, so the status alone would miss them.
- Under stdio there is no HTTP layer, so `McpTelemetryInterceptor` records the metrics itself.
- `mcp.server.auth.failures` counts failures by reason. The token guard (#15) calls `recordAuthFailure`.

### Identity

`enduser.pseudo.id` is HMAC-SHA256 of `sub`, keyed with `LOG_PSEUDONYM_KEY`. `Pseudonymiser` and `pseudoIdAttributes` are the only route by which identity reaches a log, span or metric. Raw `sub`, email, name, tokens and `client.address` are never recorded, and there is no setting to record them.

### Collector

The reference deployment sends OTLP to a self-run OpenTelemetry Collector container app, which forwards to Application Insights (spec §10; built in B13). The Container Apps managed agent was rejected for these reasons:

- its Application Insights destination takes no metrics;
- it speaks gRPC only;
- it runs as one fixed replica;
- it drops data after about five minutes of backlog.

### Consequences

- Good: works with any OTLP backend. Telemetry is off unless an endpoint is set, and nothing connects anywhere by default.
- Good: every line can be joined to its trace, and every MCP request is counted, including lists and pre-dispatch errors.
- Good: identity is attributable with the key and pseudonymous without it. Investigating a user means computing their pseudonym with the production key.
- Bad: two interceptors share the work.
  - Calls that never reach the Nest pipeline get an HTTP span, not an MCP span.
  - The HTTP interceptor wraps `res.write` and `res.end` to read the outcome, and ignores bodies over 256 KiB.
- Bad: rotating `LOG_PSEUDONYM_KEY` breaks correlation across the rotation. The key must outlive telemetry retention.
- Bad: Nest's RPC exception filter masks a `ProtocolError` thrown by a tool into an `isError` result. The span keeps the thrown code, but the error count records `tool_error`, which is what the client received.
- Neutral: a keyed pseudonym is still personal data. Deployers need a lawful basis and a record of processing (`docs/privacy.md`, a separate task).

### Confirmation

- `test/platform/telemetry/log-options.spec.ts` checks redaction (fixed paths, nested and child-binding keys, request headers), that there is no client address, the pseudonym, and `trace_id`/`span_id`.
- `test/platform/config/telemetry-env.spec.ts` checks no exporter without an endpoint, `http/protobuf` by default, `grpc`, and a bad protocol.
- `test/platform/telemetry/mcp-telemetry.spec.ts` checks span names and attributes, `_meta` parenting, duration by method and tool including lists, and error counts by JSON-RPC code, including an error sent before dispatch.
- `test/platform/telemetry/no-raw-identity.spec.ts` fails on raw identity attributes in `src/`, or on a setting that would record them.
- `pseudonym.spec.ts`, `scrubbing-span-processor.spec.ts` and `response-outcome.spec.ts` cover the pieces.

## Pros and cons of the options

### nestjs-pino

- Good: fast JSON logs, request logging and redaction, and Nest's own logs (and mcp-nest's) go through it.
- Bad: substring-key redaction needs a walk of each finished line.

### ConsoleLogger with JSON

- Good: no dependency.
- Bad: no redaction, no request logging, and no hook for trace IDs.

### OpenTelemetry logs SDK

- Good: one pipeline for every signal.
- Bad: logs vanish when no endpoint is set, and stdout logs are what Container Apps and local development read.

### Node SDK over OTLP

- Good: vendor-neutral, configured by standard variables, and works with any collector.
- Bad: the SDK falls back to localhost exporters unless every option is set, so the bootstrap sets them all.

### Vendor distro

- Good: one package for Application Insights.
- Bad: ties the template to one backend, which the intent rules out.

### Raw `sub` behind a flag

- Good: easier investigation.
- Bad: a flag that records personal data will be turned on. Concern 4 resolved against it.

### No identity

- Good: no personal data.
- Bad: calls can't be attributed (security-mcp §8).
