import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "../config/config.schema";

type HttpLimitsConfig = Pick<
	AppConfig,
	"MCP_MAX_REQUEST_BYTES" | "MCP_REQUEST_TIMEOUT_MS"
>;

// The same shape the transport uses for its own HTTP-level rejections: a JSON-RPC error with no id.
// An empty or non-JSON body makes a conforming client conclude the server is legacy.
const jsonRpcError = (message: string) => ({
	jsonrpc: "2.0",
	error: { code: -32000, message },
	id: null,
});

/**
 * Body limit and request timeout for the HTTP entry. mcp-nest sets neither, so the template does.
 * Call before `startAllMicroservices()` and `listen()`, and create the app with `bodyParser: false`.
 */
export function applyHttpLimits(
	app: NestExpressApplication,
	config: HttpLimitsConfig,
): void {
	const timeoutMs = config.MCP_REQUEST_TIMEOUT_MS;

	// Bounds the time to receive a whole request, so a slow upload can't hold a connection open.
	app.getHttpServer().requestTimeout = timeoutMs;

	// Bounds the time to answer one. Before anything is sent the caller gets a 503; once a response
	// is streaming, the status is settled, so the connection is closed instead.
	app.use("/mcp", (_req: Request, res: Response, next: NextFunction) => {
		const timer = setTimeout(() => {
			if (res.headersSent) {
				res.destroy();
				return;
			}
			res.status(503).json(jsonRpcError("Request timed out."));
		}, timeoutMs);
		const clear = () => clearTimeout(timer);
		res.on("finish", clear);
		res.on("close", clear);
		next();
	});

	app.useBodyParser("json", { limit: config.MCP_MAX_REQUEST_BYTES });

	// Answers body-parser failures (413 too large, 400 malformed) as JSON-RPC, not Express's HTML page.
	app.use(
		(
			error: { status?: number; type?: string },
			_req: Request,
			res: Response,
			next: NextFunction,
		) => {
			if (res.headersSent || error.status === undefined) {
				next(error);
				return;
			}
			const message =
				error.type === "entity.too.large"
					? "Request body too large."
					: "Invalid request body.";
			res.status(error.status).json(jsonRpcError(message));
		},
	);
}
