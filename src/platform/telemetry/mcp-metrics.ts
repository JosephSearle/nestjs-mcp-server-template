import { type Attributes, metrics } from "@opentelemetry/api";

const meter = () => metrics.getMeter("mcp-server");

/** Why a request to /mcp failed authentication (spec §3, §7). */
export type AuthFailureReason =
	| "missing"
	| "malformed"
	| "invalid_signature"
	| "wrong_issuer"
	| "wrong_audience"
	| "expired"
	| "not_yet_valid"
	| "lifetime_exceeded"
	| "insufficient_scope";

/**
 * Request duration by method and tool, following the OpenTelemetry MCP semantic conventions.
 * The histogram's count is the request count.
 */
export function recordOperation(seconds: number, attributes: Attributes): void {
	meter()
		.createHistogram("mcp.server.operation.duration", {
			description: "Duration of MCP requests.",
			unit: "s",
		})
		.record(seconds, attributes);
}

/** Error count by JSON-RPC code, or by HTTP status for requests rejected before dispatch. */
export function recordError(attributes: Attributes): void {
	meter()
		.createCounter("mcp.server.errors", {
			description: "MCP requests that ended in an error.",
		})
		.add(1, attributes);
}

/** Auth failure count by reason. Called by the token guard and for per-tool scope denials. */
export function recordAuthFailure(reason: AuthFailureReason): void {
	meter()
		.createCounter("mcp.server.auth.failures", {
			description: "Requests to /mcp that failed authentication.",
		})
		.add(1, { reason });
}
