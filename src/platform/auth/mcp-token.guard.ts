import type { IncomingMessage, ServerResponse } from "node:http";
import {
	type CanActivate,
	type ExecutionContext,
	ForbiddenException,
	HttpException,
	HttpStatus,
	Injectable,
	Logger,
	UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../config/config.schema";
import { jsonRpcError } from "../mcp/json-rpc-error";
import { recordAuthFailure } from "../telemetry/mcp-metrics";
import { TokenVerifier } from "./token-verifier";
import {
	insufficientScopeChallenge,
	resourceMetadataUrl,
	unauthorizedChallenge,
} from "./www-authenticate";

const BEARER = /^Bearer[ ]+([^ ]+)[ ]*$/i;

/** The token from `Authorization: Bearer`, the only place one is accepted (no query, no body). */
function bearerToken(req: IncomingMessage): string | undefined {
	const header = req.headers.authorization;
	return header === undefined ? undefined : (BEARER.exec(header)?.[1] ?? "");
}

/**
 * Validates the bearer token on every request to /mcp (spec §3, ADR-0003). On success the token's
 * claims become `req.user`, which mcp-nest reads for `@ToolScopes` and `@ToolRoles`. The token
 * itself is never stored, logged or forwarded.
 */
@Injectable()
export class McpTokenGuard implements CanActivate {
	private readonly logger = new Logger(McpTokenGuard.name);
	private readonly metadataUrl: string;

	constructor(
		private readonly verifier: TokenVerifier,
		config: ConfigService<AppConfig, true>,
	) {
		this.metadataUrl = resourceMetadataUrl(
			config.get("MCP_PUBLIC_URL", { infer: true }),
		);
	}

	async canActivate(ctx: ExecutionContext): Promise<boolean> {
		const http = ctx.switchToHttp();
		const req = http.getRequest<IncomingMessage & { user?: unknown }>();
		const res = http.getResponse<ServerResponse>();

		const token = bearerToken(req);
		if (token === undefined) {
			recordAuthFailure("missing");
			throw this.unauthorized(res, false);
		}
		if (token === "") {
			recordAuthFailure("malformed");
			throw this.unauthorized(res, true);
		}

		const result = await this.verifier.verify(token);
		switch (result.outcome) {
			case "valid":
				req.user = result.payload;
				return true;
			case "unavailable":
				this.logger.error(result.cause);
				throw new HttpException(
					jsonRpcError("Authorization is unavailable."),
					HttpStatus.SERVICE_UNAVAILABLE,
				);
			case "rejected":
				recordAuthFailure(result.reason);
				if (result.reason === "insufficient_scope") {
					res.setHeader(
						"WWW-Authenticate",
						insufficientScopeChallenge(
							this.metadataUrl,
							result.requiredScopes ?? [],
						),
					);
					throw new ForbiddenException(jsonRpcError("Forbidden."));
				}
				throw this.unauthorized(res, true);
		}
	}

	private unauthorized(res: ServerResponse, tokenPresent: boolean) {
		res.setHeader(
			"WWW-Authenticate",
			unauthorizedChallenge(this.metadataUrl, tokenPresent),
		);
		return new UnauthorizedException(jsonRpcError("Unauthorized."));
	}
}
