import {
	TokenVerifier,
	tokenScopes,
	type VerifierSettings,
} from "../../../src/platform/auth/token-verifier";
import {
	DEFAULT_AUDIENCE,
	ISSUER,
	JWKS_URI,
	startAuthStub,
} from "../../support/auth";

const authStub = startAuthStub();

const SETTINGS: VerifierSettings = {
	AUTH_ISSUER: ISSUER,
	AUTH_AUDIENCE: DEFAULT_AUDIENCE,
	AUTH_JWKS_URI: undefined,
	AUTH_ALGORITHMS: ["RS256"],
	AUTH_REQUIRED_SCOPES: undefined,
	AUTH_CLOCK_TOLERANCE_SECONDS: 30,
	AUTH_MAX_TOKEN_LIFETIME_SECONDS: 5400,
};

const GOOD_DISCOVERY = { issuer: ISSUER, jwks_uri: JWKS_URI };

afterEach(() => authStub.setDiscovery(GOOD_DISCOVERY));

describe("TokenVerifier", () => {
	it("finds the keys through the issuer's discovery document", async () => {
		const result = await new TokenVerifier(SETTINGS).verify(
			await authStub.sign(),
		);
		expect(result).toMatchObject({
			outcome: "valid",
			payload: { sub: "user-1" },
		});
	});

	it("uses AUTH_JWKS_URI without reading discovery", async () => {
		authStub.setDiscovery({});
		const verifier = new TokenVerifier({
			...SETTINGS,
			AUTH_JWKS_URI: JWKS_URI,
		});
		await expect(verifier.verify(await authStub.sign())).resolves.toMatchObject(
			{ outcome: "valid" },
		);
	});

	it("refuses a discovery document for another issuer, and tries again later", async () => {
		authStub.setDiscovery({
			issuer: "https://attacker.example.test",
			jwks_uri: JWKS_URI,
		});
		const verifier = new TokenVerifier(SETTINGS);
		const token = await authStub.sign();
		await expect(verifier.verify(token)).resolves.toMatchObject({
			outcome: "unavailable",
		});

		authStub.setDiscovery(GOOD_DISCOVERY);
		await expect(verifier.verify(token)).resolves.toMatchObject({
			outcome: "valid",
		});
	});

	it("reports an unreachable JWKS as unavailable, not as a bad token", async () => {
		const verifier = new TokenVerifier({
			...SETTINGS,
			AUTH_JWKS_URI: `${ISSUER}/missing`,
		});
		await expect(verifier.verify(await authStub.sign())).resolves.toMatchObject(
			{ outcome: "unavailable" },
		);
	});

	it("rejects junk tokens without fetching keys", async () => {
		const verifier = new TokenVerifier({
			...SETTINGS,
			AUTH_JWKS_URI: JWKS_URI,
		});
		const before = authStub.jwksFetches();

		await expect(verifier.verify("abc.def.ghi")).resolves.toEqual({
			outcome: "rejected",
			reason: "malformed",
		});
		await expect(verifier.verify(authStub.unsecured())).resolves.toEqual({
			outcome: "rejected",
			reason: "invalid_signature",
		});
		expect(authStub.jwksFetches()).toBe(before);
	});

	it("is unavailable without AUTH_ISSUER", async () => {
		const verifier = new TokenVerifier({
			...SETTINGS,
			AUTH_ISSUER: undefined,
		});
		await expect(verifier.verify(await authStub.sign())).resolves.toEqual({
			outcome: "unavailable",
			cause: "AUTH_ISSUER is not set.",
		});
	});

	it("checks every AUTH_REQUIRED_SCOPES scope", async () => {
		const verifier = new TokenVerifier({
			...SETTINGS,
			AUTH_REQUIRED_SCOPES: ["mcp:access", "reports:read"],
		});
		await expect(verifier.verify(await authStub.sign())).resolves.toEqual({
			outcome: "rejected",
			reason: "insufficient_scope",
			requiredScopes: ["mcp:access", "reports:read"],
		});
		await expect(
			verifier.verify(
				await authStub.sign({
					claims: { scope: ["mcp:access", "reports:read"] },
				}),
			),
		).resolves.toMatchObject({ outcome: "valid" });
	});
});

describe("tokenScopes", () => {
	it("reads a space-delimited string or an array", () => {
		expect(tokenScopes({ scope: "a  b" })).toEqual(["a", "b"]);
		expect(tokenScopes({ scope: ["a", 1, "b"] })).toEqual(["a", "b"]);
		expect(tokenScopes({})).toEqual([]);
	});
});
