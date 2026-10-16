import { Controller, UseGuards, UseInterceptors } from "@nestjs/common";
import { StreamableHttpController } from "@rekog/mcp-nest";
import { McpTokenGuard } from "../auth/mcp-token.guard";
import { McpHttpInterceptor } from "../telemetry/mcp-http.interceptor";

// A real Nest route, so the token guard applies to every request to /mcp (spec §2, §3).
// The transport is built from config, so its handlers come from DI (MCP_HTTP_HANDLER), not
// McpHttpControllerFor, which reads the transport at import time.
@Controller("mcp")
@UseGuards(McpTokenGuard)
@UseInterceptors(McpHttpInterceptor)
export class McpHttpController extends StreamableHttpController {}
