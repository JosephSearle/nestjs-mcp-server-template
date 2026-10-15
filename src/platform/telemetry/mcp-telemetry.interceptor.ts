import {
	type CallHandler,
	type ExecutionContext,
	Injectable,
	type NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PATTERN_EXTRAS_METADATA } from "@nestjs/microservices/constants.js";
import {
	type Attributes,
	context,
	type Link,
	propagation,
	ROOT_CONTEXT,
	SpanKind,
	SpanStatusCode,
	trace,
} from "@opentelemetry/api";
import type { McpContext } from "@rekog/mcp-nest";
import { Observable } from "rxjs";
import { recordError, recordOperation } from "./mcp-metrics";
import { Pseudonymiser } from "./pseudonym";

const tracer = () => trace.getTracer("mcp-server");

/** The JSON-RPC code of a protocol error, if the error carries one. */
function jsonRpcCode(error: unknown): number | undefined {
	const code = (error as { code?: unknown } | null)?.code;
	return typeof code === "number" ? code : undefined;
}

/** The parent from `_meta` trace context (SEP-414) when present, else the active context. */
function parentContext(mcp: McpContext) {
	const carrier = mcp.getTraceContext();
	if (!carrier.traceparent) {
		return { parent: context.active(), links: [] as Link[] };
	}
	const parent = propagation.extract(ROOT_CONTEXT, carrier);
	// Keep the HTTP span reachable from the MCP span, since it is no longer the parent.
	const httpSpan = trace.getActiveSpan()?.spanContext();
	return { parent, links: httpSpan ? [{ context: httpSpan }] : [] };
}

/**
 * Wraps every `tools/call`, `resources/read` and `prompts/get` in a span named
 * `<mcp.method.name> <name>` (spec §7), with the code the handler threw. Lists and
 * `server/discover` are answered before the Nest pipeline, so `McpHttpInterceptor` covers them,
 * and records the metrics for every HTTP request (ADR-0005).
 */
@Injectable()
export class McpTelemetryInterceptor implements NestInterceptor {
	constructor(
		private readonly reflector: Reflector,
		private readonly pseudonymiser: Pseudonymiser,
	) {}

	intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
		if (ctx.getType() !== "rpc") {
			return next.handle();
		}
		const mcp = ctx.switchToRpc().getContext<McpContext>();
		const method = mcp.mcpRequest.method;
		const params = (mcp.mcpRequest.params ?? {}) as {
			name?: unknown;
			uri?: unknown;
		};
		// The registered name: the tool or prompt name, or the resource's name, not its URI.
		const extras = this.reflector.get<{ mcpName?: string } | undefined>(
			PATTERN_EXTRAS_METADATA,
			ctx.getHandler(),
		);
		const name =
			extras?.mcpName ??
			(typeof params.name === "string" ? params.name : undefined);
		const stdio = mcp.getSession().transport === "stdio";

		const attributes: Attributes = {
			"mcp.method.name": method,
			"network.transport": stdio ? "pipe" : "tcp",
			...this.pseudonymiser.attributesFor(mcp.getUser()),
		};
		const protocolVersion = mcp.getProtocolVersion();
		if (protocolVersion) {
			attributes["mcp.protocol.version"] = protocolVersion;
		}
		const metricAttributes: Attributes = { "mcp.method.name": method };
		if (method === "tools/call" && name) {
			attributes["gen_ai.tool.name"] = name;
			attributes["gen_ai.operation.name"] = "execute_tool";
			metricAttributes["gen_ai.tool.name"] = name;
		} else if (method === "prompts/get" && name) {
			attributes["gen_ai.prompt.name"] = name;
			metricAttributes["gen_ai.prompt.name"] = name;
		} else if (method === "resources/read" && typeof params.uri === "string") {
			attributes["mcp.resource.uri"] = params.uri;
		}

		const { parent, links } = parentContext(mcp);
		const span = tracer().startSpan(
			name ? `${method} ${name}` : method,
			{ kind: SpanKind.SERVER, attributes, links },
			parent,
		);
		const start = process.hrtime.bigint();
		let errorType: string | undefined;

		const fail = (type: string, code?: number) => {
			errorType = type;
			span.setAttribute("error.type", type);
			span.setStatus({ code: SpanStatusCode.ERROR });
			const codeAttribute =
				code === undefined ? {} : { "rpc.response.status_code": String(code) };
			span.setAttributes(codeAttribute);
			if (stdio) {
				recordError({
					...metricAttributes,
					"error.type": type,
					...codeAttribute,
				});
			}
		};
		let ended = false;
		// Over HTTP, McpHttpInterceptor counts and times every request from what is sent. stdio has
		// no HTTP layer, so this records its metrics.
		const end = () => {
			if (ended) {
				return;
			}
			ended = true;
			span.end();
			if (stdio) {
				recordOperation(Number(process.hrtime.bigint() - start) / 1e9, {
					...metricAttributes,
					...(errorType && { "error.type": errorType }),
				});
			}
		};

		return new Observable((subscriber) => {
			const subscription = context
				.with(trace.setSpan(parent, span), () => next.handle())
				.subscribe({
					next: (value) => {
						if ((value as { isError?: unknown } | null)?.isError === true) {
							fail("tool_error");
						}
						subscriber.next(value);
					},
					error: (error: unknown) => {
						const code = jsonRpcCode(error);
						// mcp-nest turns anything but a protocol error from a tool into an isError result.
						const fallback =
							method === "tools/call" ? "tool_error" : "internal_error";
						fail(code === undefined ? fallback : String(code), code);
						end();
						subscriber.error(error);
					},
					complete: () => {
						end();
						subscriber.complete();
					},
				});
			// The strategy takes the first value and unsubscribes, so complete may never arrive.
			return () => {
				subscription.unsubscribe();
				end();
			};
		});
	}
}
