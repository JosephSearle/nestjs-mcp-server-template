import {
	createRemoteJWKSet,
	type JWTPayload,
	type JWTVerifyGetKey,
	jwtVerify,
} from "jose";
import type { AppConfig } from "../config/config.schema";
import type { AuthFailureReason } from "../telemetry/mcp-metrics";

export type VerifierSettings = Pick<
	AppConfig,
	| "AUTH_ISSUER"
	| "AUTH_AUDIENCE"
	| "AUTH_JWKS_URI"
	| "AUTH_ALGORITHMS"
	| "AUTH_REQUIRED_SCOPES"
	| "AUTH_CLOCK_TOLERANCE_SECONDS"
	| "AUTH_MAX_TOKEN_LIFETIME_SECONDS"
>;

export type Verification =
	| { outcome: "valid"; payload: JWTPayload }
	| {
			outcome: "rejected";
			reason: AuthFailureReason;
			/** Set when the reason is `insufficient_scope`: the scopes to ask for. */
			requiredScopes?: string[];
	  }
	/** The issuer's keys couldn't be fetched. Not the caller's fault, so not an auth failure. */
	| { outcome: "unavailable"; cause: string };

const DISCOVERY_TIMEOUT_MS = 5000;

/** Raised when the key set can't be fetched, so it isn't mistaken for a bad token. */
class KeysUnavailable extends Error {}

// jose error codes, read by `code` so a second copy of jose can't break `instanceof`.
const REASON_BY_CODE: Record<string, AuthFailureReason> = {
	ERR_JWT_EXPIRED: "expired",
	ERR_JOSE_ALG_NOT_ALLOWED: "invalid_signature",
	ERR_JOSE_NOT_SUPPORTED: "invalid_signature",
	ERR_JWS_SIGNATURE_VERIFICATION_FAILED: "invalid_signature",
	ERR_JWKS_NO_MATCHING_KEY: "invalid_signature",
	ERR_JWKS_MULTIPLE_MATCHING_KEYS: "invalid_signature",
};

const REASON_BY_CLAIM: Record<string, AuthFailureReason> = {
	iss: "wrong_issuer",
	aud: "wrong_audience",
	nbf: "not_yet_valid",
	exp: "expired",
};

function reasonFor(error: unknown): AuthFailureReason {
	const { code, claim, reason } = (error ?? {}) as {
		code?: string;
		claim?: string;
		reason?: string;
	};
	if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED") {
		// A missing required claim, or a claim of the wrong type, is a malformed token.
		return (
			(reason === "check_failed" && claim && REASON_BY_CLAIM[claim]) ||
			"malformed"
		);
	}
	return (code && REASON_BY_CODE[code]) || "malformed";
}

/** The token's scopes from the `scope` claim, as a space-delimited string or an array. */
export function tokenScopes(payload: JWTPayload): string[] {
	const { scope } = payload;
	if (typeof scope === "string") {
		return scope.split(" ").filter((entry) => entry !== "");
	}
	return Array.isArray(scope)
		? scope.filter((entry): entry is string => typeof entry === "string")
		: [];
}

/**
 * Validates bearer tokens with jose (spec §3, ADR-0003). Keys come only from `AUTH_JWKS_URI` or the
 * issuer's discovery document, never from the token, so `jku`, `x5u` and `x5c` are ignored.
 */
export class TokenVerifier {
	private keys?: Promise<JWTVerifyGetKey>;

	constructor(private readonly settings: VerifierSettings) {}

	async verify(token: string): Promise<Verification> {
		const { AUTH_ISSUER, AUTH_REQUIRED_SCOPES } = this.settings;
		if (AUTH_ISSUER === undefined) {
			return { outcome: "unavailable", cause: "AUTH_ISSUER is not set." };
		}

		// Keys are loaded inside jose's key callback, which runs only after the token parses and its
		// algorithm is allowed, so junk tokens never cause a fetch.
		const keys: JWTVerifyGetKey = async (header, jws) =>
			(await this.keySet(AUTH_ISSUER))(header, jws);

		let payload: JWTPayload;
		try {
			({ payload } = await jwtVerify(token, keys, {
				algorithms: [...this.settings.AUTH_ALGORITHMS],
				issuer: AUTH_ISSUER,
				audience: this.settings.AUTH_AUDIENCE,
				clockTolerance: this.settings.AUTH_CLOCK_TOLERANCE_SECONDS,
				requiredClaims: ["exp", "iat", "sub"],
			}));
		} catch (error) {
			if (error instanceof KeysUnavailable) {
				return { outcome: "unavailable", cause: error.message };
			}
			return { outcome: "rejected", reason: reasonFor(error) };
		}

		// Bounds how long a stolen token works, whatever lifetime the issuer allows.
		const lifetime = (payload.exp as number) - (payload.iat as number);
		if (lifetime > this.settings.AUTH_MAX_TOKEN_LIFETIME_SECONDS) {
			return { outcome: "rejected", reason: "lifetime_exceeded" };
		}

		const required = AUTH_REQUIRED_SCOPES ?? [];
		const granted = new Set(tokenScopes(payload));
		if (!required.every((scope) => granted.has(scope))) {
			return {
				outcome: "rejected",
				reason: "insufficient_scope",
				requiredScopes: required,
			};
		}
		return { outcome: "valid", payload };
	}

	private keySet(issuer: string): Promise<JWTVerifyGetKey> {
		this.keys ??= this.loadKeySet(issuer).catch((error: unknown) => {
			// Try discovery again on the next request rather than failing forever.
			this.keys = undefined;
			throw error;
		});
		return this.keys;
	}

	private async loadKeySet(issuer: string): Promise<JWTVerifyGetKey> {
		const jwksUri =
			this.settings.AUTH_JWKS_URI ?? (await discoverJwksUri(issuer));
		const remote = createRemoteJWKSet(new URL(jwksUri));
		return async (header, token) => {
			try {
				return await remote(header, token);
			} catch (error) {
				const code = (error as { code?: string }).code;
				if (
					code === "ERR_JWKS_NO_MATCHING_KEY" ||
					code === "ERR_JWKS_MULTIPLE_MATCHING_KEYS"
				) {
					throw error;
				}
				throw new KeysUnavailable(
					`Could not fetch the JWKS: ${(error as Error).message}`,
				);
			}
		};
	}
}

/**
 * Reads `jwks_uri` from the issuer's OpenID discovery document. The document's `issuer` must equal
 * `AUTH_ISSUER` exactly, so a misconfigured or spoofed document is never trusted.
 */
async function discoverJwksUri(issuer: string): Promise<string> {
	const url = `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;
	let document: { issuer?: unknown; jwks_uri?: unknown };
	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
			redirect: "error",
		});
		if (!response.ok) {
			throw new Error(`status ${response.status}`);
		}
		document = await response.json();
	} catch (error) {
		throw new KeysUnavailable(
			`Could not read ${url}: ${(error as Error).message}`,
		);
	}
	if (document.issuer !== issuer) {
		throw new KeysUnavailable(
			`The issuer in ${url} does not match AUTH_ISSUER.`,
		);
	}
	if (
		typeof document.jwks_uri !== "string" ||
		!URL.canParse(document.jwks_uri)
	) {
		throw new KeysUnavailable(`${url} has no valid jwks_uri.`);
	}
	return document.jwks_uri;
}
