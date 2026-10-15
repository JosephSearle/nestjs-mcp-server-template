import type { ServerContext } from "@modelcontextprotocol/server";
import { createRequestStateCodec } from "@rekog/mcp-nest";
import {
	httpTransportOptions,
	strategyOptions,
} from "../../../src/platform/mcp/mcp.options";

const SECRET = "s".repeat(32);
// The codec ignores the context; verify only needs one to match the SDK signature.
const CTX = {} as ServerContext;
const CONFIG = {
	MCP_SERVER_NAME: "test-server",
	MCP_SERVER_VERSION: "1.2.3",
	MCP_REQUEST_STATE_SECRET: SECRET,
	MCP_INPUT_MAX_ROUNDS: 3,
	MCP_INPUT_ROUND_TIMEOUT_MS: 4000,
};

const PUBLIC_URL = "https://mcp.example.com";

describe("httpTransportOptions", () => {
	it("serves modern-only, statelessly, from the controller's route", () => {
		const options = httpTransportOptions({
			MCP_ALLOWED_ORIGINS: undefined,
			MCP_ALLOWED_HOSTS: undefined,
			MCP_PUBLIC_URL: PUBLIC_URL,
		});

		expect(options.protocol).toBe("modern-only");
		expect(options.mount).toBe(false);
		// statefulMode is legacy-era only. Enabling it keeps state in process (spec §5).
		expect(options.statefulMode).toBeFalsy();
		expect(options.security).toEqual({});
	});

	it("answers a per-tool scope shortfall with a step-up challenge (spec §3)", () => {
		const options = httpTransportOptions({
			MCP_ALLOWED_ORIGINS: undefined,
			MCP_ALLOWED_HOSTS: undefined,
			MCP_PUBLIC_URL: PUBLIC_URL,
		});

		expect(options.stepUpAuthorization).toEqual({
			resourceMetadataUrl: `${PUBLIC_URL}/.well-known/oauth-protected-resource/mcp`,
		});
	});

	it("takes the Origin and Host allowlists from config", () => {
		const options = httpTransportOptions({
			MCP_ALLOWED_ORIGINS: ["app.example.com"],
			MCP_ALLOWED_HOSTS: ["mcp.example.com"],
			MCP_PUBLIC_URL: PUBLIC_URL,
		});

		expect(options.security).toEqual({
			allowedOrigins: ["app.example.com"],
			allowedHosts: ["mcp.example.com"],
		});
	});
});

describe("strategyOptions", () => {
	const options = strategyOptions(CONFIG, []);

	it("names the server from config", () => {
		expect(options).toMatchObject({ name: "test-server", version: "1.2.3" });
	});

	it("keeps every cache hint private", () => {
		const hints = Object.values(options.cacheHints ?? {}) as {
			cacheScope?: string;
		}[];

		expect(hints).toHaveLength(6);
		for (const hint of hints) {
			expect(hint.cacheScope).toBe("private");
		}
	});

	it("takes the round limits from config", () => {
		expect(options.inputRequired).toEqual({
			maxRounds: 3,
			roundTimeoutMs: 4000,
		});
	});

	it("verifies requestState with MCP_REQUEST_STATE_SECRET", async () => {
		const verify = options.requestState?.verify;
		if (!verify) {
			throw new Error("Expected requestState.verify.");
		}
		const ours = createRequestStateCodec({ key: SECRET });
		const theirs = createRequestStateCodec({ key: "t".repeat(32) });

		await expect(verify(await ours.mint({ step: 1 }), CTX)).resolves.toEqual({
			step: 1,
		});
		await expect(verify(await theirs.mint({ step: 1 }), CTX)).rejects.toThrow();
	});

	it("has no server mutator and no unauthenticated access", () => {
		expect(options.serverMutator).toBeUndefined();
		expect(options.allowUnauthenticatedAccess).toBeUndefined();
	});
});
