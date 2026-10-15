import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../config/config.schema";
import { McpTokenGuard } from "./mcp-token.guard";
import { TokenVerifier } from "./token-verifier";

/** The token guard and the one `TokenVerifier`, so every request shares one cached key set. */
@Module({
	providers: [
		{
			provide: TokenVerifier,
			inject: [ConfigService],
			useFactory: (config: ConfigService<AppConfig, true>) =>
				new TokenVerifier({
					AUTH_ISSUER: config.get("AUTH_ISSUER", { infer: true }),
					AUTH_AUDIENCE: config.get("AUTH_AUDIENCE", { infer: true }),
					AUTH_JWKS_URI: config.get("AUTH_JWKS_URI", { infer: true }),
					AUTH_ALGORITHMS: config.get("AUTH_ALGORITHMS", { infer: true }),
					AUTH_REQUIRED_SCOPES: config.get("AUTH_REQUIRED_SCOPES", {
						infer: true,
					}),
					AUTH_CLOCK_TOLERANCE_SECONDS: config.get(
						"AUTH_CLOCK_TOLERANCE_SECONDS",
						{ infer: true },
					),
					AUTH_MAX_TOKEN_LIFETIME_SECONDS: config.get(
						"AUTH_MAX_TOKEN_LIFETIME_SECONDS",
						{ infer: true },
					),
				}),
		},
		McpTokenGuard,
	],
	exports: [TokenVerifier, McpTokenGuard],
})
export class AuthModule {}
