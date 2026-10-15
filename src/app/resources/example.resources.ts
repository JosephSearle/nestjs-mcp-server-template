import { ConfigService } from "@nestjs/config";
import { McpController, Resource } from "@rekog/mcp-nest";
import type { AppConfig } from "../../platform/config/config.schema";

export const ABOUT_URI = "example://about";

@McpController()
export class ExampleResources {
	constructor(private readonly config: ConfigService<AppConfig, true>) {}

	@Resource({
		uri: ABOUT_URI,
		name: "about",
		description: "The server's name and version.",
		mimeType: "text/plain",
	})
	about() {
		const name = this.config.get("MCP_SERVER_NAME", { infer: true });
		const version = this.config.get("MCP_SERVER_VERSION", { infer: true });
		return {
			contents: [
				{ uri: ABOUT_URI, mimeType: "text/plain", text: `${name} ${version}` },
			],
		};
	}
}
