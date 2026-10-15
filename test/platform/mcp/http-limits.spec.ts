import "./fixtures/http-limits-env";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createHttpApp } from "../../../src/platform/mcp/start-mcp";
import { connectHttp } from "../../support/mcp-client";
import { SlowModule } from "./fixtures/slow.module";

let app: NestExpressApplication;
let url: string;

beforeAll(async () => {
	app = await createHttpApp(SlowModule, { logger: false });
	await app.listen(0, "127.0.0.1");
	url = `${await app.getUrl()}/mcp`;
});

afterAll(async () => {
	await app?.close();
});

describe("HTTP limits", () => {
	it("answers a body over MCP_MAX_REQUEST_BYTES with 413", async () => {
		const response = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ padding: "x".repeat(2048) }),
		});
		expect(response.status).toBe(413);
		await expect(response.json()).resolves.toMatchObject({
			jsonrpc: "2.0",
			error: { message: "Request body too large." },
			id: null,
		});
	});

	it("answers a request slower than MCP_REQUEST_TIMEOUT_MS with 503", async () => {
		const client = await connectHttp(url);
		await expect(
			client.callTool({ name: "slow", arguments: {} }),
		).rejects.toThrow("Request timed out.");
		await client.close();
	});

	it("sets the server's request timeout from MCP_REQUEST_TIMEOUT_MS", () => {
		expect(app.getHttpServer().requestTimeout).toBe(250);
	});
});
