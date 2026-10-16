import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MCP_HTTP_HANDLER, StreamableHttpTransport } from "@rekog/mcp-nest";
import { AuthModule } from "../auth/auth.module";
import type { AppConfig } from "../config/config.schema";
import { httpTransportOptions } from "./mcp.options";
import { MCP_HTTP_TRANSPORT } from "./mcp.tokens";
import { McpHttpController } from "./mcp-http.controller";

@Module({
	imports: [AuthModule],
	controllers: [McpHttpController],
	providers: [
		{
			provide: MCP_HTTP_TRANSPORT,
			inject: [ConfigService],
			useFactory: (config: ConfigService<AppConfig, true>) =>
				new StreamableHttpTransport(
					httpTransportOptions({
						MCP_ALLOWED_ORIGINS: config.get("MCP_ALLOWED_ORIGINS", {
							infer: true,
						}),
						MCP_ALLOWED_HOSTS: config.get("MCP_ALLOWED_HOSTS", {
							infer: true,
						}),
						MCP_PUBLIC_URL: config.get("MCP_PUBLIC_URL", { infer: true }),
					}),
				),
		},
		{
			provide: MCP_HTTP_HANDLER,
			inject: [MCP_HTTP_TRANSPORT],
			useFactory: (transport: StreamableHttpTransport) =>
				transport.httpHandlers,
		},
	],
	exports: [MCP_HTTP_TRANSPORT],
})
export class McpPlatformModule {}
