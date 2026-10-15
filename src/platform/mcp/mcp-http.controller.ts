import { Controller } from "@nestjs/common";
import { StreamableHttpController } from "@rekog/mcp-nest";

// A real Nest route, so guards apply to every request to /mcp. #15 adds @UseGuards(McpTokenGuard).
// The transport is built from config, so its handlers come from DI (MCP_HTTP_HANDLER), not
// McpHttpControllerFor, which reads the transport at import time.
@Controller("mcp")
export class McpHttpController extends StreamableHttpController {}
