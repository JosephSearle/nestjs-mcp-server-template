import type { ConfigService } from "@nestjs/config";
import {
	ABOUT_URI,
	ExampleResources,
} from "../../src/app/resources/example.resources";
import type { AppConfig } from "../../src/platform/config/config.schema";

describe("ExampleResources", () => {
	it("returns the server's name and version", () => {
		const values: Partial<AppConfig> = {
			MCP_SERVER_NAME: "test-server",
			MCP_SERVER_VERSION: "1.2.3",
		};
		const config = {
			get: (key: keyof AppConfig) => values[key],
		} as ConfigService<AppConfig, true>;

		expect(new ExampleResources(config).about()).toEqual({
			contents: [
				{ uri: ABOUT_URI, mimeType: "text/plain", text: "test-server 1.2.3" },
			],
		});
	});
});
