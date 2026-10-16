import "./fixtures/auth-env";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createHttpApp } from "../../../src/platform/mcp/start-mcp";
import { ISSUER } from "../../support/auth";
import { REPORTS_SCOPE, ScopedModule } from "./fixtures/scoped.module";

let app: NestExpressApplication;
let baseUrl: string;

beforeAll(async () => {
	app = await createHttpApp(ScopedModule, { logger: false });
	await app.listen(0, "127.0.0.1");
	baseUrl = await app.getUrl();
});

afterAll(async () => {
	await app?.close();
});

describe("Protected-resource metadata (RFC 9728)", () => {
	it("describes /mcp without a token", async () => {
		const response = await fetch(
			`${baseUrl}/.well-known/oauth-protected-resource/mcp`,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			resource: "http://localhost:3000/mcp",
			authorization_servers: [ISSUER],
			scopes_supported: ["mcp:access", REPORTS_SCOPE],
			bearer_methods_supported: ["header"],
			mcp_versions_supported: ["2026-07-28"],
		});
	});
});
