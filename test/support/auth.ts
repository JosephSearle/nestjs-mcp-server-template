import { generateKeyPairSync, type KeyObject } from "node:crypto";
import {
	base64url,
	type JWTHeaderParameters,
	type JWTPayload,
	SignJWT,
} from "jose";

/** The stub's issuer. Nothing listens on it: `fetch` answers its URLs (see `startAuthStub`). */
export const ISSUER = "https://issuer.example.test";
export const JWKS_URI = `${ISSUER}/jwks`;
/** The audience the server expects by default: `MCP_PUBLIC_URL` + `/mcp`. */
export const DEFAULT_AUDIENCE = "http://localhost:3000/mcp";

export const RSA_KID = "rsa-key";
export const EC_KID = "ec-key";

export interface KeyPair {
	publicKey: KeyObject;
	privateKey: KeyObject;
}

export interface TokenOptions {
	/** Claims to set. `undefined` removes a default claim. */
	claims?: Record<string, unknown>;
	header?: Partial<JWTHeaderParameters>;
	/** Sign with another key, such as an attacker's, instead of the published RSA key. */
	key?: KeyObject;
}

export interface AuthStub {
	rsa: KeyPair;
	ec: KeyPair;
	/** Signs an RS256 token that the server accepts, changed by `options`. */
	sign(options?: TokenOptions): Promise<string>;
	/** An unsecured `alg: none` token with the default claims. */
	unsecured(): string;
	/** An HS256 token keyed with the RSA public key's PEM: the algorithm-confusion attack. */
	hmacWithPublicKey(): Promise<string>;
	/** How many times the JWKS has been fetched. */
	jwksFetches(): number;
	/** Changes the discovery document, for tests of a bad one. */
	setDiscovery(document: Record<string, unknown>): void;
}

export const now = () => Math.floor(Date.now() / 1000);

export const rsaKeyPair = (): KeyPair =>
	generateKeyPairSync("rsa", { modulusLength: 2048 });

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

/**
 * A local issuer with OpenID discovery and a JWKS holding one RSA and one EC key. Synchronous, so
 * an env fixture can call it before `platform.module.ts` is imported. It answers `fetch` calls to
 * `ISSUER` and passes every other call through, so the server finds its keys through discovery
 * exactly as it would in production.
 */
export function startAuthStub(): AuthStub {
	const rsa = rsaKeyPair();
	const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
	const jwks = {
		keys: [
			{
				...rsa.publicKey.export({ format: "jwk" }),
				kid: RSA_KID,
				alg: "RS256",
				use: "sig",
			},
			{
				...ec.publicKey.export({ format: "jwk" }),
				kid: EC_KID,
				alg: "ES256",
				use: "sig",
			},
		],
	};
	let discovery: Record<string, unknown> = {
		issuer: ISSUER,
		jwks_uri: JWKS_URI,
	};
	let fetches = 0;

	const realFetch = globalThis.fetch;
	globalThis.fetch = async (input, init) => {
		const url = input instanceof Request ? input.url : String(input);
		if (url === `${ISSUER}/.well-known/openid-configuration`) {
			return json(discovery);
		}
		if (url === JWKS_URI) {
			fetches += 1;
			return json(jwks);
		}
		if (url.startsWith(ISSUER)) {
			return json({}, 404);
		}
		return realFetch(input, init);
	};

	const withOverrides = (claims: Record<string, unknown> = {}) => {
		const payload: Record<string, unknown> = {
			iss: ISSUER,
			aud: DEFAULT_AUDIENCE,
			sub: "user-1",
			scope: "mcp:access",
			iat: now(),
			exp: now() + 600,
			...claims,
		};
		for (const [name, value] of Object.entries(payload)) {
			if (value === undefined) {
				delete payload[name];
			}
		}
		return payload as JWTPayload;
	};

	return {
		rsa,
		ec,
		sign: ({ claims, header, key } = {}) =>
			new SignJWT(withOverrides(claims))
				.setProtectedHeader({ alg: "RS256", kid: RSA_KID, ...header })
				.sign(key ?? rsa.privateKey),
		unsecured: () =>
			[
				base64url.encode(JSON.stringify({ alg: "none", typ: "JWT" })),
				base64url.encode(JSON.stringify(withOverrides())),
				"",
			].join("."),
		hmacWithPublicKey: () =>
			new SignJWT(withOverrides())
				.setProtectedHeader({ alg: "HS256", kid: RSA_KID })
				.sign(
					new TextEncoder().encode(
						rsa.publicKey.export({ type: "spki", format: "pem" }) as string,
					),
				),
		jwksFetches: () => fetches,
		setDiscovery: (document) => {
			discovery = document;
		},
	};
}
