import { type ExecutionContext, HttpException, Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { McpTokenGuard } from "../../../src/platform/auth/mcp-token.guard";
import type { TokenVerifier } from "../../../src/platform/auth/token-verifier";
import type { AppConfig } from "../../../src/platform/config/config.schema";

beforeAll(() => Logger.overrideLogger(false));

function contextFor(authorization: string) {
	const headers = new Map<string, string>();
	const req = { headers: { authorization } };
	const res = {
		setHeader: (name: string, value: string) => headers.set(name, value),
	};
	const ctx = {
		switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
	} as unknown as ExecutionContext;
	return { ctx, headers };
}

const config = {
	get: () => "http://localhost:3000",
} as unknown as ConfigService<AppConfig, true>;

describe("McpTokenGuard when the issuer's keys are unavailable", () => {
	it("answers 503 without a challenge, so clients don't start a new login", async () => {
		const verifier = {
			verify: async () => ({ outcome: "unavailable", cause: "down" }),
		} as unknown as TokenVerifier;
		const { ctx, headers } = contextFor("Bearer a.b.c");

		const error = await new McpTokenGuard(verifier, config)
			.canActivate(ctx)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(HttpException);
		expect((error as HttpException).getStatus()).toBe(503);
		expect(headers.size).toBe(0);
	});
});
