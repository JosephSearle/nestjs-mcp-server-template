import { z } from "zod";

// Unset and empty variables are the same thing: Docker and CI often pass `KEY=`.
const fromEnv = <T extends z.ZodType>(schema: T) =>
	z.preprocess((value) => (value === "" ? undefined : value), schema);

const int = (min: number, max = Number.MAX_SAFE_INTEGER) =>
	z.coerce.number().int().min(min).max(max);

const httpUrl = () => z.url({ protocol: /^https?$/ });

const list = <T extends z.ZodType<unknown, string>>(item: T, min = 0) =>
	z
		.string()
		.transform((value) =>
			value
				.split(",")
				.map((entry) => entry.trim())
				.filter((entry) => entry !== ""),
		)
		.pipe(z.array(item).min(min));

// Asymmetric algorithms only: `none` and HMAC algorithms are never accepted (spec §3).
export const AUTH_ALGORITHMS = [
	"RS256",
	"RS384",
	"RS512",
	"PS256",
	"PS384",
	"PS512",
	"ES256",
	"ES384",
	"ES512",
	"EdDSA",
] as const;

export const SECRET_MIN_LENGTH = 32;
const secret = () => z.string().min(SECRET_MIN_LENGTH);

// One key per environment variable, named as the variable, so every issue path starts with the KEY.
// Defaults that depend on other values or on the environment are filled in by `toAppConfig`.
export const envSchema = z.object({
	NODE_ENV: fromEnv(
		z.enum(["development", "test", "production"]).default("development"),
	),
	PORT: fromEnv(int(1, 65535).default(3000)),

	MCP_SERVER_NAME: fromEnv(z.string().optional()),
	MCP_SERVER_VERSION: fromEnv(z.string().optional()),
	MCP_PUBLIC_URL: fromEnv(httpUrl().optional()),
	MCP_ALLOWED_ORIGINS: fromEnv(list(z.string()).optional()),
	MCP_ALLOWED_HOSTS: fromEnv(list(z.string()).optional()),
	MCP_MAX_REQUEST_BYTES: fromEnv(int(1).default(1048576)),
	MCP_REQUEST_TIMEOUT_MS: fromEnv(int(1).default(60000)),
	MCP_INPUT_MAX_ROUNDS: fromEnv(int(1).default(5)),
	MCP_INPUT_ROUND_TIMEOUT_MS: fromEnv(int(1).default(300000)),
	MCP_REQUEST_STATE_SECRET: fromEnv(secret().optional()),

	AUTH_MODE: fromEnv(z.enum(["external", "dev"]).default("external")),
	AUTH_PROVIDER: fromEnv(
		z.enum(["entra", "auth0", "keycloak", "generic"]).default("generic"),
	),
	AUTH_SCOPES_CLAIM: fromEnv(z.string().optional()),
	AUTH_ROLES_CLAIM: fromEnv(z.string().optional()),
	AUTH_ISSUER: fromEnv(httpUrl().optional()),
	AUTH_AUDIENCE: fromEnv(z.string().optional()),
	AUTH_JWKS_URI: fromEnv(httpUrl().optional()),
	AUTH_ALGORITHMS: fromEnv(list(z.enum(AUTH_ALGORITHMS), 1).default(["RS256"])),
	AUTH_REQUIRED_SCOPES: fromEnv(list(z.string()).optional()),
	AUTH_CLOCK_TOLERANCE_SECONDS: fromEnv(int(0).default(30)),
	AUTH_MAX_TOKEN_LIFETIME_SECONDS: fromEnv(int(1).default(5400)),

	DEV_AUTH_PROVIDER: fromEnv(z.enum(["github", "google"]).default("github")),
	DEV_AUTH_CLIENT_ID: fromEnv(z.string().optional()),
	DEV_AUTH_CLIENT_SECRET: fromEnv(z.string().optional()),
	DEV_AUTH_JWT_SECRET: fromEnv(secret().optional()),

	LOG_LEVEL: fromEnv(
		z
			.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
			.default("info"),
	),
	LOG_PSEUDONYM_KEY: fromEnv(secret().optional()),
	TRUST_PROXY_HOPS: fromEnv(int(0).default(0)),
	SHUTDOWN_TIMEOUT_MS: fromEnv(int(1).default(25000)),
	REDIS_URL: fromEnv(z.url({ protocol: /^rediss?$/ }).optional()),
});

export type EnvKey = keyof typeof envSchema.shape;
export type ParsedEnv = z.output<typeof envSchema>;

/** The validated config. Inject it as `ConfigService<AppConfig, true>`. */
export type AppConfig = ParsedEnv &
	Required<
		Pick<
			ParsedEnv,
			| "MCP_SERVER_NAME"
			| "MCP_SERVER_VERSION"
			| "MCP_PUBLIC_URL"
			| "MCP_REQUEST_STATE_SECRET"
			| "AUTH_AUDIENCE"
			| "DEV_AUTH_JWT_SECRET"
			| "LOG_PSEUDONYM_KEY"
		>
	>;

// What to say about a variable that fails its type check. `<what's wrong>. <what to do>.`
// Never mentions the value.
export const FIELD_HELP: Record<EnvKey, string> = {
	NODE_ENV:
		"must be development, test or production. Set it to one of those values.",
	PORT: "must be a whole number from 1 to 65535. Set it to a free port.",
	MCP_SERVER_NAME: "must be a string. Set it to the server's name.",
	MCP_SERVER_VERSION: "must be a string. Set it to the server's version.",
	MCP_PUBLIC_URL:
		"must be an http or https URL. Set it to the URL clients use to reach the server, without /mcp.",
	MCP_ALLOWED_ORIGINS:
		"must be a comma-separated list. Set it to the allowed Origin values.",
	MCP_ALLOWED_HOSTS:
		"must be a comma-separated list. Set it to the allowed Host values.",
	MCP_MAX_REQUEST_BYTES:
		"must be a whole number of 1 or more. Set it to the request body limit in bytes.",
	MCP_REQUEST_TIMEOUT_MS:
		"must be a whole number of 1 or more. Set it to the request timeout in milliseconds.",
	MCP_INPUT_MAX_ROUNDS:
		"must be a whole number of 1 or more. Set it to the most input rounds one request may take.",
	MCP_INPUT_ROUND_TIMEOUT_MS:
		"must be a whole number of 1 or more. Set it to the input round timeout in milliseconds.",
	MCP_REQUEST_STATE_SECRET: `must be at least ${SECRET_MIN_LENGTH} characters. Set it to a long random string shared by every replica.`,
	AUTH_MODE: "must be external or dev. Set it to one of those values.",
	AUTH_PROVIDER:
		"must be entra, auth0, keycloak or generic. Set it to one of those values.",
	AUTH_SCOPES_CLAIM:
		"must be a string. Set it to the dotted path of the scopes claim.",
	AUTH_ROLES_CLAIM:
		"must be a string. Set it to the dotted path of the roles claim.",
	AUTH_ISSUER:
		"must be an http or https URL. Set it to your issuer URL, exactly as it appears in the iss claim.",
	AUTH_AUDIENCE:
		"must be a string. Set it to the audience tokens are issued for.",
	AUTH_JWKS_URI:
		"must be an http or https URL. Set it to your issuer's JWKS URL, or unset it to use discovery.",
	AUTH_ALGORITHMS: `must be a comma-separated list of ${AUTH_ALGORITHMS.join(", ")}. Remove any other algorithm; none and HMAC algorithms are not allowed.`,
	AUTH_REQUIRED_SCOPES:
		"must be a comma-separated list. Set it to the scopes every token must carry.",
	AUTH_CLOCK_TOLERANCE_SECONDS:
		"must be a whole number of 0 or more. Set it to the allowed clock skew in seconds.",
	AUTH_MAX_TOKEN_LIFETIME_SECONDS:
		"must be a whole number of 1 or more. Set it to the longest token lifetime to accept, in seconds.",
	DEV_AUTH_PROVIDER: "must be github or google. Set it to one of those values.",
	DEV_AUTH_CLIENT_ID: "must be a string. Set it to your OAuth app's client ID.",
	DEV_AUTH_CLIENT_SECRET:
		"must be a string. Set it to your OAuth app's client secret.",
	DEV_AUTH_JWT_SECRET: `must be at least ${SECRET_MIN_LENGTH} characters. Set it to a long random string, or unset it to generate one per process.`,
	LOG_LEVEL:
		"must be fatal, error, warn, info, debug, trace or silent. Set it to one of those values.",
	LOG_PSEUDONYM_KEY: `must be at least ${SECRET_MIN_LENGTH} characters. Set it to a long random string that outlives your telemetry retention.`,
	TRUST_PROXY_HOPS:
		"must be a whole number of 0 or more. Set it to the number of proxies in front of the server.",
	SHUTDOWN_TIMEOUT_MS:
		"must be a whole number of 1 or more. Set it to the drain time in milliseconds.",
	REDIS_URL:
		"must be a redis:// or rediss:// URL. Set it to your Redis URL, or unset it.",
};
