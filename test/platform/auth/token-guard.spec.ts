import "./fixtures/auth-env";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createHttpApp } from "../../../src/platform/mcp/start-mcp";
import type { AuthFailureReason } from "../../../src/platform/telemetry/mcp-metrics";
import { EC_KID, ISSUER, now, RSA_KID, rsaKeyPair } from "../../support/auth";
import { connectHttp } from "../../support/mcp-client";
import { installTestTelemetry } from "../../support/telemetry";
import { authStub } from "./fixtures/auth-env";
import { REPORTS_SCOPE, ScopedModule } from "./fixtures/scoped.module";

// Spec §3 and concern 3: the token guard is template-owned security code, so every way a token
// can be wrong has a test here, checking the status, the challenge and the failure metric.

const telemetry = installTestTelemetry();
const METADATA_URL =
	"http://localhost:3000/.well-known/oauth-protected-resource/mcp";
const INVALID_TOKEN = `Bearer error="invalid_token", resource_metadata="${METADATA_URL}"`;

let app: NestExpressApplication;
let url: string;

beforeAll(async () => {
	app = await createHttpApp(ScopedModule, { logger: false });
	await app.listen(0, "127.0.0.1");
	url = `${await app.getUrl()}/mcp`;
});

afterAll(async () => {
	await app?.close();
});

/** Posts `tools/list` with the given Authorization header, or none. */
function post(authorization?: string): Promise<Response> {
	return fetch(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			"mcp-protocol-version": "2026-07-28",
			"mcp-method": "tools/list",
			...(authorization && { authorization }),
		},
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
	});
}

const bearer = (token: string) => post(`Bearer ${token}`);

async function failures(reason: AuthFailureReason): Promise<number> {
	const points = await telemetry.points("mcp.server.auth.failures");
	const point = points.find((p) => p.attributes.reason === reason);
	return (point?.value as number | undefined) ?? 0;
}

/** Sends a request and checks it is rejected with `status`, `challenge` and one `reason` count. */
async function expectRejected(
	send: () => Promise<Response>,
	reason: AuthFailureReason,
	challenge = INVALID_TOKEN,
	status = 401,
): Promise<Response> {
	const before = await failures(reason);
	const response = await send();
	expect(response.status).toBe(status);
	expect(response.headers.get("www-authenticate")).toBe(challenge);
	expect(await failures(reason)).toBe(before + 1);
	return response;
}

describe("McpTokenGuard", () => {
	it("accepts a valid token and serves MCP", async () => {
		const client = await connectHttp(url, await authStub.sign());
		const { tools } = await client.listTools();
		expect(tools.map((tool) => tool.name)).toContain("echo");
		await client.close();
	});

	it("rejects a request with no token, without an error code", async () => {
		const response = await expectRejected(
			() => post(),
			"missing",
			`Bearer resource_metadata="${METADATA_URL}"`,
		);
		// A JSON-RPC body with a generic message, so clients don't mistake the server for legacy.
		await expect(response.json()).resolves.toEqual({
			jsonrpc: "2.0",
			error: { code: -32000, message: "Unauthorized." },
			id: null,
		});
	});

	it("rejects a non-Bearer Authorization header", async () => {
		await expectRejected(() => post("Basic dXNlcjpwYXNz"), "malformed");
	});

	it("rejects a malformed token", async () => {
		await expectRejected(() => bearer("not.a.jwt"), "malformed");
	});

	it("rejects alg none", async () => {
		await expectRejected(
			() => bearer(authStub.unsecured()),
			"invalid_signature",
		);
	});

	it("rejects an HMAC token signed with the public key", async () => {
		await expectRejected(
			async () => bearer(await authStub.hmacWithPublicKey()),
			"invalid_signature",
		);
	});

	it("rejects an algorithm outside AUTH_ALGORITHMS, even with a published key", async () => {
		await expectRejected(
			async () =>
				bearer(
					await authStub.sign({
						header: { alg: "ES256", kid: EC_KID },
						key: authStub.ec.privateKey,
					}),
				),
			"invalid_signature",
		);
	});

	it("rejects a token signed by another key", async () => {
		await expectRejected(
			async () => bearer(await authStub.sign({ key: rsaKeyPair().privateKey })),
			"invalid_signature",
		);
	});

	it("rejects an unknown kid", async () => {
		await expectRejected(
			async () => bearer(await authStub.sign({ header: { kid: "unknown" } })),
			"invalid_signature",
		);
	});

	it("ignores jku and x5u, and never fetches them", async () => {
		const attacker = rsaKeyPair();
		const realFetch = globalThis.fetch;
		const fetched: string[] = [];
		globalThis.fetch = (input, init) => {
			fetched.push(input instanceof Request ? input.url : String(input));
			return realFetch(input, init);
		};
		try {
			await expectRejected(
				async () =>
					bearer(
						await authStub.sign({
							header: {
								kid: RSA_KID,
								jku: "https://attacker.example.test/jwks",
								x5u: "https://attacker.example.test/cert.pem",
							},
							key: attacker.privateKey,
						}),
					),
				"invalid_signature",
			);
		} finally {
			globalThis.fetch = realFetch;
		}
		expect(fetched.filter((u) => u.includes("attacker"))).toEqual([]);
	});

	it("rejects the wrong issuer", async () => {
		await expectRejected(
			async () =>
				bearer(await authStub.sign({ claims: { iss: `${ISSUER}/other` } })),
			"wrong_issuer",
		);
	});

	it("rejects the wrong audience", async () => {
		await expectRejected(
			async () =>
				bearer(
					await authStub.sign({
						claims: { aud: "https://other.example.test/mcp" },
					}),
				),
			"wrong_audience",
		);
	});

	it("rejects an expired token, beyond the clock tolerance", async () => {
		await expectRejected(
			async () =>
				bearer(
					await authStub.sign({
						claims: { iat: now() - 700, exp: now() - 60 },
					}),
				),
			"expired",
		);
	});

	it("rejects a token that isn't valid yet, beyond the clock tolerance", async () => {
		await expectRejected(
			async () => bearer(await authStub.sign({ claims: { nbf: now() + 120 } })),
			"not_yet_valid",
		);
	});

	it("allows clock skew within AUTH_CLOCK_TOLERANCE_SECONDS", async () => {
		const client = await connectHttp(
			url,
			await authStub.sign({ claims: { nbf: now() + 10 } }),
		);
		await expect(client.listTools()).resolves.toBeDefined();
		await client.close();
	});

	it("rejects a lifetime over AUTH_MAX_TOKEN_LIFETIME_SECONDS", async () => {
		await expectRejected(
			async () =>
				bearer(
					await authStub.sign({
						claims: { iat: now(), exp: now() + 3601 },
					}),
				),
			"lifetime_exceeded",
		);
	});

	it.each(["sub", "exp", "iat"])(
		"rejects a token without %s",
		async (claim) => {
			await expectRejected(
				async () =>
					bearer(await authStub.sign({ claims: { [claim]: undefined } })),
				"malformed",
			);
		},
	);

	it("answers a missing AUTH_REQUIRED_SCOPES scope with 403 and the scope to ask for", async () => {
		const response = await expectRejected(
			async () => bearer(await authStub.sign({ claims: { scope: "other" } })),
			"insufficient_scope",
			`Bearer error="insufficient_scope", scope="mcp:access", resource_metadata="${METADATA_URL}"`,
			403,
		);
		await expect(response.json()).resolves.toMatchObject({
			error: { message: "Forbidden." },
		});
	});

	it("never echoes the token", async () => {
		const token = await authStub.sign({ claims: { aud: "wrong" } });
		const response = await bearer(token);
		expect(await response.text()).not.toContain(token);
	});
});

describe("Per-tool scopes", () => {
	it("answers a @ToolScopes shortfall with a step-up 403 and counts it", async () => {
		const before = await failures("insufficient_scope");
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				authorization: `Bearer ${await authStub.sign()}`,
				"mcp-protocol-version": "2026-07-28",
				"mcp-method": "tools/call",
				"mcp-name": "report",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: { name: "report", arguments: {} },
			}),
		});

		expect(response.status).toBe(403);
		expect(response.headers.get("www-authenticate")).toContain(
			`error="insufficient_scope"`,
		);
		expect(response.headers.get("www-authenticate")).toContain(
			`scope="${REPORTS_SCOPE}"`,
		);
		expect(response.headers.get("www-authenticate")).toContain(
			`resource_metadata="${METADATA_URL}"`,
		);
		expect(await failures("insufficient_scope")).toBe(before + 1);
	});

	it("lets a caller with the scope call the tool", async () => {
		const client = await connectHttp(
			url,
			await authStub.sign({ claims: { scope: `mcp:access ${REPORTS_SCOPE}` } }),
		);
		await expect(
			client.callTool({ name: "report", arguments: {} }),
		).resolves.toMatchObject({ content: [{ type: "text", text: "report" }] });
		await client.close();
	});
});
