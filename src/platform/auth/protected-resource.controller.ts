import { Controller, Get, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../config/config.schema";
import { MCP_PROTOCOL_VERSION } from "../mcp/mcp.options";
import { SUPPORTED_SCOPES } from "./auth.tokens";
import { RESOURCE_METADATA_PATH } from "./www-authenticate";

/** RFC 9728 protected-resource metadata for /mcp. Unauthenticated, so clients can discover auth. */
@Controller()
export class ProtectedResourceController {
	private readonly metadata: Record<string, unknown>;

	constructor(
		config: ConfigService<AppConfig, true>,
		@Inject(SUPPORTED_SCOPES) scopes: readonly string[],
	) {
		const issuer = config.get("AUTH_ISSUER", { infer: true });
		this.metadata = {
			resource: `${config.get("MCP_PUBLIC_URL", { infer: true })}/mcp`,
			authorization_servers: issuer === undefined ? [] : [issuer],
			scopes_supported: [...scopes],
			bearer_methods_supported: ["header"],
			mcp_versions_supported: [MCP_PROTOCOL_VERSION],
		};
	}

	@Get(RESOURCE_METADATA_PATH)
	get(): Record<string, unknown> {
		return this.metadata;
	}
}
