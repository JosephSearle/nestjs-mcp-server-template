import type { IncomingMessage, ServerResponse } from "node:http";
import {
	type CallHandler,
	type ExecutionContext,
	Injectable,
	type NestInterceptor,
} from "@nestjs/common";
import { type Attributes, trace } from "@opentelemetry/api";
import type { Observable } from "rxjs";
import { recordError, recordOperation } from "./mcp-metrics";
import { captureBody, responseOutcome } from "./response-outcome";

const header = (req: IncomingMessage, name: string) => {
	const value = req.headers[name];
	return typeof value === "string" && value !== "" ? value : undefined;
};

/** `error.type` and code attributes for a finished response, or none if it succeeded. */
function errorAttributes(res: ServerResponse, body?: string): Attributes {
	if (res.statusCode >= 400) {
		return {
			"error.type": String(res.statusCode),
			"http.response.status_code": res.statusCode,
		};
	}
	const contentType = res.getHeader("content-type");
	const outcome =
		body === undefined
			? undefined
			: responseOutcome(
					body,
					typeof contentType === "string" ? contentType : undefined,
				);
	if (outcome?.code !== undefined) {
		return {
			"error.type": String(outcome.code),
			"rpc.response.status_code": String(outcome.code),
		};
	}
	return outcome?.toolError ? { "error.type": "tool_error" } : {};
}

/**
 * Counts and times every request to /mcp by method and tool, counts errors by the JSON-RPC code
 * sent, and names the HTTP span `<mcp.method.name> <name>` (spec §7). Reads the 2026-07-28
 * `Mcp-Method` and `Mcp-Name` headers, which the SDK checks against the body (SEP-2243). It sees
 * lists, `server/discover` and requests rejected before dispatch, none of which reach
 * `McpTelemetryInterceptor` (ADR-0005).
 */
@Injectable()
export class McpHttpInterceptor implements NestInterceptor {
	intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
		const http = ctx.switchToHttp();
		const req = http.getRequest<IncomingMessage>();
		const res = http.getResponse<ServerResponse>();
		const start = process.hrtime.bigint();
		const body = captureBody(res);

		const method = header(req, "mcp-method");
		const name = header(req, "mcp-name");
		const attributes: Attributes = {
			"mcp.method.name": method ?? `http.${req.method ?? "unknown"}`,
		};
		if (method === "tools/call" && name) {
			attributes["gen_ai.tool.name"] = name;
		} else if (method === "prompts/get" && name) {
			attributes["gen_ai.prompt.name"] = name;
		}
		// Resource URIs are left out of span names and metric attributes: they can be unbounded.
		if (method) {
			trace
				.getActiveSpan()
				?.updateName(
					name && method !== "resources/read" ? `${method} ${name}` : method,
				);
		}

		res.once("close", () => {
			const seconds = Number(process.hrtime.bigint() - start) / 1e9;
			const error = errorAttributes(res, body());
			recordOperation(seconds, { ...attributes, ...error });
			if ("error.type" in error) {
				recordError({ ...attributes, ...error });
			}
		});
		return next.handle();
	}
}
