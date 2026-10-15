import "./fixtures/http-env";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "../../../src/app/app.module";
import { createHttpApp } from "../../../src/platform/mcp/start-mcp";
import {
	connectHttp,
	LEGACY_INITIALIZE,
	UNSUPPORTED_PROTOCOL_VERSION,
} from "../../support/mcp-client";
import { authStub } from "./fixtures/http-env";

let app: NestExpressApplication;
let url: string;

beforeAll(async () => {
	app = await createHttpApp(AppModule, { logger: false });
	await app.listen(0, "127.0.0.1");
	url = `${await app.getUrl()}/mcp`;
});

afterAll(async () => {
	await app?.close();
});

describe("Streamable HTTP on /mcp", () => {
	it("serves revision 2026-07-28", async () => {
		const client = await connectHttp(url, await authStub.sign());
		expect(client.getProtocolEra()).toBe("modern");
		expect(client.getNegotiatedProtocolVersion()).toBe("2026-07-28");
		await client.close();
	});

	it("serves the example tool, resource and prompt", async () => {
		const client = await connectHttp(url, await authStub.sign());

		const { tools } = await client.listTools();
		expect(tools.map((tool) => tool.name)).toContain("echo");
		await expect(
			client.callTool({ name: "echo", arguments: { message: "hi" } }),
		).resolves.toMatchObject({ content: [{ type: "text", text: "hi" }] });

		const resource = await client.readResource({ uri: "example://about" });
		expect(resource.contents[0]).toMatchObject({ uri: "example://about" });

		const prompt = await client.getPrompt({
			name: "summarise",
			arguments: { text: "Some text." },
		});
		expect(prompt.messages[0].content).toMatchObject({ type: "text" });

		await client.close();
	});

	it("rejects a 2025-era initialize", async () => {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				authorization: `Bearer ${await authStub.sign()}`,
			},
			body: JSON.stringify(LEGACY_INITIALIZE),
		});
		const body = await response.json();
		expect(body.error.code).toBe(UNSUPPORTED_PROTOCOL_VERSION);
		expect(body.error.data.supported).toEqual(["2026-07-28"]);
	});
});
